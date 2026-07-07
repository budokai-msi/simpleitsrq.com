// api/_lib/portal/leadgen.js
//
// Lead-generation /api/portal actions (admin dashboard + the public
// token-authenticated tracking endpoints leadgen-o/-c/-u).
// leadgenTaxonomyReady is module-level state shared by several of the
// handlers below, so they all live together here.

import { sql } from "../db.js";
import { json } from "../http.js";
import { clampString } from "../sanitize.js";
import { runLeadgenWorker } from "../../cron/agent.js";
import { looksLikeChain } from "../leadgen-classify.js";
import { requireAdmin } from "./shared.js";

// ============================================================
// Lead generation (admin only)
// ============================================================
//
// All handlers below back the /portal/leadgen admin dashboard. The pipeline
// is:
//
//   1. Operator enters a zip code → handleLeadgenDiscover queues a
//      `lead_crawl_jobs` row of kind='osm_zip'. The cron worker picks it up,
//      calls discoverBusinessesByZip, and upserts into lead_businesses.
//   2. Operator picks a batch of businesses → handleLeadgenCrawlEmails
//      queues kind='website_emails' jobs (one per business). Cron worker
//      runs crawlEmails(business.website) and inserts lead_emails rows.
//   3. Operator builds a lead_campaigns row, ties it to a saved-segment
//      query, and starts it. Cron worker drains lead_campaign_sends
//      respecting throttle_per_hour + daily_cap, calling SES.
//
// The handlers are intentionally lightweight: they validate input, write
// the queue row or read from the DB, and return. All real work happens
// in api/cron/agent.js so we stay well under serverless time limits.

const LEADGEN_VALID_KINDS = new Set(["osm_zip", "website_emails"]);
let leadgenTaxonomyReady = false;

async function ensureLeadgenTaxonomyColumns() {
  if (leadgenTaxonomyReady) return;
  await sql`ALTER TABLE lead_businesses ADD COLUMN IF NOT EXISTS industry_group text`;
  await sql`ALTER TABLE lead_businesses ADD COLUMN IF NOT EXISTS sub_industry   text`;
  await sql`ALTER TABLE lead_businesses ADD COLUMN IF NOT EXISTS tags           text[] NOT NULL DEFAULT '{}'`;
  await sql`CREATE INDEX IF NOT EXISTS lead_businesses_group_idx ON lead_businesses (industry_group, status)`;
  await sql`CREATE INDEX IF NOT EXISTS lead_businesses_tags_gin  ON lead_businesses USING gin (tags)`;
  leadgenTaxonomyReady = true;
}

// Independently-wrapped health probe for the leadgen subsystem. Used as the
// fallback when handleLeadgenStatus fails, so the dashboard can show exactly
// what's wrong (the common cause is unapplied migrations or a missing
// DATABASE_URL) instead of an opaque 500.
const LEADGEN_TABLES = [
  "lead_businesses", "lead_emails", "lead_campaigns",
  "lead_campaign_sends", "lead_campaign_links", "lead_crawl_jobs",
];
async function leadgenPreflight() {
  const checks = {};
  try {
    await sql`SELECT 1`;
    checks.database = { ok: true };
  } catch (e) {
    checks.database = { ok: false, detail: String(e?.message || e).slice(0, 200) };
  }
  if (checks.database.ok) {
    try {
      const rows = await sql`SELECT table_name FROM information_schema.tables
                             WHERE table_schema = 'public' AND table_name = ANY(${LEADGEN_TABLES})`;
      const present = new Set(rows.map((r) => r.table_name));
      const missing = LEADGEN_TABLES.filter((t) => !present.has(t));
      checks.tables = {
        ok: missing.length === 0,
        missing,
        ...(missing.length ? { hint: "Run `npm run db:push` to apply db/migrations (013_leadgen.sql)." } : {}),
      };
    } catch (e) {
      checks.tables = { ok: false, detail: String(e?.message || e).slice(0, 200) };
    }
  } else {
    checks.tables = { ok: false, detail: "skipped — database unreachable" };
  }
  const hasEmail = !!(process.env.RESEND_API_KEY || process.env.BREVO_API_KEY || process.env.SMTP_HOST);
  checks.email_transport = {
    ok: hasEmail,
    ...(hasEmail ? {} : { hint: "Set RESEND_API_KEY, BREVO_API_KEY, or SMTP_HOST to enable campaign sends." }),
  };
  checks.discovery = { ok: true, detail: "OpenStreetMap Overpass — checked live during discover/crawl." };
  return { ok: checks.database.ok && checks.tables.ok, checks };
}

export async function handleLeadgenStatus(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  try {
  await ensureLeadgenTaxonomyColumns();

  // Aggregate counts in one round-trip per table. These power the
  // dashboard top-line numbers.
  const [biz, emails, camps, sends, jobs, readySegments, reviewQueue, campaignQueue, jobCounts] = await Promise.all([
    sql`SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status='active')::int AS active,
               COUNT(*) FILTER (WHERE website IS NOT NULL)::int AS with_website
        FROM lead_businesses`,
    sql`SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE opted_out_at IS NULL AND bounced_at IS NULL)::int AS deliverable,
               COUNT(DISTINCT business_id)::int AS businesses_with_email
        FROM lead_emails`,
    sql`SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status='running')::int AS running
        FROM lead_campaigns`,
    sql`SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE sent_at IS NOT NULL)::int AS sent,
               COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::int AS opened,
               COUNT(*) FILTER (WHERE clicked_at IS NOT NULL)::int AS clicked,
               COUNT(*) FILTER (WHERE replied_at IS NOT NULL)::int AS replied
        FROM lead_campaign_sends`,
    sql`SELECT id, kind, status, progress, total, result, payload, created_at
        FROM lead_crawl_jobs
        ORDER BY created_at DESC
        LIMIT 20`,
    sql`SELECT b.zip,
               COALESCE(NULLIF(MAX(b.city), ''), '-') AS city,
               COALESCE(b.industry_group, 'Other') AS industry_group,
               COUNT(*)::int AS businesses,
               COUNT(*) FILTER (WHERE b.website IS NOT NULL)::int AS with_website,
               COUNT(*) FILTER (WHERE EXISTS (
                 SELECT 1 FROM lead_emails e
                 WHERE e.business_id = b.id
                   AND e.opted_out_at IS NULL
                   AND e.bounced_at IS NULL
               ))::int AS with_email
        FROM lead_businesses b
        WHERE b.status = 'active'
          AND b.zip IS NOT NULL
        GROUP BY b.zip, b.industry_group
        HAVING COUNT(*) >= 2
        ORDER BY with_email DESC, businesses DESC
        LIMIT 8`,
    sql`SELECT b.id, b.name, b.city, b.state, b.zip, b.website, b.phone,
               b.industry_group, b.sub_industry, b.source_url, b.created_at,
               (SELECT COUNT(*)::int FROM lead_emails e
                 WHERE e.business_id = b.id
                   AND e.opted_out_at IS NULL
                   AND e.bounced_at IS NULL) AS deliverable_emails
        FROM lead_businesses b
        WHERE b.status = 'active'
        ORDER BY deliverable_emails DESC, b.created_at DESC
        LIMIT 8`,
    sql`SELECT c.id, c.name, c.status, c.daily_cap, c.updated_at,
               (SELECT COUNT(*)::int FROM lead_campaign_sends s WHERE s.campaign_id = c.id) AS total_sends,
               (SELECT COUNT(*)::int FROM lead_campaign_sends s
                 WHERE s.campaign_id = c.id AND s.status = 'queued') AS queued,
               (SELECT COUNT(*)::int FROM lead_campaign_sends s
                 WHERE s.campaign_id = c.id AND s.sent_at IS NOT NULL) AS sent,
               (SELECT COUNT(*)::int FROM lead_campaign_sends s
                 WHERE s.campaign_id = c.id AND s.opened_at IS NOT NULL) AS opened,
               (SELECT COUNT(*)::int FROM lead_campaign_sends s
                 WHERE s.campaign_id = c.id AND s.replied_at IS NOT NULL) AS replied
        FROM lead_campaigns c
        ORDER BY c.updated_at DESC, c.id DESC
        LIMIT 6`,
    sql`SELECT status, COUNT(*)::int AS count
        FROM lead_crawl_jobs
        GROUP BY status
        ORDER BY status`,
  ]);

  return json(200, {
    ok: true,
    generated_at: new Date().toISOString(),
    businesses: biz[0] || {},
    emails: emails[0] || {},
    campaigns: camps[0] || {},
    sends: sends[0] || {},
    recent_jobs: jobs,
    ready_segments: readySegments || [],
    review_queue: reviewQueue || [],
    campaign_queue: campaignQueue || [],
    job_counts: jobCounts || [],
  });
  } catch (err) {
    // Self-diagnose instead of returning an opaque 500. The whole dashboard
    // reads this endpoint, so a single missing table or unset DATABASE_URL
    // otherwise makes every leadgen surface look "broken". Surface the exact
    // cause and remediation so the operator can fix it in one step.
    const preflight = await leadgenPreflight().catch(() => null);
    const message = preflight?.checks?.database?.ok === false
      ? "Leadgen database is unreachable — check DATABASE_URL in your environment."
      : preflight?.checks?.tables?.ok === false
        ? "Leadgen tables are missing — run `npm run db:push` to apply migrations."
        : "Leadgen is temporarily unavailable. See detail below.";
    return json(200, {
      ok: true,
      degraded: true,
      error: "leadgen_unavailable",
      message,
      detail: String(err?.message || err).slice(0, 240),
      preflight,
      generated_at: new Date().toISOString(),
      businesses: {}, emails: {}, campaigns: {}, sends: {},
      recent_jobs: [], ready_segments: [], review_queue: [],
      campaign_queue: [], job_counts: [],
    });
  }
}

