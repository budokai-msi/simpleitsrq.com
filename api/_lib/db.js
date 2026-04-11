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

export const sql = neon(url || "postgres://placeholder@localhost/placeholder");
