// POST /api/track
//
// Server-side visitor logging with passive device fingerprinting.
// Writes to two tables:
//   - visits    — one row per page view (always, even without consent)
//   - visitors  — one row per consenting visitor (keyed on anon_id)
//
// The device_hash is a SHA-256 of passive signals (IP + UA + screen + tz +
// platform + cores + mem + touch + dpr + colorDepth). No canvas/WebGL/audio
// probing. The hash is stable enough to correlate repeat visits even without
// a cookie.

import { sql } from "./_lib/db.js";
import { clientIp, geoFromHeaders, isIpBlocked, rateLimit } from "./_lib/security.js";
import { parseUA } from "./_lib/ua.js";
import { getSession } from "./_lib/session.js";

const noContent = (extra = {}) =>
  new Response(null, { status: 204, headers: { "Cache-Control": "no-store", ...extra } });

async function sha256(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(request) {
  const ip = clientIp(request);
  if (await isIpBlocked(ip)) return noContent();

  const rl = await rateLimit({ ip, bucket: "track", windowSeconds: 60, max: 120 });
  if (!rl.ok) return noContent();

  let body = {};
  try { body = await request.json(); } catch { body = {}; }

  const path       = String(body.path || "/").slice(0, 500);
  const referrer   = body.referrer ? String(body.referrer).slice(0, 1000) : null;
  const anonIdIn   = body.anonId ? String(body.anonId).slice(0, 64) : null;
  const consent    = body.consent ? String(body.consent).slice(0, 16) : "pending";
  const screen     = body.screen ? String(body.screen).slice(0, 20) : null;
  const colorDepth = body.colorDepth ? Number(body.colorDepth) || null : null;
  const tz         = body.tz ? String(body.tz).slice(0, 64) : null;
  const lang       = body.lang ? String(body.lang).slice(0, 16) : null;
  const langs      = body.langs ? String(body.langs).slice(0, 200) : null;
  const platform   = body.platform ? String(body.platform).slice(0, 64) : null;
  const cores      = body.cores ? Number(body.cores) || null : null;
  const mem        = body.mem ? Number(body.mem) || null : null;
  const touch      = body.touch != null ? Number(body.touch) : null;
  const dpr        = body.dpr ? Number(body.dpr) || null : null;
  const connection = body.connection ? String(body.connection).slice(0, 16) : null;

  const anonId = consent === "analytics" ? anonIdIn : null;

  const userAgent = request.headers.get("user-agent") || null;
  const acceptLang = request.headers.get("accept-language") || null;
  const { browser, os, device } = parseUA(userAgent || "");
  const geo = geoFromHeaders(request);

  // Passive device fingerprint — deterministic hash from server + client signals.
  const fingerprintInput = [
    ip, userAgent, acceptLang, screen, colorDepth,
    tz, platform, cores, mem, touch, dpr,
  ].map((v) => String(v ?? "")).join("|");
  const deviceHash = await sha256(fingerprintInput);

  // UTM extraction.
  let utmSource = null, utmMedium = null, utmCampaign = null;
  try {
    const q = new URL(path, "https://x.invalid").searchParams;
    utmSource   = q.get("utm_source");
    utmMedium   = q.get("utm_medium");
    utmCampaign = q.get("utm_campaign");
  } catch { /* ignore */ }

  let userId = null;
  try {
    const session = await getSession(request);
    if (session) userId = session.user.id;
  } catch { /* ignore */ }

  try {
    await sql`
      INSERT INTO visits (
        anon_id, user_id, path, referrer, ip,
        country, region, city, latitude, longitude,
        user_agent, browser, os, device, screen, tz, lang,
        consent, utm_source, utm_medium, utm_campaign,
        device_hash, color_depth, platform, cores, mem, touch, dpr, connection, langs
      ) VALUES (
        ${anonId}, ${userId}, ${path}, ${referrer}, ${ip},
        ${geo.country}, ${geo.region}, ${geo.city}, ${geo.latitude}, ${geo.longitude},
        ${userAgent}, ${browser}, ${os}, ${device}, ${screen}, ${tz}, ${lang},
        ${consent}, ${utmSource}, ${utmMedium}, ${utmCampaign},
        ${deviceHash}, ${colorDepth}, ${platform}, ${cores}, ${mem}, ${touch}, ${dpr}, ${connection}, ${langs}
      )
    `;
  } catch (err) {
    console.error("[track] visits insert failed", err);
  }

  if (anonId) {
    try {
      await sql`
        INSERT INTO visitors (
          anon_id, first_user_id, last_ip, last_ua,
          last_country, last_region, last_city, last_tz, last_lang,
          first_referrer, first_path
        ) VALUES (
          ${anonId}, ${userId}, ${ip}, ${userAgent},
          ${geo.country}, ${geo.region}, ${geo.city}, ${tz}, ${lang},
          ${referrer}, ${path}
        )
        ON CONFLICT (anon_id) DO UPDATE
          SET last_seen    = now(),
              visit_count  = visitors.visit_count + 1,
              last_ip      = EXCLUDED.last_ip,
              last_ua      = EXCLUDED.last_ua,
              last_country = EXCLUDED.last_country,
              last_region  = EXCLUDED.last_region,
              last_city    = EXCLUDED.last_city,
              last_tz      = EXCLUDED.last_tz,
              last_lang    = EXCLUDED.last_lang,
              first_user_id = COALESCE(visitors.first_user_id, EXCLUDED.first_user_id)
      `;
    } catch (err) {
      console.error("[track] visitors upsert failed", err);
    }
  }

  return noContent();
}
