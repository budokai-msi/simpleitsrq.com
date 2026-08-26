// api/_lib/leadgen-worker.js
//
// Leadgen job-queue worker, extracted from api/cron/agent.js so it can run
// BOTH from the Vercel cron AND from a long-lived local process (the owner's
// machine) without the import-time side effects of agent.js (Resend,
// Anthropic, validateEnv, etc.).
//
// Drains lead_crawl_jobs:
//   - kind='osm_zip'       → discoverBusinessesByZip(payload.zip), upsert each
//                            result into lead_businesses
//   - kind='website_emails'→ crawlEmails(business.website), upsert each result
//                            into lead_emails
//
// The claim path uses Postgres `FOR UPDATE SKIP LOCKED`, so any number of
// workers (Vercel cron + local machine) can drain the same table concurrently
// without double-processing a job.

import { sql } from "./db.js";
import { discoverBusinessesByZip } from "./leadgen-osm.js";
import { crawlEmails } from "./leadgen-emailcrawler.js";
import { hasDeliverableMx } from "./leadgen-deliverability.js";

// Caps:
//   - Process at most LEADGEN_MAX_JOBS_PER_RUN per pass (default 6). Keeps a
//     single Vercel function invocation well under the 60s limit and spreads
//     Overpass / Nominatim load. A local worker is free to raise this via env.
//   - Total elapsed budget LEADGEN_TIME_BUDGET_MS (default 45_000). If we run
//     out of time mid-batch we leave the rest for the next pass.
const LEADGEN_MAX_JOBS_PER_RUN = Number(process.env.LEADGEN_MAX_JOBS_PER_RUN) || 6;
const LEADGEN_TIME_BUDGET_MS   = Number(process.env.LEADGEN_TIME_BUDGET_MS)   || 45_000;

async function processOsmZipJob(job) {
  const zip = job?.payload?.zip;
  if (!zip) throw new Error("osm_zip job missing payload.zip");

  const result = await discoverBusinessesByZip(zip);
  if (!result.ok) throw new Error(result.error || "discover_failed");

  // Upsert businesses by (source, source_id). Existing rows get refreshed
  // contact info; new rows enter as 'active'.
  let inserted = 0;
  let updated = 0;
  for (const b of result.businesses) {
    const r = await sql`
      INSERT INTO lead_businesses
        (name, legal_name, address, city, state, zip, lat, lng,
         website, phone, source, source_id, source_url,
         industry, industry_group, sub_industry, naics, status)
      VALUES
        (${b.name}, ${b.legal_name}, ${b.address}, ${b.city}, ${b.state}, ${b.zip},
         ${b.lat}, ${b.lng}, ${b.website}, ${b.phone},
         ${b.source}, ${b.source_id}, ${b.source_url},
         ${b.industry}, ${b.industry_group}, ${b.sub_industry},
         ${b.naics}, 'active')
      ON CONFLICT (source, source_id) DO UPDATE SET
        name           = EXCLUDED.name,
        address        = COALESCE(EXCLUDED.address, lead_businesses.address),
        city           = COALESCE(EXCLUDED.city, lead_businesses.city),
        state          = COALESCE(EXCLUDED.state, lead_businesses.state),
        zip            = COALESCE(EXCLUDED.zip, lead_businesses.zip),
        lat            = COALESCE(EXCLUDED.lat, lead_businesses.lat),
        lng            = COALESCE(EXCLUDED.lng, lead_businesses.lng),
        website        = COALESCE(EXCLUDED.website, lead_businesses.website),
        phone          = COALESCE(EXCLUDED.phone, lead_businesses.phone),
        industry       = COALESCE(EXCLUDED.industry, lead_businesses.industry),
        industry_group = COALESCE(EXCLUDED.industry_group, lead_businesses.industry_group),
        sub_industry   = COALESCE(EXCLUDED.sub_industry, lead_businesses.sub_industry),
        updated_at     = now()
      RETURNING (xmax = 0) AS is_new
    `;
    if (r[0]?.is_new) inserted += 1; else updated += 1;
  }
  return { discovered: result.businesses.length, inserted, updated, bbox: result.bbox };
}

