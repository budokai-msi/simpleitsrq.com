// GET /api/health
//
// Public uptime endpoint for Vercel Cron / external monitors. This reports
// runtime availability, not security posture: active threats are included as
// telemetry, but they should not turn a healthy app into an uptime failure.

import { sql } from "./_lib/db.js";
import { json } from "./_lib/http.js";

const HEALTH_QUERY_TIMEOUT_MS = 900;

function withTimeout(promise, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label}_timeout`)), HEALTH_QUERY_TIMEOUT_MS);
    }),
  ]);
}

export async function GET() {
  const startedAt = Date.now();
  const checks = {
    app: "ok",
    db: "unknown",
    criticalEventsLastHour: 0,
  };

  try {
    const r = await withTimeout(sql`SELECT 1 AS ping`, "db_ping");
    checks.db = r.length > 0 ? "connected" : "no_response";
  } catch (err) {
    console.error("[health] db ping failed", err);
    checks.db = err?.message === "db_ping_timeout" ? "timeout" : "error";
  }

  try {
    const r = await withTimeout(sql`
      SELECT COUNT(*)::int AS cnt FROM security_events
      WHERE severity = 'critical' AND ts > now() - interval '1 hour'
    `, "critical_events");
    checks.criticalEventsLastHour = r[0]?.cnt || 0;
  } catch (err) {
    if (err?.message !== "critical_events_timeout") {
      console.error("[health] security event count failed", err);
    }
    checks.criticalEventsLastHour = -1;
  }

  const healthy = checks.app === "ok" && checks.db === "connected";
  return json(200, {
    ok: true,
    status: healthy ? "ok" : "degraded",
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