// GET — aggregated insights for the Insights tab
export async function handleLeadgenInsights(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  await ensureLeadgenTaxonomyColumns();

  const [
    totalRow,
    withWebsiteRow,
    withEmailRow,
    avgEmailsRow,
    geography,
    industries,
    emailHealth,
    discoveryVelocity,
    campaignStats,
    topSegments,
  ] = await Promise.all([
    sql`SELECT COUNT(*)::int AS n FROM lead_businesses`,
    sql`SELECT COUNT(*)::int AS n FROM lead_businesses WHERE website IS NOT NULL`,
    sql`SELECT COUNT(DISTINCT business_id)::int AS n FROM lead_emails WHERE opted_out_at IS NULL AND bounced_at IS NULL`,
    sql`SELECT AVG(cnt)::numeric(4,2) AS avg FROM (SELECT COUNT(*)::int AS cnt FROM lead_emails WHERE opted_out_at IS NULL AND bounced_at IS NULL GROUP BY business_id) t`,
    sql`SELECT b.zip, b.city, COUNT(*)::int AS count,
               COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM lead_emails e WHERE e.business_id = b.id AND e.opted_out_at IS NULL AND e.bounced_at IS NULL))::int AS with_email
        FROM lead_businesses b
        GROUP BY b.zip, b.city
        ORDER BY count DESC
        LIMIT 10`,
    sql`SELECT industry_group, COUNT(*)::int AS count,
               ROUND(COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER (), 0), 1)::text AS pct
        FROM lead_businesses
        WHERE industry_group IS NOT NULL
        GROUP BY industry_group
        ORDER BY count DESC
        LIMIT 10`,
    sql`SELECT b.industry_group,
               COUNT(e.id)::int AS total_emails,
               COUNT(*) FILTER (WHERE e.opted_out_at IS NULL AND e.bounced_at IS NULL)::int AS deliverable,
               ROUND(COUNT(*) FILTER (WHERE e.opted_out_at IS NULL AND e.bounced_at IS NULL) * 100.0
                     / NULLIF(COUNT(e.id), 0), 1)::text AS rate
        FROM lead_businesses b
        LEFT JOIN lead_emails e ON e.business_id = b.id
        WHERE b.industry_group IS NOT NULL
        GROUP BY b.industry_group
        HAVING COUNT(e.id) > 0
        ORDER BY deliverable DESC
        LIMIT 10`,
    sql`SELECT TO_CHAR(DATE_TRUNC('week', created_at), 'YYYY-MM-DD') AS period,
               COUNT(*)::int AS count,
               COUNT(*) FILTER (WHERE website IS NOT NULL)::int AS with_website
        FROM lead_businesses
        WHERE created_at > now() - interval '12 weeks'
        GROUP BY DATE_TRUNC('week', created_at)
        ORDER BY period DESC
        LIMIT 12`,
    sql`SELECT c.id, c.name,
               COUNT(*) FILTER (WHERE cs.sent_at IS NOT NULL)::int AS sent,
               ROUND(COUNT(*) FILTER (WHERE cs.opened_at IS NOT NULL) * 100.0
                     / NULLIF(COUNT(*) FILTER (WHERE cs.sent_at IS NOT NULL), 0), 1)::text AS open_rate,
               ROUND(COUNT(*) FILTER (WHERE cs.replied_at IS NOT NULL) * 100.0
                     / NULLIF(COUNT(*) FILTER (WHERE cs.sent_at IS NOT NULL), 0), 1)::text AS reply_rate
        FROM lead_campaigns c
        LEFT JOIN lead_campaign_sends cs ON cs.campaign_id = c.id
        GROUP BY c.id, c.name
        ORDER BY sent DESC
        LIMIT 10`,
    sql`SELECT b.zip, b.industry_group, COUNT(*)::int AS count,
               COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM lead_emails e WHERE e.business_id = b.id AND e.opted_out_at IS NULL AND e.bounced_at IS NULL))::int AS with_email
        FROM lead_businesses b
        WHERE b.zip IS NOT NULL AND b.industry_group IS NOT NULL
        GROUP BY b.zip, b.industry_group
        ORDER BY count DESC
        LIMIT 10`,
  ]);

  const total = totalRow[0]?.n || 0;
  const withWebsite = withWebsiteRow[0]?.n || 0;
  const withEmail = withEmailRow[0]?.n || 0;

  return json(200, {
    ok: true,
    totalBusinesses: total,
    withWebsite,
    withEmail,
    websiteRate: total > 0 ? Math.round((withWebsite / total) * 100) : 0,
    emailRate: total > 0 ? Math.round((withEmail / total) * 100) : 0,
    avgEmailsPerBiz: Number(avgEmailsRow[0]?.avg || 0),
    geography: geography || [],
    industries: industries || [],
    emailHealth: emailHealth || [],
    discoveryVelocity: discoveryVelocity || [],
    campaignStats: campaignStats || [],
    topSegments: topSegments || [],
  });
}

// POST { zip }
export async function handleLeadgenDiscover(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const userId = session.user?.id || null;
  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const zip = String(body?.zip || "").trim();
  if (!/^\d{5}$/.test(zip)) return json(400, { ok: false, error: "invalid_zip" });

  // Refuse to queue a duplicate pending job for the same zip — operators
  // hitting the button twice shouldn't double-spend Overpass quota.
  const existing = await sql`
    SELECT id FROM lead_crawl_jobs
    WHERE kind='osm_zip' AND status IN ('pending','running') AND payload->>'zip' = ${zip}
    LIMIT 1
  `;
  if (existing.length) {
    return json(200, { ok: true, job_id: existing[0].id, deduped: true });
  }

  const rows = await sql`
    INSERT INTO lead_crawl_jobs (kind, status, payload, created_by)
    VALUES ('osm_zip', 'pending', ${JSON.stringify({ zip })}::jsonb, ${userId})
    RETURNING id
  `;
  return json(200, { ok: true, job_id: rows[0].id });
}

// POST { business_ids?: number[], zip?: string, limit?: number }
//
// If business_ids is provided, queue a website_emails job per id. Otherwise
// pick the first `limit` (default 25, max 200) active businesses in the
// given zip that still have a website and no recent crawl.
export async function handleLeadgenCrawlEmails(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const userId = session.user?.id || null;
  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }

  let ids = Array.isArray(body?.business_ids) ? body.business_ids.filter(Number.isInteger) : [];
  if (!ids.length) {
    const zip = String(body?.zip || "").trim();
    const limit = Math.min(Math.max(Number(body?.limit) || 25, 1), 200);
    if (!/^\d{5}$/.test(zip)) return json(400, { ok: false, error: "missing_zip_or_ids" });
    const rows = await sql`
      SELECT b.id FROM lead_businesses b
      WHERE b.zip = ${zip}
        AND b.website IS NOT NULL
        AND b.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM lead_crawl_jobs j
          WHERE j.kind='website_emails'
            AND j.status IN ('pending','running','done')
            AND (j.payload->>'business_id')::int = b.id
            AND j.created_at > now() - interval '30 days'
        )
      ORDER BY b.id
      LIMIT ${limit}
    `;
    ids = rows.map((r) => r.id);
  }
  if (!ids.length) return json(200, { ok: true, queued: 0, ids: [] });

  const inserted = [];
  for (const id of ids) {
    const r = await sql`
      INSERT INTO lead_crawl_jobs (kind, status, payload, created_by)
      VALUES ('website_emails', 'pending', ${JSON.stringify({ business_id: id })}::jsonb, ${userId})
      RETURNING id
    `;
    inserted.push(r[0].id);
  }
  return json(200, { ok: true, queued: inserted.length, ids: inserted });
}

