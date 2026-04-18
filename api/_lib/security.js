// api/_lib/security.js
//
// Shared helpers: client IP, rate limiting, IP deny list, security-event
// log writes, and a couple of header extractors for Vercel's geo data.

import { sql } from "./db.js";

// ISO 3166-1 alpha-2 codes for hostile-origin countries.
// Visitors from these countries never see the real site — they get a
// honeypot response and every detail is logged to threat_actors.
const HOSTILE_COUNTRIES = new Set(["CN", "RU", "KP"]);

export function isHostileGeo(request) {
  const country = (request.headers.get("x-vercel-ip-country") || "").toUpperCase();
  return HOSTILE_COUNTRIES.has(country);
}

export async function logThreatActor(request, extra = {}) {
  const h = request.headers;
  const ip = clientIp(request);
  const geo = geoFromHeaders(request);
  const ua = h.get("user-agent") || null;
  const acceptLang = h.get("accept-language") || null;

  // Capture a fingerprint from server-side signals only (no client JS ran).
  let deviceHash = null;
  try {
    const raw = [ip, ua, acceptLang, geo.timezone].map((v) => String(v ?? "")).join("|");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
    deviceHash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch { /* ignore */ }

  // Collect every request header for intel.
  const headersObj = {};
  for (const [k, v] of h.entries()) {
    if (k.startsWith("x-vercel-") || k === "cookie") continue; // skip infra + session
    headersObj[k] = v;
  }

  try {
    await sql`
      INSERT INTO threat_actors (
        ip, country, region, city, latitude, longitude,
        user_agent, accept_lang, device_hash,
        path, referrer, method, host, origin,
        headers_json, threat_class
      ) VALUES (
        ${ip}, ${geo.country}, ${geo.region}, ${geo.city}, ${geo.latitude}, ${geo.longitude},
        ${ua}, ${acceptLang}, ${deviceHash},
        ${extra.path || new URL(request.url).pathname}, ${h.get("referer") || null},
        ${request.method}, ${h.get("host") || null}, ${h.get("origin") || null},
        ${JSON.stringify(headersObj)}::jsonb, ${extra.threatClass || "hostile_geo"}
      )
    `;
  } catch (err) {
    console.error("[security] logThreatActor failed", err);
  }
}

export function clientIp(request) {
  // Prefer Vercel's authoritative x-real-ip header — set by the edge and not
  // reachable from client code. x-forwarded-for is trivially spoofable and
  // was the source of a rate-limit / blocklist bypass before this fix.
  const real = request.headers.get("x-real-ip");
  if (real) return real;
  const xff = request.headers.get("x-forwarded-for") || "";
  return xff.split(",")[0].trim() || "unknown";
}

export function geoFromHeaders(request) {
  // Vercel sets these on every request. They're not secrets.
  const h = request.headers;
  return {
    country:  h.get("x-vercel-ip-country") || null,
    region:   h.get("x-vercel-ip-country-region") || null,
    city:     h.get("x-vercel-ip-city") ? decodeURIComponent(h.get("x-vercel-ip-city")) : null,
    latitude: h.get("x-vercel-ip-latitude") || null,
    longitude: h.get("x-vercel-ip-longitude") || null,
    timezone: h.get("x-vercel-ip-timezone") || null,
  };
}

export async function logSecurityEvent({
  kind,
  severity = "info",
  ip = null,
  userId = null,
  userAgent = null,
  path = null,
  detail = null,
}) {
  try {
    await sql`
      INSERT INTO security_events (kind, severity, ip, user_id, user_agent, path, detail)
      VALUES (${kind}, ${severity}, ${ip}, ${userId}, ${userAgent}, ${path},
              ${detail ? JSON.stringify(detail) : null}::jsonb)
    `;

    // Real-time alert for critical events — don't wait for the daily cron.
    if (severity === "critical") {
      fireRealtimeAlert(kind, ip, detail).catch(() => {});
    }
  } catch (err) {
    console.error("[security] logSecurityEvent failed", err);
  }
}

async function fireRealtimeAlert(kind, ip, detail) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL || "hello@simpleitsrq.com";
  if (!apiKey) return;
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: "Simple IT SRQ Alert <alert@simpleitsrq.com>",
      to: [to],
      subject: `[CRITICAL] ${kind} — ${ip || "unknown"}`,
      text: `Critical security event on simpleitsrq.com\n\nKind: ${kind}\nIP: ${ip}\nTime: ${new Date().toISOString()}\n\nDetail:\n${JSON.stringify(detail, null, 2)}`,
    });
  } catch { /* best effort */ }
}

export async function isIpBlocked(ip) {
  if (!ip || ip === "unknown") return false;
  try {
    const rows = await sql`SELECT 1 FROM ip_blocklist WHERE ip = ${ip} LIMIT 1`;
    return rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * DB-backed sliding-window rate limiter. Trades a bit of precision for
 * persistence across Fluid Compute instances (the previous in-memory limiter
 * was per-instance).
 */
export async function rateLimit({ ip, bucket, windowSeconds, max }) {
  if (!ip || ip === "unknown") return { ok: true, remaining: max };
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowSeconds * 1000);

  try {
    // Upsert the counter. If the existing row is inside the window, bump
    // count; otherwise reset to 1 with a fresh window_start.
    const rows = await sql`
      INSERT INTO auth_throttle (ip, bucket, window_start, count)
      VALUES (${ip}, ${bucket}, ${now.toISOString()}, 1)
      ON CONFLICT (ip, bucket) DO UPDATE
        SET count = CASE
                      WHEN auth_throttle.window_start < ${windowStart.toISOString()}
                        THEN 1
                      ELSE auth_throttle.count + 1
                    END,
            window_start = CASE
                             WHEN auth_throttle.window_start < ${windowStart.toISOString()}
                               THEN ${now.toISOString()}
                             ELSE auth_throttle.window_start
                           END
      RETURNING count
    `;
    const count = Number(rows[0]?.count || 1);
    return { ok: count <= max, count, remaining: Math.max(0, max - count) };
  } catch (err) {
    console.error("[rateLimit] failed", err);
    // Fail open — it's better to serve the request than to false-positive-429.
    return { ok: true, remaining: max };
  }
}

/**
 * XSS-safe string truncation.
 */
export function safeStr(value, maxLength = 200) {
  return String(value || "").trim().slice(0, maxLength);
}

/**
 * Validate email format with a permissive RFC 5322-ish regex.
 */
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
}
