-- 013_leadgen.sql
--
-- Lead-generation system tables. Powers the automated discovery →
-- enrichment → outreach pipeline for capturing local-business leads in
-- a target geography (initially the operator's own zip code).
--
-- Pipeline:
--   1. Discovery   (lead_businesses)  — OSM Overpass (Sunbiz/manual later)
--   2. Enrichment  (lead_emails)      — per-website crawler
--   3. Campaigns   (lead_campaigns + lead_campaign_sends + lead_campaign_links)
--   4. Job queue   (lead_crawl_jobs)  — drained by api/cron/agent.js
--
-- This file is the source-of-truth for `db migrate`; the same DDL is also
-- inlined in api/portal.js so admins can apply it from the portal UI
-- without shell access to the DB.
--
-- Compliance: every lead_emails row has consent_basis +
-- opted_out_at + bounced_at. Every campaign send has its own
-- unsubscribe_token used by the public unsubscribe handler.

-- ---------- lead_businesses ----------
CREATE TABLE IF NOT EXISTS lead_businesses (
  id              bigserial PRIMARY KEY,
  name            text NOT NULL,
  legal_name      text,
  address         text,
  city            text,
  state           text,
  zip             text,
  lat             double precision,
  lng             double precision,
  website         text,
  phone           text,
  source          text NOT NULL,        -- 'osm' | 'sunbiz' | 'manual' | 'csv'
  source_id       text,                 -- e.g. 'node/12345' for OSM
  source_url      text,
  industry        text,
  naics           text,
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','rejected','do_not_contact')),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  last_crawled_at timestamptz,
  -- Upsert key for the OSM importer: same source row updates in place.
  UNIQUE (source, source_id)
);

CREATE INDEX IF NOT EXISTS lead_businesses_zip_idx     ON lead_businesses (zip, status);
CREATE INDEX IF NOT EXISTS lead_businesses_status_idx  ON lead_businesses (status, created_at DESC);
CREATE INDEX IF NOT EXISTS lead_businesses_website_idx ON lead_businesses (website) WHERE website IS NOT NULL;
CREATE INDEX IF NOT EXISTS lead_businesses_name_idx    ON lead_businesses (zip, lower(name));

-- ---------- lead_emails ----------
CREATE TABLE IF NOT EXISTS lead_emails (
  id              bigserial PRIMARY KEY,
  business_id     bigint NOT NULL REFERENCES lead_businesses(id) ON DELETE CASCADE,
  email           text NOT NULL,
  source          text NOT NULL,        -- 'website_mailto' | 'website_text' | 'osint' | 'manual'
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
  -- Same address may legitimately appear under several businesses
  -- (shared owner, franchise HQ). Dedupe within a single business.
  UNIQUE (business_id, email)
);

CREATE INDEX IF NOT EXISTS lead_emails_business_idx    ON lead_emails (business_id);
CREATE INDEX IF NOT EXISTS lead_emails_optout_idx      ON lead_emails (opted_out_at) WHERE opted_out_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS lead_emails_confidence_idx  ON lead_emails (confidence DESC);

-- ---------- lead_campaigns ----------
CREATE TABLE IF NOT EXISTS lead_campaigns (
  id                bigserial PRIMARY KEY,
  name              text NOT NULL,
  description       text,
  subject_template  text NOT NULL,        -- supports {{placeholders}}
  body_template     text NOT NULL,
  -- Optional Claude prompt; when set, the sender renders {{custom_intro}}
  -- per business by running this prompt against the business profile.
  ai_intro_prompt   text,
  from_email        text NOT NULL,
  reply_to          text,
  throttle_per_hour int NOT NULL DEFAULT 30  CHECK (throttle_per_hour > 0),
  daily_cap         int NOT NULL DEFAULT 200 CHECK (daily_cap > 0),
  consent_basis     text NOT NULL DEFAULT 'legitimate_interest'
                    CHECK (consent_basis IN ('legitimate_interest','public_record','opted_in')),
  -- segment is the JSON filter handleLeadgenCampaignStart reads to
  -- materialize lead_campaign_sends rows. Today: { zip, min_confidence }.
  segment           jsonb NOT NULL DEFAULT '{}'::jsonb,
  status            text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','scheduled','running','paused','done','cancelled')),
  scheduled_at      timestamptz,
  started_at        timestamptz,
  completed_at      timestamptz,
  created_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_campaigns_status_idx ON lead_campaigns (status, scheduled_at);

-- ---------- lead_campaign_sends ----------
CREATE TABLE IF NOT EXISTS lead_campaign_sends (
  id                  bigserial PRIMARY KEY,
  campaign_id         bigint NOT NULL REFERENCES lead_campaigns(id) ON DELETE CASCADE,
  business_id         bigint NOT NULL REFERENCES lead_businesses(id) ON DELETE CASCADE,
  email_id            bigint NOT NULL REFERENCES lead_emails(id)    ON DELETE CASCADE,
  to_email            text NOT NULL,
  status              text NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued','sending','sent','failed','bounced','suppressed')),
  -- Rendered content is filled at send time. Avoids storing 5000 templated
  -- bodies up front for a paused campaign.
  rendered_subject    text,
  rendered_body       text,
  provider            text,                 -- 'ses' | 'gmail' | 'smtp'
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
  open_token          text UNIQUE,          -- set at send time
  unsubscribe_token   text NOT NULL UNIQUE, -- set at queue time
  open_count          int NOT NULL DEFAULT 0,
  click_count         int NOT NULL DEFAULT 0,
  UNIQUE (campaign_id, email_id)
);

CREATE INDEX IF NOT EXISTS lead_campaign_sends_campaign_idx ON lead_campaign_sends (campaign_id, queued_at);
CREATE INDEX IF NOT EXISTS lead_campaign_sends_email_idx    ON lead_campaign_sends (email_id);
CREATE INDEX IF NOT EXISTS lead_campaign_sends_provider_idx ON lead_campaign_sends (provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS lead_campaign_sends_status_idx   ON lead_campaign_sends (status, queued_at) WHERE sent_at IS NULL;

-- ---------- lead_campaign_links ----------
CREATE TABLE IF NOT EXISTS lead_campaign_links (
  id          bigserial PRIMARY KEY,
  campaign_id bigint NOT NULL REFERENCES lead_campaigns(id) ON DELETE CASCADE,
  url         text NOT NULL,
  label       text,
  click_count int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, url)
);

-- ---------- lead_crawl_jobs ----------
CREATE TABLE IF NOT EXISTS lead_crawl_jobs (
  id          bigserial PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('sunbiz_zip','osm_zip','website_emails','smtp_verify')),
  payload     jsonb NOT NULL,             -- { zip: "34236" } or { business_id: 123 }
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','running','done','failed','cancelled')),
  attempts    int NOT NULL DEFAULT 0,
  progress    int,                        -- items processed
  total       int,                        -- items expected
  error       text,
  result      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  started_at  timestamptz,
  finished_at timestamptz,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS lead_crawl_jobs_status_idx ON lead_crawl_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS lead_crawl_jobs_kind_idx   ON lead_crawl_jobs (kind, status);
