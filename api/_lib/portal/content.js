import { sql } from "../db.js";
import { json } from "../http.js";

function requireAdminSync(session) {
  return session?.user?.isAdmin ? null : json(403, { ok: false, error: "forbidden" });
}

// Content performance: which posts attract, hold, and convert readers.
// Feeds the "Content" tab of the admin dashboard. All queries read the
// engagement_events + visits tables that VisitorTracker already populates,
// so there is no new client instrumentation required.
export async function handleContentInsights(session) {
  const gate = requireAdminSync(session);
  if (gate) return gate;

  const [topPosts, entryPosts, exitToBook, searchTerms, stalePosts, categoryMix] = await Promise.all([
    // Per-post engagement over 30 days
    sql`
      SELECT slug,
             COUNT(*) FILTER (WHERE kind = 'pageview_enter')::int AS views,
             COUNT(DISTINCT COALESCE(anon_id, session_id::text))::int AS unique_visitors,
             ROUND(AVG(value_num) FILTER (WHERE kind = 'pageview_exit') / 1000.0, 1)::float AS avg_dwell_sec,
             ROUND(MAX(value_num) FILTER (WHERE kind = 'pageview_exit'))::int AS max_scroll_pct
      FROM engagement_events
      WHERE path LIKE '/blog/%' AND ts > now() - interval '30 days' AND slug IS NOT NULL
      GROUP BY slug
      ORDER BY views DESC
      LIMIT 25
    `.catch(() => []),
    // Where do new sessions land? Landing pages drive SEO.
    sql`
      SELECT landing_path, COUNT(*)::int AS entries,
             ROUND(AVG(total_dwell_ms) / 1000.0, 1)::float AS avg_dwell_sec,
             COUNT(*) FILTER (WHERE bounced)::int AS bounces,
             COUNT(*)::int AS total_sessions
      FROM web_sessions
      WHERE landing_path LIKE '/blog%' AND started_at > now() - interval '30 days'
      GROUP BY landing_path
      ORDER BY entries DESC
      LIMIT 15
    `.catch(() => []),
    // Conversion signal: blog readers who later hit /book or /services
    sql`
      WITH bookers AS (
        SELECT DISTINCT anon_id FROM visits
        WHERE (path LIKE '/book%' OR path LIKE '/contact%')
          AND ts > now() - interval '30 days'
      )
      SELECT v2.path, COUNT(DISTINCT v2.anon_id)::int AS visitors_who_booked
      FROM visits v2
      JOIN bookers ON bookers.anon_id = v2.anon_id
      WHERE v2.path LIKE '/blog%'
        AND v2.ts > now() - interval '30 days'
        AND v2.ts < (
          SELECT MIN(v3.ts) FROM visits v3
          WHERE v3.anon_id = v2.anon_id AND (v3.path LIKE '/book%' OR v3.path LIKE '/contact%')
            AND v3.ts > now() - interval '30 days'
        )
      GROUP BY v2.path
      ORDER BY visitors_who_booked DESC
      LIMIT 10
    `.catch(() => []),
    // What are people searching for on the site?
    sql`
      SELECT value_text AS query, COUNT(*)::int AS searches
      FROM engagement_events
      WHERE kind = 'search' AND ts > now() - interval '30 days'
      GROUP BY value_text
      ORDER BY searches DESC
      LIMIT 20
    `.catch(() => []),
    // Posts losing traffic — update candidates for SEO refreshes
    sql`
      SELECT COALESCE(this_month.slug, prior.slug) AS slug,
             COALESCE(this_month.views, 0) AS recent_views,
             COALESCE(prior.views, 0) AS prior_views
      FROM (
        SELECT slug, COUNT(*) FILTER (WHERE kind='pageview_enter')::int AS views
        FROM engagement_events
        WHERE path LIKE '/blog/%' AND ts > now() - interval '30 days' AND slug IS NOT NULL
        GROUP BY slug
      ) this_month
      FULL OUTER JOIN (
        SELECT slug, COUNT(*) FILTER (WHERE kind='pageview_enter')::int AS views
        FROM engagement_events
        WHERE path LIKE '/blog/%' AND ts BETWEEN now() - interval '60 days' AND now() - interval '30 days' AND slug IS NOT NULL
        GROUP BY slug
      ) prior ON prior.slug = this_month.slug
      WHERE COALESCE(this_month.views, 0) * 2 < COALESCE(prior.views, 0)
      ORDER BY prior.views DESC
      LIMIT 12
    `.catch(() => []),
    sql`
      SELECT meta->>'category' AS category, COUNT(*)::int AS views
      FROM engagement_events
      WHERE path LIKE '/blog/%' AND kind = 'pageview_enter' AND ts > now() - interval '30 days'
      GROUP BY meta->>'category'
      ORDER BY views DESC
      LIMIT 8
    `.catch(() => []),
  ]);

  return json(200, {
    ok: true,
    generatedAt: new Date().toISOString(),
    topPosts,
    entryPosts,
    exitToBook,
    searchTerms,
    stalePosts,
    categoryMix,
  });
}
