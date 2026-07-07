// api/_lib/portal/ops.js
//
// Operational /api/portal actions: admin-status, health (unauthenticated),
// audit-verify, run-audit-migration, run-ticket-migration,
// reset-audit-chain.

import { sql } from "../db.js";
import { json } from "../http.js";
import { auditVerify } from "../security.js";
import { requireAdmin } from "./shared.js";

// ----------- handler: admin-status (token + admin only) -----------
//
// Read-only health snapshot. Designed for the CLI / agent to "see
// what's going on" without needing to hit the browser dashboard.
// Returns: env presence flags, table row counts, queue depths, recent
// errors, and the last-applied audit chain head.
export async function handleAdminStatus(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const env = {
    ADMIN_API_TOKEN: !!process.env.ADMIN_API_TOKEN,
    GROQ_API_KEY:    !!process.env.GROQ_API_KEY,
    GITHUB_TOKEN:    !!process.env.GITHUB_TOKEN,
    BREVO_API_KEY:   !!process.env.BREVO_API_KEY,
    SMTP_HOST:       !!process.env.SMTP_HOST,
    SMTP_USER:       !!process.env.SMTP_USER,
    RESEND_API_KEY:  !!process.env.RESEND_API_KEY,
    STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
    NEON_API_KEY:    !!process.env.NEON_API_KEY,
    VITE_AFF_AMAZON_TAG: !!process.env.VITE_AFF_AMAZON_TAG,
    VITE_AFF_GUSTO_REF: !!process.env.VITE_AFF_GUSTO_REF,
    VITE_AFF_1PASSWORD_REF: !!process.env.VITE_AFF_1PASSWORD_REF,
    VITE_AFF_HONEYBOOK_REF: !!process.env.VITE_AFF_HONEYBOOK_REF,
    VITE_AFF_ACRONIS_REF: !!process.env.VITE_AFF_ACRONIS_REF,
    VITE_AFF_UBNT_REF: !!process.env.VITE_AFF_UBNT_REF,
    VITE_AFF_REOLINK_REF: !!process.env.VITE_AFF_REOLINK_REF,
    VITE_AFF_BH_REF: !!process.env.VITE_AFF_BH_REF,
    VITE_AFF_BACKBLAZE_REF: !!process.env.VITE_AFF_BACKBLAZE_REF,
  };

  // Run all probe queries in parallel; wrap each in a defensive try
  // so a single missing-table doesn't 500 the whole snapshot.
  const safe = async (label, q) => {
    try { return { [label]: (await q)[0] }; }
    catch (e) { return { [label]: { error: String(e.message || e) } }; }
  };

  const [
    leadBiz, leadEmails, leadCampaigns, leadSends, leadJobs,
    users, tickets, sec, eng, threats,
  ] = await Promise.all([
    safe("lead_businesses",      sql`SELECT count(*)::int AS n, count(*) FILTER (WHERE status='active')::int AS active FROM lead_businesses`),
    safe("lead_emails",          sql`SELECT count(*)::int AS n, count(*) FILTER (WHERE status='deliverable')::int AS deliverable FROM lead_emails`),
    safe("lead_campaigns",       sql`SELECT count(*)::int AS n FROM lead_campaigns`),
    safe("lead_campaign_sends",  sql`SELECT count(*)::int AS n FROM lead_campaign_sends`),
    safe("lead_crawl_jobs",      sql`SELECT count(*)::int AS n,
                                            count(*) FILTER (WHERE status='queued')::int     AS queued,
                                            count(*) FILTER (WHERE status='running')::int    AS running,
                                            count(*) FILTER (WHERE status='failed')::int     AS failed
                                       FROM lead_crawl_jobs`),
    safe("users",                sql`SELECT count(*)::int AS n FROM users`),
    safe("tickets",              sql`SELECT count(*)::int AS n, count(*) FILTER (WHERE status IN ('open','in_progress','waiting'))::int AS open FROM tickets`),
    safe("security_events",      sql`SELECT count(*)::int AS n FROM security_events`),
    safe("engagement_events",    sql`SELECT count(*)::int AS n FROM engagement_events`),
    safe("threat_feeds",         sql`SELECT count(*)::int AS n FROM threat_feeds`),
  ]);
  const counts = { ...leadBiz, ...leadEmails, ...leadCampaigns, ...leadSends, ...leadJobs, ...users, ...tickets, ...sec, ...eng, ...threats };

  // Most recent jobs and security events — fingerprint of "what just
  // happened" without dumping the full table.
  const recentJobs = await sql`
    SELECT id, kind, status, progress, total, error, result, payload, created_at, finished_at
    FROM lead_crawl_jobs
    ORDER BY id DESC
    LIMIT 25
  `.catch((e) => [{ error: String(e.message || e) }]);

  const recentSecurity = await sql`
    SELECT id, event_type, detail, ip, ts
    FROM security_events
    WHERE event_type LIKE '%error%' OR event_type LIKE '%fail%' OR event_type LIKE '%blocked%'
    ORDER BY id DESC
    LIMIT 25
  `.catch((e) => [{ error: String(e.message || e) }]);

  // Detect schema state of migration 014 columns (informational so the
  // agent can decide whether to run run-audit-migration).
  let schema014;
  try {
    const r = await sql`
      SELECT
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lead_businesses' AND column_name='industry_group')  AS has_industry_group,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lead_businesses' AND column_name='sub_industry')    AS has_sub_industry,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lead_businesses' AND column_name='tags')            AS has_tags
    `;
    schema014 = r[0];
  } catch (e) {
    schema014 = { error: String(e.message || e) };
  }

  return json(200, {
    ok: true,
    via: session.__viaToken ? "admin_token" : "session",
    env,
    counts,
    schema014,
    recent_jobs: recentJobs,
    recent_security_errors: recentSecurity,
    server_time: new Date().toISOString(),
  });
}

