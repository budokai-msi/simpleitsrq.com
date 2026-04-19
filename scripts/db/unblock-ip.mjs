// One-shot: remove an IP (and known lockout cruft) from ip_blocklist +
// auth_throttle so the owner can sign back in after a scanner trap fired.
//
// Usage:  node --env-file=.env.local scripts/db/unblock-ip.mjs <ip>
//         node --env-file=.env.local scripts/db/unblock-ip.mjs 47.195.81.127
//
// Safe to re-run; all deletes are scoped to the provided IP.

import { neon } from "@neondatabase/serverless";

const ip = process.argv[2];
if (!ip) {
  console.error("usage: node scripts/db/unblock-ip.mjs <ip>");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set (run with --env-file=.env.local)");
  process.exit(1);
}

const sql = neon(url);

const removedBlock = await sql`
  DELETE FROM ip_blocklist WHERE ip = ${ip} RETURNING ip, reason, created_at
`;

const resetThrottle = await sql`
  DELETE FROM auth_throttle WHERE ip = ${ip} RETURNING bucket, count
`;

console.log(JSON.stringify({
  ip,
  blocklist: { removed: removedBlock.length, rows: removedBlock },
  throttle:  { reset:   resetThrottle.length, rows: resetThrottle },
}, null, 2));
