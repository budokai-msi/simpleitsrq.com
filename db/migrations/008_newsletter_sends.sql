-- Migration 008 — Newsletter send log.
--
-- One row per admin-initiated newsletter blast. Records the subject,
-- how many recipients it was sent to, how many failed, and when the
-- send completed. Used by the client portal to show recent sends and
-- for audit purposes.
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS newsletter_sends (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject     text NOT NULL,
  sent        integer NOT NULL DEFAULT 0,
  failed      integer NOT NULL DEFAULT 0,
  sent_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  sent_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS newsletter_sends_sent_at_idx
  ON newsletter_sends (sent_at DESC);
