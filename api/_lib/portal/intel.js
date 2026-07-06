// api/_lib/portal/intel.js
//
// Admin security/observability /api/portal actions: visitors,
// behavior-insights, investigate(-ip), threat-intel, enum-intel,
// cred-intel, geo-intel, adsense-health, countermeasures,
// grant-immunity, ops-status, osint-status/refresh, honeypot-creds,
// block-ip.

import { sql } from "../db.js";
import { json } from "../http.js";
import { clientIp, logSecurityEvent } from "../security.js";
import { refreshThreatFeeds, matchOsintFeeds, osintStatus } from "../osint.js";
import { aggregateScanners, identifyScanner } from "../scanner-fingerprints.js";
import { resolveAdmin, requireAdmin } from "./shared.js";

export async function handleVisitors(session) {
  if (!(await resolveAdmin(session))) {
    return json(403, { ok: false, error: "forbidden" });
  }

  const [stats24, stats7, recent, topPages, topCountries, topReferrers] = await Promise.all([
    sql`
      SELECT COUNT(*)::int AS total,
             COUNT(DISTINCT COALESCE(anon_id, ip))::int AS unique_count
      FROM visits WHERE ts > now() - interval '24 hours'
    `,
    sql`
      SELECT COUNT(*)::int AS total,
             COUNT(DISTINCT COALESCE(anon_id, ip))::int AS unique_count
      FROM visits WHERE ts > now() - interval '7 days'
    `,
    sql`
      SELECT v.ts, v.path, v.referrer, v.ip, v.country, v.region, v.city,
             v.browser, v.os, v.device, v.consent, v.anon_id,
             v.device_hash, v.screen, v.platform, v.cores, v.mem, v.touch,
             v.dpr, v.color_depth, v.connection, v.user_agent, v.tz, v.lang, v.langs,
             u.email AS user_email, u.name AS user_name
      FROM visits v
      LEFT JOIN users u ON u.id = v.user_id
      ORDER BY v.ts DESC
      LIMIT 100
    `,
    sql`
      SELECT path, COUNT(*)::int AS hits
      FROM visits WHERE ts > now() - interval '7 days'
      GROUP BY path ORDER BY hits DESC LIMIT 15
    `,
    sql`
      SELECT COALESCE(country, '?') AS country, COUNT(*)::int AS hits
      FROM visits WHERE ts > now() - interval '7 days'
      GROUP BY country ORDER BY hits DESC LIMIT 15
    `,
    sql`
      SELECT COALESCE(NULLIF(referrer, ''), '(direct)') AS referrer, COUNT(*)::int AS hits
      FROM visits WHERE ts > now() - interval '7 days'
      GROUP BY referrer ORDER BY hits DESC LIMIT 15
    `,
  ]);

  // --- Threat actors with OSINT enrichment + blocked status ---
  const [threatActors, sessionAnomalies, blockedIps, ipIntelAll] = await Promise.all([
    sql`
      SELECT ta.ip, ta.country, ta.city, ta.user_agent, ta.device_hash,
             ta.path, ta.method, ta.threat_class, ta.ts
      FROM threat_actors ta
      ORDER BY ta.ts DESC LIMIT 50
    `,
    sql`
      SELECT st.event, st.ip, st.country, st.city, st.device_hash, st.detail, st.ts,
             u.email AS user_email
      FROM session_tracking st
      LEFT JOIN users u ON u.id = st.user_id
      WHERE st.event = 'anomaly'
      ORDER BY st.ts DESC LIMIT 50
    `,
    sql`SELECT ip, reason, created_at FROM ip_blocklist ORDER BY created_at DESC LIMIT 100`,
    sql`
      SELECT ip, asn, org, isp, is_datacenter, is_tor, is_proxy, is_vpn,
             abuse_score, abuse_reports, abuse_last_seen, enriched_at
      FROM ip_intel
      ORDER BY enriched_at DESC LIMIT 200
    `,
  ]);

  // Build a lookup map for fast IP→intel resolution on the client.
  const intelMap = {};
  for (const i of ipIntelAll) {
    intelMap[i.ip] = {
      asn: i.asn, org: i.org, isp: i.isp,
      isDatacenter: i.is_datacenter, isTor: i.is_tor, isProxy: i.is_proxy, isVpn: i.is_vpn,
      abuseScore: i.abuse_score, abuseReports: i.abuse_reports,
      abuseLastSeen: i.abuse_last_seen, enrichedAt: i.enriched_at,
    };
  }
  const blockedSet = new Set(blockedIps.map((b) => b.ip));

  // Live OSINT feed matches for every IP in the rendered panel. Single
  // query against the threat_feeds cache (daily-refreshed by the cron);
  // returns {} silently if migration 003 hasn't been run yet.
  const osintIps = [...new Set([
    ...recent.map((r) => r.ip),
    ...threatActors.map((t) => t.ip),
    ...blockedIps.map((b) => b.ip),
  ].filter(Boolean))];
  const osintMap = await matchOsintFeeds(osintIps);

  return json(200, {
    stats: {
      total24h: stats24[0]?.total || 0,
      unique24h: stats24[0]?.unique_count || 0,
      total7d: stats7[0]?.total || 0,
      unique7d: stats7[0]?.unique_count || 0,
    },
    recent: recent.map((r) => ({
      ts: r.ts,
      path: r.path,
      referrer: r.referrer,
      ip: r.ip,
      country: r.country,
      region: r.region,
      city: r.city,
      browser: r.browser,
      os: r.os,
      device: r.device,
      consent: r.consent,
      anonId: r.anon_id,
      deviceHash: r.device_hash,
      screen: r.screen,
      platform: r.platform,
      cores: r.cores,
      mem: r.mem,
      touch: r.touch,
      dpr: r.dpr,
      colorDepth: r.color_depth,
      connection: r.connection,
      userAgent: r.user_agent,
      tz: r.tz,
      lang: r.lang,
      langs: r.langs,
      userEmail: r.user_email,
      userName: r.user_name,
      abuseScore: r.abuse_score,
      isDatacenter: r.is_datacenter,
      org: r.org,
      intel: intelMap[r.ip] || null,
      osintMatches: osintMap[r.ip] || [],
      blocked: blockedSet.has(r.ip),
    })),
    topPages,
    topCountries,
    topReferrers,
    threatActors: threatActors.map((t) => ({
      ip: t.ip, country: t.country, city: t.city, ua: t.user_agent,
      deviceHash: t.device_hash, path: t.path, method: t.method,
      threatClass: t.threat_class, ts: t.ts,
      intel: intelMap[t.ip] || null,
      osintMatches: osintMap[t.ip] || [],
      blocked: blockedSet.has(t.ip),
    })),
    sessionAnomalies: sessionAnomalies.map((s) => ({
      event: s.event, ip: s.ip, country: s.country, city: s.city,
      deviceHash: s.device_hash, detail: s.detail, ts: s.ts,
      userEmail: s.user_email,
    })),
    blockedIps: blockedIps.map((b) => ({
      ip: b.ip, reason: b.reason, blockedAt: b.created_at,
      intel: intelMap[b.ip] || null,
      osintMatches: osintMap[b.ip] || [],
    })),
    ipIntel: intelMap,
    osintSummary: {
      matchedIps: Object.keys(osintMap).length,
      totalChecked: osintIps.length,
    },
  });
}

