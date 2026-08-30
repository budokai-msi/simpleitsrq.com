CREATE TABLE IF NOT EXISTS content_overrides (
  id          bigserial PRIMARY KEY,
  page        text NOT NULL,          -- e.g. 'home', 'services', 'book', 'support', 'leadgen'
  key         text NOT NULL,           -- e.g. 'hero_title', 'cta_button'
  value       text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page, key)
);
CREATE INDEX IF NOT EXISTS content_overrides_page_idx ON content_overrides (page);
