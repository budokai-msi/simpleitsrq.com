// api/_lib/session.js
//
// Opaque-token session helpers with full session lifecycle tracking
// and hijack detection. The browser holds a random 32-byte token in
// an HttpOnly cookie; the DB stores only a SHA-256 hash.

import { sql } from "./db.js";
import { clientIp } from "./security.js";

const SESSION_COOKIE = "sirq_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashToken(token) {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function extractRequestMeta(request) {
  // Use the same authoritative resolver as the rest of the API — prefers
  // x-real-ip (set by the Vercel edge, not client-reachable). Reading
  // x-forwarded-for directly was trivially spoofable and caused session
  // tracking, hijack detection, and admin-IP immunity to disagree with
  // rate-limiting and blocklists.
  const rawIp = clientIp(request);
  const ip = rawIp === "unknown" ? null : rawIp;
  const ua = request.headers.get("user-agent") || null;
  const country = request.headers.get("x-vercel-ip-country") || null;
  const city = request.headers.get("x-vercel-ip-city")
    ? decodeURIComponent(request.headers.get("x-vercel-ip-city"))
    : null;
  return { ip, ua, country, city };
}

async function deviceHashFromRequest(request) {
  const { ip, ua } = extractRequestMeta(request);
  const acceptLang = request.headers.get("accept-language") || "";
  return sha256([ip, ua, acceptLang].map((v) => String(v ?? "")).join("|"));
}

// Fire-and-forget session lifecycle log.
function logSessionEvent(event, { sessionId, userId, ip, ua, country, city, deviceHash, detail }) {
  sql`
    INSERT INTO session_tracking (event, session_id, user_id, ip, user_agent, country, city, device_hash, detail)
    VALUES (${event}, ${sessionId || null}, ${userId || null}, ${ip}, ${ua}, ${country}, ${city}, ${deviceHash || null},
            ${detail ? JSON.stringify(detail) : null}::jsonb)
  `.catch((err) => console.error("[session] tracking failed", err));
}

export function parseCookies(request) {
  const header = request.headers.get("cookie") || "";
  const out = {};
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function sessionCookieValue(token, maxAge) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

function clearCookieValue() {
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export async function createSession(userId, request) {
  const token = randomToken();
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const meta = extractRequestMeta(request);
  const deviceHash = await deviceHashFromRequest(request);

  const rows = await sql`
    INSERT INTO sessions (user_id, token_hash, expires_at, ip, user_agent)
    VALUES (${userId}, ${tokenHash}, ${expiresAt.toISOString()}, ${meta.ip}, ${meta.ua})
    RETURNING id
  `;

  logSessionEvent("created", {
    sessionId: rows[0]?.id,
    userId,
    ...meta,
    deviceHash,
  });

  return {
    token,
    cookie: sessionCookieValue(token, SESSION_TTL_SECONDS),
  };
}

export async function getSession(request) {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;

  const tokenHash = await hashToken(token);
  const rows = await sql`
    SELECT s.id, s.user_id, s.expires_at, s.ip AS session_ip, s.user_agent AS session_ua,
           u.email, u.name, u.avatar_url, u.company, u.phone, u.is_admin
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash}
      AND s.expires_at > now()
    LIMIT 1
  `;
  if (rows.length === 0) return null;

  const row = rows[0];
  const meta = extractRequestMeta(request);

  // --- Hijack detection ---
  // If the IP or UA changed since the session was created, log it as a
  // potential hijack attempt. We don't kill the session (IP changes happen
  // legitimately on mobile), but we flag it for review.
  const ipChanged = row.session_ip && meta.ip && row.session_ip !== meta.ip;
  const uaChanged = row.session_ua && meta.ua && row.session_ua !== meta.ua;

  if (ipChanged || uaChanged) {
    const deviceHash = await deviceHashFromRequest(request);
    logSessionEvent("anomaly", {
      sessionId: row.id,
      userId: row.user_id,
      ...meta,
      deviceHash,
      detail: {
        reason: [
          ipChanged ? "ip_changed" : null,
          uaChanged ? "ua_changed" : null,
        ].filter(Boolean),
        originalIp: row.session_ip,
        originalUa: row.session_ua,
        newIp: meta.ip,
        newUa: meta.ua,
      },
    });

    // If BOTH IP and UA changed, this is highly suspicious — log as critical.
    if (ipChanged && uaChanged) {
      sql`
        INSERT INTO security_events (kind, severity, ip, user_id, user_agent, path, detail)
        VALUES ('session.hijack_suspect', 'critical', ${meta.ip}, ${row.user_id}, ${meta.ua}, '/api/auth/session',
                ${JSON.stringify({
                  sessionId: row.id,
                  originalIp: row.session_ip,
                  originalUa: row.session_ua,
                })}::jsonb)
      `.catch(() => {});
    }
  }

  // Best-effort last-seen + IP bump.
  sql`UPDATE sessions SET last_seen_at = now(), ip = ${meta.ip} WHERE id = ${row.id}`.catch(() => {});

  return {
    sessionId: row.id,
    user: {
      id: row.user_id,
      email: row.email,
      name: row.name,
      avatarUrl: row.avatar_url,
      company: row.company,
      phone: row.phone,
      isAdmin: row.is_admin === true,
    },
  };
}

export async function destroySession(request) {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE];
  if (!token) return { cookie: clearCookieValue() };

  const tokenHash = await hashToken(token);
  const meta = extractRequestMeta(request);

  // Get session ID before deleting for the log.
  const rows = await sql`SELECT id, user_id FROM sessions WHERE token_hash = ${tokenHash}`;
  if (rows.length > 0) {
    logSessionEvent("destroyed", {
      sessionId: rows[0].id,
      userId: rows[0].user_id,
      ...meta,
    });
  }

  await sql`DELETE FROM sessions WHERE token_hash = ${tokenHash}`;
  return { cookie: clearCookieValue() };
}

export function clearSessionCookie() {
  return clearCookieValue();
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