export async function handleBehaviorInsights(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const [
    liveSessions,
    retention,
    interestRows,
    recentActivity,
    typedSignals,
    topForms,
    searchTerms,
    contentDepth,
    situationSummary,
    situationByScenario,
    situationRecent,
  ] = await Promise.all([
    sql`
      SELECT ws.id, ws.anon_id, ws.ip, ws.country, ws.region, ws.city,
             ws.landing_path, ws.exit_path, ws.referrer, ws.page_count,
             ws.total_dwell_ms, ws.max_scroll_pct, ws.event_count, ws.engaged,
             ws.started_at, ws.last_activity,
             le.kind AS last_event_kind, le.path AS last_event_path, le.value_text AS last_event_text, le.ts AS last_event_at,
             CASE
               WHEN le.path LIKE '/leadgen%' OR le.path LIKE '/portal/leadgen%' THEN 'Leadgen'
               WHEN le.path LIKE '/services%' OR le.path LIKE '/sarasota%' OR le.path LIKE '/bradenton%' OR le.path LIKE '/venice%' OR le.path LIKE '/lakewood-ranch%' OR le.path LIKE '/nokomis%' THEN 'Managed IT'
               WHEN le.path LIKE '/tools%' OR le.path LIKE '/stack%' OR le.path LIKE '/partners%' THEN 'Tools / affiliate'
               WHEN le.path LIKE '/industries%' OR le.path LIKE '/%/it-%' THEN 'Industry pages'
               WHEN le.path LIKE '/blog/%' THEN 'Blog research'
               WHEN le.path LIKE '/book%' OR le.path LIKE '/support%' OR le.path LIKE '/portal%' THEN 'Conversion / support'
               ELSE 'General site'
             END AS interest
      FROM web_sessions ws
      LEFT JOIN LATERAL (
        SELECT kind, path, value_text, ts
        FROM engagement_events e
        WHERE e.session_id = ws.id
        ORDER BY ts DESC
        LIMIT 1
      ) le ON true
      WHERE ws.last_activity > now() - interval '30 minutes'
      ORDER BY ws.last_activity DESC
      LIMIT 25
    `.catch(() => []),
    sql`
      WITH daily AS (
        SELECT date_trunc('day', started_at)::date AS day,
               COUNT(*)::int AS sessions,
               COUNT(DISTINCT COALESCE(anon_id, ip))::int AS visitors,
               COUNT(*) FILTER (WHERE page_count > 1 OR engaged)::int AS engaged_sessions,
               ROUND(AVG(page_count), 2)::text AS avg_pages,
               ROUND(AVG(total_dwell_ms) / 1000.0, 1)::text AS avg_dwell_sec
        FROM web_sessions
        WHERE started_at > now() - interval '14 days'
        GROUP BY 1
      )
      SELECT * FROM daily ORDER BY day DESC
    `.catch(() => []),
    sql`
      SELECT CASE
               WHEN v.path LIKE '/leadgen%' OR v.path LIKE '/portal/leadgen%' THEN 'Leadgen'
               WHEN v.path LIKE '/services%' OR v.path LIKE '/sarasota%' OR v.path LIKE '/bradenton%' OR v.path LIKE '/venice%' OR v.path LIKE '/lakewood-ranch%' OR v.path LIKE '/nokomis%' THEN 'Managed IT'
               WHEN v.path LIKE '/tools%' OR v.path LIKE '/stack%' OR v.path LIKE '/partners%' THEN 'Tools / affiliate'
               WHEN v.path LIKE '/industries%' OR v.path LIKE '/%/it-%' THEN 'Industry pages'
               WHEN v.path LIKE '/blog/%' THEN 'Blog research'
               WHEN v.path LIKE '/book%' OR v.path LIKE '/support%' OR v.path LIKE '/portal%' THEN 'Conversion / support'
               ELSE 'General site'
             END AS interest,
             COUNT(*)::int AS views,
             COUNT(DISTINCT COALESCE(v.anon_id, v.ip))::int AS visitors,
             COUNT(DISTINCT v.session_id)::int AS sessions
      FROM visits v
      WHERE v.ts > now() - interval '7 days'
      GROUP BY interest
      ORDER BY views DESC
    `.catch(() => []),
    sql`
      SELECT e.ts, e.session_id, e.anon_id, e.path, e.kind, e.value_num, e.value_text, e.meta,
             CASE
               WHEN e.path LIKE '/leadgen%' OR e.path LIKE '/portal/leadgen%' THEN 'Leadgen'
               WHEN e.path LIKE '/services%' OR e.path LIKE '/sarasota%' OR e.path LIKE '/bradenton%' OR e.path LIKE '/venice%' OR e.path LIKE '/lakewood-ranch%' OR e.path LIKE '/nokomis%' THEN 'Managed IT'
               WHEN e.path LIKE '/tools%' OR e.path LIKE '/stack%' OR e.path LIKE '/partners%' THEN 'Tools / affiliate'
               WHEN e.path LIKE '/industries%' OR e.path LIKE '/%/it-%' THEN 'Industry pages'
               WHEN e.path LIKE '/blog/%' THEN 'Blog research'
               WHEN e.path LIKE '/book%' OR e.path LIKE '/support%' OR e.path LIKE '/portal%' THEN 'Conversion / support'
               ELSE 'General site'
             END AS interest,
             ws.ip, ws.country, ws.city
      FROM engagement_events e
      LEFT JOIN web_sessions ws ON ws.id = e.session_id
      ORDER BY e.ts DESC
      LIMIT 80
    `.catch(() => []),
    sql`
      SELECT e.ts, e.session_id, e.path, e.value_text, e.value_num, e.meta,
             CASE
               WHEN e.path LIKE '/leadgen%' OR e.path LIKE '/portal/leadgen%' THEN 'Leadgen'
               WHEN e.path LIKE '/services%' OR e.path LIKE '/sarasota%' OR e.path LIKE '/bradenton%' OR e.path LIKE '/venice%' OR e.path LIKE '/lakewood-ranch%' OR e.path LIKE '/nokomis%' THEN 'Managed IT'
               WHEN e.path LIKE '/tools%' OR e.path LIKE '/stack%' OR e.path LIKE '/partners%' THEN 'Tools / affiliate'
               WHEN e.path LIKE '/industries%' OR e.path LIKE '/%/it-%' THEN 'Industry pages'
               WHEN e.path LIKE '/blog/%' THEN 'Blog research'
               WHEN e.path LIKE '/book%' OR e.path LIKE '/support%' OR e.path LIKE '/portal%' THEN 'Conversion / support'
               ELSE 'General site'
             END AS interest,
             ws.country, ws.city
      FROM engagement_events e
      LEFT JOIN web_sessions ws ON ws.id = e.session_id
      WHERE e.kind IN ('input_intent','form_focus')
      ORDER BY e.ts DESC
      LIMIT 50
    `.catch(() => []),
    sql`
      SELECT COALESCE(e.meta->>'form', 'inline') AS form,
             COALESCE(e.meta->>'field', e.value_text, 'field') AS field,
             COUNT(*)::int AS events,
             COUNT(DISTINCT e.session_id)::int AS sessions,
             MAX(e.ts) AS last_seen
      FROM engagement_events e
      WHERE e.kind IN ('input_intent','form_focus')
        AND e.ts > now() - interval '7 days'
      GROUP BY form, field
      ORDER BY events DESC
      LIMIT 20
    `.catch(() => []),
    sql`
      SELECT e.ts, e.session_id, e.path, e.value_text AS query, e.value_num AS result_count, e.meta,
             CASE
               WHEN e.path LIKE '/leadgen%' OR e.path LIKE '/portal/leadgen%' THEN 'Leadgen'
               WHEN e.path LIKE '/services%' OR e.path LIKE '/sarasota%' OR e.path LIKE '/bradenton%' OR e.path LIKE '/venice%' OR e.path LIKE '/lakewood-ranch%' OR e.path LIKE '/nokomis%' THEN 'Managed IT'
               WHEN e.path LIKE '/tools%' OR e.path LIKE '/stack%' OR e.path LIKE '/partners%' THEN 'Tools / affiliate'
               WHEN e.path LIKE '/industries%' OR e.path LIKE '/%/it-%' THEN 'Industry pages'
               WHEN e.path LIKE '/blog/%' THEN 'Blog research'
               WHEN e.path LIKE '/book%' OR e.path LIKE '/support%' OR e.path LIKE '/portal%' THEN 'Conversion / support'
               ELSE 'General site'
             END AS interest,
             ws.ip, ws.country, ws.region, ws.city
      FROM engagement_events e
      LEFT JOIN web_sessions ws ON ws.id = e.session_id
      WHERE e.kind = 'search'
      ORDER BY e.ts DESC
      LIMIT 80
    `.catch(() => []),
    sql`
      SELECT path,
             COUNT(*) FILTER (WHERE kind = 'pageview_exit')::int AS exits,
             ROUND(AVG(value_num) FILTER (WHERE kind = 'pageview_exit') / 1000.0, 1)::text AS avg_dwell_sec,
             ROUND(AVG((meta->>'maxScrollPct')::numeric) FILTER (WHERE kind = 'pageview_exit'), 1)::text AS avg_scroll,
             COUNT(*) FILTER (WHERE kind = 'click')::int AS clicks
      FROM engagement_events
      WHERE ts > now() - interval '7 days'
        AND path IS NOT NULL
      GROUP BY path
      ORDER BY clicks DESC, exits DESC
      LIMIT 25
    `.catch(() => []),
    sql`
      SELECT
        COUNT(*) FILTER (WHERE kind = 'home_situation_first_interaction')::int AS first_interactions,
        COUNT(*) FILTER (WHERE kind = 'home_situation_switch')::int AS switches,
        COUNT(*) FILTER (WHERE kind = 'home_situation_cta_click')::int AS cta_clicks,
        COUNT(*) FILTER (WHERE kind = 'home_situation_cta_click' AND COALESCE(meta->>'cta_kind','') = 'primary_contact')::int AS primary_cta_clicks,
        COUNT(*) FILTER (WHERE kind = 'home_situation_cta_click' AND COALESCE(meta->>'cta_kind','') = 'secondary_services')::int AS secondary_cta_clicks
      FROM engagement_events
      WHERE ts > now() - interval '14 days'
        AND (path = '/' OR path LIKE '/?%')
        AND kind IN (
          'home_situation_first_interaction',
          'home_situation_switch',
          'home_situation_cta_click',
          'home_situation_scroll_depth'
        )
    `.catch(() => []),
    sql`
      SELECT
        COALESCE(meta->>'scenario_id', value_text, 'unknown') AS scenario_id,
        COUNT(*) FILTER (WHERE kind = 'home_situation_switch')::int AS switches,
        COUNT(*) FILTER (WHERE kind = 'home_situation_cta_click')::int AS cta_clicks,
        COUNT(*) FILTER (WHERE kind = 'home_situation_cta_click' AND COALESCE(meta->>'cta_kind','') = 'primary_contact')::int AS primary_clicks,
        COUNT(*) FILTER (WHERE kind = 'home_situation_cta_click' AND COALESCE(meta->>'cta_kind','') = 'secondary_services')::int AS secondary_clicks
      FROM engagement_events
      WHERE ts > now() - interval '14 days'
        AND (path = '/' OR path LIKE '/?%')
        AND kind IN ('home_situation_switch', 'home_situation_cta_click')
      GROUP BY scenario_id
      ORDER BY cta_clicks DESC, switches DESC
      LIMIT 12
    `.catch(() => []),
    sql`
      SELECT ts, kind, value_text, meta
      FROM engagement_events
      WHERE ts > now() - interval '14 days'
        AND (path = '/' OR path LIKE '/?%')
        AND kind IN (
          'home_situation_first_interaction',
          'home_situation_switch',
          'home_situation_cta_click'
        )
      ORDER BY ts DESC
      LIMIT 40
    `.catch(() => []),
  ]);

  const totals = {
    liveSessions: liveSessions.length,
    sessions14d: retention.reduce((sum, row) => sum + Number(row.sessions || 0), 0),
    visitors14d: retention.reduce((sum, row) => sum + Number(row.visitors || 0), 0),
    engaged14d: retention.reduce((sum, row) => sum + Number(row.engaged_sessions || 0), 0),
  };

  return json(200, {
    ok: true,
    generatedAt: new Date().toISOString(),
    totals,
    liveSessions: liveSessions.map((row) => ({
      id: row.id,
      anonId: row.anon_id,
      ip: row.ip,
      country: row.country,
      region: row.region,
      city: row.city,
      landingPath: row.landing_path,
      exitPath: row.exit_path,
      referrer: row.referrer,
      pageCount: row.page_count,
      totalDwellMs: Number(row.total_dwell_ms || 0),
      maxScrollPct: row.max_scroll_pct,
      eventCount: row.event_count,
      engaged: row.engaged,
      startedAt: row.started_at,
      lastActivity: row.last_activity,
      lastEventKind: row.last_event_kind,
      lastEventPath: row.last_event_path,
      lastEventText: row.last_event_text,
      lastEventAt: row.last_event_at,
      interest: row.interest || "General site",
    })),
    retention,
    interests: interestRows,
    recentActivity,
    typedSignals,
    topForms,
    searchTerms,
    contentDepth,
    situationFunnel: situationSummary?.[0] || {
      first_interactions: 0,
      switches: 0,
      cta_clicks: 0,
      primary_cta_clicks: 0,
      secondary_cta_clicks: 0,
    },
    situationByScenario,
    situationRecent,
    privacy: {
      note: "Form telemetry stores field/form names and character counts, not raw typed text, passwords, emails, phone numbers, or message bodies.",
    },
  });
}

