// scripts/db/make-admin.mjs
//
// Usage:
//   node --env-file=.env.local scripts/db/make-admin.mjs you@example.com
//
// Flips is_admin = true on the user row matching the given email. If the row
// doesn't exist yet (they haven't signed in for the first time), we insert a
// stub so the flag is ready the moment they do.

import { neon } from "@neondatabase/serverless";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node --env-file=.env.local scripts/db/make-admin.mjs <email>");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set. Pull with: vercel env pull .env.local --yes");
  process.exit(1);
}
const sql = neon(url);

const existing = await sql`SELECT id, email, is_admin FROM users WHERE lower(email) = lower(${email})`;
if (existing.length > 0) {
  await sql`UPDATE users SET is_admin = true, updated_at = now() WHERE id = ${existing[0].id}`;
  console.log(`✓ ${existing[0].email} is now admin (existing user)`);
} else {
  const rows = await sql`
    INSERT INTO users (email, is_admin) VALUES (${email}, true) RETURNING id, email
  `;
  console.log(`✓ ${rows[0].email} created as admin (stub — sign in to finish)`);
}
