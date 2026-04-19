-- Migration 003 — OSINT threat-feed cache.
--
-- Stores CIDRs / IPs pulled from public threat feeds (Spamhaus DROP/EDROP,
-- Emerging Threats compromised-ips) so every admin query can match visiting
-- IPs against the feeds without a network round-trip. Refreshed once a day
-- by the /api/cron/report handler.
--
-- cidr column is Postgres' native cidr type, so a single row can represent
-- either an individual IP ("203.0.113.5/32") or a full netblock. Match with
-- `WHERE ${ip}::inet <<= cidr`.
--
-- Safe to re-run — every statement is IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS threat_feeds (
  id         bigserial PRIMARY KEY,
  feed_name  text NOT NULL,
  source_url text NOT NULL,
  cidr       cidr NOT NULL,
  category   text,
  note       text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feed_name, cidr)
);

CREATE INDEX IF NOT EXISTS threat_feeds_feed_idx     ON threat_feeds (feed_name);
CREATE INDEX IF NOT EXISTS threat_feeds_fetched_idx  ON threat_feeds (fetched_at DESC);
CREATE INDEX IF NOT EXISTS threat_feeds_cidr_idx     ON threat_feeds (cidr);