function readLeadgenBusinessFilters(url) {
  const zip = (url.searchParams.get("zip") || "").trim();
  const status = (url.searchParams.get("status") || "").trim();
  const q = (url.searchParams.get("q") || "").trim();
  const industryGroup = (url.searchParams.get("industry_group") || "").trim();
  const subIndustry = (url.searchParams.get("sub_industry") || "").trim();
  const hasWebsite = url.searchParams.get("has_website") === "1";
  const hasEmail = url.searchParams.get("has_email") === "1";
  const noEmail = url.searchParams.get("no_email") === "1";
  const tag = (url.searchParams.get("tag") || "").trim().toLowerCase();
  const minEmails = Math.max(0, Number(url.searchParams.get("min_emails")) || 0);
  const maxEmails = Math.max(0, Number(url.searchParams.get("max_emails")) || 0);
  const createdAfter = (url.searchParams.get("created_after") || "").trim();
  const createdBefore = (url.searchParams.get("created_before") || "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const offset = (page - 1) * limit;

  const wantsZip = /^\d{5}$/.test(zip);
  const wantsStatus = ["active", "rejected", "do_not_contact"].includes(status);
  const wantsQ = q.length >= 2;
  const wantsGroup = industryGroup.length > 0;
  const wantsSub = subIndustry.length > 0;
  const wantsTag = tag.length > 0;
  const wantsMinEmails = minEmails > 0;
  const wantsMaxEmails = maxEmails > 0;
  const wantsCreatedAfter = /^\d{4}-\d{2}-\d{2}$/.test(createdAfter);
  const wantsCreatedBefore = /^\d{4}-\d{2}-\d{2}$/.test(createdBefore);
  const like = `%${q.toLowerCase()}%`;
  const tagLike = `%${tag}%`;
  const groupLike = `%${industryGroup.toLowerCase()}%`;
  const subLike = `%${subIndustry.toLowerCase()}%`;
  const createdAfterIso = wantsCreatedAfter ? `${createdAfter}T00:00:00Z` : "1970-01-01T00:00:00Z";
  const createdBeforeIso = wantsCreatedBefore ? `${createdBefore}T23:59:59Z` : "9999-12-31T23:59:59Z";

  return {
    zip,
    status,
    q,
    industryGroup,
    subIndustry,
    hasWebsite,
    hasEmail,
    noEmail,
    tag,
    minEmails,
    maxEmails,
    page,
    limit,
    offset,
    wantsZip,
    wantsStatus,
    wantsQ,
    wantsGroup,
    wantsSub,
    wantsTag,
    wantsMinEmails,
    wantsMaxEmails,
    wantsCreatedAfter,
    wantsCreatedBefore,
    like,
    tagLike,
    groupLike,
    subLike,
    createdAfterIso,
    createdBeforeIso,
  };
}

function safeLeadgenError(err) {
  return String(err?.message || err || "unknown_error").slice(0, 220);
}

function leadgenResultWarning(mode, reason) {
  return `Loaded ${mode} view after leadgen query failed: ${safeLeadgenError(reason)}`;
}

async function fetchLeadgenBusinessesModern(f) {
  const rows = await sql`
    SELECT b.id, b.name, b.address, b.city, b.state, b.zip, b.lat, b.lng, b.website,
           b.phone, b.industry, b.industry_group, b.sub_industry, b.tags,
           b.status, b.source, b.source_id, b.source_url, b.created_at,
           (SELECT COUNT(*)::int FROM lead_emails e
              WHERE e.business_id = b.id
                AND e.opted_out_at IS NULL
                AND e.bounced_at IS NULL) AS deliverable_emails
    FROM lead_businesses b
    WHERE (${!f.wantsZip}::bool OR b.zip = ${f.zip})
      AND (${!f.wantsStatus}::bool OR b.status = ${f.status})
      AND (${!f.wantsQ}::bool
        OR lower(b.name) LIKE ${f.like}
        OR lower(coalesce(b.website,'')) LIKE ${f.like}
        OR EXISTS (
          SELECT 1 FROM lead_emails e
          WHERE e.business_id = b.id
            AND lower(e.email) LIKE ${f.like}
            AND e.opted_out_at IS NULL
            AND e.bounced_at IS NULL))
      AND (${!f.wantsGroup}::bool OR b.industry_group = ${f.industryGroup})
      AND (${!f.wantsSub}::bool OR b.sub_industry = ${f.subIndustry})
      AND (${!f.hasWebsite}::bool OR b.website IS NOT NULL)
      AND (${!f.hasEmail}::bool OR EXISTS (
            SELECT 1 FROM lead_emails e
            WHERE e.business_id = b.id
              AND e.opted_out_at IS NULL
              AND e.bounced_at IS NULL))
      AND (${!f.noEmail}::bool OR NOT EXISTS (
            SELECT 1 FROM lead_emails e
            WHERE e.business_id = b.id
              AND e.opted_out_at IS NULL
              AND e.bounced_at IS NULL))
      AND (${!f.wantsTag}::bool OR EXISTS (
            SELECT 1
            FROM unnest(coalesce(b.tags, '{}'::text[])) AS tag_value(tag)
            WHERE lower(tag_value.tag) LIKE ${f.tagLike}))
      AND (${!f.wantsCreatedAfter}::bool OR b.created_at >= ${f.createdAfterIso}::timestamptz)
      AND (${!f.wantsCreatedBefore}::bool OR b.created_at <= ${f.createdBeforeIso}::timestamptz)
    ORDER BY b.id DESC
    LIMIT ${f.limit} OFFSET ${f.offset}
  `;

  // Apply min/max email filters in JS because the subquery makes SQL
  // composition with neon tagged templates fragile for HAVING.
  const filteredRows = rows.filter((r) => {
    const de = r.deliverable_emails || 0;
    if (f.wantsMinEmails && de < f.minEmails) return false;
    if (f.wantsMaxEmails && de > f.maxEmails) return false;
    return true;
  });

  const totalRow = await sql`
    SELECT COUNT(*)::int AS total
    FROM lead_businesses b
    WHERE (${!f.wantsZip}::bool OR b.zip = ${f.zip})
      AND (${!f.wantsStatus}::bool OR b.status = ${f.status})
      AND (${!f.wantsQ}::bool
        OR lower(b.name) LIKE ${f.like}
        OR lower(coalesce(b.website,'')) LIKE ${f.like}
        OR EXISTS (
          SELECT 1 FROM lead_emails e
          WHERE e.business_id = b.id
            AND lower(e.email) LIKE ${f.like}
            AND e.opted_out_at IS NULL
            AND e.bounced_at IS NULL))
      AND (${!f.wantsGroup}::bool OR b.industry_group = ${f.industryGroup})
      AND (${!f.wantsSub}::bool OR b.sub_industry = ${f.subIndustry})
      AND (${!f.hasWebsite}::bool OR b.website IS NOT NULL)
      AND (${!f.hasEmail}::bool OR EXISTS (
            SELECT 1 FROM lead_emails e
            WHERE e.business_id = b.id
              AND e.opted_out_at IS NULL
              AND e.bounced_at IS NULL))
      AND (${!f.noEmail}::bool OR NOT EXISTS (
            SELECT 1 FROM lead_emails e
            WHERE e.business_id = b.id
              AND e.opted_out_at IS NULL
              AND e.bounced_at IS NULL))
      AND (${!f.wantsTag}::bool OR EXISTS (
            SELECT 1
            FROM unnest(coalesce(b.tags, '{}'::text[])) AS tag_value(tag)
            WHERE lower(tag_value.tag) LIKE ${f.tagLike}))
      AND (${!f.wantsCreatedAfter}::bool OR b.created_at >= ${f.createdAfterIso}::timestamptz)
      AND (${!f.wantsCreatedBefore}::bool OR b.created_at <= ${f.createdBeforeIso}::timestamptz)
  `;

  const groups = await sql`
    SELECT industry_group, COUNT(*)::int AS n
    FROM lead_businesses
    WHERE industry_group IS NOT NULL
      AND (${!f.wantsZip}::bool OR zip = ${f.zip})
    GROUP BY industry_group ORDER BY n DESC
  `;
  const subs = f.wantsGroup ? await sql`
    SELECT sub_industry, COUNT(*)::int AS n
    FROM lead_businesses
    WHERE industry_group = ${f.industryGroup}
      AND sub_industry IS NOT NULL
      AND (${!f.wantsZip}::bool OR zip = ${f.zip})
    GROUP BY sub_industry ORDER BY n DESC
  ` : [];

  return {
    rows: filteredRows,
    total: totalRow[0]?.total || 0,
    facets: { groups, subs },
  };
}

async function fetchLeadgenBusinessesLegacy(f, reason) {
  const rows = await sql`
    SELECT b.id, b.name, b.address, b.city, b.state, b.zip, b.lat, b.lng, b.website,
           b.phone, b.industry, COALESCE(NULLIF(b.industry, ''), 'Other') AS industry_group,
           NULL::text AS sub_industry, '{}'::text[] AS tags,
           b.status, b.source, b.source_id, b.source_url, b.created_at,
           (SELECT COUNT(*)::int FROM lead_emails e
              WHERE e.business_id = b.id
                AND e.opted_out_at IS NULL
                AND e.bounced_at IS NULL) AS deliverable_emails
    FROM lead_businesses b
    WHERE (${!f.wantsZip}::bool OR b.zip = ${f.zip})
      AND (${!f.wantsStatus}::bool OR b.status = ${f.status})
      AND (${!f.wantsQ}::bool
        OR lower(b.name) LIKE ${f.like}
        OR lower(coalesce(b.website,'')) LIKE ${f.like}
        OR lower(coalesce(b.industry,'')) LIKE ${f.like}
        OR EXISTS (
          SELECT 1 FROM lead_emails e
          WHERE e.business_id = b.id
            AND lower(e.email) LIKE ${f.like}
            AND e.opted_out_at IS NULL
            AND e.bounced_at IS NULL))
      AND (${!f.wantsGroup}::bool OR lower(coalesce(b.industry,'')) LIKE ${f.groupLike})
      AND (${!f.wantsSub}::bool OR lower(coalesce(b.industry,'')) LIKE ${f.subLike})
      AND (${!f.hasWebsite}::bool OR b.website IS NOT NULL)
      AND (${!f.hasEmail}::bool OR EXISTS (
            SELECT 1 FROM lead_emails e
            WHERE e.business_id = b.id
              AND e.opted_out_at IS NULL
              AND e.bounced_at IS NULL))
      AND (${!f.noEmail}::bool OR NOT EXISTS (
            SELECT 1 FROM lead_emails e
            WHERE e.business_id = b.id
              AND e.opted_out_at IS NULL
              AND e.bounced_at IS NULL))
      AND (${!f.wantsTag}::bool
        OR lower(b.name) LIKE ${f.tagLike}
        OR lower(coalesce(b.website,'')) LIKE ${f.tagLike}
        OR lower(coalesce(b.industry,'')) LIKE ${f.tagLike}
        OR EXISTS (
          SELECT 1 FROM lead_emails e
          WHERE e.business_id = b.id
            AND lower(e.email) LIKE ${f.tagLike}
            AND e.opted_out_at IS NULL
            AND e.bounced_at IS NULL))
      AND (${!f.wantsCreatedAfter}::bool OR b.created_at >= ${f.createdAfterIso}::timestamptz)
      AND (${!f.wantsCreatedBefore}::bool OR b.created_at <= ${f.createdBeforeIso}::timestamptz)
    ORDER BY b.id DESC
    LIMIT ${f.limit} OFFSET ${f.offset}
  `;

  const filteredRows = rows.filter((r) => {
    const de = r.deliverable_emails || 0;
    if (f.wantsMinEmails && de < f.minEmails) return false;
    if (f.wantsMaxEmails && de > f.maxEmails) return false;
    return true;
  });

  let total = filteredRows.length;
  let groups = [];
  const warnings = [];

  try {
    const totalRow = await sql`
      SELECT COUNT(*)::int AS total
      FROM lead_businesses b
      WHERE (${!f.wantsZip}::bool OR b.zip = ${f.zip})
        AND (${!f.wantsStatus}::bool OR b.status = ${f.status})
        AND (${!f.wantsQ}::bool
          OR lower(b.name) LIKE ${f.like}
          OR lower(coalesce(b.website,'')) LIKE ${f.like}
          OR lower(coalesce(b.industry,'')) LIKE ${f.like}
          OR EXISTS (
            SELECT 1 FROM lead_emails e
            WHERE e.business_id = b.id
              AND lower(e.email) LIKE ${f.like}
              AND e.opted_out_at IS NULL
              AND e.bounced_at IS NULL))
        AND (${!f.wantsGroup}::bool OR lower(coalesce(b.industry,'')) LIKE ${f.groupLike})
        AND (${!f.wantsSub}::bool OR lower(coalesce(b.industry,'')) LIKE ${f.subLike})
        AND (${!f.hasWebsite}::bool OR b.website IS NOT NULL)
        AND (${!f.hasEmail}::bool OR EXISTS (
              SELECT 1 FROM lead_emails e
              WHERE e.business_id = b.id
                AND e.opted_out_at IS NULL
                AND e.bounced_at IS NULL))
        AND (${!f.noEmail}::bool OR NOT EXISTS (
              SELECT 1 FROM lead_emails e
              WHERE e.business_id = b.id
                AND e.opted_out_at IS NULL
                AND e.bounced_at IS NULL))
        AND (${!f.wantsTag}::bool
          OR lower(b.name) LIKE ${f.tagLike}
          OR lower(coalesce(b.website,'')) LIKE ${f.tagLike}
          OR lower(coalesce(b.industry,'')) LIKE ${f.tagLike}
          OR EXISTS (
            SELECT 1 FROM lead_emails e
            WHERE e.business_id = b.id
              AND lower(e.email) LIKE ${f.tagLike}
              AND e.opted_out_at IS NULL
              AND e.bounced_at IS NULL))
        AND (${!f.wantsCreatedAfter}::bool OR b.created_at >= ${f.createdAfterIso}::timestamptz)
        AND (${!f.wantsCreatedBefore}::bool OR b.created_at <= ${f.createdBeforeIso}::timestamptz)
    `;
    total = totalRow[0]?.total || 0;
  } catch (err) {
    warnings.push(`count: ${safeLeadgenError(err)}`);
    console.warn("[portal] leadgen legacy count failed; keeping row list", safeLeadgenError(err));
  }

  try {
    groups = await sql`
      SELECT COALESCE(NULLIF(industry, ''), 'Other') AS industry_group, COUNT(*)::int AS n
      FROM lead_businesses
      WHERE industry IS NOT NULL
        AND (${!f.wantsZip}::bool OR zip = ${f.zip})
      GROUP BY COALESCE(NULLIF(industry, ''), 'Other')
      ORDER BY n DESC
    `;
  } catch (err) {
    warnings.push(`facets: ${safeLeadgenError(err)}`);
    console.warn("[portal] leadgen legacy facets failed; keeping row list", safeLeadgenError(err));
  }

  return {
    rows: filteredRows,
    total,
    facets: { groups, subs: [] },
    degraded: true,
    warning: [leadgenResultWarning("compatibility", reason), ...warnings].join(" | "),
  };
}

async function fetchLeadgenBusinessesBare(f, reason) {
  const rows = await sql`
    SELECT b.id, b.name, b.address, b.city, b.state, b.zip, b.lat, b.lng, b.website,
           b.phone, b.industry, COALESCE(NULLIF(b.industry, ''), 'Other') AS industry_group,
           NULL::text AS sub_industry, '{}'::text[] AS tags,
           b.status, b.source, b.source_id, b.source_url, b.created_at,
           0::int AS deliverable_emails
    FROM lead_businesses b
    WHERE (${!f.wantsZip}::bool OR b.zip = ${f.zip})
      AND (${!f.wantsStatus}::bool OR b.status = ${f.status})
      AND (${!f.wantsQ}::bool
        OR lower(b.name) LIKE ${f.like}
        OR lower(coalesce(b.website,'')) LIKE ${f.like}
        OR lower(coalesce(b.industry,'')) LIKE ${f.like})
      AND (${!f.wantsGroup}::bool OR lower(coalesce(b.industry,'')) LIKE ${f.groupLike})
      AND (${!f.wantsSub}::bool OR lower(coalesce(b.industry,'')) LIKE ${f.subLike})
      AND (${!f.hasWebsite}::bool OR b.website IS NOT NULL)
      AND (${!f.wantsTag}::bool
        OR lower(b.name) LIKE ${f.tagLike}
        OR lower(coalesce(b.website,'')) LIKE ${f.tagLike}
        OR lower(coalesce(b.industry,'')) LIKE ${f.tagLike})
      AND (${!f.wantsCreatedAfter}::bool OR b.created_at >= ${f.createdAfterIso}::timestamptz)
      AND (${!f.wantsCreatedBefore}::bool OR b.created_at <= ${f.createdBeforeIso}::timestamptz)
    ORDER BY b.id DESC
    LIMIT ${f.limit} OFFSET ${f.offset}
  `;

  let total = rows.length;
  let groups = [];
  const warnings = [];

  try {
    const totalRow = await sql`
      SELECT COUNT(*)::int AS total
      FROM lead_businesses b
      WHERE (${!f.wantsZip}::bool OR b.zip = ${f.zip})
        AND (${!f.wantsStatus}::bool OR b.status = ${f.status})
        AND (${!f.wantsQ}::bool
          OR lower(b.name) LIKE ${f.like}
          OR lower(coalesce(b.website,'')) LIKE ${f.like}
          OR lower(coalesce(b.industry,'')) LIKE ${f.like})
        AND (${!f.wantsGroup}::bool OR lower(coalesce(b.industry,'')) LIKE ${f.groupLike})
        AND (${!f.wantsSub}::bool OR lower(coalesce(b.industry,'')) LIKE ${f.subLike})
        AND (${!f.hasWebsite}::bool OR b.website IS NOT NULL)
        AND (${!f.wantsTag}::bool
          OR lower(b.name) LIKE ${f.tagLike}
          OR lower(coalesce(b.website,'')) LIKE ${f.tagLike}
          OR lower(coalesce(b.industry,'')) LIKE ${f.tagLike})
        AND (${!f.wantsCreatedAfter}::bool OR b.created_at >= ${f.createdAfterIso}::timestamptz)
        AND (${!f.wantsCreatedBefore}::bool OR b.created_at <= ${f.createdBeforeIso}::timestamptz)
    `;
    total = totalRow[0]?.total || 0;
  } catch (err) {
    warnings.push(`count: ${safeLeadgenError(err)}`);
    console.warn("[portal] leadgen bare count failed; keeping row list", safeLeadgenError(err));
  }

  try {
    groups = await sql`
      SELECT COALESCE(NULLIF(industry, ''), 'Other') AS industry_group, COUNT(*)::int AS n
      FROM lead_businesses
      WHERE industry IS NOT NULL
        AND (${!f.wantsZip}::bool OR zip = ${f.zip})
      GROUP BY COALESCE(NULLIF(industry, ''), 'Other')
      ORDER BY n DESC
    `;
  } catch (err) {
    warnings.push(`facets: ${safeLeadgenError(err)}`);
    console.warn("[portal] leadgen bare facets failed; keeping row list", safeLeadgenError(err));
  }

  return {
    rows,
    total,
    facets: { groups, subs: [] },
    degraded: true,
    warning: [leadgenResultWarning("bare business", reason), ...warnings].join(" | "),
  };
}

// GET ?zip=&status=&q=&page=&limit=&tag=&min_emails=&max_emails=&created_after=&created_before=
export async function handleLeadgenBusinesses(session, url) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const f = readLeadgenBusinessFilters(url);
  let ensureError = null;
  try {
    await ensureLeadgenTaxonomyColumns();
  } catch (err) {
    ensureError = err;
    console.warn("[portal] leadgen taxonomy ensure failed; list will try compatibility mode", safeLeadgenError(err));
  }

  let result;
  try {
    result = await fetchLeadgenBusinessesModern(f);
  } catch (err) {
    console.warn("[portal] leadgen modern list query failed; trying compatibility mode", safeLeadgenError(err));
    try {
      result = await fetchLeadgenBusinessesLegacy(f, ensureError || err);
    } catch (legacyErr) {
      console.warn("[portal] leadgen compatibility list query failed; trying bare mode", safeLeadgenError(legacyErr));
      try {
        result = await fetchLeadgenBusinessesBare(f, legacyErr);
      } catch (bareErr) {
        console.error("[portal] leadgen bare list query failed; returning empty degraded list", safeLeadgenError(bareErr));
        result = {
          rows: [],
          total: 0,
          facets: { groups: [], subs: [] },
          degraded: true,
          warning: [
            leadgenResultWarning("empty fallback", bareErr),
            `compatibility: ${safeLeadgenError(legacyErr)}`,
          ].join(" | "),
        };
      }
    }
  }

  return json(200, {
    ok: true,
    page: f.page,
    limit: f.limit,
    total: result.total,
    // Flag national/regional chains so the dashboard can sort independents
    // first and offer an independents-only filter (matches the public scanner).
    rows: (result.rows || []).map((r) => ({ ...r, is_chain: Boolean(r.is_chain) || looksLikeChain(r.name) })),
    facets: result.facets,
    degraded: !!result.degraded,
    warning: result.warning || null,
  });
}

