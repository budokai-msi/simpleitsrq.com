// GET /api/cron/agent
//
// Autonomous AI agent that runs on a schedule:
//   - Every 15 min: auto counter-measures (block repeat attackers, alert on critical events)
//   - Daily at 06:00 ET: generate a blog post draft
//   - Daily at 06:30 ET: security pattern analysis
//
// The cron schedule in vercel.json fires every 15 min. The agent checks
// what tasks are due based on the current time.

import { sql } from "../_lib/db.js";
import { Resend } from "resend";
import { timingSafeEqual } from "node:crypto";
import { validateEnv } from "../_lib/env.js";
import { runNewsletterDrip } from "../_lib/newsletter-drip.js";
import { discoverBusinessesByZip } from "../_lib/leadgen-osm.js";
import { crawlEmails } from "../_lib/leadgen-emailcrawler.js";

// Cold-start validation. Both keys are validated as 'optional' rather than
// 'required': the per-task code below already returns { skipped } when a
// key is missing, and a strict gate here used to crash the entire cron at
// import time the moment either secret was rotated — silently killing
// auto-block, threat-feed ingest, security analysis, AND blog drafts. The
// 'optional' mode still logs a warning at boot for diagnosability.
validateEnv({
  ANTHROPIC_API_KEY: "optional",
  RESEND_API_KEY: "optional",
});

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const REPORT_TO = process.env.CONTACT_TO_EMAIL || "hello@simpleitsrq.com";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
// Env-overridable model so a deprecated snapshot id (Anthropic rotates them
// every few months) can be fixed via Vercel env without a redeploy.
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
const FROM = "Simple IT SRQ Agent <agent@simpleitsrq.com>";

