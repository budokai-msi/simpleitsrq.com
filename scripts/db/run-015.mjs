// One-off: apply db/migrations/015_opsec.sql via the Neon serverless driver.
// Run with:
//   node scripts/db/run-015.mjs
// DATABASE_URL must be set in the environment.
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!url) { console.error("Set DATABASE_URL"); process.exit(1); }
const sql = neon(url);

const file = path.resolve("db/migrations/015_opsec.sql");
const text = fs.readFileSync(file, "utf8");

const statements = text
  .split(/;\s*\n/)
  .map((s) => s.replace(/--[^\n]*/g, "").trim())
  .filter((s) => s.length > 0);

console.log(`Running ${statements.length} statements from ${file}`);
for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];
  const preview = stmt.replace(/\s+/g, " ").slice(0, 100);
  process.stdout.write(`[${i + 1}/${statements.length}] ${preview}... `);
  try {
    await sql.query(stmt);
    console.log("OK");
  } catch (err) {
    console.log("FAIL");
    console.error("  ->", err.message);
    process.exit(1);
  }
}
console.log("Migration 015 applied.");
