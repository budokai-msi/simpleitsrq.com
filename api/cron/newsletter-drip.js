// GET /api/cron/newsletter-drip
//
// Daily cron that finds confirmed newsletter subscribers in two
// drip-stage windows and sends them the next email in the sequence.
// Also catches up any subscriber whose welcome email failed to send
// when they confirmed (transient Resend / network errors).
//
// Stages:
//   welcome   — confirmed_at NOT NULL AND welcome_sent_at IS NULL
//               (catches up any confirm-time send that failed)
//   day3      — confirmed_at ≥ 3 days ago AND drip_day3_sent_at IS NULL
//               AND welcome_sent_at IS NOT NULL
//   day7      — confirmed_at ≥ 7 days ago AND drip_day7_sent_at IS NULL
//               AND drip_day3_sent_at IS NOT NULL
//
// Unsubscribed rows are excluded by partial indexes (see migration
// 009_newsletter_drip.sql). Each successful send updates its sent_at
// timestamp; failures stay retryable on the next run.
//
// Throughput: caps each stage at 200 sends per run to stay under
// Resend's free-tier per-second limits without spreading sends across
// hours. Schedule once a day in vercel.json — at 100/day signups this
// catches everyone within 24h of their eligibility window.

import { sql } from "../_lib/db.js";
import { timingSafeEqual } from "node:crypto";
import { sendWelcomeEmail, sendDripDay3Email, sendDripDay7Email } from "../contact.js";

const PER_STAGE_CAP = 200;

function verifyCron(request) {
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

// Per-stage marker — three discrete UPDATE statements rather than
// a dynamic column-name interpolation, because @neondatabase/serverless
// `sql` is parametrized and won't substitute identifiers safely.
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
    // Polite: 250ms gap between sends so Resend doesn't throttle us.
    await new Promise((r) => setTimeout(r, 250));
  }
  return { eligible: eligible.length, sent, failed };
}

export async function GET(request) {
  if (!verifyCron(request)) {
    return new Response("forbidden", { status: 403 });
  }

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

  return new Response(
    JSON.stringify({ ok: true, welcome, day3, day7, ts: new Date().toISOString() }),
    { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
  );
}
