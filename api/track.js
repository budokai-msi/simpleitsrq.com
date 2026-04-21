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
import { enrichIp } from "./_lib/ipintel.js";

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

  // Client-side error telemetry. Fires from ErrorBoundary when a React
  // render crash is caught — one row per session per error, enough to see
  // regressions in prod without a third-party monitor.
  if (body.kind === "client_error") {
    const errRl = await rateLimit({ ip, bucket: "track:err", windowSeconds: 60, max: 30 });
    if (!errRl.ok) return noContent();
    const msg = body.message ? String(body.message).slice(0, 500) : null;
    const stack = body.stack ? String(body.stack).slice(0, 4000) : null;
    const path = body.path ? String(body.path).slice(0, 500) : null;
    const ua = request.headers.get("user-agent") || null;
    let userId = null;
    try {
      const session = await getSession(request);
      if (session) userId = session.user.id;
    } catch { /* ignore */ }
    await sql`
      INSERT INTO security_events (kind, severity, ip, user_id, user_agent, path, detail)
      VALUES ('client_error', 'info', ${ip}, ${userId}, ${ua}, ${path},
              ${JSON.stringify({ message: msg, stack })}::jsonb)
    `.catch((err) => console.error("[track] client_error insert failed", err));
    return noContent();
  }

  // Affiliate-click tracking piggybacks on the same endpoint so we don't
  // spend a function slot on a dedicated route. One row per outbound
  // affiliate-link click; used by the Revenue Signals admin panel to
  // attribute CTR per blog post.
  if (body.kind === "affiliate_click" && body.destination) {
    // Only accept plausibly-valid https URLs. Anyone can POST here; without
    // a schema check a bad actor could flood the dashboard with garbage
    // (`javascript:`, `data:`, or multi-KB junk strings).
    let destination = null;
    try {
      const raw = String(body.destination).slice(0, 2000);
      const parsed = new URL(raw);
      if (parsed.protocol === "https:") destination = parsed.toString();
    } catch { /* invalid URL → reject */ }
    if (!destination) return noContent();

    // Tighter per-IP rate than the shared track bucket — pageview traffic
    // should not earn a budget for click amplification.
    const clickRl = await rateLimit({ ip, bucket: "track:aff", windowSeconds: 60, max: 20 });
    if (!clickRl.ok) return noContent();

    const geo = geoFromHeaders(request);
    let userId = null;
    try {
      const session = await getSession(request);
      if (session) userId = session.user.id;
    } catch { /* unauthenticated is fine */ }
    await sql`
      INSERT INTO affiliate_clicks (
        slug, destination, label, network, ip, country,
        anon_id, user_id, referrer_path
      ) VALUES (
        ${String(body.slug || "").slice(0, 200) || null},
        ${destination},
        ${body.label ? String(body.label).slice(0, 200) : null},
        ${body.network ? String(body.network).slice(0, 40) : null},
        ${ip}, ${geo.country},
        ${body.anonId ? String(body.anonId).slice(0, 64) : null},
        ${userId},
        ${body.referrerPath ? String(body.referrerPath).slice(0, 500) : null}
      )
    `.catch((err) => console.error("[track] affiliate_click insert failed", err));
    return noContent();
  }

  const path       = String(body.path || "/").slice(0, 500);
  const referrer   = body.referrer ? String(body.referrer).slice(0, 1000) : null;
  const anonIdIn   = body.anonId ? String(body.anonId).slice(0, 64) : null;
  const consent    = body.consent ? String(body.consent).slice(0, 16) : "pending";
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const rawSid = body.sessionId ? String(body.sessionId) : null;
  const sessionId   = rawSid && UUID_RE.test(rawSid) ? rawSid.toLowerCase() : null;
  const isNewSession = !!body.isNewSession && !!sessionId;
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
        anon_id, user_id, session_id, path, referrer, ip,
        country, region, city, latitude, longitude,
        user_agent, browser, os, device, screen, tz, lang,
        consent, utm_source, utm_medium, utm_campaign,
        device_hash, color_depth, platform, cores, mem, touch, dpr, connection, langs
      ) VALUES (
        ${anonId}, ${userId}, ${sessionId}::uuid, ${path}, ${referrer}, ${ip},
        ${geo.country}, ${geo.region}, ${geo.city}, ${geo.latitude}, ${geo.longitude},
        ${userAgent}, ${browser}, ${os}, ${device}, ${screen}, ${tz}, ${lang},
        ${consent}, ${utmSource}, ${utmMedium}, ${utmCampaign},
        ${deviceHash}, ${colorDepth}, ${platform}, ${cores}, ${mem}, ${touch}, ${dpr}, ${connection}, ${langs}
      )
    `;
  } catch (err) {
    console.error("[track] visits insert failed", err);
  }

  // Web-session upsert. First pageview in a session inserts the full row
  // (landing path, referrer, UTM). Subsequent pageviews within the 30-min
  // idle window only bump activity/count/exit — and clear `bounced` once
  // the session crosses two pageviews.
  if (sessionId) {
    try {
      if (isNewSession) {
        await sql`
          INSERT INTO web_sessions (
            id, anon_id, user_id, ip, country, region, city,
            user_agent, device_hash, landing_path, exit_path, referrer,
            utm_source, utm_medium, utm_campaign
          ) VALUES (
            ${sessionId}::uuid, ${anonId}, ${userId}, ${ip},
            ${geo.country}, ${geo.region}, ${geo.city},
            ${userAgent}, ${deviceHash}, ${path}, ${path}, ${referrer},
            ${utmSource}, ${utmMedium}, ${utmCampaign}
          )
          ON CONFLICT (id) DO UPDATE
            SET last_activity = now(),
                page_count    = web_sessions.page_count + 1,
                exit_path     = EXCLUDED.exit_path,
                bounced       = false,
                user_id       = COALESCE(web_sessions.user_id, EXCLUDED.user_id),
                anon_id       = COALESCE(web_sessions.anon_id, EXCLUDED.anon_id)
        `;
      } else {
        await sql`
          UPDATE web_sessions
             SET last_activity = now(),
                 page_count    = page_count + 1,
                 exit_path     = ${path},
                 bounced       = false,
                 user_id       = COALESCE(user_id, ${userId})
           WHERE id = ${sessionId}::uuid
        `;
      }
    } catch (err) {
      console.error("[track] web_sessions upsert failed", err);
    }
  }

  // Fire-and-forget: IP enrichment + real-time threat response. Runs after
  // the visit insert so it never slows down the 204. The enrichIp call
  // auto-blocks IPs with abuse_score >= 75 (in ipintel.js). The back-patch
  // here populates the admin dashboard columns.
  enrichIp(ip).then(async (intel) => {
    if (!intel) return;
    // Back-patch visit row with OSINT data.
    await sql`
      UPDATE visits
      SET abuse_score = ${intel.abuse_score},
          is_datacenter = ${intel.is_datacenter},
          org = ${intel.org}
      WHERE ip = ${ip} AND abuse_score IS NULL
    `.catch(() => {});

    // Back-patch the current session with reverse DNS + registrant + bot flag.
    // The session was written with these fields NULL; enrichment fills them
    // once the async IP intel resolves.
    if (sessionId) {
      await sql`
        UPDATE web_sessions
           SET reverse_dns     = ${intel.reverse_dns},
               rdap_registrant = ${intel.rdap_registrant},
               is_bot          = ${!!intel.is_bot_hostname || !!intel.is_datacenter}
         WHERE id = ${sessionId}::uuid
      `.catch(() => {});
    }

    // Real-time auto-counter: check if this IP has 3+ threat_actor hits
    // in the last hour (regardless of the daily cron). Lighter threshold
    // than the cron's 5-in-24h because we are checking in real time.
    const hits = await sql`
      SELECT COUNT(*)::int AS cnt FROM threat_actors
      WHERE ip = ${ip} AND ts > now() - interval '1 hour'
    `.catch(() => [{ cnt: 0 }]);
    if ((hits[0]?.cnt || 0) >= 3) {
      const blocked = await sql`SELECT 1 FROM ip_blocklist WHERE ip = ${ip}`.catch(() => []);
      // Skip auto-block for any IP an admin has signed in from in the last
      // 7 days. This is how the owner avoids self-banning from a stray
      // /wp-admin prefetch their browser issued.
      const immune = await sql`
        SELECT 1 FROM admin_ip_immunity WHERE ip = ${ip} AND expires_at > now() LIMIT 1
      `.catch(() => []);
      if (blocked.length === 0 && immune.length === 0) {
        await sql`INSERT INTO ip_blocklist (ip, reason) VALUES (${ip}, ${`auto: ${hits[0].cnt} threat hits in 1h (realtime)`})`.catch(() => {});
        await sql`
          INSERT INTO security_events (kind, severity, ip, detail)
          VALUES ('auto_block.realtime', 'critical', ${ip},
                  ${JSON.stringify({ hits: hits[0].cnt, window: '1h', abuse_score: intel.abuse_score })}::jsonb)
        `.catch(() => {});
      }
    }
  }).catch(() => {});

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
