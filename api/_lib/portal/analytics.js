// api/_lib/portal/analytics.js
//
// Vercel-style analytics /api/portal action: analytics.
//
// Returns the same shape Vercel's Analytics dashboard shows — stat
// cards (visitors, page views, bounce rate) plus breakdown tables
// (top pages, referrers, countries, devices, browsers, OS, UTM) —
// computed from the site's own `visits` and `web_sessions` tables.
// No third-party analytics dependency.

import { sql } from "../db.js";
import { json } from "../http.js";
import { requireAdmin } from "./shared.js";

const RANGE_DAYS = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 };

export async function handleAnalytics(session, url) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const range = url?.searchParams?.get("range") || "7d";
  const days = RANGE_DAYS[range] ?? 7;
  const since = `now() - interval '${days} days'`;

  // Stat cards + breakdowns, all in parallel. Defensive try-per-query so
  // a missing table never 500s the whole snapshot.
  const safe = async (label, q) => {
    try { return { [label]: await q }; }
    catch (e) { return { [label]: { error: String(e.message || e) } }; }
  };

  const [
    totals, topPages, referrers, countries, devices, browsers, os, utm,
    bounce, daily,
  ] = await Promise.all([
    safe("totals", sql`
      SELECT COUNT(*)::int AS page_views,
             COUNT(DISTINCT COALESCE(anon_id, ip))::int AS visitors
      FROM visits WHERE ts > ${sql.unsafe(since)}
    `),
    safe("topPages", sql`
      SELECT path, COUNT(*)::int AS hits
      FROM visits WHERE ts > ${sql.unsafe(since)}
      GROUP BY path ORDER BY hits DESC LIMIT 15
    `),
    safe("referrers", sql`
      SELECT COALESCE(NULLIF(referrer, ''), '(direct)') AS referrer, COUNT(*)::int AS hits
      FROM visits WHERE ts > ${sql.unsafe(since)}
      GROUP BY referrer ORDER BY hits DESC LIMIT 15
    `),
    safe("countries", sql`
      SELECT COALESCE(country, '?') AS country, COUNT(*)::int AS hits
      FROM visits WHERE ts > ${sql.unsafe(since)}
      GROUP BY country ORDER BY hits DESC LIMIT 15
    `),
    safe("devices", sql`
      SELECT COALESCE(device, 'Unknown') AS device, COUNT(*)::int AS hits
      FROM visits WHERE ts > ${sql.unsafe(since)}
      GROUP BY device ORDER BY hits DESC LIMIT 10
    `),
    safe("browsers", sql`
      SELECT COALESCE(browser, 'Other') AS browser, COUNT(*)::int AS hits
      FROM visits WHERE ts > ${sql.unsafe(since)}
      GROUP BY browser ORDER BY hits DESC LIMIT 10
    `),
    safe("os", sql`
      SELECT COALESCE(os, 'Other') AS os, COUNT(*)::int AS hits
      FROM visits WHERE ts > ${sql.unsafe(since)}
      GROUP BY os ORDER BY hits DESC LIMIT 10
    `),
    safe("utm", sql`
      SELECT COALESCE(NULLIF(utm_source, ''), '(none)') AS source,
             COALESCE(NULLIF(utm_medium, ''), '(none)') AS medium,
             COALESCE(NULLIF(utm_campaign, ''), '(none)') AS campaign,
             COUNT(*)::int AS hits
      FROM visits WHERE ts > ${sql.unsafe(since)}
      GROUP BY 1, 2, 3 ORDER BY hits DESC LIMIT 15
    `),
    safe("bounce", sql`
      SELECT COUNT(*)::int AS sessions,
             COUNT(*) FILTER (WHERE page_count <= 1)::int AS bounced
      FROM web_sessions WHERE started_at > ${sql.unsafe(since)}
    `),
    safe("daily", sql`
      SELECT date_trunc('day', ts)::date AS day,
             COUNT(*)::int AS page_views,
             COUNT(DISTINCT COALESCE(anon_id, ip))::int AS visitors
      FROM visits WHERE ts > ${sql.unsafe(since)}
      GROUP BY 1 ORDER BY day ASC
    `),
  ]);

  const t = totals.totals?.error ? {} : totals.totals?.[0] || {};
  const b = bounce.bounce?.error ? {} : bounce.bounce?.[0] || {};
  const bounceRate = b.sessions ? Math.round((b.bounced / b.sessions) * 100) : null;

  return json(200, {
    ok: true,
    range,
    stats: {
      visitors: t.visitors || 0,
      pageViews: t.page_views || 0,
      bounceRate,
      sessions: b.sessions || 0,
    },
    topPages: topPages.topPages?.error ? [] : topPages.topPages,
    referrers: referrers.referrers?.error ? [] : referrers.referrers,
    countries: countries.countries?.error ? [] : countries.countries,
    devices: devices.devices?.error ? [] : devices.devices,
    browsers: browsers.browsers?.error ? [] : browsers.browsers,
    os: os.os?.error ? [] : os.os,
    utm: utm.utm?.error ? [] : utm.utm,
    daily: daily.daily?.error ? [] : daily.daily,
  });
}
