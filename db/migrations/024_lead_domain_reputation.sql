CREATE TABLE IF NOT EXISTS lead_domain_reputation (
  id              bigserial PRIMARY KEY,
  domain          text NOT NULL UNIQUE,
  sent_count      int NOT NULL DEFAULT 0,
  bounce_count    int NOT NULL DEFAULT 0,
  open_count      int NOT NULL DEFAULT 0,
  click_count     int NOT NULL DEFAULT 0,
  reply_count     int NOT NULL DEFAULT 0,
  reputation      numeric(5,2) NOT NULL DEFAULT 100.00,
  status          text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','warn','paused')),
  last_sent_at    timestamptz,
  last_bounce_at  timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_domain_reputation_status_idx ON lead_domain_reputation (status);