function verifyCron(request) {
  // Vercel sets x-vercel-cron: 1 on genuine cron invocations — this header
  // cannot be spoofed from outside the Vercel edge. Accept either that or a
  // valid CRON_SECRET bearer (for manual triggers). Fail closed if neither.
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

// ========== AUTO COUNTER-MEASURES (every 15 min) ==========

async function autoCounter() {
  const actions = [];

  // 1. Auto-block IPs with 5+ threat actor hits in 24h. Skip any IP in
  // admin_ip_immunity — otherwise the owner's own browser can get the
  // owner banned by prefetching a scanner trap.
  const repeatThreats = await sql`
    SELECT ip, COUNT(*)::int AS hits
    FROM threat_actors
    WHERE ts > now() - interval '24 hours'
    GROUP BY ip
    HAVING COUNT(*) >= 5
  `;
  for (const row of repeatThreats) {
    const existing = await sql`SELECT 1 FROM ip_blocklist WHERE ip = ${row.ip}`;
    const immune = await sql`SELECT 1 FROM admin_ip_immunity WHERE ip = ${row.ip} AND expires_at > now() LIMIT 1`.catch(() => []);
    if (existing.length === 0 && immune.length === 0) {
      await sql`INSERT INTO ip_blocklist (ip, reason) VALUES (${row.ip}, ${`auto: ${row.hits} threat hits in 24h`})`;
      actions.push({ action: "ip_blocked", target: row.ip, reason: `${row.hits} threat hits in 24h` });
    }
  }

  // 2. Auto-block IPs with 20+ rate-limit trips on auth (same immunity rule).
  const authAbuse = await sql`
    SELECT ip, count FROM auth_throttle
    WHERE bucket = 'auth_login' AND count >= 20
  `;
  for (const row of authAbuse) {
    const existing = await sql`SELECT 1 FROM ip_blocklist WHERE ip = ${row.ip}`;
    const immune = await sql`SELECT 1 FROM admin_ip_immunity WHERE ip = ${row.ip} AND expires_at > now() LIMIT 1`.catch(() => []);
    if (existing.length === 0 && immune.length === 0) {
      await sql`INSERT INTO ip_blocklist (ip, reason) VALUES (${row.ip}, ${`auto: ${row.count} auth attempts`})`;
      actions.push({ action: "ip_blocked", target: row.ip, reason: `${row.count} auth attempts` });
    }
  }

  // 3. Expire stale sessions (>30 days)
  const expired = await sql`
    DELETE FROM sessions WHERE expires_at < now() RETURNING id
  `;
  if (expired.length > 0) {
    actions.push({ action: "sessions_expired", target: `${expired.length} sessions` });
  }

  // 4. Clean old oauth states (>1 hour)
  await sql`DELETE FROM oauth_states WHERE created_at < now() - interval '1 hour'`;

  // 5. Clean old auth throttle entries (>1 hour)
  await sql`DELETE FROM auth_throttle WHERE window_start < now() - interval '1 hour'`;

  // 6. GDPR/CCPA retention cleanup — privacy policy §8 commits us to
  // 12-month retention for security/threat data and 24-month for
  // affiliate-click analytics. Run once per cron tick (every 15 min)
  // so the table never drifts more than a quarter-hour past stated
  // policy. RETURNING ... is bounded to LIMIT 5000 per tick so a long
  // gap doesn't cause one DELETE to lock the table for minutes.
  const purgedThreats = await sql`
    DELETE FROM threat_actors
    WHERE ts < now() - interval '12 months'
      AND id IN (SELECT id FROM threat_actors WHERE ts < now() - interval '12 months' LIMIT 5000)
    RETURNING id
  `.catch(() => []);
  if (purgedThreats.length > 0) {
    actions.push({ action: "retention_purge_threats", target: `${purgedThreats.length} rows`, reason: "GDPR/CCPA 12mo retention policy" });
  }
  const purgedClicks = await sql`
    DELETE FROM affiliate_clicks
    WHERE ts < now() - interval '24 months'
      AND id IN (SELECT id FROM affiliate_clicks WHERE ts < now() - interval '24 months' LIMIT 5000)
    RETURNING id
  `.catch(() => []);
  if (purgedClicks.length > 0) {
    actions.push({ action: "retention_purge_clicks", target: `${purgedClicks.length} rows`, reason: "24mo retention policy" });
  }
  // Soft-deleted user rows (deleted_at set by handleDeleteAccount in
  // api/portal.js) get hard-deleted 30 days after the user clicked
  // delete, so the audit log keeps the deletion event but the row
  // itself goes away within the regulated window.
  const purgedUsers = await sql`
    DELETE FROM users WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '30 days'
    RETURNING id
  `.catch(() => []);
  if (purgedUsers.length > 0) {
    actions.push({ action: "retention_purge_users", target: `${purgedUsers.length} rows`, reason: "30-day grace post-delete" });
  }

  // 6. Alert on critical security events in last 15 min
  const criticals = await sql`
    SELECT kind, severity, ip, detail, ts
    FROM security_events
    WHERE severity = 'critical'
      AND ts > now() - interval '15 minutes'
    ORDER BY ts DESC
  `;

  if (criticals.length > 0 && REPORT_TO) {
    const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
    if (resend) {
      const body = criticals.map((e) =>
        `[${e.severity}] ${e.kind} from ${e.ip} at ${e.ts}\n${JSON.stringify(e.detail)}`
      ).join("\n\n");
      try {
        await resend.emails.send({
          from: FROM,
          to: [REPORT_TO],
          subject: `[CRITICAL] ${criticals.length} security alert(s) on simpleitsrq.com`,
          text: body,
        });
        actions.push({ action: "critical_alert_sent", target: REPORT_TO, reason: `${criticals.length} events` });
      } catch { /* best effort */ }
    }
  }

  // Log all actions taken
  for (const a of actions) {
    await sql`
      INSERT INTO auto_actions (action, target, reason, detail)
      VALUES (${a.action}, ${a.target}, ${a.reason || null}, ${JSON.stringify(a)}::jsonb)
    `.catch(() => {});
  }

  return actions;
}

// ========== THREAT-FEED INGEST (daily) ==========
//
// Pulls known-bad IPs from public threat feeds and pre-populates ip_blocklist
// so scanners are blocked on first touch instead of being detected after
// they've already probed us. IP-only feeds (not CIDR) so rows fit the
// existing schema. Runs daily — feeds update hourly but once/day is plenty
// for a marketing site on Hobby.

const THREAT_FEEDS = [
  {
    source: "feodo-tracker",
    url: "https://feodotracker.abuse.ch/downloads/ipblocklist.txt",
    description: "active Emotet/Dridex/TrickBot C2 servers",
  },
  {
    source: "et-compromised",
    url: "https://rules.emergingthreats.net/blockrules/compromised-ips.txt",
    description: "Emerging Threats compromised IPs",
  },
];

const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
const INGEST_CAP_PER_FEED = 5000; // cap per run so a corrupt feed can't blow up the table

async function fetchFeedIps(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "simpleitsrq-threat-intel/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const body = await res.text();
  const ips = new Set();
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    // Some feeds ship "ip[tab]comment"; take the first token.
    const first = line.split(/\s+/)[0];
    if (IPV4_RE.test(first)) ips.add(first);
  }
  return Array.from(ips).slice(0, INGEST_CAP_PER_FEED);
}

