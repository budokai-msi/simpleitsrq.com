-- Migration 001 — Tamper-evident audit chain for security_events.
--
-- Run this ONCE in the Neon SQL editor (or via psql) on the production
-- database. After it runs, every new row inserted by logSecurityEvent()
-- in api/_lib/security.js gets chained: row_hash = SHA-256(prev_hash ||
-- row content). A tampered row breaks its own hash AND every subsequent
-- row, which /api/portal?action=audit-verify detects.
--
-- Safe to run on a live database — the new columns are nullable so
-- existing rows are untouched. New writes get chained; old rows are
-- simply "pre-chain" and auditVerify() skips them.

ALTER TABLE security_events
  ADD COLUMN IF NOT EXISTS prev_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS row_hash  CHAR(64);

-- Optional: index on row_hash so getLastRowHash() is O(1) rather than
-- a full table scan when the table grows past a few thousand rows.
CREATE INDEX IF NOT EXISTS idx_security_events_row_hash_id
  ON security_events (id DESC)
  WHERE row_hash IS NOT NULL;

-- Verification query — run this manually to spot-check the chain.
-- Should always return 0 rows; any result is evidence of tampering OR
-- a schema/code version mismatch:
--
--   WITH chain AS (
--     SELECT id,
--            row_hash,
--            prev_hash,
--            LAG(row_hash) OVER (ORDER BY id) AS expected_prev
--     FROM security_events
--     WHERE row_hash IS NOT NULL
--   )
--   SELECT id, prev_hash, expected_prev
--   FROM chain
--   WHERE prev_hash IS DISTINCT FROM COALESCE(expected_prev, 'GENESIS');
