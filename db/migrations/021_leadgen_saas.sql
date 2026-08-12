-- 021_leadgen_saas.sql
-- Consolidated SaaS domain primitives for Leadgen.
-- Keeps discovery/enrichment/campaign data in the existing 013 tables and
-- adds ownership, automation, scoring, suppression, attribution and health.

CREATE TABLE IF NOT EXISTS lead_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_workspace_members (
  workspace_id uuid NOT NULL REFERENCES lead_workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS lead_saved_markets (
  id bigserial PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES lead_workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  zip text NOT NULL,
  industry_group text,
  sub_industry text,
  radius_miles int,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  schedule text CHECK (schedule IS NULL OR schedule IN ('daily','weekly','monthly')),
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);
CREATE INDEX IF NOT EXISTS lead_saved_markets_due_idx ON lead_saved_markets(next_run_at) WHERE schedule IS NOT NULL;

CREATE TABLE IF NOT EXISTS lead_market_changes (
  id bigserial PRIMARY KEY,
  saved_market_id bigint NOT NULL REFERENCES lead_saved_markets(id) ON DELETE CASCADE,
  business_id bigint REFERENCES lead_businesses(id) ON DELETE SET NULL,
  change_type text NOT NULL CHECK (change_type IN ('new','changed','missing','contact_added','contact_removed')),
  before_value jsonb,
  after_value jsonb,
  detected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_market_changes_market_idx ON lead_market_changes(saved_market_id, detected_at DESC);

CREATE TABLE IF NOT EXISTS lead_territories (
  id bigserial PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES lead_workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  zip_prefixes text[] NOT NULL DEFAULT '{}',
  industries text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, name)
);

CREATE TABLE IF NOT EXISTS lead_exclusions (
  id bigserial PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES lead_workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('domain','email','phone','business','keyword')),
  value text NOT NULL,
  reason text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, kind, value)
);

CREATE TABLE IF NOT EXISTS lead_scores (
  workspace_id uuid NOT NULL REFERENCES lead_workspaces(id) ON DELETE CASCADE,
  business_id bigint NOT NULL REFERENCES lead_businesses(id) ON DELETE CASCADE,
  score int NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  grade text NOT NULL DEFAULT 'C' CHECK (grade IN ('A','B','C','D')),
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_version text NOT NULL DEFAULT 'rules-v1',
  scored_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace_id, business_id)
);
CREATE INDEX IF NOT EXISTS lead_scores_rank_idx ON lead_scores(workspace_id, score DESC);

CREATE TABLE IF NOT EXISTS lead_crm_sync (
  id bigserial PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES lead_workspaces(id) ON DELETE CASCADE,
  business_id bigint REFERENCES lead_businesses(id) ON DELETE SET NULL,
  integration_id bigint,
  provider text NOT NULL,
  external_id text,
  dedupe_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','created','updated','skipped','failed')),
  error text,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, provider, dedupe_key)
);

CREATE TABLE IF NOT EXISTS lead_pipeline_attribution (
  id bigserial PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES lead_workspaces(id) ON DELETE CASCADE,
  business_id bigint REFERENCES lead_businesses(id) ON DELETE SET NULL,
  campaign_id bigint REFERENCES lead_campaigns(id) ON DELETE SET NULL,
  stage text NOT NULL CHECK (stage IN ('lead','qualified','meeting','opportunity','won','lost')),
  value_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  external_ref text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS lead_pipeline_attr_workspace_idx ON lead_pipeline_attribution(workspace_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS lead_integration_health (
  workspace_id uuid NOT NULL REFERENCES lead_workspaces(id) ON DELETE CASCADE,
  integration_id bigint NOT NULL,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('healthy','degraded','down','unknown')),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  consecutive_failures int NOT NULL DEFAULT 0,
  latency_ms int,
  last_error text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace_id, integration_id)
);
