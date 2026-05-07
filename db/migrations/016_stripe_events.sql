-- 016_stripe_events.sql
--
-- Persists Stripe webhook events for audit + idempotency. We dedupe on
-- the Stripe event ID so a redelivered webhook doesn't double-process.
-- The `data` column stores the full event payload (jsonb) for replay /
-- forensics. Indexed by type + created_at so the admin can query
-- "all recent checkout.session.completed" cheaply.

CREATE TABLE IF NOT EXISTS stripe_events (
  id              text PRIMARY KEY,            -- Stripe event id (evt_...)
  type            text NOT NULL,               -- e.g. checkout.session.completed
  livemode        boolean NOT NULL DEFAULT true,
  api_version     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  occurred_at     timestamptz,                 -- event.created from Stripe
  customer_email  text,
  customer_id     text,
  amount_total    integer,                     -- cents
  currency        text,
  data            jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS stripe_events_type_idx       ON stripe_events (type);
CREATE INDEX IF NOT EXISTS stripe_events_created_at_idx ON stripe_events (created_at DESC);
CREATE INDEX IF NOT EXISTS stripe_events_email_idx      ON stripe_events (lower(customer_email)) WHERE customer_email IS NOT NULL;
