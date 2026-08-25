import 'dotenv/config';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateLocalDraft } from './local-publisher.mjs';

// Daily cron daemon. Fires once per day at the configured hour (default 11:00).
// Uses the write→critique→revise pipeline in local-publisher.mjs.
//
// Exit codes (Windows Task Scheduler reads these):
//   0  — published a post (ok: true)
//   2  — no publishable story found (no_story)
//   3  — quality gate rejected (quality_gate)
//   4  — slug collision (slug_collision)
//   5  — GitHub publish failed (publish_failed)
//   1  — fatal/crash (anything else, or thrown error)
//   (only --once mode uses these; the looping daemon never exits on its own)
//
// The last-run heartbeat is written to .last-publish.json next to this file
// regardless of mode — so the looping daemon also produces a record you can
// alert on. .last-publish.json shape:
//   { ts: ISO8601, ok: bool, reason: string|null, slug: string|null,
//     slop: number|null, ms: number }

const RUN_HOUR = Number(process.env.BLOG_CRON_HOUR || 11);
const RUN_MINUTE = Number(process.env.BLOG_CRON_MINUTE || 0);

const __dirname = dirname(fileURLToPath(import.meta.url));
const HEARTBEAT = join(__dirname, '..', '.last-publish.json');

console.log('===================================================');
console.log(' Simple IT SRQ — Local Blog Publisher Daemon');
console.log('===================================================');
console.log(`Fires daily at ${String(RUN_HOUR).padStart(2, '0')}:${String(RUN_MINUTE).padStart(2, '0')} local time.`);
console.log(`Heartbeat file: ${HEARTBEAT}`);
console.log('Leave this window open (or install the scheduled task instead).');

// Map publisher reasons to Windows-friendly exit codes.
const REASON_EXIT = {
  no_story: 2,
  quality_gate: 3,
  slug_collision: 4,
  publish_failed: 5,
};

function writeHeartbeat(result, errorMsg) {
  const record = errorMsg
    ? { ts: new Date().toISOString(), ok: false, reason: 'fatal', error: errorMsg, slug: null, slop: null, ms: 0 }
    : {
        ts: new Date().toISOString(),
        ok: !!result?.ok,
        reason: result?.reason ?? null,
        slug: result?.slug ?? null,
        slop: result?.slop ?? null,
        ms: result?.ms ?? null,
      };
  try {
    writeFileSync(HEARTBEAT, JSON.stringify(record, null, 2) + '\n');
  } catch (err) {
    console.error('[cron] Could not write heartbeat:', err.message);
  }
  return record;
}

async function runOnce() {
  const t0 = Date.now();
  try {
    const result = await generateLocalDraft();
    result.ms = Date.now() - t0;
    const record = writeHeartbeat(result);
    console.log(`[cron] Run finished in ${result.ms}ms: ${JSON.stringify(result)}`);
    return { result, exitCode: record.ok ? 0 : (REASON_EXIT[record.reason] || 1) };
  } catch (err) {
    console.error('[cron] Fatal execution error:', err);
    writeHeartbeat(null, err?.message || String(err));
    return { result: { ok: false, reason: 'fatal' }, exitCode: 1 };
  }
}

let lastRunDay = null;

setInterval(() => {
  const now = new Date();
  if (now.getHours() === RUN_HOUR && now.getMinutes() === RUN_MINUTE && now.getDate() !== lastRunDay) {
    lastRunDay = now.getDate();
    runOnce().catch((err) => console.error('[cron] tick error:', err));
  }
}, 60 * 1000);

// Support a manual one-shot: `node scripts/local-cron-daemon.mjs --once`
// Exit code reflects what actually happened — Task Scheduler can now alert
// on a non-zero result that wasn't a crash.
if (process.argv.includes('--once')) {
  console.log('[cron] --once flag: running immediately and exiting.');
  const { result, exitCode } = await runOnce();
  if (result.ok) {
    console.log(`[cron] ✓ Published: ${result.slug}`);
    process.exit(0);
  }
  console.log(`[cron] ✗ No publish. reason=${result.reason}${result.slop != null ? ` slop=${result.slop}` : ''} (exit ${exitCode})`);
  process.exit(exitCode);
}