// --- Per-IP investigation endpoint (admin only) ---
export async function handleInvestigateIp(session, url) {
  if (!(await resolveAdmin(session))) {
    return json(403, { ok: false, error: "forbidden" });
  }
  const ip = url.searchParams.get("ip");
  if (!ip) return json(400, { ok: false, error: "missing_ip" });

  const [intel, visits, threats, blocked] = await Promise.all([
    sql`SELECT * FROM ip_intel WHERE ip = ${ip} LIMIT 1`,
    sql`
      SELECT ts, path, device_hash, user_agent, browser, os, device,
             screen, platform, cores, mem, tz, lang, country, city
      FROM visits WHERE ip = ${ip} ORDER BY ts DESC LIMIT 50
    `,
    sql`
      SELECT ts, path, method, threat_class, device_hash, user_agent
      FROM threat_actors WHERE ip = ${ip} ORDER BY ts DESC LIMIT 50
    `,
    sql`SELECT ip, reason, created_at FROM ip_blocklist WHERE ip = ${ip}`,
  ]);

  const osintMap = await matchOsintFeeds([ip]);
  const osintMatches = osintMap[ip] || [];

  const rawIntel = intel[0] || null;
  const intelOut = rawIntel
    ? {
        ip: rawIntel.ip,
        asn: rawIntel.asn,
        org: rawIntel.org,
        isp: rawIntel.isp,
        country: rawIntel.country,
        region: rawIntel.region,
        city: rawIntel.city,
        isDatacenter: rawIntel.is_datacenter,
        isTor: rawIntel.is_tor,
        isProxy: rawIntel.is_proxy,
        isVpn: rawIntel.is_vpn,
        abuseScore: rawIntel.abuse_score,
        abuseReports: rawIntel.abuse_reports,
        abuseLastSeen: rawIntel.abuse_last_seen,
        reverseDns: rawIntel.reverse_dns,
        rdapName: rawIntel.rdap_name,
        rdapRegistrant: rawIntel.rdap_registrant,
        rdapAbuseEmail: rawIntel.rdap_abuse_email,
        rdapNetRange: rawIntel.rdap_net_range,
        enrichedAt: rawIntel.enriched_at,
      }
    : null;

  return json(200, {
    ip,
    intel: intelOut,
    osintMatches,
    blocked: blocked.length > 0 ? blocked[0] : null,
    visits: visits.map((v) => ({
      ts: v.ts, path: v.path, deviceHash: v.device_hash, ua: v.user_agent,
      browser: v.browser, os: v.os, device: v.device, screen: v.screen,
      platform: v.platform, cores: v.cores, mem: v.mem, tz: v.tz,
      lang: v.lang, country: v.country, city: v.city,
    })),
    threats: threats.map((t) => ({
      ts: t.ts, path: t.path, method: t.method, threatClass: t.threat_class,
      deviceHash: t.device_hash, ua: t.user_agent,
    })),
    deviceHashes: [...new Set([
      ...visits.map((v) => v.device_hash),
      ...threats.map((t) => t.device_hash),
    ].filter(Boolean))],
  });
}