// GET ?business_id=
export async function handleLeadgenBusinessDetail(session, url) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const id = Number(url.searchParams.get("business_id"));
  if (!Number.isInteger(id)) return json(400, { ok: false, error: "invalid_id" });

  const [biz, emails] = await Promise.all([
    sql`SELECT * FROM lead_businesses WHERE id = ${id}`,
    sql`SELECT id, email, source, source_url, context_snippet, confidence,
               opted_out_at, bounced_at, last_sent_at, created_at
        FROM lead_emails WHERE business_id = ${id} ORDER BY confidence DESC, id ASC`,
  ]);
  if (!biz.length) return json(404, { ok: false, error: "not_found" });
  return json(200, { ok: true, business: biz[0], emails });
}

// POST { id, status?, tags?, sub_industry?, industry_group? }
//   id required. Any of the optional fields may be passed; nulls/undefined
//   leave the existing value untouched.
export async function handleLeadgenBusinessUpdate(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const id = Number(body?.id);
  if (!Number.isInteger(id)) return json(400, { ok: false, error: "invalid_id" });

  const status = body?.status !== undefined ? String(body.status) : null;
  if (status !== null && !["active","rejected","do_not_contact"].includes(status)) {
    return json(400, { ok: false, error: "invalid_status" });
  }

  // Tags arrive as either an array of strings or a comma-separated string;
  // normalize to a deduped lowercased array (PG text[]).
  let tags = undefined;
  if (Array.isArray(body?.tags)) {
    tags = body.tags;
  } else if (typeof body?.tags === "string") {
    tags = body.tags.split(",");
  }
  if (tags !== undefined) {
    tags = Array.from(new Set(tags
      .map((t) => String(t || "").trim().toLowerCase())
      .filter((t) => t.length > 0 && t.length <= 32)));
  }

  const subIndustry = body?.sub_industry !== undefined ? String(body.sub_industry || "").slice(0, 64) : null;
  const industryGroup = body?.industry_group !== undefined ? String(body.industry_group || "").slice(0, 64) : null;

  await sql`
    UPDATE lead_businesses SET
      status         = COALESCE(${status}, status),
      sub_industry   = COALESCE(${subIndustry}, sub_industry),
      industry_group = COALESCE(${industryGroup}, industry_group),
      tags           = COALESCE(${tags}::text[], tags),
      updated_at     = now()
    WHERE id = ${id}
  `;
  return json(200, { ok: true });
}

