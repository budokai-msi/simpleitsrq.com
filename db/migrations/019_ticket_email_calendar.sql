-- 019_ticket_email_calendar.sql
--
-- Reply-by-email, CC recipients, and calendar appointments for tickets.
-- Idempotent — safe to re-run. Mirrors the canonical scripts/db/schema.sql.

-- CC recipients + outbound threading state on the ticket.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS cc_emails       text[] NOT NULL DEFAULT '{}';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS last_message_id text;

-- Reply-by-email plumbing on the message thread.
ALTER TABLE ticket_messages ADD COLUMN IF NOT EXISTS author_email text;
ALTER TABLE ticket_messages ADD COLUMN IF NOT EXISTS via          text NOT NULL DEFAULT 'portal'
  CHECK (via IN ('portal', 'email', 'system'));
ALTER TABLE ticket_messages ADD COLUMN IF NOT EXISTS message_id   text;
ALTER TABLE ticket_messages ADD COLUMN IF NOT EXISTS in_reply_to  text;

-- Inbound idempotency: a provider retry with the same Message-ID is a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS ticket_messages_message_id_idx
  ON ticket_messages (message_id) WHERE message_id IS NOT NULL;

-- Scheduled appointments attached to a ticket.
CREATE TABLE IF NOT EXISTS ticket_appointments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  uid          text NOT NULL UNIQUE,
  title        text NOT NULL,
  location     text,
  description  text,
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz NOT NULL,
  status       text NOT NULL DEFAULT 'confirmed'
               CHECK (status IN ('confirmed', 'tentative', 'cancelled')),
  sequence     integer NOT NULL DEFAULT 0,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_appointments_ticket_idx ON ticket_appointments (ticket_id, starts_at);