// ---------- threat intelligence (admin only) ----------

export async function handleThreatIntel(session, url) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const range = url.searchParams.get("range") || "7d";
  const interval = range === "24h" ? "24 hours" : range === "30d" ? "30 days" : "7 days";

  const [
    timeline, campaigns, topAsns, threatClasses,
    tzDistribution, credStats,
    autoActions, recentCritical, attackVelocity
  ] = await Promise.all([
    // Attack timeline — hourly buckets for charting
    sql`
      SELECT date_trunc('hour', ts) AS bucket,
             threat_class,
             COUNT(*)::int AS hits
      FROM threat_actors
      WHERE ts > now() - ${interval}::interval
      GROUP BY bucket, threat_class
      ORDER BY bucket
    `,
    // Campaign clusters — group by device_hash to reveal actors behind multiple IPs
    sql`
      SELECT ta.device_hash,
             COUNT(DISTINCT ta.ip)::int AS ip_count,
             COUNT(*)::int AS total_hits,
             array_agg(DISTINCT ta.ip) AS ips,
             array_agg(DISTINCT ta.country) FILTER (WHERE ta.country IS NOT NULL) AS countries,
             MIN(ta.ts) AS first_seen,
             MAX(ta.ts) AS last_seen,
             array_agg(DISTINCT ta.threat_class) AS threat_classes,
             array_agg(DISTINCT ta.path ORDER BY ta.path) AS paths_probed
      FROM threat_actors ta
      WHERE ta.device_hash IS NOT NULL
        AND ta.ts > now() - ${interval}::interval
      GROUP BY ta.device_hash
      HAVING COUNT(DISTINCT ta.ip) >= 2
      ORDER BY total_hits DESC
      LIMIT 20
    `,
    // Top attacking ASNs/orgs
    sql`
      SELECT ii.org, ii.asn, ii.is_datacenter,
             COUNT(DISTINCT ta.ip)::int AS ip_count,
             COUNT(*)::int AS total_hits,
             AVG(ii.abuse_score)::int AS avg_abuse
      FROM threat_actors ta
      JOIN ip_intel ii ON ii.ip = ta.ip
      WHERE ta.ts > now() - ${interval}::interval AND ii.org IS NOT NULL
      GROUP BY ii.org, ii.asn, ii.is_datacenter
      ORDER BY total_hits DESC
      LIMIT 15
    `,
    // Threat class breakdown
    sql`
      SELECT threat_class, COUNT(*)::int AS hits
      FROM threat_actors
      WHERE ts > now() - ${interval}::interval
      GROUP BY threat_class
      ORDER BY hits DESC
    `,
    // Timezone distribution from attacker user-agents (behavioral signal)
    sql`
      SELECT
        EXTRACT(HOUR FROM ts AT TIME ZONE 'UTC')::int AS utc_hour,
        COUNT(*)::int AS hits
      FROM threat_actors
      WHERE ts > now() - ${interval}::interval
      GROUP BY utc_hour
      ORDER BY utc_hour
    `,
    // Credential capture stats
    sql`
      SELECT COUNT(*)::int AS total_captures,
             COUNT(DISTINCT detail->>'ip')::int AS unique_ips,
             COUNT(DISTINCT detail->>'email')::int AS unique_emails,
             COUNT(DISTINCT detail->>'passwordHash')::int AS unique_passwords
      FROM security_events
      WHERE kind = 'honeypot.credential'
        AND ts > now() - ${interval}::interval
    `,
    // Auto countermeasure actions taken
    sql`
      SELECT action, target, reason, ts
      FROM auto_actions
      WHERE ts > now() - ${interval}::interval
      ORDER BY ts DESC
      LIMIT 50
    `,
    // Recent critical security events
    sql`
      SELECT kind, severity, ip, user_agent, path, detail, ts
      FROM security_events
      WHERE severity IN ('critical', 'error')
        AND ts > now() - ${interval}::interval
      ORDER BY ts DESC
      LIMIT 20
    `,
    // Attack velocity — IPs with highest hit rate in last hour
    sql`
      SELECT ip, COUNT(*)::int AS hits_1h
      FROM threat_actors
      WHERE ts > now() - interval '1 hour'
      GROUP BY ip
      HAVING COUNT(*) >= 3
      ORDER BY hits_1h DESC
      LIMIT 10
    `,
  ]);

  // Enrich campaigns with ip_intel
  const campaignIps = new Set(campaigns.flatMap((c) => c.ips || []));
  const velocityIps = new Set(attackVelocity.map((v) => v.ip));
  const allIps = [...new Set([...campaignIps, ...velocityIps])];
  let intelMap = {};
  if (allIps.length > 0) {
    const intel = await sql`SELECT ip, org, asn, isp, is_datacenter, abuse_score, abuse_reports, is_tor, is_vpn, is_proxy FROM ip_intel WHERE ip = ANY(${allIps})`;
    for (const i of intel) intelMap[i.ip] = i;
  }

  // Summary stats
  const totalThreats = threatClasses.reduce((s, t) => s + t.hits, 0);
  const blockedCount = await sql`SELECT COUNT(*)::int AS n FROM ip_blocklist`;

  // ── Narrative summary (Huntress-style) ──────────────────────────────
  // Turns raw numbers into a plain-English story the MSP owner can read
  // in 10 seconds. Status level is the first thing they see; incidents
  // are the second. Everything else is optional drill-down.
  const activeAttackers = attackVelocity.length;
  const exploitAttempts = (recentCritical || []).filter((e) =>
    e.kind === "exploit_attempt" || String(e.detail?.cve || "").length > 0
  ).length;
  const scannerBlocks = (autoActions || []).filter((a) =>
    String(a.reason || "").includes("scanner trap") || String(a.reason || "").includes("exploit attempt")
  ).length;

  let statusLevel = "calm";
  let statusHeadline = "No notable activity in the last window.";
  if (exploitAttempts > 0 || activeAttackers >= 5) {
    statusLevel = "under_attack";
    statusHeadline = exploitAttempts > 0
      ? `${exploitAttempts} active exploit attempt${exploitAttempts > 1 ? "s" : ""} in progress — all blocked.`
      : `${activeAttackers} attackers hitting hard right now — site still healthy.`;
  } else if (activeAttackers >= 2 || campaigns.length >= 1) {
    statusLevel = "elevated";
    statusHeadline = campaigns.length >= 1
      ? `Coordinated activity detected — ${campaigns.length} attacker${campaigns.length > 1 ? "s" : ""} rotating through multiple IPs.`
      : `${activeAttackers} attackers active — automatic defenses engaged.`;
  }

  // Build the "incidents worth your attention" list — the 3-5 highest-
  // severity events with plain-English explanations + recommendations.
  const incidents = [];

  if (exploitAttempts > 0) {
    const first = (recentCritical || []).find((e) => e.kind === "exploit_attempt" || e.detail?.cve);
    incidents.push({
      severity: "critical",
      title: `Exploit payload thrown at your site`,
      explanation: "Someone tried to land a known CVE payload (like Log4Shell, Spring4Shell, or ProxyShell) in a request header or URL. These are automated attacks — the same IP has probably tried thousands of other sites today.",
      weDid: "Instantly blocked the IP, served them a fake login page, and logged every byte of the payload for your records.",
      youShould: "Nothing urgent — this is covered. Review the blocked IP list weekly to make sure we're not catching anyone legit.",
      ts: first?.ts || null,
    });
  }

  if (campaigns.length >= 1) {
    const c = campaigns[0];
    incidents.push({
      severity: "warning",
      title: `One attacker, multiple IPs`,
      explanation: `We spotted a single device fingerprint rotating through ${c.ip_count} different IPs${c.countries?.length ? ` (${c.countries.slice(0, 3).join(", ")})` : ""}. That's someone using a proxy pool to look like many people — classic for credential stuffing or vulnerability sweeps.`,
      weDid: `Logged every request and fingerprinted their browser/OS combo so we recognize them even if they switch networks again.`,
      youShould: `Consider blocking the /24 range from the Geo tab — one range often covers the whole campaign.`,
      ts: c.last_seen,
    });
  }

  const credCount = credStats[0]?.total_captures || 0;
  if (credCount >= 5) {
    incidents.push({
      severity: "warning",
      title: `Automated login attempts against your admin panel`,
      explanation: `${credCount} credential attempts from ${credStats[0]?.unique_ips || "multiple"} IPs hit the honeypot login page. Attackers don't know it's fake — they're burning through username/password pairs.`,
      weDid: `Let them keep trying (tarpit'd the response so it's slow) and captured every username + password shape they submitted.`,
      youShould: `Open the "Login attempts" tab to see what usernames they're trying — if "admin" or your real username is in the list, rotate that password.`,
      ts: null,
    });
  }

  const hostileGeoHits = (threatClasses.find((t) => t.threat_class === "hostile_geo") || {}).hits || 0;
  if (hostileGeoHits >= 50) {
    incidents.push({
      severity: "info",
      title: `High traffic from China / Russia / North Korea`,
      explanation: `${hostileGeoHits} requests from hostile-geo countries in this window. These visitors see the honeypot, not your real site — they never know the difference.`,
      weDid: `Every request from those countries is served the fake site. Your real content is protected.`,
      youShould: `Nothing. This is normal — small-business sites attract routine sweeps from these regions.`,
      ts: null,
    });
  }

  // Positive framing — "what we saved you from" card.
  const stopped = {
    blocks: blockedCount[0]?.n || 0,
    autoActions: (autoActions || []).length,
    scannerBlocks,
    exploitAttempts,
    hostileGeoHits,
    credAttempts: credCount,
  };

  return json(200, {
    range,
    narrative: {
      statusLevel,
      statusHeadline,
      activeAttackers,
      incidents,
      stopped,
    },
    summary: {
      totalThreats,
      blockedIps: blockedCount[0]?.n || 0,
      campaignCount: campaigns.length,
      credCaptures: credStats[0]?.total_captures || 0,
      uniqueAttackerEmails: credStats[0]?.unique_emails || 0,
      uniquePasswords: credStats[0]?.unique_passwords || 0,
    },
    timeline: timeline.map((t) => ({
      bucket: t.bucket,
      threatClass: t.threat_class,
      hits: t.hits,
    })),
    campaigns: campaigns.map((c) => ({
      deviceHash: c.device_hash,
      ipCount: c.ip_count,
      totalHits: c.total_hits,
      ips: (c.ips || []).slice(0, 10),
      countries: c.countries || [],
      firstSeen: c.first_seen,
      lastSeen: c.last_seen,
      threatClasses: c.threat_classes || [],
      pathsProbed: (c.paths_probed || []).slice(0, 15),
      intel: (c.ips || []).slice(0, 3).map((ip) => intelMap[ip]).filter(Boolean),
    })),
    topAsns: topAsns.map((a) => ({
      org: a.org, asn: a.asn, isDatacenter: a.is_datacenter,
      ipCount: a.ip_count, totalHits: a.total_hits, avgAbuse: a.avg_abuse,
    })),
    threatClasses: threatClasses.map((t) => ({ class: t.threat_class, hits: t.hits })),
    tzDistribution: tzDistribution.map((t) => ({ hour: t.utc_hour, hits: t.hits })),
    attackVelocity: attackVelocity.map((v) => ({
      ip: v.ip, hits1h: v.hits_1h, intel: intelMap[v.ip] || null,
    })),
    autoActions: autoActions.map((a) => ({
      action: a.action, target: a.target, reason: a.reason, ts: a.ts,
    })),
    recentCritical: recentCritical.map((e) => ({
      kind: e.kind, severity: e.severity, ip: e.ip, path: e.path,
      detail: e.detail, ts: e.ts,
    })),
  });
}

