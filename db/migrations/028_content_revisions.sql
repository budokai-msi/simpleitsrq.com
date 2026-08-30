CREATE TABLE IF NOT EXISTS content_revisions (
  id          bigserial PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('content','design_token')),
  ref_key     text NOT NULL,          -- the page.key for content, or the token for design_token
  old_value   text,
  new_value   text NOT NULL,
  editor_note text,
  created_by  text,                    -- admin email
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_revisions_kind_idx   ON content_revisions (kind, ref_key);
CREATE INDEX IF NOT EXISTS content_revisions_created_idx ON content_revisions (created_at DESC);
