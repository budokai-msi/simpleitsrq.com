// Vercel Serverless Function: POST /api/contact
//
// Pipeline:
//   1. Reject non-POST
//   2. checkBotId() — Vercel BotID (invisible, server-side)
//   3. Cloudflare Turnstile siteverify (client token)
//   4. Per-IP rate limit (in-memory, per Fluid Compute instance)
//   5. Honeypot field
//   6. Field validation
//   7. Send via Resend (from contact@simpleitsrq.com → hello@simpleitsrq.com)
//
// Env vars (set in Vercel → Settings → Environment Variables):
//   RESEND_API_KEY         — required in prod
//   TURNSTILE_SECRET_KEY   — required in prod
//   CONTACT_TO_EMAIL       — optional, overrides the inbox submissions land in.
//                            Defaults to hello@simpleitsrq.com. Set this to a
//                            real mailbox (e.g. a Gmail address) until the
//                            apex MX records for simpleitsrq.com are wired up.
// If RESEND_API_KEY / TURNSTILE_SECRET_KEY are missing (e.g. local dev without
// .env.local) the function "fails open" on that layer so the form is still
// usable in development.

import { checkBotId } from "botid/server";
import { Resend } from "resend";
import { clientIp, rateLimit } from "./_lib/security.js";
import { sql } from "./_lib/db.js";
import { validateEnv } from "./_lib/env.js";
import { requireCsrf } from "./_lib/csrf.js";
import { getSession } from "./_lib/session.js";
import { runExposureScan } from "./_lib/exposure.js";
import { identifyScanner } from "./_lib/scanner-fingerprints.js";

// Inline admin check — gates OPSEC-sensitive surfaces (the threats feed)
// without pulling the larger portal.js admin helper. Mirrors the email +
// users.is_admin pattern used in api/portal.js#resolveAdmin.
async function isAdminRequest(request) {
  try {
    const session = await getSession(request);
    if (!session?.user?.email) return false;
    const adminEmail = process.env.ADMIN_EMAIL || "";
    if (!adminEmail) return false;
    if (session.user.email.toLowerCase() !== adminEmail.toLowerCase()) return false;
    const rows = await sql`SELECT is_admin FROM users WHERE id = ${session.user.id} LIMIT 1`;
    return rows.length > 0 && rows[0].is_admin === true;
  } catch {
    return false;
  }
}

/** Collapse an IPv4 to its /24 for public display — preserves "who" at
 *  network level without ever leaking the exact host. IPv6 gets its
 *  first 4 hextets for similar anonymization. Non-IP strings return as
 *  "unknown" so a malformed row can never leak. */
function anonIp(ip) {
  if (!ip || typeof ip !== "string") return "unknown";
  const v4 = ip.match(/^(\d+\.\d+\.\d+)\.\d+$/);
  if (v4) return `${v4[1]}.x`;
  const v6 = ip.match(/^([0-9a-fA-F:]+:)[0-9a-fA-F:]+$/);
  if (v6 && ip.includes(":")) {
    const parts = ip.split(":").filter(Boolean);
    if (parts.length >= 4) return `${parts.slice(0, 4).join(":")}:::`;
  }
  return "unknown";
}

/** Convert an arbitrary probed path into a short category label so the
 *  public feed doesn't expose unusual internal routes someone might
 *  misconstrue as real endpoints. */
function summarizePath(path = "") {
  const p = String(path || "").toLowerCase();
  if (/\b(wp-login|wp-admin|xmlrpc|wp-config)\b/.test(p)) return "/wordpress-*";
  if (/\.env|\.git|\.aws|\.svn|\.ssh/.test(p))             return "/*-leak-probe";
  if (/\b(phpmyadmin|pma|adminer)\b/.test(p))              return "/phpmyadmin-*";
  if (/\b(actuator|spring|druid)\b/.test(p))               return "/spring-*";
  if (/\b(admin|administrator|dashboard)\b/.test(p))       return "/admin-*";
  if (/\b(jenkins|tomcat|manager)\b/.test(p))              return "/app-server-*";
  if (/\b(api\/v\d|debug|test|health)\b/.test(p))          return "/api-probe";
  if (/\.(php|asp|jsp)(\?|$)/.test(p))                     return "/script-probe";
  if (/\$\{jndi:|class\.module|union\s+select/i.test(p))   return "/cve-payload";
  return p.length > 30 ? p.slice(0, 30) + "…" : p || "/";
}

// Cold-start validation. Throws in production if any required secret is
// missing; logs a warning in dev/preview so local iteration keeps working
// (matches the existing fail-open behavior below).
validateEnv({
  RESEND_API_KEY: "required",
  TURNSTILE_SECRET_KEY: "required",
});

const CONTACT_FROM = "Simple IT SRQ Website <contact@simpleitsrq.com>";
const NEWSLETTER_FROM = "Simple IT Brief <hello@simpleitsrq.com>";
// Routed to hello@simpleitsrq.com via ImprovMX (mx1/mx2.improvmx.com) which
// forwards to the Gmail catch-all. Override with CONTACT_TO_EMAIL if the
// destination needs to change (e.g. shared team inbox).
const CONTACT_TO_DEFAULT = "hello@simpleitsrq.com";
const SITE_URL = "https://simpleitsrq.com";
const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const escapeHtml = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const isEmail = (s = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// Collapse C0 (U+0000..U+001F), DEL, and C1 (U+0080..U+009F) to spaces so
// user input can't smuggle extra headers (Bcc:, etc.) into a Resend subject.
// Some SMTP gateways treat the C1 range as line breaks.
const stripHeaderCtrl = (s = "") => {
  const str = String(s);
  let out = "";
  for (let k = 0; k < str.length; k++) {
    const c = str.charCodeAt(k);
    out += (c < 0x20 || c === 0x7F || (c >= 0x80 && c <= 0x9F)) ? " " : str[k];
  }
  return out.replace(/\s+/g, " ").trim();
};

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

// ---------- Rate limit ----------
// Per-instance Map of ip -> array of submission timestamps.
// Fluid Compute reuses instances across requests, so this is a soft
// per-instance limit — good enough for a marketing site. Upgrade to
// Upstash Redis if submission volume grows.
// Rate limit config — 5 submissions per 10 min per IP. The DB-backed
// sliding window from _lib/security.js survives across Fluid Compute
// instances and uses x-real-ip (not spoofable).
const RATE_WINDOW_S = 10 * 60;
const RATE_MAX = 5;

// ---------- Turnstile ----------
async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Dev mode: no secret configured → skip verification.
    console.warn("[contact] TURNSTILE_SECRET_KEY not set; skipping Turnstile verify");
    return { ok: true, skipped: true };
  }
  if (!token || typeof token !== "string") {
    return { ok: false, reason: "missing_token" };
  }
  try {
    const params = new URLSearchParams();
    params.set("secret", secret);
    params.set("response", token);
    if (ip && ip !== "unknown") params.set("remoteip", ip);

    const r = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const data = await r.json().catch(() => ({}));
    if (!data?.success) {
      return { ok: false, reason: "rejected", codes: data?.["error-codes"] };
    }
    return { ok: true };
  } catch (err) {
    console.error("[contact] turnstile verify threw", err);
    // Fail open on Cloudflare-side outages — BotID + rate limit still apply.
    return { ok: true, skipped: true, err: String(err) };
  }
}