// ---------- enumeration intel (admin only) ----------
//
// Turns the raw threat_actors table into "what tools are scanning us",
// "which CMS/products are being probed", and "which CVEs are being
// thrown at us". The scanner fingerprint library runs in-process over
// the recent rows — no per-query CPU hit on the DB.

export async function handleEnumIntel(session, url) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const range = url.searchParams.get("range") || "7d";
  const interval = range === "24h" ? "24 hours" : range === "30d" ? "30 days" : "7 days";

  // Pull (ip, path, user_agent) for every threat in the window. We cap
  // at 20k rows so a runaway scanner can't blow up the function — the
  // aggregations below are all frequency-based, so sampling still
  // produces a representative shape.
  const rows = await sql`
    SELECT ip, path, user_agent, ts
    FROM threat_actors
    WHERE ts > now() - ${interval}::interval
    ORDER BY ts DESC
    LIMIT 20000
  `;

  // Path frequency — what attackers are looking for, regardless of who.
  const pathCounts = new Map();
  for (const r of rows) {
    const p = r.path || "/";
    pathCounts.set(p, (pathCounts.get(p) || 0) + 1);
  }
  const topPaths = [...pathCounts.entries()]
    .map(([path, hits]) => ({ path, hits }))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 25);

  // Scanner / CMS / CVE aggregation (pure function over the rows).
  const scannerAgg = aggregateScanners(
    rows.map((r) => ({ userAgent: r.user_agent, path: r.path })),
  );

  // Per-IP path entropy — many unique paths = directory-busting or
  // full-CMS fingerprint sweep; few unique paths with many hits = a
  // targeted exploit attempt or credential brute-force.
  const perIp = new Map();
  for (const r of rows) {
    const e = perIp.get(r.ip) || { hits: 0, paths: new Set() };
    e.hits += 1;
    e.paths.add(r.path || "/");
    perIp.set(r.ip, e);
  }
  const topEnumerators = [...perIp.entries()]
    .map(([ip, { hits, paths }]) => ({ ip, hits, uniquePaths: paths.size }))
    .sort((a, b) => b.uniquePaths - a.uniquePaths || b.hits - a.hits)
    .slice(0, 15);

  // First-seen vs recurring — IPs that attacked us this window but
  // have never been in visits or threat_actors before it.
  const startISO = new Date(Date.now() - (
    range === "24h" ? 86400e3 : range === "30d" ? 30 * 86400e3 : 7 * 86400e3
  )).toISOString();
  const ipsInWindow = [...new Set(rows.map((r) => r.ip))];
  let freshIps = [];
  if (ipsInWindow.length > 0) {
    const prior = await sql`
      SELECT DISTINCT ip FROM threat_actors
      WHERE ip = ANY(${ipsInWindow}) AND ts < ${startISO}
    `;
    const seenBefore = new Set(prior.map((p) => p.ip));
    freshIps = ipsInWindow.filter((ip) => !seenBefore.has(ip));
  }

  // Exploit attempts — rows matched to a CVE. Surface the top N so the
  // dashboard can show "CVE-2021-44228 × 47 hits from 9 IPs".
  const cveHits = new Map();
  for (const r of rows) {
    const id = identifyScanner({ userAgent: r.user_agent, path: r.path });
    if (!id.cve) continue;
    const e = cveHits.get(id.cve) || { cve: id.cve, name: id.cveName, hits: 0, ips: new Set(), lastSeen: null };
    e.hits += 1;
    e.ips.add(r.ip);
    if (!e.lastSeen || r.ts > e.lastSeen) e.lastSeen = r.ts;
    cveHits.set(id.cve, e);
  }
  const exploitAttempts = [...cveHits.values()]
    .map((e) => ({ cve: e.cve, name: e.name, hits: e.hits, uniqueIps: e.ips.size, lastSeen: e.lastSeen }))
    .sort((a, b) => b.hits - a.hits);

  return json(200, {
    range,
    summary: {
      totalThreats: rows.length,
      uniqueIps: ipsInWindow.length,
      freshIps: freshIps.length,
      recurringIps: ipsInWindow.length - freshIps.length,
      distinctPaths: pathCounts.size,
      exploitAttempts: exploitAttempts.reduce((s, e) => s + e.hits, 0),
    },
    topPaths,
    topEnumerators,
    tools: scannerAgg.tools.slice(0, 15),
    cms:   scannerAgg.cms.slice(0, 15),
    cve:   scannerAgg.cve.slice(0, 15),
    exploitAttempts,
    freshIps: freshIps.slice(0, 20),
  });
}