async function ingestThreatFeeds() {
  const perFeed = [];
  for (const feed of THREAT_FEEDS) {
    try {
      const ips = await fetchFeedIps(feed.url);
      if (ips.length === 0) {
        perFeed.push({ source: feed.source, fetched: 0, added: 0 });
        continue;
      }
      // One round-trip: bulk-insert ignoring dupes. Postgres ON CONFLICT gives
      // us the insert count directly via RETURNING.
      const reason = `feed: ${feed.source} (${feed.description})`;
      const inserted = await sql`
        INSERT INTO ip_blocklist (ip, reason)
        SELECT ip, ${reason}
        FROM unnest(${ips}::text[]) AS t(ip)
        ON CONFLICT (ip) DO NOTHING
        RETURNING ip
      `;
      perFeed.push({ source: feed.source, fetched: ips.length, added: inserted.length });
    } catch (err) {
      perFeed.push({ source: feed.source, error: String(err.message || err).slice(0, 200) });
    }
  }
  const totalAdded = perFeed.reduce((n, f) => n + (f.added || 0), 0);
  return { feeds: perFeed, totalAdded };
}

// ========== AI BLOG AGENT (daily) ==========

// Fold a slug down to its kebab-case canonical form, in case the model
// returns an UpperCase or apostrophe-rich version.
function normalizeSlug(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

// Pick a non-colliding slug. The slug column is UNIQUE across draft_posts,
// so a model that picks a slug we have already used (in any status —
// draft / approved / rejected / published) makes INSERT throw and used to
// kill the whole run silently. We try the model's slug first, then -2, -3…
// up to -9 before giving up.
async function pickFreeSlug(base) {
  const root = normalizeSlug(base) || `post-${Date.now()}`;
  for (let i = 0; i < 10; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const collision = await sql`SELECT 1 FROM draft_posts WHERE slug = ${candidate} LIMIT 1`.catch(() => []);
    if (collision.length === 0) return candidate;
  }
  return null;
}

// Write a row to auto_actions so the admin can confirm the agent ran and
// see why it skipped or failed without grepping serverless logs. Best-effort.
async function logBlogOutcome(outcome) {
  await sql`
    INSERT INTO auto_actions (action, target, reason, detail)
    VALUES (${'blog_draft'}, ${outcome.slug || outcome.title || null},
            ${outcome.error || outcome.reason || (outcome.generated ? 'generated' : 'unknown')},
            ${JSON.stringify(outcome)}::jsonb)
  `.catch(() => {});
}

async function generateBlogDraft({ force = false } = {}) {
  if (!ANTHROPIC_API_KEY) {
    const out = { skipped: true, reason: "ANTHROPIC_API_KEY not set" };
    await logBlogOutcome(out);
    return out;
  }

  // "Already generated today" — anchored to America/New_York so a cron
  // that fires at 11:15 UTC (≈07:15 ET) doesn't race the UTC date rollover.
  if (!force) {
    const todayCheck = await sql`
      SELECT 1 FROM draft_posts
      WHERE (ts AT TIME ZONE 'America/New_York')::date
          = (now() AT TIME ZONE 'America/New_York')::date
      LIMIT 1
    `.catch(() => []);
    if (todayCheck.length > 0) {
      const out = { skipped: true, reason: "already generated today" };
      await logBlogOutcome(out);
      return out;
    }
  }

  // Fetch trending IT/security topics via a simple approach:
  // use the Claude model to pick a topic and write the post.
  const systemPrompt = `You are the blog writer for Simple IT SRQ, a managed IT services company in Sarasota, Bradenton, and Venice, Florida. You write practical, plain-English blog posts for small business owners (5-80 employees) in healthcare, legal, finance, construction, and real estate.

VOICE AND STYLE:
- Write like you're explaining something to a smart friend who isn't technical
- No jargon without explanation. No corporate buzzwords.
- Short paragraphs (2-3 sentences max). Use headers to break up sections.
- Always include a "what to do about it" section with concrete next steps
- End with a soft CTA mentioning Simple IT SRQ and linking to /#contact or /#solutions
- Use Markdown formatting
- 800-1200 words
- Include a meta description (under 160 chars)
- Include a category from: Cybersecurity, AI & Productivity, Cloud, Compliance, Privacy, Business Tech, Industry News
- Include a short excerpt (1-2 sentences)
- Slug should be lowercase-kebab-case, include "sarasota" or "bradenton" for SEO

TOPICS TO COVER (pick one that's timely):
- New security vulnerabilities affecting small businesses
- AI tools that help or threaten small business operations
- Microsoft 365 / Windows updates that matter
- Compliance changes (HIPAA, cyber-insurance, state privacy laws)
- Cloud migration best practices
- Remote work security
- Practical IT budgeting tips

Respond with ONLY a JSON object (no markdown fencing):
{
  "title": "...",
  "slug": "...",
  "category": "...",
  "excerpt": "...",
  "metaDescription": "...",
  "body": "..."
}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 4096,
        messages: [
          { role: "user", content: "Write today's blog post for Simple IT SRQ. Pick a timely topic that a Sarasota small business owner would care about this week." },
        ],
        system: systemPrompt,
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      const out = { error: `API ${res.status}: ${err.slice(0, 200)}`, model: ANTHROPIC_MODEL };
      await logBlogOutcome(out);
      return out;
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || "";

    // Parse the JSON response
    let post;
    try {
      // Handle potential markdown code fencing
      const cleaned = text.replace(/```json\s*/, "").replace(/```\s*$/, "").trim();
      post = JSON.parse(cleaned);
    } catch {
      const out = { error: "Failed to parse model response", raw: text.slice(0, 500) };
      await logBlogOutcome(out);
      return out;
    }

    if (!post.title || !post.slug || !post.body) {
      const out = { error: "Incomplete post", raw: text.slice(0, 500) };
      await logBlogOutcome(out);
      return out;
    }

    // Pick a non-colliding slug; bail with a logged error if even -2..-10
    // are all taken (effectively impossible, but never throw).
    const finalSlug = await pickFreeSlug(post.slug);
    if (!finalSlug) {
      const out = { error: "slug_collision_unresolvable", originalSlug: post.slug };
      await logBlogOutcome(out);
      return out;
    }

    // Save to DB and capture the new row's id for the review link.
    let inserted;
    try {
      inserted = await sql`
        INSERT INTO draft_posts (title, slug, category, excerpt, body, meta_desc, model)
        VALUES (${post.title}, ${finalSlug}, ${post.category || "Business Tech"},
                ${post.excerpt || ""}, ${post.body}, ${post.metaDescription || ""},
                ${ANTHROPIC_MODEL})
        RETURNING id
      `;
    } catch (dbErr) {
      const out = { error: `db_insert_failed: ${String(dbErr.message || dbErr).slice(0, 200)}`, slug: finalSlug };
      await logBlogOutcome(out);
      return out;
    }
    const draftId = inserted[0]?.id;
    const reviewUrl = `https://simpleitsrq.com/portal?tab=drafts${draftId ? `&id=${draftId}` : ""}`;

    // Email the draft
    const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
    if (resend && REPORT_TO) {
      try {
        await resend.emails.send({
          from: FROM,
          to: [REPORT_TO],
          subject: `[Blog Draft] ${post.title}`,
          text:
            `New draft generated by AI agent.\n\n` +
            `Title: ${post.title}\n` +
            `Slug: ${finalSlug}\n` +
            `Category: ${post.category}\n\n` +
            `Review + publish: ${reviewUrl}\n\n` +
            `---\n\n${post.body}\n\n---\n` +
            `Open the link above to publish with one click. The portal commits to GitHub and Vercel redeploys automatically.`,
        });
      } catch { /* best effort */ }
    }

    const out = { generated: true, title: post.title, slug: finalSlug, draftId, reviewUrl };
    await logBlogOutcome(out);
    return out;
  } catch (err) {
    const out = { error: String(err.message || err) };
    await logBlogOutcome(out);
    return out;
  }
}

