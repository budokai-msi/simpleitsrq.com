// Vercel Serverless Function: POST /api/ticket
//
// Structured support ticket submission. Same hardening pipeline as /api/contact:
//   1. checkBotId() — Vercel BotID
//   2. Cloudflare Turnstile siteverify
//   3. Per-IP rate limit (in-memory, per Fluid Compute instance)
//   4. Honeypot
//   5. Validate
//   6. Generate ticket ID (SRQ-YYYYMMDD-XXXXX)
//   7. Send formatted HTML + text email via Resend to CONTACT_TO_EMAIL
//
// Env vars (set in Vercel → Settings → Environment Variables):
//   RESEND_API_KEY         — required in prod
//   TURNSTILE_SECRET_KEY   — required in prod
//   CONTACT_TO_EMAIL       — optional, inbox for support tickets.
//                            Defaults to hello@simpleitsrq.com.

import { checkBotId } from "botid/server";
import { Resend } from "resend";
import { sql } from "./_lib/db.js";
import { clientIp, rateLimit } from "./_lib/security.js";
import { getSession } from "./_lib/session.js";

const TICKET_FROM = "Simple IT SRQ Support <support@simpleitsrq.com>";
const CONTACT_TO_DEFAULT = "hello@simpleitsrq.com";
const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const ALLOWED_PRIORITIES = new Set(["low", "normal", "high", "critical"]);
const PRIORITY_LABELS = {
  low:      "Low",
  normal:   "Normal",
  high:     "High",
  critical: "CRITICAL",
};
const PRIORITY_COLORS = {
  low:      "#6b7280",
  normal:   "#0F6CBD",
  high:     "#D97706",
  critical: "#DC2626",
};

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

// ---------- Ticket ID ----------
// Format: SRQ-YYYYMMDD-XXXXX where XXXXX is a 5-char base36 random segment.
// Not globally unique — these are human-friendly references, not DB primary keys.
function generateTicketId() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `SRQ-${y}${m}${d}-${rand}`;
}

// Rate limit config — DB-backed sliding window (see _lib/security.js).
// Survives across Fluid Compute instances; keys on x-real-ip (not spoofable).
const RATE_WINDOW_S = 10 * 60;
const RATE_MAX = 5;

// ---------- Turnstile ----------
async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.warn("[ticket] TURNSTILE_SECRET_KEY not set; skipping Turnstile verify");
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
    console.error("[ticket] turnstile verify threw", err);
    return { ok: true, skipped: true, err: String(err) };
  }
}