// ---------- credential-enumeration intel (admin only) ----------
//
// The honeypot logs every login attempt into security_events as
// 'honeypot.credential'. This endpoint mines that table for:
//   - Top usernames tried (is admin/root/test dominant? → classic)
//   - Password length + first-char shape distribution
//   - Per-IP pattern: spray (many usernames, few tries each) vs
//     brute-force (one username, many tries) vs stuffing (diverse, bursty)

export async function handleCredIntel(session, url) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const range = url.searchParams.get("range") || "7d";
  const interval = range === "24h" ? "24 hours" : range === "30d" ? "30 days" : "7 days";

  const rows = await sql`
    SELECT ip, detail, ts
    FROM security_events
    WHERE kind = 'honeypot.credential'
      AND ts > now() - ${interval}::interval
    ORDER BY ts ASC
    LIMIT 10000
  `;

  const normEmail = (d) => {
    const raw = String(d?.email || d?.d?.email || "").toLowerCase().trim();
    return raw || "(empty)";
  };
  const pwShape = (d) => d?.passwordShape || d?.d?.passwordShape || null;

  // Top usernames
  const userCounts = new Map();
  for (const r of rows) {
    const u = normEmail(r.detail);
    userCounts.set(u, (userCounts.get(u) || 0) + 1);
  }
  const topUsernames = [...userCounts.entries()]
    .map(([username, hits]) => ({ username, hits }))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 20);

  // Password length distribution (histogram, buckets of 1 char up to 32)
  const lenBuckets = new Array(33).fill(0); // 0..32, 32 = "32+"
  for (const r of rows) {
    const sh = pwShape(r.detail);
    const len = Number(sh?.length) || 0;
    const idx = Math.min(32, Math.max(0, len));
    lenBuckets[idx] += 1;
  }
  const pwLengthHistogram = lenBuckets
    .map((hits, len) => ({ length: len, hits }))
    .filter((b) => b.hits > 0);

  // Per-IP pattern classification.
  //   spray       → distinct usernames >= 3 AND max attempts per username <= 3
  //   brute-force → distinct usernames <= 2 AND total >= 5
  //   stuffing    → distinct usernames >= 5 AND total >= 10
  //   probe       → otherwise
  const perIp = new Map();
  for (const r of rows) {
    const u = normEmail(r.detail);
    const e = perIp.get(r.ip) || { total: 0, users: new Map(), first: r.ts, last: r.ts };
    e.total += 1;
    e.users.set(u, (e.users.get(u) || 0) + 1);
    if (r.ts < e.first) e.first = r.ts;
    if (r.ts > e.last)  e.last  = r.ts;
    perIp.set(r.ip, e);
  }
  const classify = (e) => {
    const distinct = e.users.size;
    const maxPerUser = [...e.users.values()].reduce((m, v) => Math.max(m, v), 0);
    if (distinct >= 5 && e.total >= 10) return "stuffing";
    if (distinct >= 3 && maxPerUser <= 3) return "spray";
    if (distinct <= 2 && e.total >= 5) return "brute-force";
    return "probe";
  };
  const ipBreakdown = [...perIp.entries()]
    .map(([ip, e]) => ({
      ip,
      total: e.total,
      distinctUsers: e.users.size,
      maxPerUser: [...e.users.values()].reduce((m, v) => Math.max(m, v), 0),
      pattern: classify(e),
      firstSeen: e.first,
      lastSeen: e.last,
      spanSeconds: Math.max(1, Math.round((new Date(e.last) - new Date(e.first)) / 1000)),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 30);

  const patternCounts = ipBreakdown.reduce((acc, row) => {
    acc[row.pattern] = (acc[row.pattern] || 0) + 1;
    return acc;
  }, {});

  return json(200, {
    range,
    summary: {
      totalAttempts: rows.length,
      uniqueIps: perIp.size,
      uniqueUsernames: userCounts.size,
      patternCounts,
    },
    topUsernames,
    pwLengthHistogram,
    ipBreakdown,
  });
}

// ---------- geo intel (admin only) ----------
//
// Country + city + /24 rollup. Uses inet arithmetic for the CIDR
// bucketing so we count every attack in the same /24 as one entry.

export async function handleGeoIntel(session, url) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const range = url.searchParams.get("range") || "7d";
  const interval = range === "24h" ? "24 hours" : range === "30d" ? "30 days" : "7 days";

  const [byCountry, byCity, byCidr, conversionByCountry] = await Promise.all([
    sql`
      SELECT country, COUNT(*)::int AS hits, COUNT(DISTINCT ip)::int AS ips
      FROM threat_actors
      WHERE ts > now() - ${interval}::interval AND country IS NOT NULL
      GROUP BY country
      ORDER BY hits DESC
      LIMIT 25
    `,
    sql`
      SELECT country, city, COUNT(*)::int AS hits, COUNT(DISTINCT ip)::int AS ips
      FROM threat_actors
      WHERE ts > now() - ${interval}::interval AND city IS NOT NULL
      GROUP BY country, city
      ORDER BY hits DESC
      LIMIT 25
    `,
    // /24 rollup — cast ip text to inet then mask to /24. Rows where
    // the cast fails (e.g. malformed IP) are silently excluded by the
    // WHERE inet check.
    sql`
      SELECT (host(set_masklen(ip::inet, 24)) || '/24') AS cidr,
             COUNT(*)::int AS hits,
             COUNT(DISTINCT ip)::int AS ips,
             array_agg(DISTINCT country) FILTER (WHERE country IS NOT NULL) AS countries
      FROM threat_actors
      WHERE ts > now() - ${interval}::interval
        AND ip ~ '^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+$'
      GROUP BY cidr
      HAVING COUNT(DISTINCT ip) >= 2
      ORDER BY hits DESC
      LIMIT 20
    `,
    // Visit-to-threat conversion rate by country — what fraction of
    // traffic from each country turned hostile. High rate = consider
    // geofencing; low rate = normal user traffic mixed with noise.
    sql`
      WITH v AS (
        SELECT country, COUNT(DISTINCT ip)::int AS visit_ips
        FROM visits
        WHERE ts > now() - ${interval}::interval AND country IS NOT NULL
        GROUP BY country
      ),
      t AS (
        SELECT country, COUNT(DISTINCT ip)::int AS threat_ips
        FROM threat_actors
        WHERE ts > now() - ${interval}::interval AND country IS NOT NULL
        GROUP BY country
      )
      SELECT v.country,
             v.visit_ips,
             COALESCE(t.threat_ips, 0) AS threat_ips,
             ROUND(100.0 * COALESCE(t.threat_ips, 0) / NULLIF(v.visit_ips, 0), 1)::float AS pct
      FROM v
      LEFT JOIN t ON t.country = v.country
      WHERE v.visit_ips >= 3
      ORDER BY pct DESC NULLS LAST, threat_ips DESC
      LIMIT 20
    `,
  ]);

  return json(200, {
    range,
    byCountry: byCountry.map((r) => ({ country: r.country, hits: r.hits, ips: r.ips })),
    byCity:    byCity.map((r) => ({ country: r.country, city: r.city, hits: r.hits, ips: r.ips })),
    byCidr:    byCidr.map((r) => ({ cidr: r.cidr, hits: r.hits, ips: r.ips, countries: r.countries || [] })),
    conversionByCountry: conversionByCountry.map((r) => ({
      country: r.country, visitIps: r.visit_ips, threatIps: r.threat_ips, pct: r.pct,
    })),
  });
}

