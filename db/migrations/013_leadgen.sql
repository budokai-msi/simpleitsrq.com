-- 013_leadgen.sql
--
-- Lead-generation system tables. Powers the automated discovery →
-- enrichment → outreach pipeline for capturing local-business leads in
-- a target geography (initially the operator's own zip code).
--
-- Pipeline:
--   1. Discovery (lead_businesses)  — Sunbiz, OpenStreetMap Overpass, etc.
--   2. Enrichment (lead_emails)     — per-website crawler, OSINT
--   3. Campaigns (lead_campaigns + lead_campaign_sends) — outreach with
--      send tracking, opens/clicks/replies, unsubscribes
--
-- Compliance: every lead_email tracks consent_basis ('legitimate_interest',
-- 'public_record', 'opted_in') and opted_out_at. Every campaign_send must
-- include an unsubscribe link rendered server-side from
-- unsubscribe_token. Bounces hard-suppress the address via opted_out_at.

-- ---------- lead_businesses ----------
-- One row per discovered business. Source-agnostic: a single business
-- can be discovered via multiple channels (Sunbiz + OSM + manual import)
-- and we de-dup on (name, zip) at insert time, merging metadata.
CREATE TABLE IF NOT EXISTS lead_businesses (
  id            bigserial PRIMARY KEY,
  -- Display + identity.
  name          text NOT NULL,
  legal_name    text,                  -- Sunbiz "Document Title" if differs
  -- Location (denormalized — these change rarely and we query by zip a lot).
  address       text,
  city          text,
  state         text,                  -- 2-char USPS code
  zip           text,                  -- 5-digit; ZIP+4 stripped
  lat           double precision,
  lng           double precision,
  -- Contact surfaces (no email here — see lead_emails for n:1 emails).
  website       text,
  phone         text,
  -- Discovery provenance.
  source        text NOT NULL,         -- 'sunbiz' | 'osm' | 'manual' | 'csv'
  source_id     text,                  -- Sunbiz document number, OSM id, etc.
  source_url    text,                  -- direct link back to the record
  -- Industry classification — free-form for now; we'll add a controlled
  -- vocabulary once we see what comes back from the scrapers.
  industry      text,
  naics         text,                  -- 6-digit NAICS if known
  -- Lifecycle.
  status        text NOT NULL DEFAULT 'discovered'
                CHECK (status IN ('discovered','enriching','enriched','sent','replied','opted_out','dead')),
  notes         text,
  -- Timestamps.
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  last_crawled_at timestamptz,
  -- Dedupe key — case-insensitive name within a zip.
  UNIQUE (zip, lower(name))
);

CREATE INDEX IF NOT EXISTS lead_businesses_zip_idx     ON lead_businesses (zip, status);
CREATE INDEX IF NOT EXISTS lead_businesses_status_idx  ON lead_businesses (status, created_at DESC);
CREATE INDEX IF NOT EXISTS lead_businesses_source_idx  ON lead_businesses (source, source_id);
CREATE INDEX IF NOT EXISTS lead_businesses_website_idx ON lead_businesses (website) WHERE website IS NOT NULL;

-- ---------- lead_emails ----------
-- N:1 with lead_businesses. A business may have several discovered
-- addresses (info@, contact@, owner's name, generic). We track each
-- with provenance + confidence so the campaign builder can pick the
-- best target.
CREATE TABLE IF NOT EXISTS lead_emails (
  id              bigserial PRIMARY KEY,
  business_id     bigint NOT NULL REFERENCES lead_businesses(id) ON DELETE CASCADE,
  email           text NOT NULL,       -- normalized lowercase
  -- Where did we find this address?
  source          text NOT NULL,       -- 'website_mailto' | 'website_text' | 'osint' | 'manual'
  source_url      text,                -- the page where it was scraped
  context_snippet text,                -- ~120 chars of surrounding text for review
  -- 0.0–1.0 — set by the crawler. mailto:= 1.0, text-regex with role match
  -- (sales@, info@) = 0.8, generic regex hit = 0.5.
  confidence      double precision NOT NULL DEFAULT 0.5
                  CHECK (confidence >= 0 AND confidence <= 1),
  -- Verification (DNS MX check + SMTP RCPT TO probe; soft).
  mx_valid        boolean,
  smtp_verified   boolean,
  -- Compliance.
  consent_basis   text NOT NULL DEFAULT 'legitimate_interest'
                  CHECK (consent_basis IN ('legitimate_interest','public_record','opted_in')),
  opted_out_at    timestamptz,
  bounced_at      timestamptz,
  -- Timestamps.
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- One business → many distinct emails, but each email unique system-wide
  -- so we never double-send.
  UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS lead_emails_business_idx ON lead_emails (business_id);
CREATE INDEX IF NOT EXISTS lead_emails_optout_idx   ON lead_emails (opted_out_at) WHERE opted_out_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS lead_emails_confidence_idx ON lead_emails (confidence DESC);

-- ---------- lead_campaigns ----------
-- A reusable outreach template. The body uses simple {{placeholders}}
-- ({{business_name}}, {{first_name}}, {{city}}, {{custom_intro}}).
-- An AI step (Claude) can generate per-business {{custom_intro}} at
-- send time.
CREATE TABLE IF NOT EXISTS lead_campaigns (
  id                bigserial PRIMARY KEY,
  name              text NOT NULL,
  description       text,
  subject_template  text NOT NULL,     -- supports {{placeholders}}
  body_template     text NOT NULL,     -- plain text or HTML
  -- AI-generated per-recipient personalization. When non-empty, a Claude
  -- prompt is run per-business with this prompt + the business profile to
  -- produce {{custom_intro}}.
  ai_intro_prompt   text,
  -- Throttle + scheduling.
  throttle_per_hour int NOT NULL DEFAULT 30 CHECK (throttle_per_hour > 0),
  daily_cap         int NOT NULL DEFAULT 200 CHECK (daily_cap > 0),
  status            text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','scheduled','running','paused','completed','aborted')),
  scheduled_at      timestamptz,
  started_at        timestamptz,
  completed_at      timestamptz,
  -- Audit.
  created_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_campaigns_status_idx ON lead_campaigns (status, scheduled_at);

-- ---------- lead_campaign_sends ----------
-- One row per (campaign, business, email) target. Tracks lifecycle from
-- queued → sent → opened → clicked → replied/bounced/unsubscribed.
-- The unsubscribe_token is rendered into the unsubscribe link in the
-- outgoing email and lookup-keyed for the no-auth public unsubscribe
-- handler. Single-use semantics: token → email_id, email_id has its own
-- opted_out_at on lead_emails.
CREATE TABLE IF NOT EXISTS lead_campaign_sends (
  id                  bigserial PRIMARY KEY,
  campaign_id         bigint NOT NULL REFERENCES lead_campaigns(id) ON DELETE CASCADE,
  business_id         bigint NOT NULL REFERENCES lead_businesses(id) ON DELETE CASCADE,
  email_id            bigint NOT NULL REFERENCES lead_emails(id) ON DELETE CASCADE,
  email               text NOT NULL,   -- denormalized for fast lookup
  -- Rendered content (so we can replay exactly what was sent).
  rendered_subject    text NOT NULL,
  rendered_body       text NOT NULL,
  -- Provider integration.
  provider            text,            -- 'ses' | 'gmail' | 'smtp' | etc
  provider_message_id text,            -- for dedupe + correlation with bounces
  -- Lifecycle timestamps.
  queued_at           timestamptz NOT NULL DEFAULT now(),
  sent_at             timestamptz,
  delivered_at        timestamptz,
  opened_at           timestamptz,     -- first open
  clicked_at          timestamptz,     -- first click on any tracked link
  replied_at          timestamptz,     -- inbox-watcher detected a reply
  bounced_at          timestamptz,
  unsubscribed_at     timestamptz,
  -- Error capture.
  error               text,
  -- Tracking pixel + link rewriting.
  open_token          text NOT NULL UNIQUE,
  unsubscribe_token   text NOT NULL UNIQUE,
  -- Counts (incremented on subsequent opens/clicks beyond the first).
  open_count          int NOT NULL DEFAULT 0,
  click_count         int NOT NULL DEFAULT 0,
  -- Don't double-send to the same address from the same campaign.
  UNIQUE (campaign_id, email_id)
);

CREATE INDEX IF NOT EXISTS lead_campaign_sends_campaign_idx   ON lead_campaign_sends (campaign_id, queued_at);
CREATE INDEX IF NOT EXISTS lead_campaign_sends_email_idx      ON lead_campaign_sends (email_id);
CREATE INDEX IF NOT EXISTS lead_campaign_sends_provider_idx   ON lead_campaign_sends (provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS lead_campaign_sends_status_idx     ON lead_campaign_sends (sent_at) WHERE sent_at IS NULL;

-- ---------- lead_campaign_links ----------
-- Distinct trackable URLs in a campaign body. Each click on a tracked
-- link goes through /api/leadgen/click?t=<send_token>&l=<link_id>
-- which records the click and 302's to the destination.
CREATE TABLE IF NOT EXISTS lead_campaign_links (
  id          bigserial PRIMARY KEY,
  campaign_id bigint NOT NULL REFERENCES lead_campaigns(id) ON DELETE CASCADE,
  url         text NOT NULL,
  label       text,
  -- denormalized aggregate counter — bumped per click for fast UI reads
  click_count int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, url)
);

-- ---------- lead_crawl_jobs ----------
-- Async job queue for the discovery + enrichment crawlers. Lets the cron
-- worker pick up work without holding HTTP request connections open.
CREATE TABLE IF NOT EXISTS lead_crawl_jobs (
  id          bigserial PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('sunbiz_zip','osm_zip','website_emails','smtp_verify')),
  payload     jsonb NOT NULL,           -- { zip: "34236" } or { business_id: 123 }
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','running','done','failed','cancelled')),
  attempts    int NOT NULL DEFAULT 0,
  last_error  text,
  -- Optional progress fields populated by the worker for live UI.
  progress_n  int,                      -- items processed so far
  progress_total int,                   -- total items expected
  result      jsonb,                    -- summary output the worker wrote
  -- Lifecycle.
  created_at  timestamptz NOT NULL DEFAULT now(),
  started_at  timestamptz,
  finished_at timestamptz,
  -- Optional creator.
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS lead_crawl_jobs_status_idx ON lead_crawl_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS lead_crawl_jobs_kind_idx   ON lead_crawl_jobs (kind, status);