// ========== SECURITY ANALYSIS AGENT (daily) ==========

async function securityAnalysis() {
  if (!ANTHROPIC_API_KEY) return { skipped: true, reason: "ANTHROPIC_API_KEY not set" };

  // Gather last 24h security data
  const [events, threats, anomalies, topIps] = await Promise.all([
    sql`SELECT kind, severity, ip, detail, ts FROM security_events WHERE ts > now() - interval '24 hours' ORDER BY ts DESC LIMIT 100`,
    sql`SELECT ip, country, city, path, method, ts FROM threat_actors WHERE ts > now() - interval '24 hours' ORDER BY ts DESC LIMIT 50`,
    sql`SELECT event, ip, detail, ts FROM session_tracking WHERE event = 'anomaly' AND ts > now() - interval '24 hours'`,
    sql`SELECT ip, COUNT(*)::int AS hits FROM visits WHERE ts > now() - interval '24 hours' GROUP BY ip ORDER BY hits DESC LIMIT 20`,
  ]);

  if (events.length === 0 && threats.length === 0 && anomalies.length === 0) {
    return { skipped: true, reason: "no security data to analyze" };
  }

  const summary = {
    securityEvents: events.length,
    threatActors: threats.length,
    sessionAnomalies: anomalies.length,
    events: events.slice(0, 20),
    threats: threats.slice(0, 10),
    anomalies,
    topIps: topIps.slice(0, 10),
  };

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        messages: [
          { role: "user", content: `Analyze the last 24 hours of security data for simpleitsrq.com and provide:\n1. Threat assessment (low/medium/high/critical)\n2. Key findings\n3. Recommended actions\n4. Any IPs that should be blocked\n\nData:\n${JSON.stringify(summary, null, 2)}` },
        ],
        system: "You are a cybersecurity analyst reviewing logs for a small MSP website. Be concise, actionable, and flag anything unusual. Format as plain text, not markdown.",
      }),
    });

    if (!res.ok) return { error: `API ${res.status}` };
    const data = await res.json();
    const analysis = data.content?.[0]?.text || "";

    // Email the analysis
    const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
    if (resend && REPORT_TO) {
      try {
        await resend.emails.send({
          from: FROM,
          to: [REPORT_TO],
          subject: `[Security Analysis] simpleitsrq.com — ${events.length} events, ${threats.length} threats`,
          text: analysis,
        });
      } catch { /* best effort */ }
    }

    return { analyzed: true, eventCount: events.length, threatCount: threats.length };
  } catch (err) {
    return { error: String(err.message || err) };
  }
}