// POST — backfill industry_group + sub_industry on every lead_businesses
// row from the raw OSM tag in `industry`. Idempotent. Useful after rolling
// out new entries in api/_lib/leadgen-classify.js.
export async function handleLeadgenReclassify(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  await ensureLeadgenTaxonomyColumns();
  const { classifyIndustry } = await import("./_lib/leadgen-classify.js");
  const rows = await sql`
    SELECT id, industry FROM lead_businesses
    WHERE industry IS NOT NULL
      AND (industry_group IS NULL OR sub_industry IS NULL)
  `;
  let updated = 0;
  for (const r of rows) {
    const { industry, sub_industry } = classifyIndustry(r.industry);
    await sql`
      UPDATE lead_businesses
      SET industry_group = ${industry}, sub_industry = ${sub_industry}, updated_at = now()
      WHERE id = ${r.id}
    `;
    updated += 1;
  }
  return json(200, { ok: true, updated });
}

// GET ?format=csv|json + same filter params as handleLeadgenBusinesses.
// Streams up to 10,000 rows of the current filter view as a download.
export async function handleLeadgenExport(session, url) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  await ensureLeadgenTaxonomyColumns();
  const format = (url.searchParams.get("format") || "csv").toLowerCase();
  const zip = (url.searchParams.get("zip") || "").trim();
  const status = (url.searchParams.get("status") || "").trim();
  const q = (url.searchParams.get("q") || "").trim();
  const industryGroup = (url.searchParams.get("industry_group") || "").trim();
  const subIndustry = (url.searchParams.get("sub_industry") || "").trim();
  const hasWebsite = url.searchParams.get("has_website") === "1";
  const hasEmail = url.searchParams.get("has_email") === "1";
  const noEmail = url.searchParams.get("no_email") === "1";

  const wantsZip = /^\d{5}$/.test(zip);
  const wantsStatus = ["active", "rejected", "do_not_contact"].includes(status);
  const wantsQ = q.length >= 2;
  const wantsGroup = industryGroup.length > 0;
  const wantsSub = subIndustry.length > 0;
  const like = `%${q.toLowerCase()}%`;

  const rows = await sql`
    SELECT b.id, b.name, b.address, b.city, b.state, b.zip, b.website,
           b.phone, b.industry, b.industry_group, b.sub_industry, b.tags, b.status,
           b.created_at,
           (SELECT string_agg(e.email, ';') FROM lead_emails e
              WHERE e.business_id = b.id AND e.opted_out_at IS NULL AND e.bounced_at IS NULL) AS emails
    FROM lead_businesses b
    WHERE (${!wantsZip}::bool OR b.zip = ${zip})
      AND (${!wantsStatus}::bool OR b.status = ${status})
      AND (${!wantsQ}::bool
        OR lower(b.name) LIKE ${like}
        OR lower(coalesce(b.website,'')) LIKE ${like}
        OR EXISTS (
          SELECT 1 FROM lead_emails e
          WHERE e.business_id = b.id
            AND lower(e.email) LIKE ${like}
            AND e.opted_out_at IS NULL
            AND e.bounced_at IS NULL))
      AND (${!wantsGroup}::bool OR b.industry_group = ${industryGroup})
      AND (${!wantsSub}::bool OR b.sub_industry = ${subIndustry})
      AND (${!hasWebsite}::bool OR b.website IS NOT NULL)
      AND (${!hasEmail}::bool OR EXISTS (
            SELECT 1 FROM lead_emails e
            WHERE e.business_id = b.id
              AND e.opted_out_at IS NULL
              AND e.bounced_at IS NULL))
      AND (${!noEmail}::bool OR NOT EXISTS (
            SELECT 1 FROM lead_emails e
            WHERE e.business_id = b.id
              AND e.opted_out_at IS NULL
              AND e.bounced_at IS NULL))
    ORDER BY b.id DESC
    LIMIT 10000
  `;

  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "json") {
    return new Response(JSON.stringify({ exported_at: new Date().toISOString(), count: rows.length, rows }, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="leads-${stamp}.json"`,
      },
    });
  }
  // CSV — RFC 4180-ish quoting: wrap every field in quotes, escape internal
  // quotes by doubling. Keeps cells with commas/newlines/semicolons safe.
  const cols = ["id","name","industry_group","sub_industry","industry","address","city","state","zip","phone","website","emails","tags","status","created_at"];
  const esc = (v) => {
    if (v === null || v === undefined) return "";
    const s = Array.isArray(v) ? v.join(";") : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [cols.join(",")];
  for (const r of rows) {
    lines.push(cols.map((c) => esc(r[c])).join(","));
  }
  return new Response(lines.join("\r\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${stamp}.csv"`,
    },
  });
}

