// GET /api/health
//
// Public uptime endpoint for Vercel Cron / external monitors. This reports
// runtime availability, not security posture: active threats are included as
// telemetry, but they should not turn a healthy app into an uptime failure.

import { sql } from "./_lib/db.js";
import { json } from "./_lib/http.js";

export async function GET() {
  const startedAt = Date.now();
  const checks = {
    app: "ok",
    db: "unknown",
    criticalEventsLastHour: 0,
  };

  try {
    const r = await sql`SELECT 1 AS ping`;
    checks.db = r.length > 0 ? "connected" : "no_response";
  } catch (err) {
    console.error("[health] db ping failed", err);
    checks.db = "error";
  }

  try {
    const r = await sql`
      SELECT COUNT(*)::int AS cnt FROM security_events
      WHERE severity = 'critical' AND ts > now() - interval '1 hour'
    `;
    checks.criticalEventsLastHour = r[0]?.cnt || 0;
  } catch {
    checks.criticalEventsLastHour = -1;
  }

  const ok = checks.app === "ok" && checks.db === "connected";
  return json(ok ? 200 : 503, {
    ok,
    service: "simpleitsrq-web",
    checks,
    uptime: {
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    },
  });
}

// Some uptime services send HEAD for health probes. Mirror GET status
// while returning an empty body for compatibility.
export async function HEAD() {
  const response = await GET();
  return new Response(null, {
    status: response.status,
    headers: response.headers,
  });
}

// Compatibility handler for runtimes that invoke default exports for /api/*
// routes instead of Web Fetch named methods.
export default async function handler(req, res) {
  const method = (req.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  const response = method === "HEAD" ? await HEAD() : await GET();
  const body = method === "HEAD" ? "" : await response.text();
  res.status(response.status);
  for (const [key, value] of response.headers.entries()) {
    res.setHeader(key, value);
  }
  res.send(body);
}
