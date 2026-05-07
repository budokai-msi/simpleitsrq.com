// One-off: fetch a writable Neon connection URI via the Neon API and apply
// db/migrations/016_stripe_events.sql. Avoids needing a long-lived password
// in .env.local — the API key gives us a short-lived URI on demand.
//
// Required env: NEON_API_KEY, NEON_PROJECT_ID
// Run with:    node scripts/db/run-016.mjs
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";

const apiKey = process.env.NEON_API_KEY;
const projectId = process.env.NEON_PROJECT_ID;
if (!apiKey || !projectId) {
  console.error("Set NEON_API_KEY and NEON_PROJECT_ID");
  process.exit(1);
}

// 1. Discover the default branch + role + database from the project.
const projRes = await fetch(`https://console.neon.tech/api/v2/projects/${projectId}`, {
  headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
});
if (!projRes.ok) {
  console.error("project fetch failed:", projRes.status, await projRes.text());
  process.exit(1);
}
const proj = await projRes.json();
const branchesRes = await fetch(`https://console.neon.tech/api/v2/projects/${projectId}/branches`, {
  headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
});
const branches = (await branchesRes.json()).branches || [];
const primary = branches.find((b) => b.primary || b.default) || branches[0];
const dbsRes = await fetch(
  `https://console.neon.tech/api/v2/projects/${projectId}/branches/${primary.id}/databases`,
  { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } }
);
const dbs = (await dbsRes.json()).databases || [];
const database = dbs[0];
console.log(`project=${proj.project.name} branch=${primary.name} db=${database.name} role=${database.owner_name}`);

// 2. Ask Neon for a connection URI bound to that role/database.
const uriRes = await fetch(
  `https://console.neon.tech/api/v2/projects/${projectId}/connection_uri?database_name=${encodeURIComponent(
    database.name
  )}&role_name=${encodeURIComponent(database.owner_name)}&pooled=false`,
  { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } }
);
if (!uriRes.ok) {
  console.error("connection_uri failed:", uriRes.status, await uriRes.text());
  process.exit(1);
}
const { uri } = await uriRes.json();
if (!uri) { console.error("no uri returned"); process.exit(1); }

// 3. Run the migration.
const sql = neon(uri);
const file = path.resolve("db/migrations/016_stripe_events.sql");
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

const r = await sql`SELECT COUNT(*)::int AS n FROM stripe_events`;
console.log(`Migration 016 applied. stripe_events row count: ${r[0].n}`);
