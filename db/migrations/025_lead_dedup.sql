CREATE TABLE IF NOT EXISTS lead_duplicate_groups (
  id            bigserial PRIMARY KEY,
  canonical_id  bigint NOT NULL REFERENCES lead_businesses(id) ON DELETE CASCADE,
  duplicate_id  bigint NOT NULL REFERENCES lead_businesses(id) ON DELETE CASCADE,
  similarity    numeric(5,4) NOT NULL,
  matched_on    text NOT NULL,  -- 'phone' | 'website' | 'address'
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canonical_id, duplicate_id)
);
CREATE INDEX IF NOT EXISTS lead_duplicate_groups_canonical_idx ON lead_duplicate_groups (canonical_id);
CREATE INDEX IF NOT EXISTS lead_duplicate_groups_duplicate_idx ON lead_duplicate_groups (duplicate_id);