// Walk the security_events hash chain and report tampering. Admin-only —
// the breaks themselves are not sensitive, but the full event list behind
// them is.
export async function handleAuditVerify(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const result = await auditVerify();
  return json(200, result);
}

// Run the audit-chain migration (001) — adds prev_hash + row_hash columns
// and the supporting index. Safe to re-run; each statement is IF NOT EXISTS.
// Admin-only. Gating on this action via requireAdmin means it can only be
// triggered by someone already authorized to read the audit log, so there's
// no privilege-escalation path from hitting it.
// Self-serve migration for the ticket email/CC/calendar feature (migration
// 019). Admin-session gated — runnable from the portal so no one has to wire
// up Neon credentials locally. Every statement is idempotent (IF NOT EXISTS),
// so it's safe to click more than once.
export async function handleRunTicketMigration(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const results = [];
  const step = async (label, run) => {
    try { await run(); results.push({ step: label, ok: true }); }
    catch (e) { results.push({ step: label, ok: false, error: String(e.message || e) }); }
  };

  await step("tickets.cc_emails", () =>
    sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS cc_emails text[] NOT NULL DEFAULT '{}'`);
  await step("tickets.last_message_id", () =>
    sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS last_message_id text`);
  await step("ticket_messages.author_email", () =>
    sql`ALTER TABLE ticket_messages ADD COLUMN IF NOT EXISTS author_email text`);
  await step("ticket_messages.via", () =>
    sql`ALTER TABLE ticket_messages ADD COLUMN IF NOT EXISTS via text NOT NULL DEFAULT 'portal' CHECK (via IN ('portal','email','system'))`);
  await step("ticket_messages.message_id", () =>
    sql`ALTER TABLE ticket_messages ADD COLUMN IF NOT EXISTS message_id text`);
  await step("ticket_messages.in_reply_to", () =>
    sql`ALTER TABLE ticket_messages ADD COLUMN IF NOT EXISTS in_reply_to text`);
  await step("ticket_messages message_id unique idx", () =>
    sql`CREATE UNIQUE INDEX IF NOT EXISTS ticket_messages_message_id_idx ON ticket_messages (message_id) WHERE message_id IS NOT NULL`);
  await step("ticket_appointments table", () =>
    sql`
      CREATE TABLE IF NOT EXISTS ticket_appointments (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id    uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        uid          text NOT NULL UNIQUE,
        title        text NOT NULL,
        location     text,
        description  text,
        starts_at    timestamptz NOT NULL,
        ends_at      timestamptz NOT NULL,
        status       text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','tentative','cancelled')),
        sequence     integer NOT NULL DEFAULT 0,
        created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now()
      )
    `);
  await step("ticket_appointments index", () =>
    sql`CREATE INDEX IF NOT EXISTS ticket_appointments_ticket_idx ON ticket_appointments (ticket_id, starts_at)`);

  const ok = results.every((r) => r.ok);
  return json(ok ? 200 : 500, { ok, migration: "019_ticket_email_calendar", results });
}

