-- Migration 015 — OpSec portal tables.
--
-- Personal defensive ops tooling for /portal/opsec. Three tables that
-- back the four-section UI:
--
--   opsec_watched_domains — domains we want to keep an eye on
--                           (DNS drift, cert expiry, OSINT exposure).
--   opsec_iocs            — indicators of compromise the operator is
--                           tracking (IPs, hashes, domains, emails).
--   opsec_notes           — free-form defender's notebook entries.
--
-- All three carry created_by_user_id so a future multi-admin system
-- can scope rows per operator. Today only the single root admin row is
-- expected, but we don't want to migrate twice. UNIQUE constraints
-- prevent duplicate entries from accidental double-saves.
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS opsec_watched_domains (
  id                 bigserial PRIMARY KEY,
  domain             text NOT NULL,
  label              text,
  notes              text,
  is_active          boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  last_scanned_at    timestamptz,
  UNIQUE (domain)
);
CREATE INDEX IF NOT EXISTS opsec_watched_domains_active_idx
  ON opsec_watched_domains (is_active, last_scanned_at NULLS FIRST);

CREATE TABLE IF NOT EXISTS opsec_iocs (
  id                 bigserial PRIMARY KEY,
  ioc_type           text NOT NULL CHECK (ioc_type IN ('ip','domain','url','email','hash','cidr','user_agent','other')),
  value              text NOT NULL,
  source             text,
  severity           text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  notes              text,
  first_seen_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at       timestamptz NOT NULL DEFAULT now(),
  is_active          boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (ioc_type, value)
);
CREATE INDEX IF NOT EXISTS opsec_iocs_active_idx ON opsec_iocs (is_active, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS opsec_iocs_type_idx   ON opsec_iocs (ioc_type);

CREATE TABLE IF NOT EXISTS opsec_notes (
  id                 bigserial PRIMARY KEY,
  title              text,
  body               text NOT NULL,
  tags               text[] NOT NULL DEFAULT '{}',
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS opsec_notes_updated_idx ON opsec_notes (updated_at DESC);
CREATE INDEX IF NOT EXISTS opsec_notes_tags_idx    ON opsec_notes USING gin (tags);
