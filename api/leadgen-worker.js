// api/leadgen-worker.js
//
// On-demand leadgen job-queue worker endpoint.
//
// Drains lead_crawl_jobs (osm_zip + website_emails) right now. It's called
// two ways:
//   1. Automatically by the enqueue handlers in api/_lib/portal/leadgen.js,
//      which fire a background request here (with CRON_SECRET) right after a
//      job is queued, so jobs start within seconds instead of waiting for a
//      cron tick.
//   2. Manually via a scheduled Vercel cron as a safety net for anything the
//      on-demand trigger missed (e.g. a job inserted outside the handlers).
//
// Guarded by the same rule as the agent cron: either Vercel's real cron
// header (x-vercel-cron: 1, unspoofable) or a valid CRON_SECRET bearer.
// This keeps the endpoint from being a public job-runner that anyone could
// hammer.
//
// The underlying runLeadgenWorker claims jobs with Postgres FOR UPDATE SKIP
// LOCKED, so concurrent invocations (this endpoint + the agent cron) never
// double-process a job.

import { json } from "./_lib/http.js";
import { timingSafeEqual } from "node:crypto";
import { runLeadgenWorker } from "./_lib/leadgen-worker.js";

function authorized(request) {
  if (request.headers.get("x-vercel-cron") === "1") return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  if (auth.length !== expected.length) return false;
  const a = Buffer.from(auth);
  const b = Buffer.from(expected);
  return timingSafeEqual(a, b);
}

export async function POST(request) {
  if (!authorized(request)) {
    return json(403, { ok: false, error: "forbidden" });
  }

  try {
    const summary = await runLeadgenWorker();
    return json(200, { ok: true, ...summary });
  } catch (err) {
    return json(500, { ok: false, error: "worker_failed", message: String(err?.message || err).slice(0, 200) });
  }
}

export default async function handler(req, res) {
  const method = (req.method || "POST").toUpperCase();
  if (method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  const headers = new Headers();
  if (req.headers?.["x-vercel-cron"]) headers.set("x-vercel-cron", "1");
  if (req.headers?.authorization) headers.set("authorization", req.headers.authorization);
  const request = new Request("https://simpleitsrq.com/api/leadgen-worker", { method: "POST", headers });
  const response = await POST(request);
  const payload = await response.text();
  res.status(response.status);
  for (const [key, value] of response.headers.entries()) res.setHeader(key, value);
  res.send(payload);
}