export async function handleRunAuditMigration(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const results = [];
  try {
    await sql`ALTER TABLE security_events ADD COLUMN IF NOT EXISTS prev_hash CHAR(64)`;
    results.push({ step: "add prev_hash column", ok: true });
  } catch (e) {
    results.push({ step: "add prev_hash column", ok: false, error: String(e.message || e) });
  }
  try {
    await sql`ALTER TABLE security_events ADD COLUMN IF NOT EXISTS row_hash CHAR(64)`;
    results.push({ step: "add row_hash column", ok: true });
  } catch (e) {
    results.push({ step: "add row_hash column", ok: false, error: String(e.message || e) });
  }
  try {
    await sql`
      CREATE INDEX IF NOT EXISTS idx_security_events_row_hash_id
        ON security_events (id DESC)
        WHERE row_hash IS NOT NULL
    `;
    results.push({ step: "create index", ok: true });
  } catch (e) {
    results.push({ step: "create index", ok: false, error: String(e.message || e) });
  }

  // Migration 002 — drop CHAR(64) padding on prev_hash/row_hash. Safe to
  // re-run: ALTER COLUMN TYPE on a column that's already the target type
  // is a no-op.
  try {
    await sql`ALTER TABLE security_events ALTER COLUMN prev_hash TYPE varchar(64)`;
    results.push({ step: "alter prev_hash to varchar(64)", ok: true });
  } catch (e) {
    results.push({ step: "alter prev_hash to varchar(64)", ok: false, error: String(e.message || e) });
  }
  try {
    await sql`ALTER TABLE security_events ALTER COLUMN row_hash TYPE varchar(64)`;
    results.push({ step: "alter row_hash to varchar(64)", ok: true });
  } catch (e) {
    results.push({ step: "alter row_hash to varchar(64)", ok: false, error: String(e.message || e) });
  }

  // Migration 004 — admin IP immunity cache (prevents owner lockout).
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS admin_ip_immunity (
        ip          text PRIMARY KEY,
        user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
        granted_at  timestamptz NOT NULL DEFAULT now(),
        expires_at  timestamptz NOT NULL,
        reason      text
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS admin_ip_immunity_expires_idx ON admin_ip_immunity (expires_at)`;
    results.push({ step: "create admin_ip_immunity table", ok: true });
  } catch (e) {
    results.push({ step: "create admin_ip_immunity table", ok: false, error: String(e.message || e) });
  }

  // Migration 003 — OSINT threat-feed cache (Spamhaus DROP/EDROP + ET).
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS threat_feeds (
        id         bigserial PRIMARY KEY,
        feed_name  text NOT NULL,
        source_url text NOT NULL,
        cidr       cidr NOT NULL,
        category   text,
        note       text,
        fetched_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (feed_name, cidr)
      )
    `;
    results.push({ step: "create threat_feeds table", ok: true });
  } catch (e) {
    results.push({ step: "create threat_feeds table", ok: false, error: String(e.message || e) });
  }
  try {
    await sql`CREATE INDEX IF NOT EXISTS threat_feeds_feed_idx    ON threat_feeds (feed_name)`;
    await sql`CREATE INDEX IF NOT EXISTS threat_feeds_fetched_idx ON threat_feeds (fetched_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS threat_feeds_cidr_idx    ON threat_feeds (cidr)`;
    results.push({ step: "create threat_feeds indexes", ok: true });
  } catch (e) {
    results.push({ step: "create threat_feeds indexes", ok: false, error: String(e.message || e) });
  }

  // Migration 006 — newsletter subscribers (double-opt-in).
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS newsletter_subscribers (
        id                  bigserial PRIMARY KEY,
        email               text NOT NULL,
        confirm_token       text NOT NULL UNIQUE,
        unsubscribe_token   text NOT NULL UNIQUE,
        source              text,
        ip                  text,
        created_at          timestamptz NOT NULL DEFAULT now(),
        confirmed_at        timestamptz,
        unsubscribed_at     timestamptz,
        UNIQUE (email)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS newsletter_confirmed_idx ON newsletter_subscribers (confirmed_at) WHERE confirmed_at IS NOT NULL`;
    await sql`CREATE INDEX IF NOT EXISTS newsletter_email_idx     ON newsletter_subscribers (lower(email))`;
    results.push({ step: "create newsletter_subscribers table", ok: true });
  } catch (e) {
    results.push({ step: "create newsletter_subscribers table", ok: false, error: String(e.message || e) });
  }

  // Migration 007 — testimonials (no seed data; admin adds rows via UI).
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS testimonials (
        id             bigserial PRIMARY KEY,
        quote          text NOT NULL,
        author_name    text NOT NULL,
        author_role    text,
        author_company text,
        city           text,
        product_slug   text,
        rating         int CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
        approved       boolean NOT NULL DEFAULT false,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS testimonials_approved_idx ON testimonials (approved, created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS testimonials_product_idx  ON testimonials (product_slug) WHERE product_slug IS NOT NULL`;
    results.push({ step: "create testimonials table", ok: true });
  } catch (e) {
    results.push({ step: "create testimonials table", ok: false, error: String(e.message || e) });
  }

  // Migration 005 — affiliate_clicks table (revenue-signal tracking).
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS affiliate_clicks (
        id            bigserial PRIMARY KEY,
        ts            timestamptz NOT NULL DEFAULT now(),
        slug          text,
        destination   text NOT NULL,
        label         text,
        network       text,
        ip            text,
        country       text,
        anon_id       text,
        user_id       uuid REFERENCES users(id) ON DELETE SET NULL,
        referrer_path text
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS affiliate_clicks_ts_idx      ON affiliate_clicks (ts DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS affiliate_clicks_slug_idx    ON affiliate_clicks (slug, ts DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS affiliate_clicks_network_idx ON affiliate_clicks (network)`;
    results.push({ step: "create affiliate_clicks table", ok: true });
  } catch (e) {
    results.push({ step: "create affiliate_clicks table", ok: false, error: String(e.message || e) });
  }

  // Migration 013 — lead-gen tables (businesses, emails, campaigns, sends,
  // links, crawl jobs). Idempotent: every CREATE uses IF NOT EXISTS.
  //
  // The schema here is canonical. handlers in this file and the cron
  // worker in api/cron/agent.js depend on the column names + uniqueness
  // constraints below; if you rename anything, update both.
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS lead_businesses (
        id            bigserial PRIMARY KEY,
        name          text NOT NULL,
        legal_name    text,
        address       text,
        city          text,
        state         text,
        zip           text,
        lat           double precision,
        lng           double precision,
        website       text,
        phone         text,
        source        text NOT NULL,
        source_id     text,
        source_url    text,
        industry      text,
        naics         text,
        status        text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','rejected','do_not_contact')),
        notes         text,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        last_crawled_at timestamptz,
        -- Upsert key for OSM/Sunbiz/etc rediscovery — same source row
        -- updates in place rather than duplicating.
        UNIQUE (source, source_id)
      )`;
    await sql`CREATE INDEX IF NOT EXISTS lead_businesses_zip_idx     ON lead_businesses (zip, status)`;
    await sql`CREATE INDEX IF NOT EXISTS lead_businesses_status_idx  ON lead_businesses (status, created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS lead_businesses_website_idx ON lead_businesses (website) WHERE website IS NOT NULL`;
    await sql`CREATE INDEX IF NOT EXISTS lead_businesses_name_idx    ON lead_businesses (zip, lower(name))`;
    results.push({ step: "create lead_businesses table", ok: true });
  } catch (e) {
    results.push({ step: "create lead_businesses table", ok: false, error: String(e.message || e) });
  }
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS lead_emails (
        id              bigserial PRIMARY KEY,
        business_id     bigint NOT NULL REFERENCES lead_businesses(id) ON DELETE CASCADE,
        email           text NOT NULL,
        source          text NOT NULL,
        source_url      text,
        context_snippet text,
        confidence      double precision NOT NULL DEFAULT 0.5
                        CHECK (confidence >= 0 AND confidence <= 1),
        mx_valid        boolean,
        smtp_verified   boolean,
        consent_basis   text NOT NULL DEFAULT 'legitimate_interest'
                        CHECK (consent_basis IN ('legitimate_interest','public_record','opted_in')),
        opted_out_at    timestamptz,
        bounced_at      timestamptz,
        last_sent_at    timestamptz,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now(),
        -- Same address can appear under multiple businesses (shared owner,
        -- franchise HQ contact). Dedupe within a business only.
        UNIQUE (business_id, email)
      )`;
    await sql`CREATE INDEX IF NOT EXISTS lead_emails_business_idx   ON lead_emails (business_id)`;
    await sql`CREATE INDEX IF NOT EXISTS lead_emails_optout_idx     ON lead_emails (opted_out_at) WHERE opted_out_at IS NOT NULL`;
    await sql`CREATE INDEX IF NOT EXISTS lead_emails_confidence_idx ON lead_emails (confidence DESC)`;
    results.push({ step: "create lead_emails table", ok: true });
  } catch (e) {
    results.push({ step: "create lead_emails table", ok: false, error: String(e.message || e) });
  }
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS lead_campaigns (
        id                bigserial PRIMARY KEY,
        name              text NOT NULL,
        description       text,
        subject_template  text NOT NULL,
        body_template     text NOT NULL,
        ai_intro_prompt   text,
        from_email        text NOT NULL,
        reply_to          text,
        throttle_per_hour int NOT NULL DEFAULT 30 CHECK (throttle_per_hour > 0),
        daily_cap         int NOT NULL DEFAULT 200 CHECK (daily_cap > 0),
        consent_basis     text NOT NULL DEFAULT 'legitimate_interest'
                          CHECK (consent_basis IN ('legitimate_interest','public_record','opted_in')),
        -- segment is a JSON filter that handleLeadgenCampaignStart reads
        -- to materialize lead_campaign_sends rows. Today: { zip, min_confidence }.
        segment           jsonb NOT NULL DEFAULT '{}'::jsonb,
        status            text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','scheduled','running','paused','done','cancelled')),
        scheduled_at      timestamptz,
        started_at        timestamptz,
        completed_at      timestamptz,
        created_by        uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now()
      )`;
    await sql`CREATE INDEX IF NOT EXISTS lead_campaigns_status_idx ON lead_campaigns (status, scheduled_at)`;
    results.push({ step: "create lead_campaigns table", ok: true });
  } catch (e) {
    results.push({ step: "create lead_campaigns table", ok: false, error: String(e.message || e) });
  }
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS lead_campaign_sends (
        id                  bigserial PRIMARY KEY,
        campaign_id         bigint NOT NULL REFERENCES lead_campaigns(id) ON DELETE CASCADE,
        business_id         bigint NOT NULL REFERENCES lead_businesses(id) ON DELETE CASCADE,
        email_id            bigint NOT NULL REFERENCES lead_emails(id) ON DELETE CASCADE,
        to_email            text NOT NULL,
        status              text NOT NULL DEFAULT 'queued'
                            CHECK (status IN ('queued','sending','sent','failed','bounced','suppressed')),
        -- Filled in by the sender at send time (so a paused campaign doesn't
        -- store a 5000-row body cache it never uses).
        rendered_subject    text,
        rendered_body       text,
        provider            text,
        provider_message_id text,
        queued_at           timestamptz NOT NULL DEFAULT now(),
        sent_at             timestamptz,
        delivered_at        timestamptz,
        opened_at           timestamptz,
        clicked_at          timestamptz,
        replied_at          timestamptz,
        bounced_at          timestamptz,
        unsubscribed_at     timestamptz,
        error               text,
        -- open_token NULL until first send (then set + persisted so reopens
        -- of the link still work after status='sent').
        open_token          text UNIQUE,
        unsubscribe_token   text NOT NULL UNIQUE,
        open_count          int NOT NULL DEFAULT 0,
        click_count         int NOT NULL DEFAULT 0,
        UNIQUE (campaign_id, email_id)
      )`;
    await sql`CREATE INDEX IF NOT EXISTS lead_campaign_sends_campaign_idx ON lead_campaign_sends (campaign_id, queued_at)`;
    await sql`CREATE INDEX IF NOT EXISTS lead_campaign_sends_email_idx    ON lead_campaign_sends (email_id)`;
    await sql`CREATE INDEX IF NOT EXISTS lead_campaign_sends_provider_idx ON lead_campaign_sends (provider_message_id) WHERE provider_message_id IS NOT NULL`;
    await sql`CREATE INDEX IF NOT EXISTS lead_campaign_sends_status_idx   ON lead_campaign_sends (status, queued_at) WHERE sent_at IS NULL`;
    results.push({ step: "create lead_campaign_sends table", ok: true });
  } catch (e) {
    results.push({ step: "create lead_campaign_sends table", ok: false, error: String(e.message || e) });
  }
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS lead_campaign_links (
        id          bigserial PRIMARY KEY,
        campaign_id bigint NOT NULL REFERENCES lead_campaigns(id) ON DELETE CASCADE,
        url         text NOT NULL,
        label       text,
        click_count int NOT NULL DEFAULT 0,
        created_at  timestamptz NOT NULL DEFAULT now(),
        UNIQUE (campaign_id, url)
      )`;
    results.push({ step: "create lead_campaign_links table", ok: true });
  } catch (e) {
    results.push({ step: "create lead_campaign_links table", ok: false, error: String(e.message || e) });
  }
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS lead_crawl_jobs (
        id          bigserial PRIMARY KEY,
        kind        text NOT NULL CHECK (kind IN ('sunbiz_zip','osm_zip','website_emails','smtp_verify')),
        payload     jsonb NOT NULL,
        status      text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','running','done','failed','cancelled')),
        attempts    int NOT NULL DEFAULT 0,
        progress    int,
        total       int,
        error       text,
        result      jsonb,
        created_at  timestamptz NOT NULL DEFAULT now(),
        started_at  timestamptz,
        finished_at timestamptz,
        created_by  uuid REFERENCES users(id) ON DELETE SET NULL
      )`;
    await sql`CREATE INDEX IF NOT EXISTS lead_crawl_jobs_status_idx ON lead_crawl_jobs (status, created_at)`;
    await sql`CREATE INDEX IF NOT EXISTS lead_crawl_jobs_kind_idx   ON lead_crawl_jobs (kind, status)`;
    results.push({ step: "create lead_crawl_jobs table", ok: true });
  } catch (e) {
    results.push({ step: "create lead_crawl_jobs table", ok: false, error: String(e.message || e) });
  }

  // Migration 014 — better lead-gen taxonomy. Adds:
  //   - industry_group: friendly top-level (e.g. "Healthcare")
  //   - sub_industry:   specific human label (e.g. "Dentist")
  //   - tags:           free-form text[] for manual operator notes
  // Backfill of industry_group + sub_industry happens lazily on the next
  // Discover/upsert via classifyIndustry(); existing rows can be backfilled
  // by calling /api/portal?action=leadgen-reclassify (admin).
  try {
    await sql`ALTER TABLE lead_businesses ADD COLUMN IF NOT EXISTS industry_group text`;
    await sql`ALTER TABLE lead_businesses ADD COLUMN IF NOT EXISTS sub_industry   text`;
    await sql`ALTER TABLE lead_businesses ADD COLUMN IF NOT EXISTS tags           text[] NOT NULL DEFAULT '{}'`;
    await sql`CREATE INDEX IF NOT EXISTS lead_businesses_group_idx ON lead_businesses (industry_group, status)`;
    await sql`CREATE INDEX IF NOT EXISTS lead_businesses_tags_gin  ON lead_businesses USING gin (tags)`;
    results.push({ step: "lead-gen taxonomy columns (014)", ok: true });
  } catch (e) {
    results.push({ step: "lead-gen taxonomy columns (014)", ok: false, error: String(e.message || e) });
  }

  // Migration 018 — user plan tracking + integrations table
  try {
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free','growth','pro','lifetime'))`;
    results.push({ step: "add users.plan column (018)", ok: true });
  } catch (e) {
    results.push({ step: "add users.plan column (018)", ok: false, error: String(e.message || e) });
  }
  try {
    await sql`UPDATE users SET plan = 'lifetime', is_admin = true WHERE email = 'ivanovspccenter@gmail.com'`;
    results.push({ step: "grant lifetime plan to owner (018)", ok: true });
  } catch (e) {
    results.push({ step: "grant lifetime plan to owner (018)", ok: false, error: String(e.message || e) });
  }
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS user_integrations (
        id            bigserial PRIMARY KEY,
        user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind          text NOT NULL CHECK (kind IN ('webhook','mailchimp','hubspot','activecampaign','zapier','gohighlevel')),
        label         text NOT NULL DEFAULT '',
        config        jsonb NOT NULL DEFAULT '{}'::jsonb,
        enabled       boolean NOT NULL DEFAULT true,
        last_used_at  timestamptz,
        last_error    text,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        UNIQUE (user_id, kind, label)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS user_integrations_user_idx ON user_integrations (user_id, kind)`;
    results.push({ step: "create user_integrations table (018)", ok: true });
  } catch (e) {
    results.push({ step: "create user_integrations table (018)", ok: false, error: String(e.message || e) });
  }

  // Migration 019 — visit fingerprint columns. track.js inserts these into
  // `visits`, but the base schema never had them, so EVERY visit INSERT was
  // failing silently — that's why no visitor data was being captured. Adding
  // them (idempotent) restores visitor tracking.
  try {
    await sql`
      ALTER TABLE visits
        ADD COLUMN IF NOT EXISTS session_id  uuid,
        ADD COLUMN IF NOT EXISTS device_hash text,
        ADD COLUMN IF NOT EXISTS color_depth integer,
        ADD COLUMN IF NOT EXISTS platform    text,
        ADD COLUMN IF NOT EXISTS cores       integer,
        ADD COLUMN IF NOT EXISTS mem         real,
        ADD COLUMN IF NOT EXISTS touch       integer,
        ADD COLUMN IF NOT EXISTS dpr         real,
        ADD COLUMN IF NOT EXISTS connection  text,
        ADD COLUMN IF NOT EXISTS langs       text
    `;
    results.push({ step: "add visits fingerprint columns (019)", ok: true });
  } catch (e) {
    results.push({ step: "add visits fingerprint columns (019)", ok: false, error: String(e.message || e) });
  }

  // Migration 017 — leads inbox. Contact-form submissions and service
  // reservations are written here; without the table they were lost.
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS leads (
        id          bigserial PRIMARY KEY,
        name        text, email text, phone text, message text,
        source      text, page text, ip text,
        country     text, region text, city text,
        status      text NOT NULL DEFAULT 'new',
        notes       text,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS leads_created_idx ON leads (created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS leads_status_idx ON leads (status, created_at DESC)`;
    results.push({ step: "create leads table (017)", ok: true });
  } catch (e) {
    results.push({ step: "create leads table (017)", ok: false, error: String(e.message || e) });
  }

  const allOk = results.every((r) => r.ok);
  const failedSteps = results.filter((r) => !r.ok).map((r) => ({ step: r.step, error: r.error }));
  if (failedSteps.length > 0) {
    console.error("[run-audit-migration] failed steps:", JSON.stringify(failedSteps));
  }
  return json(allOk ? 200 : 500, {
    ok: allOk,
    migrations: ["001_audit_chain", "002_audit_chain_fix", "003_threat_feeds", "004_admin_ip_immunity", "005_affiliate_clicks", "006_newsletter_subscribers", "007_testimonials", "013_leadgen", "017_leads", "018_user_plans", "019_visits_columns"],
    failedSteps,
    results,
  });
}