// ---------- adsense health (admin only) ----------
//
// Aggregates the client-side AdSense beacons so we can answer "are
// real visitors seeing ads?" in 10 seconds instead of logging into
// Google AdSense. Fill rate and block rate are the two numbers the
// owner actually cares about:
//
//   - High blocked% → most visitors run ad-blockers; expected, don't
//     confuse with a broken deploy.
//   - High timeout%  → AdSense approval is pending, or Google is
//     rate-limiting us (brand-new site, low traffic, thin content).
//   - High unfilled% → Google's accepting us but not selling — low
//     inventory on our niche. Expect over time as pages mature.
//   - High filled%   → Everything working; revenue is real.

export async function handleAdsenseHealth(session, url) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const range = url.searchParams.get("range") || "7d";
  const interval = range === "24h" ? "24 hours" : range === "30d" ? "30 days" : "7 days";

  // The adsense_events table is created on-demand by the first /api/track
  // beacon, so a cold portal that's never seen traffic returns an empty
  // summary gracefully instead of a "relation does not exist" 500.
  let rows;
  try {
    rows = await sql`
      SELECT
        COUNT(*)::int                                 AS sessions,
        COUNT(*) FILTER (WHERE script_loaded)::int    AS script_loaded_sessions,
        SUM(slot_count)::int                          AS total_slots,
        SUM(filled)::int                              AS total_filled,
        SUM(unfilled)::int                            AS total_unfilled,
        SUM(blocked)::int                             AS total_blocked,
        SUM(timeout)::int                             AS total_timeout
      FROM adsense_events
      WHERE ts > now() - ${interval}::interval
    `;
  } catch {
    return json(200, { range, noData: true, hint: "Table not yet created — no beacons received." });
  }

  const byPath = await sql`
    SELECT path,
           COUNT(*)::int AS sessions,
           SUM(slot_count)::int AS slots,
           SUM(filled)::int AS filled,
           SUM(unfilled)::int AS unfilled,
           SUM(blocked)::int AS blocked,
           SUM(timeout)::int AS timeout
    FROM adsense_events
    WHERE ts > now() - ${interval}::interval
    GROUP BY path
    ORDER BY sessions DESC
    LIMIT 15
  `.catch(() => []);

  const r = rows[0] || {};
  const totalSlots = r.total_slots || 0;
  const pct = (n) => totalSlots === 0 ? 0 : Math.round((n / totalSlots) * 1000) / 10;

  // One-line narrative that tells the owner what to do.
  let headline;
  const fillPct = pct(r.total_filled || 0);
  const blockPct = pct(r.total_blocked || 0);
  const timeoutPct = pct(r.total_timeout || 0);
  const scriptPct = r.sessions ? Math.round((r.script_loaded_sessions / r.sessions) * 100) : 0;

  if (totalSlots === 0) {
    headline = "No AdSense beacons received yet. Visit a page with ads (e.g. /glossary) in a fresh browser to seed the first measurement.";
  } else if (fillPct >= 20) {
    headline = `AdSense is healthy — ${fillPct}% of slot impressions served a real ad.`;
  } else if (timeoutPct >= 40) {
    headline = `Google isn't responding to most slots (${timeoutPct}% timeout). Your AdSense account is probably still in "Getting ready" — check adsense.google.com → Sites for the approval state.`;
  } else if (blockPct >= 40) {
    headline = `Ad blockers are the main problem — ${blockPct}% of sessions block the adsbygoogle script entirely. Real visitors on clean browsers will see ads; the "missing ads" complaint from your own browser is expected.`;
  } else if (fillPct < 5) {
    headline = `Low fill rate (${fillPct}%). Site is approved but Google isn't finding many advertisers for your pages. Normal for new sites; improves with traffic + pagecount.`;
  } else {
    headline = `AdSense is working — ${fillPct}% fill, ${blockPct}% blocked, ${timeoutPct}% timed out.`;
  }

  return json(200, {
    range,
    headline,
    summary: {
      sessions: r.sessions || 0,
      scriptLoadedPct: scriptPct,
      totalSlots,
      fillPct,
      unfilledPct: pct(r.total_unfilled || 0),
      blockedPct: blockPct,
      timeoutPct,
    },
    byPath: byPath.map((b) => ({
      path: b.path, sessions: b.sessions, slots: b.slots,
      filled: b.filled, unfilled: b.unfilled, blocked: b.blocked, timeout: b.timeout,
    })),
  });
}

// Countermeasures dashboard: what the system has auto-blocked lately,
// which IPs are currently admin-immune, and the top OSINT matches that
// got turned into blocks. Pure read, admin-gated.
export async function handleCountermeasures(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const [recentAutoActions, autoBlocks, immunities, osintBlocks] = await Promise.all([
    sql`
      SELECT action, target, reason, ts
      FROM auto_actions
      WHERE ts > now() - interval '7 days'
      ORDER BY ts DESC
      LIMIT 50
    `.catch(() => []),
    sql`
      SELECT ip, reason, created_at
      FROM ip_blocklist
      WHERE reason LIKE 'auto:%'
      ORDER BY created_at DESC
      LIMIT 50
    `.catch(() => []),
    sql`
      SELECT imm.ip, imm.granted_at, imm.expires_at, imm.reason, u.email AS user_email
      FROM admin_ip_immunity imm
      LEFT JOIN users u ON u.id = imm.user_id
      WHERE imm.expires_at > now()
      ORDER BY imm.expires_at DESC
    `.catch(() => []),
    sql`
      SELECT ta.ip, ta.country, ta.ts, ta.threat_class
      FROM threat_actors ta
      WHERE ta.threat_class = 'osint_match'
        AND ta.ts > now() - interval '7 days'
      ORDER BY ta.ts DESC
      LIMIT 30
    `.catch(() => []),
  ]);

  return json(200, {
    ok: true,
    recentAutoActions,
    autoBlocks,
    immunities: immunities.map((i) => ({
      ip: i.ip,
      grantedAt: i.granted_at,
      expiresAt: i.expires_at,
      reason: i.reason,
      userEmail: i.user_email,
    })),
    osintBlocks: osintBlocks.map((o) => ({
      ip: o.ip,
      country: o.country,
      ts: o.ts,
      threatClass: o.threat_class,
    })),
  });
}

