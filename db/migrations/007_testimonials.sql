-- Migration 007 — Testimonials.
--
-- Intentionally starts empty. No seed data, no fabricated quotes. The
-- Store page only renders the "What clients say" section when this
-- table has approved rows.
--
-- Admin adds rows via the portal Ops Console → Testimonials form.
-- Every row is unapproved by default so a typo or half-written quote
-- never goes public by accident.

CREATE TABLE IF NOT EXISTS testimonials (
  id             bigserial PRIMARY KEY,
  quote          text NOT NULL,
  author_name    text NOT NULL,
  author_role    text,
  author_company text,
  city           text,
  product_slug   text,
  rating         int CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  approved       boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS testimonials_approved_idx    ON testimonials (approved, created_at DESC);
CREATE INDEX IF NOT EXISTS testimonials_product_idx     ON testimonials (product_slug) WHERE product_slug IS NOT NULL;
