-- 022_affiliate_dashboard.sql
-- Affiliate Dashboard: trends, products, clicks, commissions, networks
-- Run after 018_user_plans.sql

-- trends_daily: aggregated daily trend snapshots
CREATE TABLE trends_daily (
  id              bigserial PRIMARY KEY,
  date            date NOT NULL,
  source          text NOT NULL,           -- 'google_trends', 'wikipedia', 'reddit', 'hackernews', 'producthunt'
  keyword         text NOT NULL,
  score           numeric NOT NULL,        -- normalized 0-100
  volume          bigint,                  -- search volume if available
  url             text,                    -- source URL
  metadata        jsonb DEFAULT '{}',      -- raw API response subset
  created_at      timestamptz DEFAULT now(),
  UNIQUE (date, source, keyword)
);

CREATE INDEX trends_daily_date_idx ON trends_daily (date DESC);
CREATE INDEX trends_daily_keyword_idx ON trends_daily (keyword);
CREATE INDEX trends_daily_source_idx ON trends_daily (source);

-- search_terms: tracked keywords with affiliate intent
CREATE TABLE search_terms (
  id              bigserial PRIMARY KEY,
  term            text NOT NULL UNIQUE,
  intent          text CHECK (intent IN ('informational', 'commercial', 'transactional', 'navigational')),
  category        text,                    -- 'tech', 'health', 'finance', etc.
  difficulty      numeric,                 -- 0-100 SEO difficulty
  cpc             numeric,                 -- estimated cost per click
  volume_monthly  bigint,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX search_terms_intent_idx ON search_terms (intent);
CREATE INDEX search_terms_category_idx ON search_terms (category);

-- affiliate_networks: configured affiliate platforms
CREATE TABLE affiliate_networks (
  id              bigserial PRIMARY KEY,
  code            text NOT NULL UNIQUE,    -- 'amazon', 'ebay', 'shareasale', 'cj', 'impact', 'awin', 'rakuten', 'aliexpress'
  name            text NOT NULL,
  api_base_url    text,
  auth_type       text NOT NULL,           -- 'oauth2', 'api_key', 'signature', 'feed'
  rate_limit_rpm  int DEFAULT 60,
  is_active       boolean DEFAULT true,
  config          jsonb DEFAULT '{}',      -- client_id, secrets refs, feed URLs
  created_at      timestamptz DEFAULT now()
);

-- affiliate_products: normalized product catalog
CREATE TABLE affiliate_products (
  id                  bigserial PRIMARY KEY,
  network_id          bigint NOT NULL REFERENCES affiliate_networks(id),
  external_id         text NOT NULL,       -- network's product ID
  title               text NOT NULL,
  description         text,
  brand               text,
  category            text,
  price_cents         int,                 -- current price in cents
  currency            char(3) DEFAULT 'USD',
  image_url           text,
  product_url         text NOT NULL,       -- affiliate link (with tracking)
  commission_rate     numeric,             -- percentage or fixed
  commission_type     text CHECK (commission_type IN ('percent', 'fixed')),
  epc                 numeric,             -- earnings per click (network reported)
  conversion_rate     numeric,             -- network reported
  gravity             numeric,             -- popularity score (ClickBank style)
  raw_data            jsonb DEFAULT '{}',  -- full API response
  last_synced_at      timestamptz DEFAULT now(),
  created_at          timestamptz DEFAULT now(),
  UNIQUE (network_id, external_id)
);

CREATE INDEX affiliate_products_network_idx ON affiliate_products (network_id);
CREATE INDEX affiliate_products_category_idx ON affiliate_products (category);
CREATE INDEX affiliate_products_price_idx ON affiliate_products (price_cents);
CREATE INDEX affiliate_products_last_synced_idx ON affiliate_products (last_synced_at DESC);

-- affiliate_clicks: click tracking is owned by 005_affiliate_clicks.sql.
-- That table already exists with schema (id, ts, slug, destination, label,
-- network, ip, country, anon_id, user_id, referrer_path) and is what the
-- site's click-tracking code writes to today. Do NOT re-create it here with
-- a different schema — the portal handlers query the 005 columns directly.

-- affiliate_conversions: post-click conversions
CREATE TABLE affiliate_conversions (
  id                  bigserial PRIMARY KEY,
  click_id            bigint NOT NULL REFERENCES affiliate_clicks(id) ON DELETE CASCADE,
  product_id          bigint REFERENCES affiliate_products(id) ON DELETE SET NULL,
  network_code        text NOT NULL,
  order_id            text,                -- network's order ID
  commission_cents    int NOT NULL,        -- earned commission
  currency            char(3) DEFAULT 'USD',
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'reversed', 'paid')),
  converted_at        timestamptz DEFAULT now(),
  reported_at         timestamptz,         -- when network reported it
  raw_data            jsonb DEFAULT '{}'
);

CREATE INDEX affiliate_conversions_click_idx ON affiliate_conversions (click_id);
CREATE INDEX affiliate_conversions_date_idx ON affiliate_conversions (converted_at DESC);
CREATE INDEX affiliate_conversions_status_idx ON affiliate_conversions (status);
CREATE INDEX affiliate_conversions_network_idx ON affiliate_conversions (network_code);

