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

const CONTACT_FROM = "Simple IT SRQ Website <contact@simpleitsrq.com>";
const NEWSLETTER_FROM = "Simple IT Brief <hello@simpleitsrq.com>";
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
