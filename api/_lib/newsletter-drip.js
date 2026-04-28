// Newsletter drip stages — pulled out of api/cron/newsletter-drip.js
// (which would have been the 13th deployed function under the Hobby
// plan's 12-function cap) so the daily agent cron can run drip sends
// alongside its other daily tasks.
//
// Stages:
//   welcome — confirmed_at NOT NULL AND welcome_sent_at IS NULL
//             (catches up any confirm-time send that failed)
//   day3    — confirmed_at ≥ 3 days ago AND drip_day3_sent_at IS NULL
//             AND welcome_sent_at IS NOT NULL
//   day7    — confirmed_at ≥ 7 days ago AND drip_day7_sent_at IS NULL
//             AND drip_day3_sent_at IS NOT NULL
//
// Each stage is capped at PER_STAGE_CAP per run to stay well under
// Resend's per-second limits without spreading sends across hours.

import { sql } from "./db.js";
import {
  sendWelcomeEmail,
  sendDripDay3Email,
  sendDripDay7Email,
} from "../contact.js";

const PER_STAGE_CAP = 200;

async function markSent(stage, id) {
  if (stage === "welcome") {
    return sql`UPDATE newsletter_subscribers SET welcome_sent_at = now() WHERE id = ${id}`;
  }
  if (stage === "day3") {
    return sql`UPDATE newsletter_subscribers SET drip_day3_sent_at = now() WHERE id = ${id}`;
  }
  return sql`UPDATE newsletter_subscribers SET drip_day7_sent_at = now() WHERE id = ${id}`;
}

async function processStage(label, eligible, sender) {
  let sent = 0;
  let failed = 0;
  for (const row of eligible) {
    const ok = await sender(row.email, row.unsubscribe_token);
    if (ok) {
      await markSent(label, row.id).catch((err) =>
        console.error(`[drip:${label}] mark-sent failed`, err),
      );
      sent++;
    } else {
      failed++;
    }
    // Polite gap so Resend doesn't throttle us.
    await new Promise((r) => setTimeout(r, 250));
  }
  return { eligible: eligible.length, sent, failed };
}

export async function runNewsletterDrip() {
  const welcomeRows = await sql`
    SELECT id, email, unsubscribe_token
    FROM newsletter_subscribers
    WHERE confirmed_at IS NOT NULL
      AND welcome_sent_at IS NULL
      AND unsubscribed_at IS NULL
    ORDER BY confirmed_at ASC
    LIMIT ${PER_STAGE_CAP}
  `.catch((err) => { console.error("[drip:welcome] query failed", err); return []; });

  const day3Rows = await sql`
    SELECT id, email, unsubscribe_token
    FROM newsletter_subscribers
    WHERE confirmed_at < now() - interval '3 days'
      AND welcome_sent_at IS NOT NULL
      AND drip_day3_sent_at IS NULL
      AND unsubscribed_at IS NULL
    ORDER BY confirmed_at ASC
    LIMIT ${PER_STAGE_CAP}
  `.catch((err) => { console.error("[drip:day3] query failed", err); return []; });

  const day7Rows = await sql`
    SELECT id, email, unsubscribe_token
    FROM newsletter_subscribers
    WHERE confirmed_at < now() - interval '7 days'
      AND drip_day3_sent_at IS NOT NULL
      AND drip_day7_sent_at IS NULL
      AND unsubscribed_at IS NULL
    ORDER BY confirmed_at ASC
    LIMIT ${PER_STAGE_CAP}
  `.catch((err) => { console.error("[drip:day7] query failed", err); return []; });

  const welcome = await processStage("welcome", welcomeRows, sendWelcomeEmail);
  const day3 = await processStage("day3", day3Rows, sendDripDay3Email);
  const day7 = await processStage("day7", day7Rows, sendDripDay7Email);

  return { welcome, day3, day7 };
}
