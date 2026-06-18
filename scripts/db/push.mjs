// scripts/db/push.mjs
//
// Apply scripts/db/schema.sql to the Neon database pointed at by DATABASE_URL.
// Idempotent — safe to re-run after every edit to schema.sql.
//
// Usage:
//   node --env-file=.env.local scripts/db/push.mjs

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { neon } from "@neondatabase/serverless";
import { pickDatabaseUrl } from "../../api/_lib/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Vercel's Neon integration often leaves DATABASE_URL empty and populates the
// POSTGRES_* / *_UNPOOLED aliases instead, so resolve the same way the app
// does rather than reading DATABASE_URL alone.
const { key: urlKey, url } = pickDatabaseUrl();
if (!url) {
  console.error(
    "No database URL set. Run with `node --env-file=.env.local scripts/db/push.mjs` " +
      "or pull env vars with `vercel env pull .env.local --yes`. Checked DATABASE_URL, " +
      "POSTGRES_PRISMA_URL, POSTGRES_URL, DATABASE_URL_UNPOOLED, POSTGRES_URL_NON_POOLING, POSTGRES_URL_NO_SSL."
  );
  process.exit(1);
}
if (urlKey !== "DATABASE_URL") {
  console.log(`→ DATABASE_URL empty; using ${urlKey}`);
}

const sql = neon(url);

const schemaPath = resolve(__dirname, "schema.sql");
const raw = await readFile(schemaPath, "utf8");

// Strip line comments, then split on semicolons at end of statement.
// This works because schema.sql has no dollar-quoted function bodies.
const statements = raw
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n")
  .split(/;\s*(?:\n|$)/)
  .map((s) => s.trim())
  .filter(Boolean);

console.log(`→ Applying ${statements.length} statements to Neon...`);

let applied = 0;
for (const stmt of statements) {
  try {
    await sql.query(stmt);
    applied += 1;
  } catch (err) {
    console.error("\n✖ Failed statement:\n" + stmt + "\n");
    console.error(err);
    process.exit(1);
  }
}

console.log(`✓ Schema applied (${applied} statements).`);
