// GET /api/health
//
// Lightweight health check for external uptime monitors (UptimeRobot,
// BetterStack, etc.). Returns JSON with DB connectivity, recent critical
// security events, and overall status. No auth required — the response
// contains no sensitive data, just boolean health signals.
//
// External monitors should alert when:
//   - HTTP status != 200
//   - body.ok != true
//   - body.db != "connected"

import { sql } from "./_lib/db.js";

export async function GET() {
  const checks = { db: "unknown", criticalEvents: 0, ok: false };

  try {
    const r = await sql`SELECT 1 AS ping`;
    checks.db = r.length > 0 ? "connected" : "no_response";
  } catch (err) {
    checks.db = "error";
    checks.dbError = String(err.message || err).slice(0, 200);
  }

  try {
    const r = await sql`
      SELECT COUNT(*)::int AS cnt
      FROM security_events
      WHERE severity = 'critical'
        AND ts > now() - interval '1 hour'
    `;
    checks.criticalEvents = r[0]?.cnt || 0;
  } catch {
    checks.criticalEvents = -1;
  }

  checks.ok = checks.db === "connected" && checks.criticalEvents === 0;

  const status = checks.ok ? 200 : 503;
  return new Response(JSON.stringify(checks), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
