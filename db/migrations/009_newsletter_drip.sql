-- Migration 009 — Newsletter drip-sequence tracking.
--
-- Adds three timestamp columns to newsletter_subscribers so the cron
-- drip job (api/cron/newsletter-drip.js) can find subscribers eligible
-- for each stage and avoid double-sending.
--
-- welcome_sent_at — set when the GET /api/contact?confirm= handler
--                   successfully transitions a subscriber from null to
--                   confirmed_at. Sent immediately on confirmation.
-- drip_day3_sent_at — set by the cron when ≥3 days have passed since
--                     confirmed_at and welcome_sent_at IS NOT NULL.
-- drip_day7_sent_at — set by the cron when ≥7 days have passed since
--                     confirmed_at and drip_day3_sent_at IS NOT NULL.
--
-- All three are NULL by default. The cron uses partial indexes so it
-- only scans subscribers who haven't yet received the next stage.
--
-- Safe to re-run.

ALTER TABLE newsletter_subscribers
  ADD COLUMN IF NOT EXISTS welcome_sent_at    timestamptz,
  ADD COLUMN IF NOT EXISTS drip_day3_sent_at  timestamptz,
  ADD COLUMN IF NOT EXISTS drip_day7_sent_at  timestamptz;

CREATE INDEX IF NOT EXISTS newsletter_drip_day3_idx
  ON newsletter_subscribers (confirmed_at)
  WHERE confirmed_at IS NOT NULL
    AND drip_day3_sent_at IS NULL
    AND unsubscribed_at IS NULL;

CREATE INDEX IF NOT EXISTS newsletter_drip_day7_idx
  ON newsletter_subscribers (confirmed_at)
  WHERE confirmed_at IS NOT NULL
    AND drip_day3_sent_at IS NOT NULL
    AND drip_day7_sent_at IS NULL
    AND unsubscribed_at IS NULL;
