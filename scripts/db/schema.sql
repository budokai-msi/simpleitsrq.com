-- Simple IT SRQ — client portal schema
--
-- Idempotent. Re-runnable with `npm run db:push`.
-- Hosted on Neon (provisioned via Vercel Marketplace).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------- users ----------
CREATE TABLE IF NOT EXISTS users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL UNIQUE,
  name        text,
  avatar_url  text,
  company     text,
  phone       text,
  is_admin    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users (lower(email));

-- Idempotent add for installs that predate is_admin.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- ---------- oauth_accounts ----------
-- One row per provider linkage (a user can sign in with both Google and GitHub).
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider             text NOT NULL CHECK (provider IN ('google', 'github')),
  provider_account_id  text NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_account_id)
);

CREATE INDEX IF NOT EXISTS oauth_accounts_user_idx ON oauth_accounts (user_id);

-- ---------- sessions ----------
-- Opaque session tokens. The token itself lives only in an HttpOnly cookie;
-- we store a SHA-256 hash so a DB leak doesn't grant login.
CREATE TABLE IF NOT EXISTS sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ip          text,
  user_agent  text
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

-- ---------- oauth_states ----------
-- Short-lived CSRF tokens for the OAuth redirect round trip.
CREATE TABLE IF NOT EXISTS oauth_states (
  state        text PRIMARY KEY,
  provider     text NOT NULL CHECK (provider IN ('google', 'github')),
  redirect_to  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oauth_states_created_idx ON oauth_states (created_at);

-- ---------- tickets ----------
CREATE TABLE IF NOT EXISTS tickets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_code  text NOT NULL UNIQUE,
  user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  email        text NOT NULL,
  name         text NOT NULL,
  company      text,
  phone        text,
  priority     text NOT NULL CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  category     text NOT NULL,
  subject      text NOT NULL,
  description  text NOT NULL,
  status       text NOT NULL DEFAULT 'open'
               CHECK (status IN ('open', 'in_progress', 'waiting', 'resolved', 'closed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  closed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS tickets_user_idx   ON tickets (user_id);
CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets (status);
CREATE INDEX IF NOT EXISTS tickets_email_idx  ON tickets (lower(email));

-- ---------- ticket_messages ----------
-- Thread of updates on a ticket (client reply, agent note, system event).
CREATE TABLE IF NOT EXISTS ticket_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_type  text NOT NULL CHECK (author_type IN ('client', 'agent', 'system')),
  author_name  text,
  body         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_messages_ticket_idx ON ticket_messages (ticket_id, created_at);

-- ---------- invoices ----------
CREATE TABLE IF NOT EXISTS invoices (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number     text NOT NULL UNIQUE,
  user_id            uuid REFERENCES users(id) ON DELETE SET NULL,
  stripe_invoice_id  text UNIQUE,
  amount_cents       integer NOT NULL,
  currency           text NOT NULL DEFAULT 'usd',
  status             text NOT NULL
                     CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
  issued_at          timestamptz NOT NULL,
  due_at             timestamptz,
  paid_at            timestamptz,
  hosted_url         text,
  pdf_url            text,
  description        text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoices_user_idx   ON invoices (user_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices (status);

-- ---------- visitors ----------
-- One row per distinct anonymous visitor (keyed on the sirq_anon cookie).
-- Visits without consent are still logged in `visits` below, but have no
-- visitor row.
CREATE TABLE IF NOT EXISTS visitors (
  anon_id       text PRIMARY KEY,
  first_seen    timestamptz NOT NULL DEFAULT now(),
  last_seen     timestamptz NOT NULL DEFAULT now(),
  visit_count   integer NOT NULL DEFAULT 1,
  first_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  last_ip       text,
  last_ua       text,
  last_country  text,
  last_region   text,
  last_city     text,
  last_tz       text,
  last_lang     text,
  first_referrer text,
  first_path     text
);

CREATE INDEX IF NOT EXISTS visitors_last_seen_idx ON visitors (last_seen DESC);

-- ---------- visits ----------
-- Every request that lands on a client page. Recorded server-side so we
-- always get the real IP + Vercel geo headers, and even visitors who reject
-- non-essential cookies still show up here (with anon_id NULL).
CREATE TABLE IF NOT EXISTS visits (
  id           bigserial PRIMARY KEY,
  ts           timestamptz NOT NULL DEFAULT now(),
  anon_id      text,
  user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  path         text NOT NULL,
  referrer     text,
  ip           text,
  country      text,
  region       text,
  city         text,
  latitude     text,
  longitude    text,
  user_agent   text,
  browser      text,
  os           text,
  device       text,
  screen       text,
  tz           text,
  lang         text,
  consent      text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text
);

-- Passive device fingerprint — SHA-256 of (IP + UA + screen + tz + platform + cores + mem + touch + dpr + colorDepth).
ALTER TABLE visits ADD COLUMN IF NOT EXISTS device_hash text;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS color_depth  integer;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS platform     text;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS cores        integer;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS mem          real;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS touch        integer;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS dpr          real;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS connection   text;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS langs        text;

CREATE INDEX IF NOT EXISTS visits_ts_idx          ON visits (ts DESC);
CREATE INDEX IF NOT EXISTS visits_anon_idx        ON visits (anon_id, ts DESC);
CREATE INDEX IF NOT EXISTS visits_user_idx        ON visits (user_id, ts DESC);
CREATE INDEX IF NOT EXISTS visits_path_idx        ON visits (path);
CREATE INDEX IF NOT EXISTS visits_ip_idx          ON visits (ip);
CREATE INDEX IF NOT EXISTS visits_device_hash_idx ON visits (device_hash);

-- Visitor-session grouping: links every pageview to the web_sessions row.
ALTER TABLE visits ADD COLUMN IF NOT EXISTS session_id uuid;
CREATE INDEX IF NOT EXISTS visits_session_idx ON visits (session_id, ts);

-- ---------- security_events ----------
-- Auth failures, rate-limit trips, and anything else worth reviewing.
CREATE TABLE IF NOT EXISTS security_events (
  id          bigserial PRIMARY KEY,
  ts          timestamptz NOT NULL DEFAULT now(),
  kind        text NOT NULL,
  severity    text NOT NULL DEFAULT 'info'
              CHECK (severity IN ('info', 'warn', 'error', 'critical')),
  ip          text,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  user_agent  text,
  path        text,
  detail      jsonb
);

CREATE INDEX IF NOT EXISTS security_events_ts_idx       ON security_events (ts DESC);
CREATE INDEX IF NOT EXISTS security_events_kind_idx     ON security_events (kind, ts DESC);
CREATE INDEX IF NOT EXISTS security_events_severity_idx ON security_events (severity, ts DESC);

-- ---------- auth_throttle ----------
-- Rolling counters for rate-limiting auth endpoints by IP.
CREATE TABLE IF NOT EXISTS auth_throttle (
  ip           text NOT NULL,
  bucket       text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  count        integer NOT NULL DEFAULT 1,
  PRIMARY KEY (ip, bucket)
);

-- ---------- ip_blocklist ----------
-- Manual deny list. Populated by you in SQL or the admin panel later.
CREATE TABLE IF NOT EXISTS ip_blocklist (
  ip          text PRIMARY KEY,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- ip_intel ----------
-- OSINT enrichment for known IPs. Populated automatically when threat actors
-- are logged (AbuseIPDB + ipinfo.io lookups).
CREATE TABLE IF NOT EXISTS ip_intel (
  ip              text PRIMARY KEY,
  asn             text,
  org             text,
  isp             text,
  country         text,
  city            text,
  is_datacenter   boolean,
  is_tor          boolean,
  is_proxy        boolean,
  is_vpn          boolean,
  abuse_score     integer,
  abuse_reports   integer,
  abuse_last_seen text,
  enriched_at     timestamptz,
  expires_at      timestamptz
);

CREATE INDEX IF NOT EXISTS ip_intel_enriched_idx ON ip_intel (enriched_at DESC);

-- Reverse DNS + RDAP WHOIS — resolved once per IP, cached with the rest.
ALTER TABLE ip_intel ADD COLUMN IF NOT EXISTS region                 text;
ALTER TABLE ip_intel ADD COLUMN IF NOT EXISTS reverse_dns            text;
ALTER TABLE ip_intel ADD COLUMN IF NOT EXISTS rdap_handle            text;
ALTER TABLE ip_intel ADD COLUMN IF NOT EXISTS rdap_name              text;
ALTER TABLE ip_intel ADD COLUMN IF NOT EXISTS rdap_registrant        text;
ALTER TABLE ip_intel ADD COLUMN IF NOT EXISTS rdap_abuse_email       text;
ALTER TABLE ip_intel ADD COLUMN IF NOT EXISTS rdap_net_range         text;
ALTER TABLE ip_intel ADD COLUMN IF NOT EXISTS rdap_registration_date timestamptz;
ALTER TABLE ip_intel ADD COLUMN IF NOT EXISTS rdap_source            text;
ALTER TABLE ip_intel ADD COLUMN IF NOT EXISTS raw_abuseipdb          jsonb;
ALTER TABLE ip_intel ADD COLUMN IF NOT EXISTS raw_ipinfo             jsonb;
ALTER TABLE ip_intel ADD COLUMN IF NOT EXISTS raw_rdap               jsonb;
CREATE INDEX IF NOT EXISTS ip_intel_rdap_registrant_idx ON ip_intel (rdap_registrant);
CREATE INDEX IF NOT EXISTS ip_intel_reverse_dns_idx     ON ip_intel (reverse_dns);

-- ---------- threat_actors ----------
-- Every request from a hostile-origin country gets logged here with full
-- device intel. The visitor sees a fake honeypot page; the real site is
-- never served. This is your threat intelligence feed.
CREATE TABLE IF NOT EXISTS threat_actors (
  id            bigserial PRIMARY KEY,
  ts            timestamptz NOT NULL DEFAULT now(),
  ip            text NOT NULL,
  country       text,
  region        text,
  city          text,
  latitude      text,
  longitude     text,
  user_agent    text,
  accept_lang   text,
  device_hash   text,
  path          text,
  referrer      text,
  method        text,
  host          text,
  origin        text,
  headers_json  jsonb,
  threat_class  text NOT NULL DEFAULT 'hostile_geo',
  honeypot_served boolean NOT NULL DEFAULT true,
  notes         text
);

CREATE INDEX IF NOT EXISTS threat_actors_ts_idx      ON threat_actors (ts DESC);
CREATE INDEX IF NOT EXISTS threat_actors_ip_idx      ON threat_actors (ip);
CREATE INDEX IF NOT EXISTS threat_actors_country_idx ON threat_actors (country);
CREATE INDEX IF NOT EXISTS threat_actors_hash_idx    ON threat_actors (device_hash);

-- ---------- session_tracking ----------
-- Every session lifecycle event: created, refreshed, destroyed, expired, hijack_attempt.
CREATE TABLE IF NOT EXISTS session_tracking (
  id          bigserial PRIMARY KEY,
  ts          timestamptz NOT NULL DEFAULT now(),
  event       text NOT NULL,
  session_id  uuid,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  ip          text,
  user_agent  text,
  country     text,
  city        text,
  device_hash text,
  detail      jsonb
);

CREATE INDEX IF NOT EXISTS session_tracking_ts_idx   ON session_tracking (ts DESC);
CREATE INDEX IF NOT EXISTS session_tracking_user_idx ON session_tracking (user_id, ts DESC);
CREATE INDEX IF NOT EXISTS session_tracking_ip_idx   ON session_tracking (ip);

-- ---------- dns_integrity ----------
-- Periodic DNS resolution checks. The cron report compares current DNS
-- against expected values to detect poisoning or unauthorized changes.
CREATE TABLE IF NOT EXISTS dns_integrity (
  id          bigserial PRIMARY KEY,
  ts          timestamptz NOT NULL DEFAULT now(),
  domain      text NOT NULL,
  record_type text NOT NULL,
  expected    text NOT NULL,
  actual      text,
  match       boolean NOT NULL,
  resolver    text
);

CREATE INDEX IF NOT EXISTS dns_integrity_ts_idx ON dns_integrity (ts DESC);
CREATE INDEX IF NOT EXISTS dns_integrity_match_idx ON dns_integrity (match, ts DESC);

-- ---------- draft_posts ----------
-- AI-generated blog posts awaiting admin review.
CREATE TABLE IF NOT EXISTS draft_posts (
  id          bigserial PRIMARY KEY,
  ts          timestamptz NOT NULL DEFAULT now(),
  title       text NOT NULL,
  slug        text NOT NULL UNIQUE,
  category    text NOT NULL,
  excerpt     text NOT NULL,
  body        text NOT NULL,
  meta_desc   text,
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected', 'published')),
  model       text,
  prompt_hash text,
  reviewed_at timestamptz,
  published_at timestamptz
);

CREATE INDEX IF NOT EXISTS draft_posts_status_idx ON draft_posts (status, ts DESC);

-- ---------- auto_actions ----------
-- Log of every automated counter-measure the system took.
CREATE TABLE IF NOT EXISTS auto_actions (
  id          bigserial PRIMARY KEY,
  ts          timestamptz NOT NULL DEFAULT now(),
  action      text NOT NULL,
  target      text,
  reason      text,
  detail      jsonb
);

CREATE INDEX IF NOT EXISTS auto_actions_ts_idx ON auto_actions (ts DESC);

-- ---------- web_sessions ----------
-- Visitor-side session grouping. One row per logical session (30-min idle
-- timeout), distinct from the `sessions` auth table. Every pageview in
-- `visits` carries a session_id pointing here.
CREATE TABLE IF NOT EXISTS web_sessions (
  id             uuid PRIMARY KEY,
  started_at     timestamptz NOT NULL DEFAULT now(),
  last_activity  timestamptz NOT NULL DEFAULT now(),
  ended_at       timestamptz,
  page_count     integer NOT NULL DEFAULT 1,
  anon_id        text,
  user_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  ip             text,
  country        text,
  region         text,
  city           text,
  user_agent     text,
  device_hash    text,
  landing_path   text,
  exit_path      text,
  referrer       text,
  utm_source     text,
  utm_medium     text,
  utm_campaign   text,
  bounced        boolean NOT NULL DEFAULT true,
  is_bot         boolean NOT NULL DEFAULT false,
  reverse_dns    text,
  rdap_registrant text
);

CREATE INDEX IF NOT EXISTS web_sessions_anon_idx     ON web_sessions (anon_id, started_at DESC);
CREATE INDEX IF NOT EXISTS web_sessions_user_idx     ON web_sessions (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS web_sessions_ip_idx       ON web_sessions (ip, started_at DESC);
CREATE INDEX IF NOT EXISTS web_sessions_last_act_idx ON web_sessions (last_activity DESC);
CREATE INDEX IF NOT EXISTS web_sessions_device_idx   ON web_sessions (device_hash);
