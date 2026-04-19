-- Migration 002 — Fix audit chain schema (replaces CHAR(64) with VARCHAR(64)).
--
-- 001 stored prev_hash/row_hash as CHAR(64). Postgres pads CHAR(n) with
-- trailing spaces, so "GENESIS" was written as "GENESIS" + 57 spaces. That
-- made auditVerify() report spurious prev_hash mismatches, and the padded
-- prev_hash value fed into the next row's hash meant row_hash mismatches too.
--
-- Safe to re-run. ALTER COLUMN TYPE from VARCHAR(64) to VARCHAR(64) is a
-- no-op in Postgres — it's idempotent by design.

ALTER TABLE security_events
  ALTER COLUMN prev_hash TYPE varchar(64);

ALTER TABLE security_events
  ALTER COLUMN row_hash TYPE varchar(64);