-- affiliate_sync_log: audit trail for data ingestion
CREATE TABLE affiliate_sync_log (
  id              bigserial PRIMARY KEY,
  network_id      bigint NOT NULL REFERENCES affiliate_networks(id),
  sync_type       text NOT NULL,           -- 'full', 'incremental', 'feed', 'api'
  status          text NOT NULL CHECK (status IN ('started', 'completed', 'failed', 'partial')),
  records_fetched int DEFAULT 0,
  records_upserted int DEFAULT 0,
  records_failed  int DEFAULT 0,
  error_message   text,
  started_at      timestamptz DEFAULT now(),
  completed_at    timestamptz
);

CREATE INDEX affiliate_sync_log_network_idx ON affiliate_sync_log (network_id);
CREATE INDEX affiliate_sync_log_date_idx ON affiliate_sync_log (started_at DESC);

-- trend_product_mapping: links trends to relevant affiliate products
CREATE TABLE trend_product_mapping (
  id                  bigserial PRIMARY KEY,
  trend_date          date NOT NULL,
  trend_keyword       text NOT NULL,
  product_id          bigint NOT NULL REFERENCES affiliate_products(id) ON DELETE CASCADE,
  relevance_score     numeric DEFAULT 1.0, -- 0-1 semantic relevance
  created_at          timestamptz DEFAULT now(),
  UNIQUE (trend_date, trend_keyword, product_id)
);

CREATE INDEX trend_product_mapping_date_idx ON trend_product_mapping (trend_date DESC);
CREATE INDEX trend_product_mapping_keyword_idx ON trend_product_mapping (trend_keyword);

-- Seed initial affiliate networks
INSERT INTO affiliate_networks (code, name, api_base_url, auth_type, rate_limit_rpm, config) VALUES
  ('amazon', 'Amazon Associates', 'https://webservices.amazon.com/paapi5', 'signature', 10, '{"region": "us-east-1", "host": "webservices.amazon.com"}'::jsonb),
  ('ebay', 'eBay Partner Network', 'https://api.ebay.com/buy/browse/v1', 'oauth2', 60, '{}'::jsonb),
  ('shareasale', 'ShareASale', 'https://api.shareasale.com', 'api_key', 30, '{}'::jsonb),
  ('cj', 'CJ Affiliate', 'https://commission-detail.api.cj.com', 'oauth2', 60, '{}'::jsonb),
  ('impact', 'Impact Radius', 'https://api.impact.com', 'oauth2', 60, '{}'::jsonb),
  ('awin', 'Awin', 'https://api.awin.com', 'oauth2', 60, '{}'::jsonb),
  ('rakuten', 'Rakuten Advertising', 'https://api.linksynergy.com', 'api_key', 30, '{}'::jsonb),
  ('aliexpress', 'AliExpress Affiliate', 'https://api.aliexpress.com', 'signature', 30, '{}'::jsonb)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  api_base_url = EXCLUDED.api_base_url,
  auth_type = EXCLUDED.auth_type,
  rate_limit_rpm = EXCLUDED.rate_limit_rpm,
  config = EXCLUDED.config;

-- RLS policies (if using Supabase/Postgres RLS)
ALTER TABLE trends_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_networks ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE trend_product_mapping ENABLE ROW LEVEL SECURITY;

-- Admin full access policies
CREATE POLICY "admin_full_trends_daily" ON trends_daily FOR ALL TO authenticated USING (auth.uid() IN (SELECT id FROM users WHERE is_admin));
CREATE POLICY "admin_full_search_terms" ON search_terms FOR ALL TO authenticated USING (auth.uid() IN (SELECT id FROM users WHERE is_admin));
CREATE POLICY "admin_full_affiliate_networks" ON affiliate_networks FOR ALL TO authenticated USING (auth.uid() IN (SELECT id FROM users WHERE is_admin));
CREATE POLICY "admin_full_affiliate_products" ON affiliate_products FOR ALL TO authenticated USING (auth.uid() IN (SELECT id FROM users WHERE is_admin));
CREATE POLICY "admin_full_affiliate_clicks" ON affiliate_clicks FOR ALL TO authenticated USING (auth.uid() IN (SELECT id FROM users WHERE is_admin));
CREATE POLICY "admin_full_affiliate_conversions" ON affiliate_conversions FOR ALL TO authenticated USING (auth.uid() IN (SELECT id FROM users WHERE is_admin));
CREATE POLICY "admin_full_affiliate_sync_log" ON affiliate_sync_log FOR ALL TO authenticated USING (auth.uid() IN (SELECT id FROM users WHERE is_admin));
CREATE POLICY "admin_full_trend_product_mapping" ON trend_product_mapping FOR ALL TO authenticated USING (auth.uid() IN (SELECT id FROM users WHERE is_admin));

-- Public read for trends/products (for frontend via API)
CREATE POLICY "public_read_trends_daily" ON trends_daily FOR SELECT TO anon USING (true);
CREATE POLICY "public_read_affiliate_products" ON affiliate_products FOR SELECT TO anon USING (true);
CREATE POLICY "public_read_affiliate_networks" ON affiliate_networks FOR SELECT TO anon USING (is_active = true);