// Grant or extend admin-IP immunity manually. Useful to pre-authorize a
// travel IP before a trip so the owner doesn't get locked out from a
// hotel network. Default TTL 7 days, overridable via days param.
export async function handleGrantImmunity(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const ip = String(body?.ip || "").trim();
  const days = Math.min(Math.max(Number(body?.days) || 7, 1), 90);
  if (!ip) return json(400, { ok: false, error: "missing_ip" });

  const row = await sql`
    INSERT INTO admin_ip_immunity (ip, user_id, expires_at, reason)
    VALUES (${ip}, ${session?.user?.id || null}, now() + (${days}::int * interval '1 day'),
            ${`manual: granted by ${session?.user?.email || "admin"}`})
    ON CONFLICT (ip) DO UPDATE
      SET user_id    = EXCLUDED.user_id,
          granted_at = now(),
          expires_at = EXCLUDED.expires_at,
          reason     = EXCLUDED.reason
    RETURNING ip, expires_at
  `.catch((err) => {
    console.error("[portal] grant-immunity failed", err);
    return null;
  });

  if (!row) return json(500, { ok: false, error: "grant_failed" });

  // Also remove from the blocklist if present — granting immunity should
  // unblock the IP in one click, not leave them both blocked and immune.
  const unblocked = await sql`
    DELETE FROM ip_blocklist WHERE ip = ${ip} RETURNING ip, reason
  `.catch(() => []);

  return json(200, { ok: true, granted: row[0], unblocked: unblocked[0] || null });
}

// Aggregate "system health" snapshot for the Ops Console. Runs one read
// per subsystem so the admin can see at a glance what's installed, what
// hasn't been run yet, and whether the chain is currently clean. All
// queries degrade gracefully when their tables don't exist yet (pre-
// migration state) — `ok: false, migrationNeeded: true` instead of 500.
export async function handleOpsStatus(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const [auditCols, feedTable, feedAgg, chainSnapshot, dbPing, criticalHour] = await Promise.all([
    sql`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'security_events'
        AND column_name IN ('prev_hash', 'row_hash')
    `.catch(() => []),
    sql`
      SELECT EXISTS(
        SELECT 1 FROM information_schema.tables WHERE table_name = 'threat_feeds'
      ) AS present
    `.catch(() => [{ present: false }]),
    sql`
      SELECT feed_name, COUNT(*)::int AS n, MAX(fetched_at) AS last_fetched
      FROM threat_feeds GROUP BY feed_name
    `.catch(() => []),
    sql`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE row_hash IS NOT NULL)::int AS chained
      FROM security_events
    `.catch(() => [{ total: 0, chained: 0 }]),
    sql`SELECT 1 AS ping`
      .then((r) => ({ status: r.length > 0 ? "connected" : "no_response" }))
      .catch(() => ({ status: "error" })),
    sql`
      SELECT COUNT(*)::int AS cnt FROM security_events
      WHERE severity = 'critical' AND ts > now() - interval '1 hour'
    `.then((r) => Number(r[0]?.cnt || 0)).catch(() => -1),
  ]);

  const hasChainCols = auditCols.length === 2;
  const hashType = auditCols.find((c) => c.column_name === "row_hash")?.data_type || null;
  const paddedChar = hashType === "character"; // CHAR(N) pads; migration 002 flips it to varchar.
  const threatFeedsInstalled = Boolean(feedTable[0]?.present);

  return json(200, {
    ok: true,
    migrations: {
      auditChainInstalled: hasChainCols,
      auditChainFixApplied: hasChainCols && !paddedChar,
      threatFeedsInstalled,
    },
    chain: {
      totalRows: chainSnapshot[0]?.total || 0,
      chainedRows: chainSnapshot[0]?.chained || 0,
    },
    runtime: {
      db: dbPing.status,
      criticalEventsLastHour: criticalHour,
    },
    osint: {
      feeds: feedAgg,
      totalCidrs: feedAgg.reduce((s, f) => s + f.n, 0),
      oldestFetch: feedAgg.length
        ? feedAgg.reduce((a, b) => (a.last_fetched < b.last_fetched ? a : b)).last_fetched
        : null,
    },
  });
}

// GET the current OSINT cache summary (per-feed counts, last-fetched time,
// 20 most-recent matches against real threat_actors visits). Cheap — runs
// two small aggregate queries.
export async function handleOsintStatus(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const status = await osintStatus();
  return json(status.ok ? 200 : 500, status);
}

// POST force-refresh every configured feed. Idempotent: each feed's rows
// are upserted on (feed_name, cidr), so re-running just bumps fetched_at
// and purges CIDRs that disappeared upstream.
export async function handleOsintRefresh(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const result = await refreshThreatFeeds();
  return json(result.ok ? 200 : 500, result);
}

// ---------- health (unauthenticated, for external uptime monitors) ----------
// ---------- honeypot credentials (admin only) ----------
export async function handleHoneypotCreds(session) {
  if (!(await resolveAdmin(session))) {
    return json(403, { ok: false, error: "forbidden" });
  }
  // LATERAL + LIMIT 1 caps the threat_actors join at one row per event —
  // plain LEFT JOIN on IP + time window could multiply rows (an attacker
  // commonly has several hits inside a 2-minute window) and inflate total.
  const rows = await sql`
    SELECT se.id, se.ip, se.detail, se.ts,
           ta.country, ta.threat_class,
           ii.org, ii.isp, ii.abuse_score
    FROM security_events se
    LEFT JOIN LATERAL (
      SELECT country, threat_class
      FROM threat_actors
      WHERE ip = se.ip
        AND ts BETWEEN se.ts - interval '2 minutes' AND se.ts + interval '30 seconds'
      ORDER BY ts DESC
      LIMIT 1
    ) ta ON TRUE
    LEFT JOIN ip_intel ii ON ii.ip = se.ip
    WHERE se.kind = 'honeypot.credential'
    ORDER BY se.ts DESC
    LIMIT 500
  `;

  // De-duplicate by IP — keep the latest credential per attacker.
  const byIp = new Map();
  for (const r of rows) {
    const email = r.detail?.email || r.detail?.d?.email || "(none captured)";
    const page = r.detail?.page || r.detail?.d?.page || "/";
    const passwordHash = r.detail?.passwordHash || null;
    const passwordShape = r.detail?.passwordShape || null;
    const existing = byIp.get(r.ip);
    if (!existing || new Date(r.ts) > new Date(existing.ts)) {
      byIp.set(r.ip, {
        ip: r.ip,
        email,
        passwordHash,
        passwordShape,
        country: r.country || "unknown",
        threatClass: r.threat_class || "honeypot",
        ts: r.ts,
        page,
        org: r.org,
        isp: r.isp,
        abuseScore: r.abuse_score,
      });
    }
  }

  return json(200, {
    credentials: [...byIp.values()],
    total: rows.length,
    uniqueIps: byIp.size,
  });
}

// ---------- block IP (admin only) ----------
export async function handleBlockIp(session, request) {
  if (!(await resolveAdmin(session))) {
    return json(403, { ok: false, error: "forbidden" });
  }
  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const ip = String(body?.ip || "").trim();
  if (!ip) return json(400, { ok: false, error: "missing_ip" });
  const reason = String(body?.reason || "manual block").trim().slice(0, 200);

  await sql`
    INSERT INTO ip_blocklist (ip, reason)
    VALUES (${ip}, ${reason})
    ON CONFLICT (ip) DO NOTHING
  `;

  await logSecurityEvent({
    kind: "admin.block_ip",
    severity: "info",
    ip: clientIp(request),
    userId: session?.user?.id || null,
    userAgent: request.headers.get("user-agent") || null,
    path: "/api/portal?action=block-ip",
    detail: {
      adminEmail: session?.user?.email || null,
      targetIp: ip,
      reason,
    },
  });

  return json(200, { ok: true });
}
