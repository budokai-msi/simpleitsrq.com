-- Migration 005 — Affiliate click-through tracking.
--
-- One row per click on an outbound [[amazon_search:...]] / affiliate link
-- anywhere on the site. Captures enough to produce per-post CTR without
-- crossing the line into full session-replay territory. IP is captured
-- for fraud detection (click farms), not for individual attribution.
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id            bigserial PRIMARY KEY,
  ts            timestamptz NOT NULL DEFAULT now(),
  slug          text,            -- blog post slug, store slug, or "" for homepage
  destination   text NOT NULL,   -- resolved outbound URL (affiliate link)
  label         text,            -- anchor text shown to the user
  network       text,            -- amazon, gusto, 1password, honeybook, acronis, etc.
  ip            text,
  country       text,
  anon_id       text,
  user_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  referrer_path text             -- path on our site where the click happened
);

CREATE INDEX IF NOT EXISTS affiliate_clicks_ts_idx       ON affiliate_clicks (ts DESC);
CREATE INDEX IF NOT EXISTS affiliate_clicks_slug_idx     ON affiliate_clicks (slug, ts DESC);
CREATE INDEX IF NOT EXISTS affiliate_clicks_network_idx  ON affiliate_clicks (network);