// POST { mode, prompt?, draft_subject?, draft_body?, business_id?, business_name?, industry?, website? }
//   mode: "campaign"     → write a fresh subject+body from a brief
//         "rewrite"      → improve a draft (keeps placeholders intact)
//         "personalize"  → 1–2 sentence opener tailored to a single biz
// Calls Groq's free Llama 3.3 70B endpoint. Requires GROQ_API_KEY env var.
export async function handleLeadgenAi(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return json(503, { ok: false, error: "groq_not_configured", hint: "Set GROQ_API_KEY in Vercel env vars." });

  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const mode = String(body?.mode || "campaign");
  const prompt = String(body?.prompt || "").slice(0, 2000);
  const draftSubject = String(body?.draft_subject || "").slice(0, 500);
  const draftBody = String(body?.draft_body || "").slice(0, 8000);

  // Hand-tuned system prompts. Goal: pass an "is this AI?" sniff test
  // from a Florida small-business owner. The model loves em-dashes,
  // tricolons, hedging openers and "as a [role] you know" — kill all
  // of them on sight. Reward concrete specifics over generic claims.
  const systemBase =
    "You write cold-outreach business emails for Simple IT SRQ, a Sarasota/Bradenton " +
    "Florida IT services shop run by one local engineer (Dan). Helpdesk, computer " +
    "repair, security cameras, Microsoft 365, ransomware/backup for SMBs.\n\n" +
    "VOICE: Direct. Florida-local. First person. One human writing to one human.\n\n" +
    "BAN LIST (do not output any of these):\n" +
    "- em-dashes (— or --)\n" +
    "- emojis or icons of any kind\n" +
    "- 'as a [job] owner you know', 'in today's', 'in this fast-paced', 'we understand'\n" +
    "- 'just wanted to', 'hope this finds you well', 'I hope you are doing well'\n" +
    "- 'leverage', 'synergy', 'robust', 'cutting-edge', 'streamline', 'best-in-class', " +
    "'unlock', 'empower', 'tailored solutions', 'peace of mind' (cliche), 'seamless'\n" +
    "- 'consider reaching out', 'feel free to', 'don't hesitate to'\n" +
    "- triple-parallel lists (X, Y, and Z) when one specific is enough\n" +
    "- exclamation marks except in extreme rare cases\n\n" +
    "REQUIRED:\n" +
    "- Reference one concrete Florida thing (hurricane season, snowbird turnover, " +
    "FIPA, Sarasota humidity, county building, a real local pain) — do not force it " +
    "if the prompt does not allow.\n" +
    "- Sentence fragments are fine. Vary length.\n" +
    "- Sign 'Dan' or '— Dan' (no em-dash; use ASCII hyphen). Default sign-off: 'Dan, Simple IT SRQ'.\n" +
    "- Preserve {{first_name}}, {{business_name}}, {{city}}, {{unsubscribe_url}} placeholders verbatim if used.";

  let systemPrompt = systemBase;
  let userPrompt = prompt;
  if (mode === "campaign") {
    systemPrompt += " Output a JSON object with exactly two keys: \"subject\" (one short line, under 70 characters, no spam triggers like 'free', 'urgent', '!') and \"body\" (plain text, 80-180 words, includes {{first_name}} once near the top and a soft CTA at the bottom). No markdown. No code fences. Output ONLY the JSON object.";
  } else if (mode === "rewrite") {
    userPrompt = `Rewrite this email to sound more human and direct. Keep all {{placeholder}} tokens intact. Same goal, better words.\n\nSubject: ${draftSubject}\n\nBody:\n${draftBody}`;
    systemPrompt += " Output a JSON object with \"subject\" and \"body\". No markdown. No code fences. Output ONLY the JSON object.";
  } else if (mode === "personalize") {
    const bn = String(body?.business_name || "").slice(0, 200);
    const ind = String(body?.industry || "").slice(0, 100);
    const site = String(body?.website || "").slice(0, 300);
    userPrompt = `Write 1-2 sentences (max 40 words) that opens a cold email to this business. Make it specific enough that it could not have been sent to anyone else. Do not flatter. Do not use the words "love", "amazing", or "great". Mention the industry naturally.\n\nBusiness: ${bn}\nIndustry: ${ind}\nWebsite: ${site}\n\nReturn JSON: {"opener": "..."}`;
    systemPrompt = systemBase + " Output ONLY a JSON object with one key \"opener\". No markdown.";
  } else {
    return json(400, { ok: false, error: "invalid_mode" });
  }

  let groqResp;
  try {
    groqResp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
        max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
  } catch (e) {
    return json(502, { ok: false, error: "groq_network", detail: String(e?.message || e) });
  }
  if (!groqResp.ok) {
    const text = await groqResp.text().catch(() => "");
    return json(502, { ok: false, error: "groq_http_" + groqResp.status, detail: text.slice(0, 500) });
  }
  const out = await groqResp.json().catch(() => ({}));
  const content = out?.choices?.[0]?.message?.content;
  if (!content) return json(502, { ok: false, error: "groq_no_content" });

  let parsed;
  try { parsed = JSON.parse(content); }
  catch { return json(502, { ok: false, error: "groq_bad_json", raw: content.slice(0, 500) }); }

  return json(200, { ok: true, mode, result: parsed, usage: out.usage || null });
}