// ---------- Handler ----------
// Random 32-char URL-safe token for confirm + unsubscribe links.
function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Public exposure-scan lead magnet.
//
// Visitor enters a domain + email, we run the passive DNS + CT scan
// server-side, store their email as a newsletter lead (same pipeline as
// the newsletter form), and return the report inline. This is a
// top-of-funnel lead engine — the report itself is genuinely useful, so
// a real-name email comes in naturally.
//
// We do NOT require double-opt-in here because the visitor just gave us
// an email for a specific purpose (the scan). Mark the subscriber as
// unconfirmed so our own cron doesn't spam them until they confirm via
// some other path — we just want the lead stored.
async function handleExposureScan(request, body, ip) {
  const rawDomain = String(body.domain || "").trim().slice(0, 253);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 320);
  if (!rawDomain) return json(400, { ok: false, error: "domain_required" });
  if (!email || !isEmail(email)) return json(400, { ok: false, error: "email_invalid" });

  const report = await runExposureScan(rawDomain);
  if (!report.ok) return json(400, report);

  // Store as a lead — same table the newsletter uses, tagged so we can
  // see where it came from. Don't auto-confirm; they can opt into the
  // newsletter separately.
  try {
    const existing = await sql`
      SELECT id FROM newsletter_subscribers WHERE lower(email) = ${email} LIMIT 1
    `.catch(() => []);
    if (existing[0]) {
      await sql`
        UPDATE newsletter_subscribers
        SET source = ${"exposure-scan:" + report.domain}, ip = ${ip}
        WHERE id = ${existing[0].id}
      `;
    } else {
      await sql`
        INSERT INTO newsletter_subscribers (email, confirm_token, unsubscribe_token, source, ip)
        VALUES (${email}, ${randomToken()}, ${randomToken()}, ${"exposure-scan:" + report.domain}, ${ip})
      `;
    }
  } catch (err) {
    // Lead storage is best-effort — a DB hiccup shouldn't block the
    // visitor's scan report from rendering.
    console.warn("[exposure-scan] lead store failed", err);
  }

  // Fire the report as an email too, so the visitor has it in their
  // inbox (gives them a reason to trust us with future outreach) and
  // you get a copy in CONTACT_TO for lead review.
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    try {
      const resend = new Resend(apiKey);
      const contactTo = process.env.CONTACT_TO_EMAIL || CONTACT_TO_DEFAULT;
      const gradeColor = report.grade === "A" ? "#107C10"
        : report.grade === "B" ? "#059669"
        : report.grade === "C" ? "#D97706"
        : report.grade === "D" ? "#DC2626" : "#7C2D12";
      const findingsHtml = (report.findings || []).map((f) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top;width:80px">
            <span style="display:inline-block;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700;
              background:${f.severity === "critical" ? "#DC2626" : f.severity === "high" ? "#D97706" : f.severity === "medium" ? "#F59E0B" : "#9CA3AF"};
              color:#fff;text-transform:uppercase">${f.severity}</span>
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top;font-size:13px">
            <strong>${escapeHtmlSafe(f.title)}</strong>
            <div style="color:#6b7280;margin-top:4px;line-height:1.5">${escapeHtmlSafe(f.detail)}</div>
          </td>
        </tr>
      `).join("") || `<tr><td colspan="2" style="padding:16px;color:#107C10;font-size:14px">No findings — your domain is well-configured. Keep monitoring.</td></tr>`;

      await resend.emails.send({
        from: CONTACT_FROM,
        to: [email],
        bcc: [contactTo],
        subject: `Your exposure scan for ${report.domain} — Grade ${report.grade}`,
        html: `
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a">
  <div style="padding:18px 22px;background:#0F6CBD;color:#fff;border-radius:10px 10px 0 0">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;opacity:.9">Exposure Scan</div>
    <div style="font-size:20px;font-weight:700;margin-top:2px">${escapeHtmlSafe(report.domain)}</div>
  </div>
  <div style="padding:24px;background:#fff;border:1px solid #e5e7eb;border-top:none">
    <div style="display:flex;gap:18px;align-items:center;margin-bottom:14px">
      <div style="font-size:48px;font-weight:700;color:${gradeColor};line-height:1">${report.grade}</div>
      <p style="margin:0;font-size:14px;line-height:1.5;color:#1f2937">${escapeHtmlSafe(report.gradeNarrative)}</p>
    </div>
    <h3 style="font-size:15px;margin:18px 0 8px">Findings</h3>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      ${findingsHtml}
    </table>
    ${report.subdomains?.length ? `
      <h3 style="font-size:15px;margin:20px 0 6px">Subdomains discovered (${report.subdomains.length})</h3>
      <p style="font-size:11px;color:#6b7280;margin:0 0 6px">From public Certificate Transparency logs — every scanner on the internet can see these.</p>
      <div style="font-family:ui-monospace,Menlo,monospace;font-size:11px;line-height:1.6;color:#374151">${report.subdomains.map(escapeHtmlSafe).join("<br>")}</div>
    ` : ""}
  </div>
  <div style="padding:16px 22px;background:#f7f7f8;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px">
    <p style="margin:0 0 6px;font-size:13px"><strong>Want this fixed?</strong></p>
    <p style="margin:0;font-size:13px;color:#4b5563;line-height:1.5">Reply to this email and we'll quote the fixes. Typical DNS-hardening engagement is a one-time flat fee, no retainer.</p>
  </div>
</div>`,
        text: [
          `Exposure scan for ${report.domain} — Grade ${report.grade}`,
          ``,
          report.gradeNarrative,
          ``,
          `Findings:`,
          ...(report.findings || []).map((f) => `  [${f.severity.toUpperCase()}] ${f.title}\n    ${f.detail}`),
          ``,
          `Reply to this email for a quote on fixing these.`,
        ].join("\n"),
      });
    } catch (err) {
      console.warn("[exposure-scan] email send failed (non-blocking)", err);
    }
  }

  return json(200, { ...report, leadStored: true });
}

// Minimal HTML escape for the email renderer — no dep needed.
function escapeHtmlSafe(s = "") {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ────────────────────────────────────────────────────────────────────────
// Newsletter drip sequence (welcome + day-3 + day-7).
//
// Each function returns true on a successful Resend send, false on any
// failure (no API key, network error, Resend rejection). Callers update
// the matching *_sent_at column ONLY on true, so a transient failure
// stays retryable on the next run.
//
// Email content lives inline so the operator can rewrite it without
// touching schema or templates infrastructure. Plain-text fallback is
// always included for mail clients that strip HTML.
// ────────────────────────────────────────────────────────────────────────

async function sendDripEmail({ to, unsubscribeToken, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const unsubscribeUrl = `${SITE_URL}/api/contact?unsubscribe=${unsubscribeToken}`;
  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: NEWSLETTER_FROM,
      to: [to],
      subject,
      text: text + "\n\nUnsubscribe: " + unsubscribeUrl,
      html: html.replace("__UNSUBSCRIBE_URL__", unsubscribeUrl),
      headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
    });
    if (error) {
      console.error("[newsletter] drip send error", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[newsletter] drip send exception", err);
    return false;
  }
}

const dripFooter = `
<p style="font-size:11px;color:#9ca3af;margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb">
  You're getting this because you confirmed your subscription to The Simple IT Brief at simpleitsrq.com.
  <a href="__UNSUBSCRIBE_URL__" style="color:#9ca3af">Unsubscribe</a> at any time — one click, no questions.
</p>`;

async function sendWelcomeEmail(email, unsubscribeToken) {
  return sendDripEmail({
    to: email,
    unsubscribeToken,
    subject: "You're in — and here's your free starter WISP",
    text: [
      `Welcome to The Simple IT Brief.`,
      ``,
      `Your free starter Written Information Security Program template is here:`,
      `${SITE_URL}/wisp-starter`,
      ``,
      `It's a 12-section Florida-flavored template — fillable, ready for your 2026 cyber-insurance renewal.`,
      `Print → Save as PDF in your browser to keep an offline copy.`,
      ``,
      `What to expect: one email a month with plain-English security, AI, and cloud news for Florida small business owners. No fluff, no offers in every email — most months it's a single useful pointer.`,
      ``,
      `If we can help with anything specific (computer repair, security cameras, M365 migration, HIPAA paperwork, etc.) reply to this email and a real Sarasota / Bradenton tech will read it.`,
      ``,
      `— Simple IT SRQ`,
    ].join("\n"),
    html: `
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <h2 style="margin:0 0 16px;color:#0F6CBD">You're in.</h2>
  <p style="font-size:15px;line-height:1.6">Welcome to <strong>The Simple IT Brief</strong>. As promised — your free starter Written Information Security Program template is ready below.</p>
  <p style="margin:24px 0">
    <a href="${SITE_URL}/wisp-starter" style="display:inline-block;padding:12px 22px;background:#0F6CBD;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Open the WISP starter →</a>
  </p>
  <p style="font-size:14px;line-height:1.6;color:#444">It's a 12-section Florida-flavored template — fillable, ready for a 2026 cyber-insurance renewal questionnaire. Print → Save as PDF in your browser to keep an offline copy.</p>
  <p style="font-size:14px;line-height:1.6;color:#444">What to expect: one email a month, plain-English security and IT news for Florida small business owners. If we can help with anything specific — computer repair, cameras, M365 migration, HIPAA paperwork — just reply and a real tech will read it.</p>
  <p style="font-size:14px;color:#444;margin-top:24px">— The Simple IT SRQ team</p>
  ${dripFooter}
</div>`,
  });
}