// One-shot: null prev_hash/row_hash on every currently-chained row. Use
// once after migration 002 to discard pre-fix rows whose hashes can never
// verify (CHAR padding + ts drift). Verify then skips them (WHERE row_hash
// IS NOT NULL) and the chain restarts clean from the next event.
export async function handleResetAuditChain(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const before = await sql`
    SELECT COUNT(*)::int AS n FROM security_events WHERE row_hash IS NOT NULL
  `;
  const reset = await sql`
    UPDATE security_events
    SET prev_hash = NULL, row_hash = NULL
    WHERE row_hash IS NOT NULL
    RETURNING id
  `;
  return json(200, {
    ok: true,
    resetRows: reset.length,
    chainedBefore: before[0]?.n || 0,
    note: "Chain will restart from the next logSecurityEvent() call.",
  });
}

// ---------- health (unauthenticated, for external uptime monitors) ----------
export async function handleHealth() {
  const checks = { db: "unknown", criticalEvents: 0, ok: false };
  const startedAt = Date.now();
  try {
    const r = await sql`SELECT 1 AS ping`;
    checks.db = r.length > 0 ? "connected" : "no_response";
  } catch (err) {
    // Public endpoint — don't leak schema/host/connection details from
    // the driver error. Log server-side, return a generic status.
    console.error("[portal/health] db ping failed", err);
    checks.db = "error";
  }
  try {
    const r = await sql`
      SELECT COUNT(*)::int AS cnt FROM security_events
      WHERE severity = 'critical' AND ts > now() - interval '1 hour'
    `;
    checks.criticalEvents = r[0]?.cnt || 0;
  } catch { checks.criticalEvents = -1; }
  checks.ok = checks.db === "connected" && checks.criticalEvents === 0;
  return json(checks.ok ? 200 : 503, {
    ok: checks.ok,
    status: checks.ok ? "ok" : "degraded",
    service: "simpleitsrq-web",
    uptime: {
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    },
  });
}
