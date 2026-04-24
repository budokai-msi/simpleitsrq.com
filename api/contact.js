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
import { runExposureScan } from "./_lib/exposure.js";
import { identifyScanner } from "./_lib/scanner-fingerprints.js";

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
  const name  = String(body.name  || "").trim().slice(0, 120);
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

  // Public Threat Wall feed — last 48h of auto-blocked attacks, anonymized
  // to /24 so we can't accidentally doxx a misclassified legit visitor.
  // Safe to expose: only rows already marked as threats (scanner,
  // exploit_attempt, hostile_geo, osint_match), never raw visits. No user
  // agent strings leak — we only show the fingerprinted tool name.
  if (action === "threats") {
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
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        },
      });
    } catch {
      return json(200, { items: [], stats: {} });
    }
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
    const rows = await sql`
      UPDATE newsletter_subscribers
      SET confirmed_at = COALESCE(confirmed_at, now())
      WHERE confirm_token = ${confirm}
      RETURNING email
    `.catch(() => []);
    const ok = rows.length > 0;
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

  const name = String(body.name || "").trim().slice(0, 200);
  const company = String(body.company || "").trim().slice(0, 200);
  const email = String(body.email || "").trim().slice(0, 320);
  const phone = String(body.phone || "").trim().slice(0, 50);
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