// ========== SUPPLY-CHAIN AUDIT (daily) ==========

async function supplyChainAudit() {
  const token = process.env.GITHUB_TOKEN;
  const repo  = process.env.GITHUB_REPO || "budokai-msi/simpleitsrq.com";
  if (!token) return { skipped: true, reason: "GITHUB_TOKEN not set" };

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/dependabot/alerts?state=open&per_page=25`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "simpleitsrq-agent",
        },
      },
    );

    if (res.status === 403 || res.status === 404) {
      return { skipped: true, reason: `GitHub API ${res.status} — token may lack security_events:read scope` };
    }
    if (!res.ok) return { error: `GitHub API ${res.status}` };

    const alerts = await res.json();
    if (!Array.isArray(alerts) || alerts.length === 0) {
      return { clean: true, openAlerts: 0 };
    }

    const summary = alerts.map((a) => ({
      package: a.security_vulnerability?.package?.name,
      severity: a.security_advisory?.severity,
      title: a.security_advisory?.summary?.slice(0, 120),
      url: a.html_url,
    }));

    // Email if there are open alerts
    const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
    if (resend && REPORT_TO && alerts.length > 0) {
      const body = [
        `${alerts.length} open Dependabot alert(s) on ${repo}:`,
        "",
        ...summary.map((s) => `[${s.severity}] ${s.package}: ${s.title}\n  ${s.url}`),
        "",
        "Run `npm audit fix` or review at:",
        `https://github.com/${repo}/security/dependabot`,
      ].join("\n");
      try {
        await resend.emails.send({
          from: FROM,
          to: [REPORT_TO],
          subject: `[Supply Chain] ${alerts.length} open vulnerability alert(s) — simpleitsrq.com`,
          text: body,
        });
      } catch { /* best effort */ }
    }

    return { openAlerts: alerts.length, alerts: summary };
  } catch (err) {
    return { error: String(err.message || err) };
  }
}

// ========== SELF-HEALTH CHECK (daily) ==========