// ---------- Handler ----------
export async function POST(request) {
  // 1. Vercel BotID — non-blocking. Log the result but don't reject real
  //    users whose browsers fail client-side verification (common on iOS
  //    Safari). Turnstile + honeypot + rate-limit still catch actual bots.
  try {
    const verification = await checkBotId();
    if (verification.isBot) {
      console.warn("[ticket] BotID flagged as bot", { ip: clientIp(request) });
    }
  } catch (err) {
    console.warn("[ticket] checkBotId failed (non-blocking)", err);
  }

  const ip = clientIp(request);

  // 2. Parse body
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }
  if (!body || typeof body !== "object") {
    return json(400, { ok: false, error: "invalid_body" });
  }

  // 3. Cloudflare Turnstile
  const turnstile = await verifyTurnstile(body.turnstileToken, ip);
  if (!turnstile.ok) {
    console.warn("[ticket] turnstile rejected", {
      ip, reason: turnstile.reason, codes: turnstile.codes,
    });
    return json(403, { ok: false, error: "bot_detected" });
  }

  // 4. Rate limit
  const rl = await rateLimit({ ip, bucket: "ticket", windowSeconds: RATE_WINDOW_S, max: RATE_MAX });
  if (!rl.ok) {
    return json(429, { ok: false, error: "rate_limited" });
  }

  // 5. Honeypot
  if (body._hp) return json(200, { ok: true, ticketId: generateTicketId() });

  const name        = stripHeaderCtrl(String(body.name || "").slice(0, 200));
  const company     = stripHeaderCtrl(String(body.company || "").slice(0, 200));
  const email       = stripHeaderCtrl(String(body.email || "").slice(0, 320));
  const phone       = stripHeaderCtrl(String(body.phone || "").slice(0, 50));
  const priorityRaw = String(body.priority || "normal").trim().toLowerCase();
  const priority    = ALLOWED_PRIORITIES.has(priorityRaw) ? priorityRaw : "normal";
  const category    = stripHeaderCtrl(String(body.category || "Other").slice(0, 200));
  const subject     = stripHeaderCtrl(String(body.subject || "").slice(0, 200));
  const description = String(body.description || "").trim().slice(0, 8000);

  // 6. Validate
  if (!name) return json(400, { ok: false, error: "name_required" });
  if (!email || !isEmail(email)) return json(400, { ok: false, error: "email_invalid" });
  if (!subject) return json(400, { ok: false, error: "subject_required" });
  if (!description) return json(400, { ok: false, error: "description_required" });

  const ticketId = generateTicketId();
  const priorityLabel = PRIORITY_LABELS[priority];
  const priorityColor = PRIORITY_COLORS[priority];

  // Persist to Neon. If the submitter is signed in we link the ticket to
  // them; otherwise the row carries the email so it can be matched later
  // when they first sign in.
  let currentUserId = null;
  try {
    const session = await getSession(request);
    if (session) currentUserId = session.user.id;
  } catch (err) {
    console.warn("[ticket] getSession failed", err);
  }

  try {
    await sql`
      INSERT INTO tickets (
        ticket_code, user_id, email, name, company, phone,
        priority, category, subject, description, status
      ) VALUES (
        ${ticketId}, ${currentUserId}, ${email}, ${name}, ${company || null}, ${phone || null},
        ${priority}, ${category}, ${subject}, ${description}, 'open'
      )
    `;
  } catch (err) {
    // Non-fatal: the email still sends even if the DB write fails, so the
    // client never gets a confusing error after a successful submission.
    console.error("[ticket] db insert failed", err);
  }

  const mailSubject =
    priority === "critical"
      ? `[CRITICAL ${ticketId}] ${subject}`
      : `[${priorityLabel} ${ticketId}] ${subject}`;

  const textBody = [
    `New support ticket: ${ticketId}`,
    ``,
    `Priority: ${priorityLabel}`,
    `Category: ${category}`,
    `Subject:  ${subject}`,
    ``,
    `Name:     ${name}`,
    `Company:  ${company || "-"}`,
    `Email:    ${email}`,
    `Phone:    ${phone || "-"}`,
    ``,
    `Description:`,
    description,
    ``,
    `---`,
    `Submitted via simpleitsrq.com/support`,
    `Ticket ID: ${ticketId}`,
    `Submitter IP: ${ip}`,
  ].join("\n");

  const htmlBody = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a">
      <div style="padding:14px 18px;background:${priorityColor};color:#fff;border-radius:8px 8px 0 0;display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;opacity:.9">New Support Ticket</div>
          <div style="font-size:20px;font-weight:700;margin-top:2px">${escapeHtml(ticketId)}</div>
        </div>
        <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">${escapeHtml(priorityLabel)}</div>
      </div>
      <div style="padding:20px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
        <h2 style="margin:0 0 14px;font-size:18px;color:#0F6CBD">${escapeHtml(subject)}</h2>
        <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px;width:100%">
          <tr><td style="color:#6b7280;width:110px">Category</td><td><strong>${escapeHtml(category)}</strong></td></tr>
          <tr><td style="color:#6b7280">Name</td><td>${escapeHtml(name)}</td></tr>
          <tr><td style="color:#6b7280">Company</td><td>${escapeHtml(company || "-")}</td></tr>
          <tr><td style="color:#6b7280">Email</td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
          <tr><td style="color:#6b7280">Phone</td><td>${phone ? `<a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a>` : "-"}</td></tr>
        </table>
        <h3 style="margin:20px 0 8px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em">Description</h3>
        <div style="white-space:pre-wrap;padding:14px 16px;background:#f7f7f8;border-radius:8px;font-size:14px;line-height:1.55">${escapeHtml(description)}</div>
        <p style="margin-top:22px;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px">
          Ticket <strong>${escapeHtml(ticketId)}</strong> - submitted via simpleitsrq.com/support - IP ${escapeHtml(ip)}
        </p>
      </div>
    </div>
  `;

  // 7. Send via Resend
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[ticket] RESEND_API_KEY not set — cannot send mail");
    return json(500, { ok: false, error: "send_failed" });
  }

  const resend = new Resend(apiKey);
  const contactTo = process.env.CONTACT_TO_EMAIL || CONTACT_TO_DEFAULT;
  try {
    const { data, error } = await resend.emails.send({
      from: TICKET_FROM,
      to: [contactTo],
      replyTo: email,
      subject: mailSubject,
      text: textBody,
      html: htmlBody,
      headers: {
        "X-Ticket-ID": ticketId,
        "X-Priority": priority,
      },
    });

    if (error) {
      console.error("[ticket] resend error", error);
      return json(502, { ok: false, error: "send_failed" });
    }

    console.log("[ticket] sent", { id: data?.id, ticketId, priority });
    return json(200, { ok: true, ticketId });
  } catch (err) {
    console.error("[ticket] resend threw", err);
    return json(502, { ok: false, error: "send_failed" });
  }
}