async function sendDripDay3Email(email, unsubscribeToken) {
  return sendDripEmail({
    to: email,
    unsubscribeToken,
    subject: "What we'd actually buy if we were starting a Sarasota office today",
    text: [
      `Three days in — figured we'd send the most useful single thing we publish, the buyer's guide for business security cameras:`,
      `${SITE_URL}/blog/business-security-cameras-sarasota-honest-guide-2026`,
      ``,
      `If you're a homeowner instead, the computer-repair guide is the equivalent — real prices, what's worth fixing, what's a scam:`,
      `${SITE_URL}/blog/computer-repair-sarasota-honest-guide-2026`,
      ``,
      `If you're already shopping for an MSP, our public pricing is here (a thing most local IT shops don't publish):`,
      `${SITE_URL}/pricing`,
      ``,
      `— Simple IT SRQ`,
    ].join("\n"),
    html: `
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <h2 style="margin:0 0 16px;color:#0F6CBD">A few things we'd actually use</h2>
  <p style="font-size:15px;line-height:1.6">Three days into your subscription. Here are the three pieces we'd hand a new Sarasota / Bradenton business owner if they asked us where to start:</p>
  <ul style="font-size:14px;line-height:1.7;padding-left:20px">
    <li><a href="${SITE_URL}/blog/business-security-cameras-sarasota-honest-guide-2026" style="color:#0F6CBD;font-weight:600">Business security cameras buyer's guide</a> — honest prices, gear we recommend, brands we don't, Florida install gotchas.</li>
    <li><a href="${SITE_URL}/blog/computer-repair-sarasota-honest-guide-2026" style="color:#0F6CBD;font-weight:600">Computer repair guide</a> — repair-vs-replace tree, real prices, six red flags in a quote.</li>
    <li><a href="${SITE_URL}/pricing" style="color:#0F6CBD;font-weight:600">Public pricing page</a> — managed-IT tiers, one-shot service prices. No quote-and-call dance.</li>
  </ul>
  <p style="font-size:14px;line-height:1.6;color:#444;margin-top:24px">If something on those pages doesn't make sense, reply and we'll explain. Real humans on this side.</p>
  <p style="font-size:14px;color:#444;margin-top:16px">— Simple IT SRQ</p>
  ${dripFooter}
</div>`,
  });
}

