-- 011_engagement_events.sql
--
-- Phase 1 of the on-site recommender / behavior-ML stack.
--
-- The existing `visits` table records ONE row per pageview with no notion
-- of how the visitor actually engaged with that page (dwell, scroll, click
-- breadth, exit type). That is the bare minimum for security/abuse logging
-- but useless for training a ranker. This migration adds:
--
--   1. engagement_events  — fine-grained per-session time-series of behavior
--   2. engagement summary columns on web_sessions (denormalized for fast queries)
--
-- The schema is intentionally generic: a single `kind` enum + a numeric
-- value + a text value + a jsonb meta bucket. New event types can be added
-- without DDL. Indexes are sized for "training export by slug or by session"
-- which is the only access pattern that actually matters.

-- ---------- engagement_events ----------
CREATE TABLE IF NOT EXISTS engagement_events (
  id          bigserial PRIMARY KEY,
  ts          timestamptz NOT NULL DEFAULT now(),
  -- Session and identity (session_id always set; anon_id only when consented).
  session_id  uuid,
  anon_id     text,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  -- Where the event happened.
  path        text,
  slug        text,                    -- post slug if applicable, else NULL
  -- What happened.
  kind        text NOT NULL CHECK (kind IN (
    'pageview_enter',                  -- first paint of a route
    'pageview_exit',                   -- pagehide / visibilitychange-hidden with dwell + max scroll
    'scroll_milestone',                -- 25/50/75/100 % crossed (value_num = pct)
    'dwell_tick',                      -- periodic "still active" beacon during long reads
    'click',                           -- internal/outbound link, button, [data-track]
    'search',                          -- in-site search query (value_text = query)
    'share',                           -- share button engaged (value_text = network)
    'copy',                            -- selection copied to clipboard
    'media_play',                      -- video/audio play
    'section_view'                     -- H2/H3 entered viewport (value_text = anchor)
  )),
  value_num   double precision,        -- pct, ms, count — kind-specific
  value_text  text,                    -- target selector, anchor, query, URL — kind-specific
  meta        jsonb                    -- everything else (referrer, x/y, viewport, etc.)
);

-- Access patterns:
--   1. Per-session sequence:    session_id + ts            → training export
--   2. Per-slug aggregates:     slug + ts                  → item-side features
--   3. Per-user history:        anon_id + ts DESC          → user-tower input
--   4. Per-kind global rollups: kind + ts                  → admin dashboards
CREATE INDEX IF NOT EXISTS engagement_events_session_idx ON engagement_events (session_id, ts);
CREATE INDEX IF NOT EXISTS engagement_events_slug_idx    ON engagement_events (slug, ts DESC) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS engagement_events_anon_idx    ON engagement_events (anon_id, ts DESC) WHERE anon_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS engagement_events_kind_idx    ON engagement_events (kind, ts DESC);
CREATE INDEX IF NOT EXISTS engagement_events_ts_idx      ON engagement_events (ts DESC);

-- ---------- web_sessions: engagement rollups ----------
-- Denormalized so the admin dashboard and the recommender can read a single
-- row per session instead of aggregating engagement_events on every query.
-- Updated by api/track.js on every pageview_exit beacon.
ALTER TABLE web_sessions ADD COLUMN IF NOT EXISTS total_dwell_ms bigint NOT NULL DEFAULT 0;
ALTER TABLE web_sessions ADD COLUMN IF NOT EXISTS max_scroll_pct integer NOT NULL DEFAULT 0;
ALTER TABLE web_sessions ADD COLUMN IF NOT EXISTS event_count    integer NOT NULL DEFAULT 0;
-- Engagement-aware "bounced" definition. Replaces the page_count == 1 heuristic
-- with: NOT engaged means dwell < 30 s AND scroll < 50 % AND clicks == 0.
-- Computed lazily on update; default true so brand-new sessions look bounced
-- until proven otherwise.
ALTER TABLE web_sessions ADD COLUMN IF NOT EXISTS engaged       boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS web_sessions_engaged_idx ON web_sessions (engaged, started_at DESC);
