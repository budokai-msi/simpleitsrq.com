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

const __dirname = dirname(fileURLToPath(import.meta.url));

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "DATABASE_URL not set. Run with `node --env-file=.env.local scripts/db/push.mjs` " +
      "or pull env vars with `vercel env pull .env.local --yes`."
  );
  process.exit(1);
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