async function sendDripDay7Email(email, unsubscribeToken) {
  return sendDripEmail({
    to: email,
    unsubscribeToken,
    subject: "Want a free 30-min walk-through with a Sarasota IT tech?",
    text: [
      `Week one of the brief — and a pitch.`,
      ``,
      `If you're an owner reading this and your IT setup is held together with copy-paste advice from Reddit, we'd be glad to look at it for free.`,
      ``,
      `30 minutes. Phone or video. We'll tell you the top 2-3 risks we hear in the call, ballpark pricing if any work is worth doing, and a written follow-up email summarizing the conversation.`,
      ``,
      `No sales pitch on the call — that's a different conversation that comes after, only if you want it.`,
      ``,
      `Book here: ${SITE_URL}/book`,
      ``,
      `— Simple IT SRQ`,
    ].join("\n"),
    html: `
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <h2 style="margin:0 0 16px;color:#0F6CBD">Free 30-min walk-through?</h2>
  <p style="font-size:15px;line-height:1.6">Week one of the brief — and the only pitch you'll get from us in a while.</p>
  <p style="font-size:14px;line-height:1.6">If your IT setup is held together with copy-paste advice from Reddit, we're glad to look at it for free. 30 minutes, phone or video. We'll tell you the top 2-3 risks we hear, ballpark pricing if any work's worth doing, and email you a written follow-up.</p>
  <p style="font-size:14px;line-height:1.6">No sales pitch ON the call. That's a different conversation that comes after, only if you want it.</p>
  <p style="margin:24px 0">
    <a href="${SITE_URL}/book" style="display:inline-block;padding:12px 22px;background:#0F6CBD;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Book the free 30-min →</a>
  </p>
  <p style="font-size:14px;color:#444;margin-top:24px">— Simple IT SRQ</p>
  ${dripFooter}
</div>`,
  });
}

export { sendWelcomeEmail, sendDripDay3Email, sendDripDay7Email };

// ---------- AI Chat (Groq Llama 3.3 70B) ----------
//
// Lives on /api/contact rather than its own route to stay under the Hobby
// plan's 12-function ceiling. The contact endpoint is already the lead-
// capture surface, so a chat that captures emails when it can't close is
// a natural fit.
//
// Pipeline:
//   1. CSRF + Origin (already enforced by POST handler)
//   2. Per-IP rate limit (chat bucket: 30 turns / hour)
//   3. Validate messages (length-cap each turn, max 12 turns)
//   4. Call Groq with a system prompt grounded in our pricing + skills
//   5. If body.captureEmail is set, also create a newsletter row so the
//      conversation transcript has somewhere to land in our CRM.
//
// Env: GROQ_API_KEY (required). Falls back to a canned reply if absent
// so local dev without keys still renders the widget.

const CHAT_SYSTEM_PROMPT = `You are the AI assistant for Simple IT SRQ, a Sarasota / SWFL IT and lead-generation provider. Be brief (2-4 sentences typical), direct, and honest. Never invent customer testimonials, logos, or compliance claims we don't have.

Service area: Sarasota, Bradenton, Lakewood Ranch, Venice, Nokomis only. If asked about other areas, say we're SWFL-only.

Surfaces you can recommend with confidence:
- /leadgen — B2B lead generation. Tiers: Free (1 zip, 10 businesses); Growth $15/mo annual or $19 monthly (500 records/mo, 1 query/day); Pro $79/mo annual or $99 monthly (5,000 records/mo, unlimited); Enterprise custom (sales-led).
- LAUNCH20 promo code = 20% off first 3 months. Auto-applied at checkout via prefilled link.
- Stripe Payment Links (recommend these only after asking which tier + cadence fits):
  Growth monthly:  https://buy.stripe.com/7sY9AM7oLe4U5040fHak01k?prefilled_promo_code=LAUNCH20
  Growth annual:   https://buy.stripe.com/dRm5kw5gDgd28cg0fHak01l?prefilled_promo_code=LAUNCH20
- /book — for demos, enterprise pricing, or anything sales-led.
- /services — IT support, security cameras, UPS, hurricane prep, HIPAA kits.
- /blog — long-form articles. Search by topic.

Rules:
- If you don't know something, say "I'm not sure — let me get a human" and suggest /book or capturing their email.
- Never quote SLAs, response times, or compliance certifications we haven't published.
- Do not provide legal, tax, or medical advice. Recommend professionals.
- If the user asks for pricing of leadgen, walk them through Free vs Growth vs Pro in 2 sentences and link the matching Stripe URL.
- If the user wants to talk to a human, point them to /book.
- Markdown links are OK. Use them sparingly.`;

async function handleChat(request, body, ip) {
  const rl = await rateLimit({ ip, bucket: "chat", windowSeconds: 3600, max: 30 });
  if (!rl.ok) return json(429, { ok: false, error: "rate_limited" });

  const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  const cleaned = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: stripHeaderCtrl(m.content.slice(0, 2000)) }));

  if (cleaned.length === 0) return json(400, { ok: false, error: "no_messages" });
  const last = cleaned[cleaned.length - 1];
  if (last.role !== "user") return json(400, { ok: false, error: "last_must_be_user" });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return json(200, {
      ok: true,
      reply: "I'm offline right now (the AI key isn't set in this environment). Please email hello@simpleitsrq.com or book at /book and we'll respond same business day.",
      degraded: true,
    });
  }

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: CHAT_SYSTEM_PROMPT }, ...cleaned],
        temperature: 0.4,
        max_tokens: 400,
        stream: false,
      }),
    });
    if (!groqRes.ok) {
      const errText = await groqRes.text().catch(() => "");
      console.warn("[chat] groq non-2xx", groqRes.status, errText.slice(0, 200));
      return json(502, { ok: false, error: "ai_unavailable" });
    }
    const data = await groqRes.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || "Sorry — I couldn't generate a reply. Try /book or email hello@simpleitsrq.com.";
    return json(200, { ok: true, reply });
  } catch (err) {
    console.error("[chat] groq error", err);
    return json(502, { ok: false, error: "ai_error" });
  }
}