async function processWebsiteEmailsJob(job) {
  const id = Number(job?.payload?.business_id);
  if (!Number.isInteger(id)) throw new Error("website_emails job missing business_id");

  const rows = await sql`SELECT id, website FROM lead_businesses WHERE id = ${id}`;
  if (!rows.length) throw new Error("business_not_found");
  if (!rows[0].website) return { skipped: "no_website" };

  const result = await crawlEmails(rows[0].website);
  if (!result.ok) return { skipped: result.error || "crawl_failed" };

  let inserted = 0;
  let noMx = 0;
  for (const e of result.emails) {
    // Deliverability gate: drop emails whose domain has no MX record. These
    // cannot receive mail and would only inflate lead counts + bounce later.
    const mxValid = await hasDeliverableMx(e.email);
    if (!mxValid) { noMx += 1; continue; }

    const r = await sql`
      INSERT INTO lead_emails
        (business_id, email, source, source_url, context_snippet, confidence,
         consent_basis, mx_valid)
      VALUES
        (${id}, ${e.email}, ${e.source}, ${e.source_url || null},
         ${e.context_snippet || null}, ${e.confidence}, 'public_record', true)
      ON CONFLICT (business_id, email) DO UPDATE SET
        confidence      = GREATEST(lead_emails.confidence, EXCLUDED.confidence),
        source_url      = COALESCE(EXCLUDED.source_url, lead_emails.source_url),
        context_snippet = COALESCE(EXCLUDED.context_snippet, lead_emails.context_snippet),
        mx_valid        = EXCLUDED.mx_valid,
        updated_at      = now()
      RETURNING (xmax = 0) AS is_new
    `;
    if (r[0]?.is_new) inserted += 1;
  }
  return { found: result.emails.length, inserted, noMx, host: result.host, robotsAllowed: result.robotsAllowed };
}

export async function runLeadgenWorker() {
  const summary = { picked: 0, completed: 0, failed: 0, jobs: [] };
  const started = Date.now();

  for (let i = 0; i < LEADGEN_MAX_JOBS_PER_RUN; i += 1) {
    if (Date.now() - started > LEADGEN_TIME_BUDGET_MS) {
      summary.budget_exhausted = true;
      break;
    }

    // Atomically claim the next pending job. Postgres-only trick: SKIP
    // LOCKED ensures two workers (Vercel cron + local machine) running
    // concurrently can't grab the same row. status='running' is set in the
    // same statement.
    const claimed = await sql`
      UPDATE lead_crawl_jobs
      SET status='running', started_at=now()
      WHERE id = (
        SELECT id FROM lead_crawl_jobs
        WHERE status='pending'
        ORDER BY id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id, kind, payload
    `;
    if (!claimed.length) break;
    summary.picked += 1;

    const job = claimed[0];
    const jobOut = { id: job.id, kind: job.kind };
    try {
      const out = job.kind === "osm_zip"
        ? await processOsmZipJob(job)
        : job.kind === "website_emails"
          ? await processWebsiteEmailsJob(job)
          : (() => { throw new Error(`unknown_kind:${job.kind}`); })();
      jobOut.result = out;

      // Normalize progress semantics:
      // - osm_zip: processed == discovered, total == discovered
      // - website_emails: processed one business job, total one business job
      const normalizedTotal = job.kind === "osm_zip"
        ? Number(out?.discovered ?? 0)
        : 1;
      const normalizedProgress = job.kind === "osm_zip"
        ? Number(out?.discovered ?? 0)
        : 1;

      await sql`
        UPDATE lead_crawl_jobs
        SET status='done', finished_at=now(),
            progress=${normalizedProgress},
            total=${normalizedTotal},
            result=${JSON.stringify(out || {})}::jsonb
        WHERE id=${job.id}
      `;
      summary.completed += 1;
    } catch (err) {
      jobOut.error = String(err?.message || err).slice(0, 500);
      await sql`
        UPDATE lead_crawl_jobs
        SET status='failed', finished_at=now(), error=${jobOut.error}
        WHERE id=${job.id}
      `;
      summary.failed += 1;
    }
    summary.jobs.push(jobOut);
  }
  return summary;
}
