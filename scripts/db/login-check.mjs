// Diagnostic: is the caller's IP + OAuth setup healthy for portal login?
// Usage: node --env-file=.env.local scripts/db/login-check.mjs <ip>

import { neon } from "@neondatabase/serverless";

const ip = process.argv[2];
if (!ip) { console.error("usage: login-check.mjs <ip>"); process.exit(1); }

const sql = neon(process.env.DATABASE_URL);

const [blocked, immune, admin, tables, recentLogins] = await Promise.all([
  sql`SELECT ip, reason, created_at FROM ip_blocklist WHERE ip = ${ip}`,
  sql`SELECT ip, user_id, granted_at, expires_at, reason FROM admin_ip_immunity WHERE ip = ${ip}`
    .catch(() => [{ err: "table missing — migration 004 not run" }]),
  sql`SELECT id, email, is_admin, created_at FROM users WHERE is_admin = true`,
  sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_name IN ('admin_ip_immunity', 'threat_feeds', 'affiliate_clicks', 'security_events', 'ip_blocklist')
    ORDER BY table_name
  `,
  sql`
    SELECT kind, ip, user_id, detail, ts
    FROM security_events
    WHERE kind LIKE 'auth.%'
      AND ts > now() - interval '2 hours'
    ORDER BY ts DESC LIMIT 20
  `,
]);

console.log(JSON.stringify({
  ip,
  blocked: blocked[0] || null,
  immune: immune[0] || null,
  admins: admin.map((u) => ({ email: u.email, is_admin: u.is_admin, created: u.created_at })),
  installedTables: tables.map((t) => t.table_name),
  recentAuthEvents: recentLogins.map((e) => ({ kind: e.kind, ip: e.ip, ts: e.ts, detail: e.detail })),
}, null, 2));
