// scripts/leadgen-worker.mjs
//
// Local leadgen job-queue worker for the owner's machine.
//
// Runs the SAME runLeadgenWorker() that the Vercel cron calls, but as a
// long-lived process so queued ZIP-discovery and email-crawl jobs are drained
// within seconds of being enqueued (instead of waiting for the once-daily
// Vercel cron). The Postgres `FOR UPDATE SKIP LOCKED` claim means this local
// worker and the Vercel cron can run concurrently without double-processing.
//
// Usage:
//   node scripts/leadgen-worker.mjs            # one drain pass, then exit
//   node scripts/leadgen-worker.mjs --watch    # loop forever, draining every N ms
//   LEADGEN_MAX_JOBS_PER_RUN=50 node scripts/leadgen-worker.mjs --watch
//
// Requires DATABASE_URL (and any provider keys the crawl jobs need). Reads
// .env.local via node --env-file=.env.local, matching the repo's other scripts.
//
// SECURITY: this is pull-based. It opens NO network listener, exposes NO port,
// and only ever (a) reads/writes your own Neon DB and (b) makes the same
// bounded outbound web crawls the Vercel worker already makes. Secrets stay in
// .env.local and are never committed.

import { runLeadgenWorker } from "../api/_lib/leadgen-worker.js";

const args = new Set(process.argv.slice(2));
const WATCH = args.has("--watch");
const WATCH_INTERVAL_MS = Number(process.env.LEADGEN_WATCH_INTERVAL_MS) || 15_000;
const MAX_PASSES = args.has("--once") ? 1 : Number(process.env.LEADGEN_MAX_PASSES || 0);

async function drain() {
  const started = Date.now();
  try {
    const summary = await runLeadgenWorker();
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `[${new Date().toISOString()}] drained ${summary.picked} job(s) ` +
      `(${summary.completed} ok, ${summary.failed} failed) in ${elapsed}s` +
      (summary.budget_exhausted ? " — budget exhausted, more pending" : "") +
      (summary.failed ? ` — failed ids: ${summary.jobs.filter((j) => j.error).map((j) => j.id).join(",")}` : "")
    );
    return summary;
  } catch (err) {
    console.error(`[${new Date().toISOString()}] worker error: ${err?.message || err}`);
    return null;
  }
}

if (!WATCH) {
  await drain();
  process.exit(0);
}

console.log(`[${new Date().toISOString()}] leadgen worker watching every ${WATCH_INTERVAL_MS}ms`);
let passes = 0;
for (;;) {
  passes += 1;
  await drain();
  if (MAX_PASSES > 0 && passes >= MAX_PASSES) {
    console.log(`[${new Date().toISOString()}] reached max passes (${MAX_PASSES})`);
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, WATCH_INTERVAL_MS));
}
