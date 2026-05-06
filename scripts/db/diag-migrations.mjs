// Run each step of handleRunAuditMigration directly against the live DB
// and report which one(s) fail. Loads .env.diag (pulled from Vercel prod
// via `vercel env pull .env.diag --environment=production`).
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const envText = readFileSync(".env.diag", "utf8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(?:"([^"]*)"|(.*))$/);
  if (m) process.env[m[1]] = m[2] ?? m[3];
}

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error("no DATABASE_URL in .env.diag");
  process.exit(1);
}
const sql = neon(url);

async function step(label, fn) {
  try {
    await fn();
    console.log("OK  ", label);
  } catch (e) {
    console.log("FAIL", label, "::", String(e.message || e));
  }
}

// Migration 001 — audit chain columns.
await step("add prev_hash column", () =>
  sql`ALTER TABLE security_events ADD COLUMN IF NOT EXISTS prev_hash text`);
await step("add row_hash column", () =>
  sql`ALTER TABLE security_events ADD COLUMN IF NOT EXISTS row_hash text`);

// Migration 002 — fix CHAR padding by switching to varchar(64).
await step("alter prev_hash to varchar(64)", () =>
  sql`ALTER TABLE security_events ALTER COLUMN prev_hash TYPE varchar(64)`);
await step("alter row_hash to varchar(64)", () =>
  sql`ALTER TABLE security_events ALTER COLUMN row_hash TYPE varchar(64)`);

// Migration 004 — admin IP immunity.
await step("create admin_ip_immunity table", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS admin_ip_immunity (
      ip text PRIMARY KEY,
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      granted_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      reason text
    )`;
  await sql`CREATE INDEX IF NOT EXISTS admin_ip_immunity_expires_idx ON admin_ip_immunity (expires_at)`;
});

// Migration 003 — threat_feeds.
await step("create threat_feeds table", () =>
  sql`
    CREATE TABLE IF NOT EXISTS threat_feeds (
      id bigserial PRIMARY KEY,
      feed_name text NOT NULL,
      source_url text NOT NULL,
      cidr cidr NOT NULL,
      category text,
      note text,
      fetched_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (feed_name, cidr)
    )`);
await step("threat_feeds indexes", async () => {
  await sql`CREATE INDEX IF NOT EXISTS threat_feeds_feed_idx ON threat_feeds (feed_name)`;
  await sql`CREATE INDEX IF NOT EXISTS threat_feeds_fetched_idx ON threat_feeds (fetched_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS threat_feeds_cidr_idx ON threat_feeds (cidr)`;
});

// Migration 006 — newsletter_subscribers.
await step("create newsletter_subscribers", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id bigserial PRIMARY KEY,
      email text NOT NULL,
      confirm_token text NOT NULL UNIQUE,
      unsubscribe_token text NOT NULL UNIQUE,
      source text,
      ip text,
      created_at timestamptz NOT NULL DEFAULT now(),
      confirmed_at timestamptz,
      unsubscribed_at timestamptz,
      UNIQUE (email)
    )`;
  await sql`CREATE INDEX IF NOT EXISTS newsletter_confirmed_idx ON newsletter_subscribers (confirmed_at) WHERE confirmed_at IS NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS newsletter_email_idx ON newsletter_subscribers (lower(email))`;
});

// Migration 007 — testimonials.
await step("create testimonials", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS testimonials (
      id bigserial PRIMARY KEY,
      quote text NOT NULL,
      author_name text NOT NULL,
      author_role text,
      author_company text,
      city text,
      product_slug text,
      rating int CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
      approved boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS testimonials_approved_idx ON testimonials (approved, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS testimonials_product_idx ON testimonials (product_slug) WHERE product_slug IS NOT NULL`;
});

// Migration 005 — affiliate_clicks.
await step("create affiliate_clicks", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS affiliate_clicks (
      id bigserial PRIMARY KEY,
      ts timestamptz NOT NULL DEFAULT now(),
      slug text,
      destination text NOT NULL,
      label text,
      network text,
      ip text,
      country text,
      anon_id text,
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      referrer_path text
    )`;
  await sql`CREATE INDEX IF NOT EXISTS affiliate_clicks_ts_idx ON affiliate_clicks (ts DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS affiliate_clicks_slug_idx ON affiliate_clicks (slug, ts DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS affiliate_clicks_network_idx ON affiliate_clicks (network)`;
});

console.log("\n--- existing column types ---");
const cols = await sql`
  SELECT column_name, data_type, character_maximum_length
  FROM information_schema.columns
  WHERE table_name = 'security_events' AND column_name IN ('prev_hash','row_hash')
`;
console.log(cols);