async function selfHealthCheck() {
  const appUrl = process.env.APP_URL || "https://simpleitsrq.com";
  const endpoints = [
    { path: "/", expect: 200 },
    { path: "/blog", expect: 200 },
    { path: "/api/portal?action=me", expect: 401 },
    { path: "/api/health", expect: 200 },
  ];

  const results = [];
  let failures = 0;
  for (const ep of endpoints) {
    try {
      const res = await fetch(`${appUrl}${ep.path}`, { redirect: "follow" });
      const ok = res.status === ep.expect;
      if (!ok) failures++;
      results.push({ path: ep.path, status: res.status, expected: ep.expect, ok });
    } catch (err) {
      failures++;
      results.push({ path: ep.path, error: String(err.message || err).slice(0, 100), ok: false });
    }
  }

  if (failures > 0 && REPORT_TO) {
    const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
    if (resend) {
      const body = [
        `Self-health check: ${failures} failure(s) out of ${endpoints.length} endpoints.`,
        "",
        ...results.filter((r) => !r.ok).map((r) =>
          `FAIL ${r.path} — got ${r.status ?? r.error}, expected ${r.expected}`
        ),
        "",
        `Full results: ${JSON.stringify(results)}`,
      ].join("\n");
      try {
        await resend.emails.send({
          from: FROM,
          to: [REPORT_TO],
          subject: `[HEALTH] ${failures} endpoint failure(s) — simpleitsrq.com`,
          text: body,
        });
      } catch { /* best effort */ }
    }
  }

  return { checked: endpoints.length, failures, results };
}

// ========== HANDLER ==========

// ========== REVIEW REQUESTS (daily) ==========
//
// For every ticket that closed 2–4 days ago and hasn't had a review
// request sent yet, email the client asking for a Google review. 2-day
// delay gives the client time to be "happy" about the resolution; 4-day
// cap avoids emailing long-stale closures. Tracks sent requests via
// security_events (kind=review.requested) so we don't need a new column.
async function sendReviewRequests() {
  const summary = { candidates: 0, sent: 0, skipped: 0, errors: [] };

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    summary.errors.push("RESEND_API_KEY not set — review requests disabled");
    return summary;
  }

  const reviewUrl = process.env.GOOGLE_REVIEW_URL
    || "https://www.google.com/search?q=Simple+IT+SRQ+Sarasota";
  const fromAddr = "Simple IT SRQ <hello@simpleitsrq.com>";

  let candidates;
  try {
    candidates = await sql`
      SELECT id, ticket_code, email, name, subject, category, closed_at
      FROM tickets
      WHERE status = 'closed'
        AND closed_at BETWEEN (now() - interval '4 days') AND (now() - interval '2 days')
        AND email IS NOT NULL
      LIMIT 50
    `;
  } catch (e) {
    summary.errors.push(`query_failed: ${String(e.message || e).slice(0, 200)}`);
    return summary;
  }
  summary.candidates = candidates.length;

  if (candidates.length === 0) return summary;

  const resend = new Resend(apiKey);

  for (const t of candidates) {
    try {
      // Idempotency — did we already ask for a review on this ticket?
      const priorAsks = await sql`
        SELECT 1 FROM security_events
        WHERE kind = 'review.requested'
          AND detail->>'ticketId' = ${String(t.id)}
        LIMIT 1
      `;
      if (priorAsks.length > 0) { summary.skipped++; continue; }

      const name = (t.name || "there").split(" ")[0];
      const subject = `${name}, one quick favor?`;
      const html = `<p>Hi ${name},</p>
<p>Thanks for letting us handle that <strong>${t.category || "IT"}</strong> issue last week (ticket <strong>${t.ticket_code}</strong>). Hope everything's running smoothly now.</p>
<p>If you've got <strong>30 seconds</strong>, would you mind leaving us a quick Google review? It helps small local IT shops like ours a ton — every review moves the needle for other Sarasota and Bradenton business owners deciding whether to reach out.</p>
<p><a href="${reviewUrl}" style="display:inline-block;padding:10px 16px;background:#0F6CBD;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Leave a Google review →</a></p>
<p>If anything is <em>not</em> running smoothly, just reply to this email — I read every one personally.</p>
<p>Thanks again,<br/>The Simple IT SRQ team<br/><a href="https://simpleitsrq.com">simpleitsrq.com</a> · (941) ___-____</p>`;

      const text = `Hi ${name},\n\nThanks for letting us handle that ${t.category || "IT"} issue last week (ticket ${t.ticket_code}). Hope everything's running smoothly now.\n\nIf you've got 30 seconds, would you mind leaving us a quick Google review? It helps small local IT shops like ours a ton.\n\nLeave a review: ${reviewUrl}\n\nIf anything is not running smoothly, just reply to this email.\n\nThanks again,\nThe Simple IT SRQ team`;

      await resend.emails.send({
        from: fromAddr,
        to: [t.email],
        subject,
        html,
        text,
        headers: { "X-Ticket-Code": t.ticket_code || "" },
      });

      await sql`
        INSERT INTO security_events (kind, severity, ip, user_agent, path, detail)
        VALUES (
          'review.requested', 'info', null, 'cron/agent', '/cron/review-request',
          ${JSON.stringify({
            ticketId: String(t.id),
            ticketCode: t.ticket_code,
            clientEmail: t.email,
            category: t.category,
          })}::jsonb
        )
      `;

      summary.sent++;
    } catch (e) {
      summary.errors.push(`ticket ${t.id}: ${String(e.message || e).slice(0, 200)}`);
    }
  }

  return summary;
}