// Capture an email mid-chat so transcripts have a name to attach to.
// Reuses the newsletter-subscribers table with source=chat for CRM
// continuity. Does NOT trigger the welcome / drip emails.
async function handleChatCapture(request, body, ip) {
  const rl = await rateLimit({ ip, bucket: "chat", windowSeconds: 3600, max: 30 });
  if (!rl.ok) return json(429, { ok: false, error: "rate_limited" });
  const email = stripHeaderCtrl(String(body.email || "").slice(0, 320)).toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json(400, { ok: false, error: "invalid_email" });
  }
  const note = stripHeaderCtrl(String(body.note || "").slice(0, 500));
  try {
    const existing = await sql`
      SELECT id FROM newsletter_subscribers WHERE lower(email) = ${email} LIMIT 1
    `;
    if (existing.length === 0) {
      const confirmToken = crypto.randomUUID();
      const unsubToken = crypto.randomUUID();
      await sql`
        INSERT INTO newsletter_subscribers (email, confirm_token, unsubscribe_token, source, ip)
        VALUES (${email}, ${confirmToken}, ${unsubToken}, ${"chat"}, ${ip})
      `;
    }
    // Note is intentionally not persisted (no column on newsletter_subscribers).
    // It still arrives in our logs so we can grep transcripts if needed.
    if (note) console.log("[chat] capture note", { email, note: note.slice(0, 200) });
    return json(200, { ok: true });
  } catch (err) {
    console.error("[chat] capture error", err);
    // Soft-fail — chat shouldn't break if the DB write fails.
    return json(200, { ok: true, degraded: true });
  }
}

// ---------- Stripe Webhook ----------
//
// Verifies the `stripe-signature` header against STRIPE_WEBHOOK_SECRET
// using Stripe's canonical scheme: HMAC-SHA256 over `${timestamp}.${rawBody}`.
// Replays > 5 minutes old are rejected.
//
// On checkout.session.completed we:
//   1. Pull customer_email + amount_total from the session.
//   2. Upsert the buyer into newsletter_subscribers (source=stripe) so they
//      enter the same CRM funnel as a chat-capture or form submission.
//   3. Email a heads-up to ADMIN_EMAIL so the human sees the sale.
//
// Other event types are acknowledged but not acted on yet — they're logged
// to console so future automation has audit context. Adding the
// stripe_events DB table later (see db/migrations/016_stripe_events.sql)
// will give us idempotent dedupe.

const STRIPE_WEBHOOK_TOLERANCE_S = 300; // 5 minutes

function timingSafeEqualHex(aHex, bHex) {
  if (typeof aHex !== "string" || typeof bHex !== "string") return false;
  if (aHex.length !== bHex.length) return false;
  let mismatch = 0;
  for (let i = 0; i < aHex.length; i++) mismatch |= aHex.charCodeAt(i) ^ bHex.charCodeAt(i);
  return mismatch === 0;
}

async function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return { ok: false, reason: "missing" };
  // Header format: t=1492774577,v1=hex,v1=hex,v0=hex
  const parts = Object.fromEntries(
    sigHeader.split(",").map((p) => {
      const idx = p.indexOf("=");
      return [p.slice(0, idx).trim(), p.slice(idx + 1).trim()];
    })
  );
  const t = Number(parts.t);
  const v1List = sigHeader
    .split(",")
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3).trim());
  if (!t || v1List.length === 0) return { ok: false, reason: "malformed" };

  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - t) > STRIPE_WEBHOOK_TOLERANCE_S) {
    return { ok: false, reason: "stale" };
  }

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${rawBody}`));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (!v1List.some((sig) => timingSafeEqualHex(sig, expected))) {
    return { ok: false, reason: "bad_signature" };
  }
  return { ok: true };
}

async function handleStripeWebhook(request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = request.headers.get("stripe-signature");
  if (!secret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET missing");
    return json(500, { ok: false, error: "not_configured" });
  }
  let rawBody;
  try {
    rawBody = await request.text();
  } catch {
    return json(400, { ok: false, error: "no_body" });
  }
  const verify = await verifyStripeSignature(rawBody, sig, secret);
  if (!verify.ok) {
    console.warn("[stripe-webhook] signature rejected", { reason: verify.reason });
    return json(400, { ok: false, error: "bad_signature" });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }
  const type = event?.type || "unknown";
  const id = event?.id || "evt_unknown";
  console.log("[stripe-webhook] verified", { id, type, livemode: event.livemode });

  // Persist every verified event to stripe_events for audit + idempotency.
  // ON CONFLICT DO NOTHING means a Stripe redelivery is a no-op.
  try {
    const obj = event.data?.object || {};
    const evtEmail = (obj.customer_details?.email || obj.customer_email || obj.receipt_email || "").toLowerCase() || null;
    const evtCustomer = typeof obj.customer === "string" ? obj.customer : (obj.customer?.id || null);
    const evtAmount = obj.amount_total ?? obj.amount_paid ?? obj.amount_due ?? null;
    const evtCurrency = obj.currency || null;
    const occurredAt = event.created ? new Date(event.created * 1000) : new Date();
    await sql`
      INSERT INTO stripe_events (id, type, livemode, api_version, occurred_at, customer_email, customer_id, amount_total, currency, data)
      VALUES (${id}, ${type}, ${!!event.livemode}, ${event.api_version || null}, ${occurredAt}, ${evtEmail}, ${evtCustomer}, ${evtAmount}, ${evtCurrency}, ${JSON.stringify(event)}::jsonb)
      ON CONFLICT (id) DO NOTHING
    `;
  } catch (auditErr) {
    console.error("[stripe-webhook] audit insert failed", auditErr);
  }

  try {
    if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") {
      const s = event.data?.object || {};
      const email = (s.customer_details?.email || s.customer_email || "").toLowerCase();
      const amount = s.amount_total ?? null;
      const currency = s.currency || "usd";
      const customerId = typeof s.customer === "string" ? s.customer : (s.customer?.id || null);
      const tier = s.metadata?.tier || null;
      const cadence = s.metadata?.cadence || null;
      console.log("[stripe-webhook] checkout completed", { email, amount, currency, tier, cadence, customerId });

      // Upsert into newsletter_subscribers so the buyer lands in our
      // existing CRM. We mark them confirmed since they just transacted.
      if (email) {
        try {
          const existing = await sql`SELECT id FROM newsletter_subscribers WHERE lower(email) = ${email} LIMIT 1`;
          if (existing.length === 0) {
            const confirmToken = crypto.randomUUID();
            const unsubToken = crypto.randomUUID();
            await sql`
              INSERT INTO newsletter_subscribers (email, confirm_token, unsubscribe_token, source, ip, confirmed_at)
              VALUES (${email}, ${confirmToken}, ${unsubToken}, ${"stripe"}, ${"webhook"}, now())
            `;
          } else {
            await sql`
              UPDATE newsletter_subscribers
              SET confirmed_at = COALESCE(confirmed_at, now())
              WHERE id = ${existing[0].id}
            `;
          }
        } catch (dbErr) {
          console.error("[stripe-webhook] db upsert failed", dbErr);
        }
      }

      // Notify admin via Resend if configured. Best-effort.
      const adminEmail = process.env.ADMIN_EMAIL;
      const resendKey = process.env.RESEND_API_KEY;
      if (adminEmail && resendKey && email) {
        try {
          const resend = new Resend(resendKey);
          const dollars = amount != null ? `$${(amount / 100).toFixed(2)} ${currency.toUpperCase()}` : "amount n/a";
          const tierLabel = tier ? `${tier}${cadence ? ` (${cadence})` : ""}` : "Stripe checkout";
          await resend.emails.send({
            from: "Simple IT SRQ <hello@simpleitsrq.com>",
            to: adminEmail,
            subject: `New Stripe sale: ${tierLabel} — ${dollars}`,
            text: `Customer: ${email}\nTier: ${tierLabel}\nAmount: ${dollars}\nStripe customer: ${customerId || "n/a"}\nEvent: ${id}\n\nDashboard: https://dashboard.stripe.com/customers/${customerId || ""}`,
          });
        } catch (mailErr) {
          console.warn("[stripe-webhook] admin notify failed", mailErr);
        }
      }
    }
  } catch (err) {
    console.error("[stripe-webhook] handler error", err);
    // Always 200 so Stripe doesn't retry storm us — we logged the failure.
  }

  return json(200, { ok: true, received: type });
}

