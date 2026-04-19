-- Migration 004 — Admin IP immunity.
--
-- Stores IPs that must NEVER be auto-blocked by the scanner-trap,
-- real-time-threat, or daily-cron auto-block paths. Populated by the
-- auth callback on every successful admin session (refreshed on each
-- auth, 7-day TTL). Prevents the lockout pattern where a stray
-- /wp-admin prefetch from the owner's browser auto-bans the owner.
--
-- Check: before any auto-block INSERT, verify the IP is not in this
-- table with expires_at > now(). The admin can still be manually
-- blocked from the portal (that path is intentional).
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS admin_ip_immunity (
  ip          text PRIMARY KEY,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  reason      text
);

CREATE INDEX IF NOT EXISTS admin_ip_immunity_expires_idx ON admin_ip_immunity (expires_at);