// POST { ids?: number[], industry_group?: string, zip?: string, list_id: number }
//   Pushes filtered businesses' first deliverable email into a Brevo
//   contact list. Reuses the same SMTP_USER as the API key holder; you
//   need a separate BREVO_API_KEY (v3) set in Vercel because SMTP creds
//   don't authenticate the contacts API.
export async function handleLeadgenBrevoSync(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return json(503, { ok: false, error: "brevo_not_configured", hint: "Set BREVO_API_KEY (v3 key from app.brevo.com → SMTP & API → API keys) in Vercel env." });

  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const listId = Number(body?.list_id);
  if (!Number.isInteger(listId) || listId <= 0) return json(400, { ok: false, error: "invalid_list_id" });

  const ids = Array.isArray(body?.ids) ? body.ids.filter(Number.isInteger).slice(0, 1000) : [];
  const zip = String(body?.zip || "").trim();
  const group = String(body?.industry_group || "").trim();
  const wantsZip = /^\d{5}$/.test(zip);
  const wantsGroup = group.length > 0;

  const rows = ids.length
    ? await sql`
        SELECT b.id, b.name, b.industry_group, b.sub_industry, b.city, b.state,
               (SELECT e.email FROM lead_emails e
                  WHERE e.business_id = b.id AND e.opted_out_at IS NULL AND e.bounced_at IS NULL
                  ORDER BY e.confidence DESC, e.id ASC LIMIT 1) AS email
        FROM lead_businesses b
        WHERE b.id = ANY(${ids}) AND b.status = 'active'
      `
    : await sql`
        SELECT b.id, b.name, b.industry_group, b.sub_industry, b.city, b.state,
               (SELECT e.email FROM lead_emails e
                  WHERE e.business_id = b.id AND e.opted_out_at IS NULL AND e.bounced_at IS NULL
                  ORDER BY e.confidence DESC, e.id ASC LIMIT 1) AS email
        FROM lead_businesses b
        WHERE b.status = 'active'
          AND (${!wantsZip}::bool OR b.zip = ${zip})
          AND (${!wantsGroup}::bool OR b.industry_group = ${group})
        LIMIT 1000
      `;

  const eligible = rows.filter((r) => r.email);
  let pushed = 0, failed = 0;
  const errors = [];
  // Brevo /contacts has no batch upsert endpoint that also assigns to a
  // list, so we loop. For larger pushes, use /contacts/import (CSV file
  // body) — out of scope here.
  for (const r of eligible) {
    try {
      const resp = await fetch("https://api.brevo.com/v3/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": apiKey, accept: "application/json" },
        body: JSON.stringify({
          email: r.email,
          listIds: [listId],
          attributes: {
            BUSINESS_NAME: r.name,
            INDUSTRY: r.industry_group || null,
            SUB_INDUSTRY: r.sub_industry || null,
            CITY: r.city || null,
            STATE: r.state || null,
          },
          updateEnabled: true,
        }),
      });
      if (resp.ok || resp.status === 204) pushed += 1;
      else { failed += 1; errors.push(`${r.email}: HTTP ${resp.status}`); }
    } catch (e) {
      failed += 1; errors.push(`${r.email}: ${String(e?.message || e).slice(0, 100)}`);
    }
  }
  return json(200, { ok: true, considered: rows.length, eligible: eligible.length, pushed, failed, errors: errors.slice(0, 20) });
}

// GET — list campaigns
export async function handleLeadgenCampaigns(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const rows = await sql`
    SELECT c.id, c.name, c.status, c.subject_template, c.from_email, c.reply_to,
           c.throttle_per_hour, c.daily_cap, c.consent_basis, c.segment,
           c.created_at, c.updated_at,
           (SELECT COUNT(*)::int FROM lead_campaign_sends s WHERE s.campaign_id = c.id) AS total_sends,
           (SELECT COUNT(*)::int FROM lead_campaign_sends s
              WHERE s.campaign_id = c.id AND s.sent_at IS NOT NULL) AS sent,
           (SELECT COUNT(*)::int FROM lead_campaign_sends s
              WHERE s.campaign_id = c.id AND s.opened_at IS NOT NULL) AS opened,
           (SELECT COUNT(*)::int FROM lead_campaign_sends s
              WHERE s.campaign_id = c.id AND s.replied_at IS NOT NULL) AS replied
    FROM lead_campaigns c
    ORDER BY c.id DESC
  `;
  return json(200, { ok: true, rows });
}

// POST — create or update a campaign (id optional)
export async function handleLeadgenCampaignSave(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const userId = session.user?.id || null;
  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }

  const fields = {
    name: clampString(body?.name, 200),
    subject_template: clampString(body?.subject_template, 500),
    body_template: clampString(body?.body_template, 20000),
    from_email: clampString(body?.from_email, 254),
    reply_to: clampString(body?.reply_to, 254),
    throttle_per_hour: Math.min(Math.max(Number(body?.throttle_per_hour) || 30, 1), 500),
    daily_cap: Math.min(Math.max(Number(body?.daily_cap) || 200, 1), 5000),
    consent_basis: ["legitimate_interest","public_record","opted_in"].includes(body?.consent_basis)
      ? body.consent_basis : "legitimate_interest",
    segment: body?.segment && typeof body.segment === "object" ? body.segment : {},
  };
  if (!fields.name || !fields.subject_template || !fields.body_template || !fields.from_email) {
    return json(400, { ok: false, error: "missing_fields" });
  }

  if (body?.id) {
    const id = Number(body.id);
    await sql`
      UPDATE lead_campaigns SET
        name=${fields.name},
        subject_template=${fields.subject_template},
        body_template=${fields.body_template},
        from_email=${fields.from_email},
        reply_to=${fields.reply_to || null},
        throttle_per_hour=${fields.throttle_per_hour},
        daily_cap=${fields.daily_cap},
        consent_basis=${fields.consent_basis},
        segment=${JSON.stringify(fields.segment)}::jsonb,
        updated_at=now()
      WHERE id=${id}
    `;
    return json(200, { ok: true, id });
  }
  const r = await sql`
    INSERT INTO lead_campaigns
      (name, status, subject_template, body_template, from_email, reply_to,
       throttle_per_hour, daily_cap, consent_basis, segment, created_by)
    VALUES
      (${fields.name}, 'draft', ${fields.subject_template}, ${fields.body_template},
       ${fields.from_email}, ${fields.reply_to || null},
       ${fields.throttle_per_hour}, ${fields.daily_cap},
       ${fields.consent_basis}, ${JSON.stringify(fields.segment)}::jsonb, ${userId})
    RETURNING id
  `;
  return json(200, { ok: true, id: r[0].id });
}

// POST { id, status }   id required, status in ('draft','scheduled','running','paused','done','cancelled')
export async function handleLeadgenCampaignSetStatus(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const id = Number(body?.id);
  const status = String(body?.status || "");
  if (!Number.isInteger(id)) return json(400, { ok: false, error: "invalid_id" });
  if (!["draft","scheduled","running","paused","done","cancelled"].includes(status)) {
    return json(400, { ok: false, error: "invalid_status" });
  }
  await sql`UPDATE lead_campaigns SET status=${status}, updated_at=now() WHERE id=${id}`;
  return json(200, { ok: true });
}

// POST { id }
//
// Materializes one lead_campaign_sends row per deliverable email matching
// the campaign's segment query, with a fresh unsubscribe_token per row.
// Then flips campaign status to 'running' so cron can drain it.
export async function handleLeadgenCampaignStart(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const id = Number(body?.id);
  if (!Number.isInteger(id)) return json(400, { ok: false, error: "invalid_id" });

  const camp = await sql`SELECT * FROM lead_campaigns WHERE id=${id}`;
  if (!camp.length) return json(404, { ok: false, error: "not_found" });
  const c = camp[0];
  if (!["draft","paused","scheduled"].includes(c.status)) {
    return json(400, { ok: false, error: "bad_status_transition", current: c.status });
  }

  const seg = c.segment || {};
  const zip = typeof seg.zip === "string" && /^\d{5}$/.test(seg.zip) ? seg.zip : null;
  const minConfidence = Number(seg.min_confidence) || 0.5;

  // Pull deliverable emails for this segment that aren't already queued
  // for this campaign. We only consider 'active' businesses.
  const candidates = await sql`
    SELECT e.id AS email_id, e.business_id, e.email
    FROM lead_emails e
    JOIN lead_businesses b ON b.id = e.business_id
    WHERE b.status = 'active'
      AND e.opted_out_at IS NULL
      AND e.bounced_at IS NULL
      AND e.confidence >= ${minConfidence}
      AND (${!zip}::bool OR b.zip = ${zip})
      AND NOT EXISTS (
        SELECT 1 FROM lead_campaign_sends s
        WHERE s.campaign_id = ${id} AND s.email_id = e.id
      )
    LIMIT 5000
  `;

  let inserted = 0;
  for (const row of candidates) {
    const tok = (globalThis.crypto || (await import("node:crypto")).webcrypto)
      .randomUUID().replace(/-/g, "");
    await sql`
      INSERT INTO lead_campaign_sends
        (campaign_id, business_id, email_id, to_email, status, unsubscribe_token)
      VALUES
        (${id}, ${row.business_id}, ${row.email_id}, ${row.email}, 'queued', ${tok})
      ON CONFLICT DO NOTHING
    `;
    inserted += 1;
  }
  await sql`UPDATE lead_campaigns SET status='running', updated_at=now() WHERE id=${id}`;
  return json(200, { ok: true, queued: inserted });
}

