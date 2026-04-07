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
// If either is missing (e.g. local dev without .env.local), the function
// "fails open" on that layer so the form is still usable in development.

import { checkBotId } from "botid/server";
import { Resend } from "resend";

const CONTACT_FROM = "Simple IT SRQ Website <contact@simpleitsrq.com>";
const CONTACT_TO = "hello@simpleitsrq.com";
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
const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_MAX = 5;                    // 5 submissions per window
const ipBuckets = new Map();

function clientIp(request) {
  const xff = request.headers.get("x-forwarded-for") || "";
  return xff.split(",")[0].trim() || "unknown";
}

function rateLimited(ip) {
  const now = Date.now();
  const arr = (ipBuckets.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) {
    ipBuckets.set(ip, arr);
    return true;
  }
  arr.push(now);
  ipBuckets.set(ip, arr);

  // Opportunistic cleanup so the Map doesn't grow forever.
  if (ipBuckets.size > 1000) {
    for (const [k, v] of ipBuckets) {
      const fresh = v.filter((t) => now - t < RATE_WINDOW_MS);
      if (fresh.length === 0) ipBuckets.delete(k);
      else ipBuckets.set(k, fresh);
    }
  }
  return false;
}

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
export async function POST(request) {
  // 1. Vercel BotID — invisible, server-side challenge verification
  try {
    const verification = await checkBotId();
    if (verification.isBot) {
      return json(403, { ok: false, error: "bot_detected" });
    }
  } catch (err) {
    console.error("[contact] checkBotId failed", err);
    // Fail open on BotID errors — don't block legit users if Vercel hiccups.
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
  if (rateLimited(ip)) {
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
  try {
    const { data, error } = await resend.emails.send({
      from: CONTACT_FROM,
      to: [CONTACT_TO],
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
