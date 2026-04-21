// api/_lib/db.js
//
// Single Neon client used by every Vercel Function. The @neondatabase/serverless
// `neon()` helper returns a tagged-template SQL function that runs over HTTP,
// so it works inside Fluid Compute without a connection pool.

import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url && process.env.NODE_ENV === "production") {
  console.error("[db] DATABASE_URL is not set in production");
}

/**
 * Tagged-template SQL client bound to `DATABASE_URL`.
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
