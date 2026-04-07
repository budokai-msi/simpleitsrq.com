// Vercel Serverless Function: POST /api/contact
//
// Pipeline:
//   1. Reject non-POST
//   2. checkBotId() — Vercel BotID Basic, free tier
//   3. Rate limit per IP (in-memory, per Fluid Compute instance)
//   4. Honeypot
//   5. Validate
//   6. Forward to Web3Forms (relays to hello@simpleitsrq.com)
//
// Web3Forms access key is a PUBLIC form ID (per Web3Forms docs) — safe to
// commit. It can only submit to the email registered at signup time. To
// rotate: visit https://web3forms.com dashboard, generate a new key,
// replace WEB3FORMS_KEY below, redeploy.

import { checkBotId } from "botid/server";

const WEB3FORMS_KEY = "caa0837e-5f10-4bcc-9da6-acbe5ea79491";
const WEB3FORMS_ENDPOINT = "https://api.web3forms.com/submit";

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
// Fluid Compute reuses instances across requests, so this provides
// soft per-instance rate limiting. Good enough for a contact form;
// upgrade to Upstash Redis if traffic grows.
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

// ---------- Handler ----------
export async function POST(request) {
  // 1. BotID — invisible challenge verification
  try {
    const verification = await checkBotId();
    if (verification.isBot) {
      return json(403, { ok: false, error: "bot_detected" });
    }
  } catch (err) {
    console.error("[contact] checkBotId failed", err);
    // Fail open: if BotID itself errors, fall through to rate limit + validation.
    // Better to accept legit traffic than block everyone if Vercel's BotID has a hiccup.
  }

  // 2. Rate limit
  const ip = clientIp(request);
  if (rateLimited(ip)) {
    return json(429, { ok: false, error: "rate_limited" });
  }

  // 3. Parse body
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }
  if (!body || typeof body !== "object") {
    return json(400, { ok: false, error: "invalid_body" });
  }

  // 4. Honeypot — real users leave this blank; bots fill it.
  if (body._hp) return json(200, { ok: true });

  const name = String(body.name || "").trim().slice(0, 200);
  const company = String(body.company || "").trim().slice(0, 200);
  const email = String(body.email || "").trim().slice(0, 320);
  const phone = String(body.phone || "").trim().slice(0, 50);
  const message = String(body.message || "").trim().slice(0, 5000);

  // 5. Validate
  if (!name) return json(400, { ok: false, error: "name_required" });
  if (!email || !isEmail(email)) return json(400, { ok: false, error: "email_invalid" });
  if (!message) return json(400, { ok: false, error: "message_required" });

  const subject = `Website inquiry from ${name}${company ? ` (${company})` : ""}`;

  const messageBody = [
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
  ].join("\n");

  try {
    const r = await fetch(WEB3FORMS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        access_key: WEB3FORMS_KEY,
        subject,
        from_name: `${name}${company ? ` (${company})` : ""}`,
        replyto: email,
        // Web3Forms shows these as labelled fields in the email body
        name,
        company: company || "-",
        email,
        phone: phone || "-",
        // The main message text
        message: messageBody,
      }),
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok || !data?.success) {
      console.error("[contact] web3forms error", r.status, data);
      return json(502, { ok: false, error: "send_failed" });
    }

    return json(200, { ok: true });
  } catch (err) {
    console.error("[contact] fetch failed", err);
    return json(502, { ok: false, error: "network_error" });
  }
}