// ========== LEAD GENERATION (every 15 min) ==========
//
// Drains lead_crawl_jobs:
//   - kind='osm_zip' → run discoverBusinessesByZip(payload.zip), upsert
//     each result into lead_businesses
//   - kind='website_emails' → run crawlEmails(business.website), upsert
//     each result into lead_emails
//
// Caps:
//   - Process at most LEADGEN_MAX_JOBS_PER_RUN per cron tick (default 6).
//     Keeps any single invocation well under the 60s function limit and
//     spreads Overpass / Nominatim load across ticks.
//   - Total elapsed budget LEADGEN_TIME_BUDGET_MS (default 45_000). If we
//     run out of time mid-batch we leave the rest for the next tick.

const LEADGEN_MAX_JOBS_PER_RUN = Number(process.env.LEADGEN_MAX_JOBS_PER_RUN) || 6;
const LEADGEN_TIME_BUDGET_MS   = Number(process.env.LEADGEN_TIME_BUDGET_MS)   || 45_000;

async function processOsmZipJob(job) {
  const zip = job?.payload?.zip;
  if (!zip) throw new Error("osm_zip job missing payload.zip");

  const result = await discoverBusinessesByZip(zip);
  if (!result.ok) throw new Error(result.error || "discover_failed");

  // Upsert businesses by (source, source_id). Existing rows get refreshed
  // contact info; new rows enter as 'active'.
  let inserted = 0;
  let updated = 0;
  for (const b of result.businesses) {
    const r = await sql`
      INSERT INTO lead_businesses
        (name, legal_name, address, city, state, zip, lat, lng,
         website, phone, source, source_id, source_url, industry, naics, status)
      VALUES
        (${b.name}, ${b.legal_name}, ${b.address}, ${b.city}, ${b.state}, ${b.zip},
         ${b.lat}, ${b.lng}, ${b.website}, ${b.phone},
         ${b.source}, ${b.source_id}, ${b.source_url},
         ${b.industry}, ${b.naics}, 'active')
      ON CONFLICT (source, source_id) DO UPDATE SET
        name      = EXCLUDED.name,
        address   = COALESCE(EXCLUDED.address, lead_businesses.address),
        city      = COALESCE(EXCLUDED.city, lead_businesses.city),
        state     = COALESCE(EXCLUDED.state, lead_businesses.state),
        zip       = COALESCE(EXCLUDED.zip, lead_businesses.zip),
        lat       = COALESCE(EXCLUDED.lat, lead_businesses.lat),
        lng       = COALESCE(EXCLUDED.lng, lead_businesses.lng),
        website   = COALESCE(EXCLUDED.website, lead_businesses.website),
        phone     = COALESCE(EXCLUDED.phone, lead_businesses.phone),
        industry  = COALESCE(EXCLUDED.industry, lead_businesses.industry),
        updated_at = now()
      RETURNING (xmax = 0) AS is_new
    `;
    if (r[0]?.is_new) inserted += 1; else updated += 1;
  }
  return { discovered: result.businesses.length, inserted, updated, bbox: result.bbox };
}

