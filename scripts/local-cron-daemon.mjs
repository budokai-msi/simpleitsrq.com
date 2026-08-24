import 'dotenv/config';
import { generateLocalDraft } from './local-publisher.mjs';

// Daily cron daemon. Fires once per day at the configured hour (default 11:00).
// Uses the write→critique→revise pipeline in local-publisher.mjs.

const RUN_HOUR = Number(process.env.BLOG_CRON_HOUR || 11);
const RUN_MINUTE = Number(process.env.BLOG_CRON_MINUTE || 0);

console.log('===================================================');
console.log(' Simple IT SRQ — Local Blog Publisher Daemon');
console.log('===================================================');
console.log(`Fires daily at ${String(RUN_HOUR).padStart(2, '0')}:${String(RUN_MINUTE).padStart(2, '0')} local time.`);
console.log('Leave this window open (or install the scheduled task instead).');

let lastRunDay = null;

async function runOnce() {
  try {
    const result = await generateLocalDraft();
    console.log(`[cron] Run finished: ${JSON.stringify(result)}`);
  } catch (err) {
    console.error('[cron] Fatal execution error:', err);
  }
}

setInterval(() => {
  const now = new Date();
  if (now.getHours() === RUN_HOUR && now.getMinutes() === RUN_MINUTE && now.getDate() !== lastRunDay) {
    lastRunDay = now.getDate();
    runOnce();
  }
}, 60 * 1000);

// Support a manual one-shot: `node scripts/local-cron-daemon.mjs --once`
if (process.argv.includes('--once')) {
  console.log('[cron] --once flag: running immediately and exiting.');
  await runOnce();
  process.exit(0);
}
