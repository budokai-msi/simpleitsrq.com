CREATE TABLE IF NOT EXISTS design_token_overrides (
  id          bigserial PRIMARY KEY,
  token       text NOT NULL UNIQUE,   -- e.g. '--brand', '--r-lg', '--space-4'
  value       text NOT NULL DEFAULT '',
  theme       text NOT NULL DEFAULT 'both' CHECK (theme IN ('both','light','dark')),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS design_token_overrides_theme_idx ON design_token_overrides (theme);
