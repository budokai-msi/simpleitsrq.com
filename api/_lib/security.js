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

// Tamper-evident audit log via hash chain.
//
// Each row's `row_hash` = SHA-256 over (prev_hash || kind || severity || ip ||
// user_id || path || detail_json || ts_iso). A single tampered value anywhere
// in the chain breaks the hash of that row AND every subsequent row, which
// auditVerify() detects by recomputing and comparing.
//
// The chain only provides value if the columns exist. Run the migration in
// db/migrations/001_audit_chain.sql once, then every new event gets chained.
// If the migration hasn't been run yet, the helper degrades to the plain
// insert path so existing code keeps working.
async function chainHash(parts) {
  const raw = parts.map((p) => (p == null ? "" : String(p))).join("\x00");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function getLastRowHash() {
  try {
    const rows = await sql`SELECT row_hash FROM security_events WHERE row_hash IS NOT NULL ORDER BY id DESC LIMIT 1`;
    return rows[0]?.row_hash || "GENESIS";
  } catch {
    // Columns probably not migrated yet — return null signal so we skip chaining.
    return null;
  }
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
  const detailJson = detail ? JSON.stringify(detail) : null;
  const ts = new Date().toISOString();

  const prevHash = await getLastRowHash();

  try {
    if (prevHash === null) {
      // Legacy path — row_hash columns don't exist yet. Log without chaining
      // so the event still lands in the DB and cron jobs still work.
      await sql`
        INSERT INTO security_events (kind, severity, ip, user_id, user_agent, path, detail, ts)
        VALUES (${kind}, ${severity}, ${ip}, ${userId}, ${userAgent}, ${path},
                ${detailJson}::jsonb, ${ts})
      `;
    } else {
      const rowHash = await chainHash([prevHash, kind, severity, ip, userId, path, detailJson, ts]);
      // ts is set explicitly so the value hashed here matches the value
      // stored — relying on a DB DEFAULT would let NOW() drift past the JS
      // timestamp and break every row_hash on verify.
      await sql`
        INSERT INTO security_events (kind, severity, ip, user_id, user_agent, path, detail, ts, prev_hash, row_hash)
        VALUES (${kind}, ${severity}, ${ip}, ${userId}, ${userAgent}, ${path},
                ${detailJson}::jsonb, ${ts}, ${prevHash}, ${rowHash})
      `;
    }

    if (severity === "critical") {
      fireRealtimeAlert(kind, ip, detail).catch(() => {});
    }
  } catch (err) {
    console.error("[security] logSecurityEvent failed", err);
  }
}

// Walk the audit log chain and report any breaks. Returns
// { ok, totalRows, chainedRows, breaks: [{ id, reason }] }. Breaks are the
// first row id where the hash doesn't match the recomputed chain (meaning
// some value in the row, or its prev_hash reference, was tampered).
export async function auditVerify(limit = 5000) {
  try {
    const rows = await sql`
      SELECT id, kind, severity, ip, user_id, path, detail, ts, prev_hash, row_hash
      FROM security_events
      WHERE row_hash IS NOT NULL
      ORDER BY id ASC
      LIMIT ${limit}
    `;
    const breaks = [];
    let expectedPrev = "GENESIS";
    for (const r of rows) {
      if (r.prev_hash !== expectedPrev) {
        breaks.push({ id: r.id, reason: `prev_hash mismatch (got ${r.prev_hash?.slice(0, 12)}, expected ${expectedPrev.slice(0, 12)})` });
      }
      const detailJson = r.detail == null ? null : JSON.stringify(r.detail);
      const recomputed = await chainHash([
        r.prev_hash, r.kind, r.severity, r.ip, r.user_id, r.path, detailJson, new Date(r.ts).toISOString(),
      ]);
      if (recomputed !== r.row_hash) {
        breaks.push({ id: r.id, reason: `row_hash mismatch — row content likely tampered` });
      }
      expectedPrev = r.row_hash;
    }
    const totalRows = await sql`SELECT COUNT(*)::int AS n FROM security_events`;
    return {
      ok: breaks.length === 0,
      totalRows: totalRows[0]?.n || 0,
      chainedRows: rows.length,
      breaks: breaks.slice(0, 20),
    };
  } catch (err) {
    return { ok: false, error: String(err?.message || err), migrationNeeded: true };
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

// ---- In-memory L1 cache for rateLimit() --------------------------------
//
// The DB-backed limiter is authoritative, but most requests from a given IP
// are well under the per-bucket limit — every one of those was doing a full
// Postgres round-trip just to learn "yep, still under". The cache below
// short-circuits that hot path when we're CONFIDENTLY under the limit.
//
// Tradeoff: Fluid Compute runs multiple function instances concurrently, and
// each holds its own Map. Worst case, N instances each let an IP rack up
// (max/2 - 1) cached hits before any of them sync to the DB, so the effective
// ceiling drifts to roughly N * (max/2) for the cache-short-circuit window
// before the DB path clamps it back. That's acceptable because:
//   1. We only skip the DB when count+1 < max/2 — i.e. we have more than half
//      the budget still free. Any request that could plausibly hit the limit
//      falls through to the authoritative DB path.
//   2. The DB path still runs for logging, window rollover, and the 429
//      enforcement itself.
//   3. Across instances the drift is bounded and transient (single window).
//
// Keyed by `${bucket}:${ip}`. Capped at 5000 entries, LRU via re-insert on
// touch — JS Maps preserve insertion order, so the oldest key is the first
// one yielded by keys().
const RL_CACHE_MAX = 5000;
const rlCache = new Map(); // key -> { resetAt: number, count: number }
let rlCacheHits = 0;
let rlCacheDbFallbacks = 0;

function rlCacheTouch(key, entry) {
  // Re-insert to move this key to the most-recently-used end of the Map.
  rlCache.delete(key);
  rlCache.set(key, entry);
  // Evict oldest entries while over cap. Map.keys() iterates in insertion
  // order, so next() gives us the LRU key.
  while (rlCache.size > RL_CACHE_MAX) {
    const oldest = rlCache.keys().next().value;
    if (oldest === undefined) break;
    rlCache.delete(oldest);
  }
}

/** Clear the in-memory rate-limit cache. Callable from admin reset flows. */
export function rateLimit_clearCache() {
  rlCache.clear();
}

/** Observability: current cache size plus lifetime hit/db-fallback counters. */
export function rateLimit_cacheStats() {
  return {
    size: rlCache.size,
    hits: rlCacheHits,
    dbFallbacks: rlCacheDbFallbacks,
  };
}

/**
 * DB-backed sliding-window rate limiter with an in-memory L1 cache.
 *
 * The DB remains authoritative for the hard limit; the cache only
 * short-circuits requests that are CONFIDENTLY under the limit
 * (count + 1 < max / 2). Anything at or above the half-way mark falls
 * through to the DB. Trades a bit of precision for persistence across
 * Fluid Compute instances (the previous in-memory limiter was per-instance).
 */
export async function rateLimit({ ip, bucket, windowSeconds, max }) {
  if (!ip || ip === "unknown") return { ok: true, remaining: max };

  const key = `${bucket}:${ip}`;
  const nowMs = Date.now();
  const cached = rlCache.get(key);

  // Cache short-circuit: entry still in window AND well under the limit.
  // The "< max / 2" check is the confidence gate — past the half-way mark
  // we always re-check the DB so enforcement stays precise.
  if (cached && cached.resetAt > nowMs && cached.count + 1 < max / 2) {
    const newCount = cached.count + 1;
    rlCacheTouch(key, { resetAt: cached.resetAt, count: newCount });
    rlCacheHits++;
    return {
      ok: true,
      count: newCount,
      remaining: Math.max(0, max - newCount),
      cached: true,
    };
  }

  rlCacheDbFallbacks++;
  const now = new Date();
  const windowStart = new Date(nowMs - windowSeconds * 1000);

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

    // Refresh the cache from the authoritative DB response. resetAt is
    // approximate — we don't know the DB's actual window_start after the
    // upsert (it may have rolled over or reused the existing window), so we
    // use nowMs + windowSeconds as a conservative upper bound. Any future
    // short-circuit gated on count+1 < max/2 is safe even if the true reset
    // lands sooner: we can't serve a request that should have been denied.
    rlCacheTouch(key, { resetAt: nowMs + windowSeconds * 1000, count });

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