// Double-opt-in newsletter subscribe. Creates or refreshes a row in
// newsletter_subscribers, emails a confirmation link. Does NOT add
// the subscriber to the list until they click the link. Re-subscribing
// over an existing confirmed row is a no-op (returns ok without sending
// a second email).
async function handleNewsletterSubscribe(request, body, ip) {
  const email = String(body.email || "").trim().toLowerCase().slice(0, 320);
  if (!email || !isEmail(email)) return json(400, { ok: false, error: "email_invalid" });
  const source = String(body.source || "newsletter").slice(0, 64);

  const existing = await sql`
    SELECT id, confirmed_at, confirm_token FROM newsletter_subscribers
    WHERE lower(email) = ${email} LIMIT 1
  `.catch(() => []);

  let confirmToken, unsubscribeToken;
  if (existing[0]?.confirmed_at) {
    // Already confirmed — behave idempotently, no second email.
    return json(200, { ok: true, alreadyConfirmed: true });
  }
  if (existing[0]) {
    confirmToken = existing[0].confirm_token;
    // reuse existing unsubscribe token to keep mail-log traceability
    const row = await sql`
      UPDATE newsletter_subscribers
      SET source = ${source}, ip = ${ip}, created_at = now()
      WHERE id = ${existing[0].id}
      RETURNING unsubscribe_token
    `;
    unsubscribeToken = row[0]?.unsubscribe_token;
  } else {
    confirmToken = randomToken();
    unsubscribeToken = randomToken();
    await sql`
      INSERT INTO newsletter_subscribers (email, confirm_token, unsubscribe_token, source, ip)
      VALUES (${email}, ${confirmToken}, ${unsubscribeToken}, ${source}, ${ip})
    `;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[newsletter] RESEND_API_KEY not set — subscribe request logged but confirm email not sent");
    return json(200, { ok: true, sent: false });
  }

  const confirmUrl = `${SITE_URL}/api/contact?confirm=${confirmToken}`;
  const unsubscribeUrl = `${SITE_URL}/api/contact?unsubscribe=${unsubscribeToken}`;

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: NEWSLETTER_FROM,
      to: [email],
      subject: "Please confirm your subscription to The Simple IT Brief",
      text: [
        `Hi,`,
        ``,
        `Please confirm your subscription to The Simple IT Brief by clicking this link:`,
        confirmUrl,
        ``,
        `If you didn't sign up, ignore this email — you won't receive anything else.`,
        ``,
        `— Simple IT SRQ`,
        ``,
        `To unsubscribe at any time: ${unsubscribeUrl}`,
      ].join("\n"),
      html: `
        <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
          <h2 style="margin:0 0 16px;color:#0F6CBD">Confirm your subscription</h2>
          <p style="font-size:15px;line-height:1.6;color:#1a1a1a">Please confirm your subscription to <strong>The Simple IT Brief</strong> — one email a month, plain-English security, AI, and cloud news for Sarasota and Bradenton business owners.</p>
          <p style="margin:24px 0"><a href="${confirmUrl}" style="display:inline-block;padding:12px 22px;background:#0F6CBD;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Confirm subscription</a></p>
          <p style="font-size:13px;color:#6b7280;margin-top:24px">If you didn't sign up, just ignore this email.</p>
          <p style="font-size:11px;color:#9ca3af;margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb">Not interested? <a href="${unsubscribeUrl}" style="color:#9ca3af">Unsubscribe</a>.</p>
        </div>
      `,
      headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
    });
    return json(200, { ok: true, sent: true });
  } catch (err) {
    console.error("[newsletter] confirm email failed", err);
    return json(200, { ok: true, sent: false });
  }
}

