-- 018_user_plans.sql
--
-- Adds subscription plan tracking to users and a generic integration config
-- table so premium customers can push leads to HubSpot, Mailchimp, webhooks, etc.

-- ── Plan column on users ─────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free'
  CHECK (plan IN ('free','growth','pro','lifetime'));

-- Immediately grant lifetime access to the owner account.
-- If the row doesn't exist yet it will be set to 'lifetime' on first login via
-- the upsert in the auth callback — the UPDATE is a safe no-op when the row is absent.
UPDATE users
  SET plan = 'lifetime', is_admin = true
  WHERE email = 'ivanovspccenter@gmail.com';

-- ── user_integrations ────────────────────────────────────────────────────────
-- Stores per-user outbound integration configuration: webhooks, CRM keys, etc.
-- The config column holds provider-specific fields (encrypted at rest via Neon TDE).
CREATE TABLE IF NOT EXISTS user_integrations (
  id            bigserial PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          text NOT NULL
                CHECK (kind IN ('webhook','mailchimp','hubspot','activecampaign','zapier','gohighlevel')),
  label         text NOT NULL DEFAULT '',
  config        jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled       boolean NOT NULL DEFAULT true,
  last_used_at  timestamptz,
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_integrations_user_idx ON user_integrations (user_id, kind);
