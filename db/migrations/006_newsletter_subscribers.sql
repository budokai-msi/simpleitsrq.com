-- Migration 006 — Newsletter subscribers (double-opt-in).
--
-- One row per subscribe attempt. confirmed_at is NULL until the user
-- clicks the confirmation link we email them. unsubscribe_token lets
-- anyone in possession of the link remove their row without a login.
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id                  bigserial PRIMARY KEY,
  email               text NOT NULL,
  confirm_token       text NOT NULL UNIQUE,
  unsubscribe_token   text NOT NULL UNIQUE,
  source              text,
  ip                  text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  confirmed_at        timestamptz,
  unsubscribed_at     timestamptz,
  UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS newsletter_confirmed_idx   ON newsletter_subscribers (confirmed_at) WHERE confirmed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS newsletter_email_idx       ON newsletter_subscribers (lower(email));