export async function GET(request) {
  const url = new URL(request.url);
  const confirm = url.searchParams.get("confirm");
  const unsubscribe = url.searchParams.get("unsubscribe");
  const testimonials = url.searchParams.get("testimonials");
  const action = url.searchParams.get("action");

  // Threat Wall feed — admin-only. Returns 403 to anonymous callers so
  // the per-attack timeline isn't part of our public attack surface.
  // The /live-threats page checks this and redirects non-admins. The
  // homepage live-defense strip used to read this endpoint too — it
  // now uses ?action=protection-status (anonymous, summary-only) so
  // visitors get a trust signal without seeing per-attack rows.
  if (action === "threats") {
    if (!(await isAdminRequest(request))) {
      return json(403, { ok: false, error: "admin_only" });
    }
    try {
      const rows = await sql`
        SELECT ip, country, city, path, user_agent, threat_class, ts
        FROM threat_actors
        WHERE ts > now() - interval '48 hours'
          AND threat_class IN ('scanner', 'exploit_attempt', 'hostile_geo', 'osint_match')
        ORDER BY ts DESC
        LIMIT 100
      `.catch(() => []);
      const [stats] = await sql`
        SELECT
          COUNT(*)::int                                AS hits_48h,
          COUNT(DISTINCT ip)::int                      AS uniq_ips_48h,
          COUNT(*) FILTER (WHERE threat_class = 'exploit_attempt')::int AS exploits_48h
        FROM threat_actors
        WHERE ts > now() - interval '48 hours'
      `.catch(() => [{}]);
      const [blocklist] = await sql`SELECT COUNT(*)::int AS n FROM ip_blocklist`.catch(() => [{}]);

      const items = rows.map((r) => {
        const id = identifyScanner({ userAgent: r.user_agent, path: r.path });
        return {
          ip: anonIp(r.ip),
          country: r.country || null,
          city: r.city || null,
          threatClass: r.threat_class,
          tool: id.tool || null,
          cms: id.cms || null,
          cve: id.cve || null,
          cveName: id.cveName || null,
          // Truncate the path so we don't leak unusual honeypot tokens.
          pathSummary: summarizePath(r.path),
          ts: r.ts,
        };
      });

      return new Response(JSON.stringify({
        items,
        stats: {
          hits48h: stats?.hits_48h || 0,
          uniqueIps48h: stats?.uniq_ips_48h || 0,
          exploitAttempts48h: stats?.exploits_48h || 0,
          blocklistTotal: blocklist?.n || 0,
        },
        generatedAt: new Date().toISOString(),
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          // Admin-only data — never cache at edge.
          "Cache-Control": "private, no-store",
        },
      });
    } catch {
      return json(200, { items: [], stats: {} });
    }
  }

  // Public protection-status — only ever returns abstract trust copy.
  // No live counts, no per-attack rows. Used by the homepage strip so
  // visitors see "this site is actively protected" without the actual
  // numbers becoming public OPSEC intelligence.
  if (action === "protection-status") {
    return new Response(JSON.stringify({
      ok: true,
      protectionActive: true,
      headline: "Active 24/7 — automated CVE auto-block, OSINT threat-feed enrichment, honeypot trapping, and rate-limit defense.",
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  }

  if (testimonials) {
    const productSlug = url.searchParams.get("product") || null;
    const rows = productSlug
      ? await sql`
          SELECT id, quote, author_name, author_role, author_company, city, product_slug, rating
          FROM testimonials
          WHERE approved = true AND product_slug = ${productSlug}
          ORDER BY created_at DESC LIMIT 12
        `.catch(() => [])
      : await sql`
          SELECT id, quote, author_name, author_role, author_company, city, product_slug, rating
          FROM testimonials
          WHERE approved = true
          ORDER BY created_at DESC LIMIT 12
        `.catch(() => []);
    return json(200, {
      ok: true,
      testimonials: rows.map((t) => ({
        id: t.id,
        quote: t.quote,
        authorName: t.author_name,
        authorRole: t.author_role,
        authorCompany: t.author_company,
        city: t.city,
        productSlug: t.product_slug,
        rating: t.rating,
      })),
    });
  }

  if (confirm) {
    // Use a CTE so we know whether THIS request is the one that flipped
    // confirmed_at from null to a value. We only fire the welcome email
    // on the actual transition — re-clicking a confirm link a second
    // time should be idempotent (no second welcome).
    const rows = await sql`
      WITH before AS (
        SELECT id, confirmed_at AS prior_confirmed_at, welcome_sent_at, unsubscribe_token
        FROM newsletter_subscribers
        WHERE confirm_token = ${confirm}
        FOR UPDATE
      ),
      updated AS (
        UPDATE newsletter_subscribers ns
        SET confirmed_at = COALESCE(ns.confirmed_at, now())
        FROM before
        WHERE ns.id = before.id
        RETURNING ns.id, ns.email, before.prior_confirmed_at, before.welcome_sent_at, before.unsubscribe_token
      )
      SELECT * FROM updated
    `.catch(() => []);
    const row = rows[0];
    const ok = !!row;
    const justConfirmed = ok && row.prior_confirmed_at === null && row.welcome_sent_at === null;

    if (justConfirmed) {
      // Fire welcome email out-of-band — never block the redirect on
      // mail delivery. Sets welcome_sent_at on success so the cron job
      // doesn't double-send. Failures are logged; the user is still
      // confirmed (the welcome email is deliverable separately).
      sendWelcomeEmail(row.email, row.unsubscribe_token).then(async (sent) => {
        if (sent) {
          await sql`
            UPDATE newsletter_subscribers
            SET welcome_sent_at = now()
            WHERE id = ${row.id}
          `.catch(() => {});
        }
      }).catch((err) => {
        console.error("[newsletter] welcome email failed", err);
      });
    }

    return new Response(ok ? `<!doctype html><meta http-equiv="refresh" content="0; url=/?newsletter=confirmed"><title>Confirmed</title><p>Subscription confirmed. Redirecting…</p>` : `<!doctype html><title>Link expired</title><p>That confirmation link has expired or was already used. <a href="/">Back to home</a>.</p>`, {
      status: ok ? 200 : 410,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  if (unsubscribe) {
    const rows = await sql`
      UPDATE newsletter_subscribers
      SET unsubscribed_at = COALESCE(unsubscribed_at, now())
      WHERE unsubscribe_token = ${unsubscribe}
      RETURNING email
    `.catch(() => []);
    const ok = rows.length > 0;
    return new Response(ok ? `<!doctype html><title>Unsubscribed</title><p>You've been unsubscribed. Sorry to see you go. <a href="/">Back to home</a>.</p>` : `<!doctype html><title>Unknown link</title><p>That unsubscribe link is not recognized. <a href="/">Back to home</a>.</p>`, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  return json(405, { ok: false, error: "method_not_allowed" });
}

export async function POST(request) {
  // -1. Stripe webhook short-circuit. Stripe POSTs JSON with a
  //     `stripe-signature` header; CSRF / Turnstile / Origin don't apply
  //     because the request originates from Stripe's edge, not a browser.
  //     Authenticity is enforced via HMAC-SHA256 over the raw body.
  if (request.headers.get("stripe-signature")) {
    return handleStripeWebhook(request);
  }

  // 0. CSRF — double-submit cookie + Origin check. Layered ON TOP of
  //    Turnstile/BotID/rate-limit below; this only rejects cross-origin
  //    attempts from a page the user didn't intend to submit from.
  const csrf = requireCsrf(request);
  if (csrf) return csrf;

  // 1. Vercel BotID — non-blocking. Log but don't reject — iOS Safari
  //    often fails client-side verification. Turnstile + rate-limit still apply.
  try {
    const verification = await checkBotId();
    if (verification.isBot) {
      console.warn("[contact] BotID flagged as bot", { ip: clientIp(request) });
    }
  } catch (err) {
    console.warn("[contact] checkBotId failed (non-blocking)", err);
  }

  const ip = clientIp(request);

  // 2. Parse body (needed before Turnstile because token lives in body)
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }
  if (!body || typeof body !== "object") {
    return json(400, { ok: false, error: "invalid_body" });
  }

  // Short-circuit: newsletter subscribe path. Uses the same rate-limit
  // bucket as the contact form so a bot can't enumerate by sending 1000
  // subscribe requests an hour.
  if (body.kind === "newsletter_subscribe") {
    const rl = await rateLimit({ ip, bucket: "contact", windowSeconds: RATE_WINDOW_S, max: RATE_MAX });
    if (!rl.ok) return json(429, { ok: false, error: "rate_limited" });
    return handleNewsletterSubscribe(request, body, ip);
  }

  // Short-circuit: public exposure-scan lead magnet. Runs a passive DNS +
  // Cert-Transparency scan of a domain the visitor entered, stores the
  // email as a newsletter lead, and returns the report. Rate-limited
  // aggressively (bucket=scan) so someone can't scan 10k domains through
  // our quota. Does NOT require Turnstile — the scan itself is bounded
  // and cheap, and asking for a captcha before showing value kills the
  // conversion rate.
  if (body.kind === "exposure_scan") {
    const rl = await rateLimit({ ip, bucket: "scan", windowSeconds: 3600, max: 12 });
    if (!rl.ok) return json(429, { ok: false, error: "rate_limited" });
    return handleExposureScan(request, body, ip);
  }

  // Short-circuit: AI chat. Rate-limited under "chat" bucket. CSRF + Origin
  // already validated above. Skips Turnstile (chat needs to be frictionless;
  // rate limit + CSRF are the guardrails).
  if (body.kind === "chat") {
    return handleChat(request, body, ip);
  }
  if (body.kind === "chat_capture") {
    return handleChatCapture(request, body, ip);
  }

  // 3. Cloudflare Turnstile
  const turnstile = await verifyTurnstile(body.turnstileToken, ip);
  if (!turnstile.ok) {
    console.warn("[contact] turnstile rejected", {
      ip,
      reason: turnstile.reason,
      codes: turnstile.codes,
    });
    return json(403, { ok: false, error: "bot_detected" });
  }

  // 4. Rate limit
  const rl = await rateLimit({ ip, bucket: "contact", windowSeconds: RATE_WINDOW_S, max: RATE_MAX });
  if (!rl.ok) {
    return json(429, { ok: false, error: "rate_limited" });
  }

  // 5. Honeypot — real users leave this blank; bots fill it.
  if (body._hp) return json(200, { ok: true });

  const name = stripHeaderCtrl(String(body.name || "").slice(0, 200));
  const company = stripHeaderCtrl(String(body.company || "").slice(0, 200));
  const email = stripHeaderCtrl(String(body.email || "").slice(0, 320));
  const phone = stripHeaderCtrl(String(body.phone || "").slice(0, 50));
  const message = String(body.message || "").trim().slice(0, 5000);

  // 6. Validate
  if (!name) return json(400, { ok: false, error: "name_required" });
  if (!email || !isEmail(email)) return json(400, { ok: false, error: "email_invalid" });
  if (!message) return json(400, { ok: false, error: "message_required" });

  const subject = `Website inquiry from ${name}${company ? ` (${company})` : ""}`;

  const textBody = [
    `New contact form submission`,
    ``,
    `Name:    ${name}`,
    `Company: ${company || "-"}`,
    `Email:   ${email}`,
    `Phone:   ${phone || "-"}`,
    ``,
    `Message:`,
    message,
    ``,
    `---`,
    `Sent via simpleitsrq.com contact form`,
    `Submitter IP: ${ip}`,
  ].join("\n");

  const htmlBody = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
      <h2 style="margin:0 0 16px;color:#0F6CBD">New website inquiry</h2>
      <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px">
        <tr><td style="color:#6b7280">Name</td><td><strong>${escapeHtml(name)}</strong></td></tr>
        <tr><td style="color:#6b7280">Company</td><td>${escapeHtml(company || "-")}</td></tr>
        <tr><td style="color:#6b7280">Email</td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
        <tr><td style="color:#6b7280">Phone</td><td>${escapeHtml(phone || "-")}</td></tr>
      </table>
      <h3 style="margin:20px 0 8px;font-size:14px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em">Message</h3>
      <div style="white-space:pre-wrap;padding:12px 14px;background:#f7f7f8;border-radius:8px;font-size:14px;line-height:1.5">${escapeHtml(message)}</div>
      <p style="margin-top:20px;font-size:12px;color:#9ca3af">Sent via simpleitsrq.com · IP ${escapeHtml(ip)}</p>
    </div>
  `;

  // 7. Send via Resend
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[contact] RESEND_API_KEY not set — cannot send mail");
    return json(500, { ok: false, error: "send_failed" });
  }

  const resend = new Resend(apiKey);
  const contactTo = process.env.CONTACT_TO_EMAIL || CONTACT_TO_DEFAULT;
  try {
    const { data, error } = await resend.emails.send({
      from: CONTACT_FROM,
      to: [contactTo],
      replyTo: email,
      subject,
      text: textBody,
      html: htmlBody,
    });

    if (error) {
      console.error("[contact] resend error", error);
      return json(502, { ok: false, error: "send_failed" });
    }

    console.log("[contact] sent", { id: data?.id });
    return json(200, { ok: true });
  } catch (err) {
    console.error("[contact] resend threw", err);
    return json(502, { ok: false, error: "send_failed" });
  }
}