// POST { id, to } — send the campaign template to an arbitrary address right
// now (no queue, no segment match). Used to preview deliverability before
// flipping the campaign to running.
export async function handleLeadgenCampaignTest(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const id = Number(body?.id);
  const to = String(body?.to || "").trim().toLowerCase();
  if (!Number.isInteger(id)) return json(400, { ok: false, error: "invalid_id" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json(400, { ok: false, error: "invalid_email" });

  const camp = await sql`SELECT * FROM lead_campaigns WHERE id=${id}`;
  if (!camp.length) return json(404, { ok: false, error: "not_found" });
  const c = camp[0];

  const { sendCampaignEmail, renderTemplate } = await import("./_lib/leadgen-smtp.js");
  const crypto = globalThis.crypto || (await import("node:crypto")).webcrypto;
  const tok = () => crypto.randomUUID().replace(/-/g, "");
  const openToken = tok();
  const unsubToken = tok();

  // Render with sane preview vars; real sends pull these from the lead row.
  const vars = {
    first_name: "there",
    business_name: "(test)",
    city: "Sarasota",
    state: "FL",
  };
  const subject = renderTemplate(c.subject_template || "(no subject)", vars);
  const text    = renderTemplate(c.body_template || "", vars);

  const result = await sendCampaignEmail({
    to,
    subject: `[TEST] ${subject}`,
    textBody: text,
    from: c.from_email || undefined,
    replyTo: c.reply_to || undefined,
    openToken,
    unsubscribeToken: unsubToken,
    campaignId: c.id,
    sendId: 0,
  });
  return json(result.ok ? 200 : 500, result);
}

// GET ?id=&page=&limit=
export async function handleLeadgenCampaignSends(session, url) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const id = Number(url.searchParams.get("id"));
  if (!Number.isInteger(id)) return json(400, { ok: false, error: "invalid_id" });
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 100));
  const offset = (page - 1) * limit;

  const rows = await sql`
    SELECT s.id, s.to_email, s.status, s.sent_at, s.opened_at,
           s.clicked_at, s.replied_at, s.bounced_at, s.error,
           b.name AS business_name, b.zip
    FROM lead_campaign_sends s
    JOIN lead_businesses b ON b.id = s.business_id
    WHERE s.campaign_id = ${id}
    ORDER BY s.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return json(200, { ok: true, rows });
}

// GET — list crawl jobs (admin diagnostics)
export async function handleLeadgenJobs(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const rows = await sql`
    SELECT id, kind, status, progress, total, payload, result, error,
           created_at, started_at, finished_at
    FROM lead_crawl_jobs
    ORDER BY id DESC
    LIMIT 100
  `;
  return json(200, { ok: true, rows });
}

// Drains the lead_crawl_jobs queue inline so admin clicks (Discover,
// Crawl emails) feel synchronous instead of waiting on the daily cron.
// Bounded by the worker's own LEADGEN_TIME_BUDGET_MS / max-jobs guards;
// the surrounding portal function is configured for maxDuration=60.
export async function handleLeadgenRunJobs(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  try {
    await ensureLeadgenTaxonomyColumns();
    const summary = await runLeadgenWorker();
    return json(200, { ok: true, summary });
  } catch (err) {
    return json(500, { ok: false, error: String(err?.message || err).slice(0, 500) });
  }
}

// ---------- public token-authenticated lead-gen endpoints ----------
//
// These three handlers serve outbound-email engagement: open pixel, click
// redirect, and unsubscribe. They never touch session — the security model
// is "if you have a valid token, you can act on the row that token belongs
// to". Tokens are 32-hex random per send, generated server-side, and only
// shipped inside the actual email body, so possession ≈ recipient.

// 1×1 transparent GIF (43 bytes). Hard-coded base64 so we don't ship a
// binary asset just for tracking.
const PIXEL_GIF = Uint8Array.from(atob(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
), (c) => c.charCodeAt(0));

function pixelResponse() {
  return new Response(PIXEL_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL_GIF.byteLength),
      "Cache-Control": "private, no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
    },
  });
}

export async function handleLeadgenOpenPixel(url) {
  const token = (url.searchParams.get("t") || "").slice(0, 64);
  // Always return a pixel so the email client doesn't render a broken
  // image icon — even if the token is bogus.
  if (!/^[a-f0-9]{32}$/i.test(token)) return pixelResponse();
  try {
    await sql`
      UPDATE lead_campaign_sends
      SET opened_at = COALESCE(opened_at, now()),
          open_count = open_count + 1
      WHERE open_token = ${token}
    `;
  } catch (err) {
    console.error("[leadgen-o] update failed", err?.message || err);
  }
  return pixelResponse();
}

export async function handleLeadgenClick(url) {
  const token = (url.searchParams.get("t") || "").slice(0, 64);
  const dest = url.searchParams.get("u") || "";

  // Validate destination — only allow http/https. Otherwise we'd be an
  // open redirect to javascript: / data: schemes.
  let target;
  try {
    const parsed = new URL(dest);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    target = parsed.toString();
  } catch {
    return new Response("Invalid destination", { status: 400 });
  }

  if (/^[a-f0-9]{32}$/i.test(token)) {
    try {
      const rows = await sql`
        UPDATE lead_campaign_sends
        SET clicked_at = COALESCE(clicked_at, now()),
            click_count = click_count + 1,
            opened_at = COALESCE(opened_at, now())
        WHERE open_token = ${token}
        RETURNING campaign_id
      `;
      if (rows.length) {
        // Upsert into lead_campaign_links and bump click_count. Lazily
        // creates the row on first click — keeps the sender stateless.
        await sql`
          INSERT INTO lead_campaign_links (campaign_id, url, click_count)
          VALUES (${rows[0].campaign_id}, ${target}, 1)
          ON CONFLICT (campaign_id, url) DO UPDATE SET
            click_count = lead_campaign_links.click_count + 1
        `;
      }
    } catch (err) {
      console.error("[leadgen-c] update failed", err?.message || err);
    }
  }
  return new Response(null, {
    status: 302,
    headers: { Location: target, "Cache-Control": "no-store" },
  });
}

export async function handleLeadgenUnsubscribe(url, method) {
  const token = (url.searchParams.get("t") || "").slice(0, 64);
  if (!/^[a-f0-9]{32}$/i.test(token)) {
    return new Response("Invalid unsubscribe link.", { status: 400 });
  }

  // Single update: flip the email row's opted_out_at, mark the send row
  // as unsubscribed, and any future queued sends for the same email get
  // suppressed by the queued→sending claim path (which checks opted_out_at).
  let row;
  try {
    const r = await sql`
      UPDATE lead_campaign_sends
      SET unsubscribed_at = COALESCE(unsubscribed_at, now()),
          status = CASE WHEN status IN ('queued','sending') THEN 'suppressed' ELSE status END
      WHERE unsubscribe_token = ${token}
      RETURNING email_id
    `;
    row = r[0];
    if (row) {
      await sql`UPDATE lead_emails SET opted_out_at = COALESCE(opted_out_at, now()) WHERE id = ${row.email_id}`;
      // Suppress all queued sends to this address across all campaigns.
      await sql`
        UPDATE lead_campaign_sends
        SET status='suppressed'
        WHERE email_id = ${row.email_id}
          AND status IN ('queued','sending')
      `;
    }
  } catch (err) {
    console.error("[leadgen-u] update failed", err?.message || err);
    return new Response("Unsubscribe failed — please reply STOP to the original email.", { status: 500 });
  }

  // RFC 8058 one-click POST: just acknowledge. Web GET: render a small
  // confirmation page so the recipient sees the action took effect.
  if (method === "POST") {
    return new Response(null, { status: 200 });
  }
  const html = `<!doctype html>
<html><head><title>Unsubscribed</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:60px auto;padding:0 20px;color:#1a1a1a;line-height:1.55}
h1{font-size:22px;margin:0 0 12px}
p{font-size:15px;color:#374151}
.box{padding:20px;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb}</style>
</head><body>
<div class="box">
  <h1>${row ? "You've been unsubscribed." : "Already unsubscribed."}</h1>
  <p>${row
    ? "We won't email you again. Sorry for the bother."
    : "This address is already off our list. Nothing more to do."}</p>
  <p style="font-size:13px;color:#6b7280">
    If you didn't expect this email at all, please ignore — we won't contact you again.
    Questions? <a href="mailto:hello@simpleitsrq.com">hello@simpleitsrq.com</a>.
  </p>
</div>
</body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
