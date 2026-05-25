// api/_lib/db.js
//
// Single Neon client used by every Vercel Function. The @neondatabase/serverless
// `neon()` helper returns a tagged-template SQL function that runs over HTTP,
// so it works inside Fluid Compute without a connection pool.

import { neon } from "@neondatabase/serverless";

const DB_URL_KEYS = [
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_URL_NO_SSL",
];

export function pickDatabaseUrl(env = process.env) {
  for (const key of DB_URL_KEYS) {
    const value = String(env[key] || "").trim();
    if (value) return { key, url: value };
  }
  return { key: null, url: "" };
}

const { key: urlKey, url } = pickDatabaseUrl();
if (!url && process.env.NODE_ENV === "production") {
  console.error(`[db] no database URL is set in production; checked ${DB_URL_KEYS.join(", ")}`);
} else if (url && process.env.NODE_ENV === "production" && urlKey !== "DATABASE_URL") {
  console.warn(`[db] DATABASE_URL is empty; using ${urlKey}`);
}

/**
 * Tagged-template SQL client bound to the first configured Neon/Postgres URL.
 *
 * Usage: ``sql`SELECT * FROM users WHERE id = ${id}` `` — parameters are
 * passed safely, never interpolated. Returns a Promise of the row array.
 *
 * Falls back to a placeholder URL in dev / preview so imports don't crash
 * when `DATABASE_URL` is absent; every query would still fail at call time.
 *
 * @type {ReturnType<typeof neon>}
 */
export const sql = neon(url || "postgres://placeholder@localhost/placeholder");