async function processWebsiteEmailsJob(job) {
  const id = Number(job?.payload?.business_id);
  if (!Number.isInteger(id)) throw new Error("website_emails job missing business_id");

  const rows = await sql`SELECT id, website FROM lead_businesses WHERE id = ${id}`;
  if (!rows.length) throw new Error("business_not_found");
  if (!rows[0].website) return { skipped: "no_website" };

  const result = await crawlEmails(rows[0].website);
  if (!result.ok) return { skipped: result.error || "crawl_failed" };

  let inserted = 0;
  for (const e of result.emails) {
    const r = await sql`
      INSERT INTO lead_emails
        (business_id, email, source, source_url, context_snippet, confidence,
         consent_basis)
      VALUES
        (${id}, ${e.email}, ${e.source}, ${e.source_url || null},
         ${e.context_snippet || null}, ${e.confidence}, 'public_record')
      ON CONFLICT (business_id, email) DO UPDATE SET
        confidence      = GREATEST(lead_emails.confidence, EXCLUDED.confidence),
        source_url      = COALESCE(EXCLUDED.source_url, lead_emails.source_url),
        context_snippet = COALESCE(EXCLUDED.context_snippet, lead_emails.context_snippet),
        updated_at      = now()
      RETURNING (xmax = 0) AS is_new
    `;
    if (r[0]?.is_new) inserted += 1;
  }
  return { found: result.emails.length, inserted, host: result.host, robotsAllowed: result.robotsAllowed };
}

async function runLeadgenWorker() {
  const summary = { picked: 0, completed: 0, failed: 0, jobs: [] };
  const started = Date.now();

  for (let i = 0; i < LEADGEN_MAX_JOBS_PER_RUN; i += 1) {
    if (Date.now() - started > LEADGEN_TIME_BUDGET_MS) {
      summary.budget_exhausted = true;
      break;
    }

    // Atomically claim the next pending job. Postgres-only trick: SKIP
    // LOCKED ensures two cron ticks running concurrently can't grab the
    // same row. status='running' is set in the same statement.
    const claimed = await sql`
      UPDATE lead_crawl_jobs
      SET status='running', started_at=now()
      WHERE id = (
        SELECT id FROM lead_crawl_jobs
        WHERE status='pending'
        ORDER BY id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id, kind, payload
    `;
    if (!claimed.length) break;
    summary.picked += 1;

    const job = claimed[0];
    const jobOut = { id: job.id, kind: job.kind };
    try {
      const out = job.kind === "osm_zip"
        ? await processOsmZipJob(job)
        : job.kind === "website_emails"
          ? await processWebsiteEmailsJob(job)
          : (() => { throw new Error(`unknown_kind:${job.kind}`); })();
      jobOut.result = out;
      await sql`
        UPDATE lead_crawl_jobs
        SET status='done', finished_at=now(),
            progress=COALESCE(${out?.inserted ?? null}, progress),
            total=COALESCE(${out?.discovered ?? out?.found ?? null}, total)
        WHERE id=${job.id}
      `;
      summary.completed += 1;
    } catch (err) {
      jobOut.error = String(err?.message || err).slice(0, 500);
      await sql`
        UPDATE lead_crawl_jobs
        SET status='failed', finished_at=now(), error=${jobOut.error}
        WHERE id=${job.id}
      `;
      summary.failed += 1;
    }
    summary.jobs.push(jobOut);
  }
  return summary;
}

export async function GET(request) {
  if (!verifyCron(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const taskParam = url.searchParams.get("task");
  const force = url.searchParams.get("force") === "1";

  const now = new Date();
  const result = { ts: now.toISOString(), tasks: {} };

  // Single-task manual trigger. Lets the admin (or a curl with CRON_SECRET)
  // run JUST the blog draft on demand without waiting for the daily cron and
  // without firing the other tasks. Pass ?task=blog&force=1 to bypass the
  // "already generated today" guard.
  if (taskParam === "blog") {
    result.tasks.blogDraft = await generateBlogDraft({ force });
    return new Response(JSON.stringify(result, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  if (taskParam === "leadgen") {
    result.tasks.leadgen = await runLeadgenWorker();
    return new Response(JSON.stringify(result, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  result.tasks.autoCounter = await autoCounter();
  result.tasks.threatFeeds = await ingestThreatFeeds();
  result.tasks.blogDraft = await generateBlogDraft({ force });
  result.tasks.securityAnalysis = await securityAnalysis();
  result.tasks.supplyChain = await supplyChainAudit();
  result.tasks.healthCheck = await selfHealthCheck();
  result.tasks.reviewRequests = await sendReviewRequests();
  result.tasks.newsletterDrip = await runNewsletterDrip().catch((e) => ({
    error: String(e.message || e).slice(0, 200),
  }));
  result.tasks.leadgen = await runLeadgenWorker().catch((e) => ({
    error: String(e.message || e).slice(0, 200),
  }));

  return new Response(JSON.stringify(result, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
