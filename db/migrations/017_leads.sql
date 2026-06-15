-- Leads inbox: every human form submission (contact form, service
-- reservation, city-landing audit request) lands here with the full detail —
-- name, phone, message, the page/source it came from, and coarse geo — so the
-- owner has a real CRM inbox to work, not just an email that scrolls away.
--
-- newsletter_subscribers stays the email-marketing list; this is the
-- follow-up queue. Idempotent so `npm run db:push` can re-run safely.

CREATE TABLE IF NOT EXISTS leads (
  id          bigserial PRIMARY KEY,
  name        text,
  email       text,
  phone       text,
  message     text,
  source      text,                 -- contact | service-reserve:<slug> | local-landing-<city> | ...
  page        text,                 -- the path the form was submitted from
  ip          text,
  country     text,
  region      text,
  city        text,
  status      text NOT NULL DEFAULT 'new',   -- new | contacted | won | lost
  notes       text,                 -- internal follow-up notes
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leads_created_idx ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS leads_status_idx  ON leads (status, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_email_idx   ON leads (lower(email));
