-- Migration 023 — blog cron run observability.
--
-- Records one row per daily auto-publish cron attempt so the admin dashboard
-- can see when the blog engine has been failing (qwen_generation_failed,
-- source article extraction errors, etc.) and acknowledge/retry the failure
-- state. Written by api/cron/agent.js; read by the Blog Health admin tab.

CREATE TABLE IF NOT EXISTS blog_cron_runs (
  id          bigserial PRIMARY KEY,
  run_date    date NOT NULL DEFAULT CURRENT_DATE,
  status      text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','failed','partial')),
  error_code  text,
  error_detail text,
  source_url  text,
  retried_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_date, source_url)
);
CREATE INDEX IF NOT EXISTS blog_cron_runs_date_idx ON blog_cron_runs (run_date DESC);
