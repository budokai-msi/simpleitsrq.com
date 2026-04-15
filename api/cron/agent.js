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

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const REPORT_TO = process.env.CONTACT_TO_EMAIL || "hello@simpleitsrq.com";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const FROM = "Simple IT SRQ Agent <agent@simpleitsrq.com>";

function verifyCron(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

// ========== AUTO COUNTER-MEASURES (every 15 min) ==========

async function autoCounter() {
  const actions = [];

  // 1. Auto-block IPs with 5+ threat actor hits in 24h
  const repeatThreats = await sql`
    SELECT ip, COUNT(*)::int AS hits
    FROM threat_actors
    WHERE ts > now() - interval '24 hours'
    GROUP BY ip
    HAVING COUNT(*) >= 5
  `;
  for (const row of repeatThreats) {
    const existing = await sql`SELECT 1 FROM ip_blocklist WHERE ip = ${row.ip}`;
    if (existing.length === 0) {
      await sql`INSERT INTO ip_blocklist (ip, reason) VALUES (${row.ip}, ${`auto: ${row.hits} threat hits in 24h`})`;
      actions.push({ action: "ip_blocked", target: row.ip, reason: `${row.hits} threat hits in 24h` });
    }
  }

  // 2. Auto-block IPs with 20+ rate-limit trips on auth
  const authAbuse = await sql`
    SELECT ip, count FROM auth_throttle
    WHERE bucket = 'auth_login' AND count >= 20
  `;
  for (const row of authAbuse) {
    const existing = await sql`SELECT 1 FROM ip_blocklist WHERE ip = ${row.ip}`;
    if (existing.length === 0) {
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

async function generateBlogDraft() {
  if (!ANTHROPIC_API_KEY) return { skipped: true, reason: "ANTHROPIC_API_KEY not set" };

  // Check if we already generated today
  const todayCheck = await sql`
    SELECT 1 FROM draft_posts WHERE ts::date = now()::date LIMIT 1
  `;
  if (todayCheck.length > 0) return { skipped: true, reason: "already generated today" };

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
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        messages: [
          { role: "user", content: "Write today's blog post for Simple IT SRQ. Pick a timely topic that a Sarasota small business owner would care about this week." },
        ],
        system: systemPrompt,
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return { error: `API ${res.status}: ${err.slice(0, 200)}` };
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
      return { error: "Failed to parse model response", raw: text.slice(0, 500) };
    }

    if (!post.title || !post.slug || !post.body) {
      return { error: "Incomplete post", raw: text.slice(0, 500) };
    }

    // Save to DB and capture the new row's id for the review link.
    const inserted = await sql`
      INSERT INTO draft_posts (title, slug, category, excerpt, body, meta_desc, model)
      VALUES (${post.title}, ${post.slug}, ${post.category || "Business Tech"},
              ${post.excerpt || ""}, ${post.body}, ${post.metaDescription || ""},
              'claude-haiku-4-5')
      RETURNING id
    `;
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
            `Slug: ${post.slug}\n` +
            `Category: ${post.category}\n\n` +
            `Review + publish: ${reviewUrl}\n\n` +
            `---\n\n${post.body}\n\n---\n` +
            `Open the link above to publish with one click. The portal commits to GitHub and Vercel redeploys automatically.`,
        });
      } catch { /* best effort */ }
    }

    return { generated: true, title: post.title, slug: post.slug, draftId, reviewUrl };
  } catch (err) {
    return { error: String(err.message || err) };
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
    { path: "/api/portal?action=health", expect: 200 },
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

export async function GET(request) {
  if (!verifyCron(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  const result = { ts: now.toISOString(), tasks: {} };

  result.tasks.autoCounter = await autoCounter();
  result.tasks.threatFeeds = await ingestThreatFeeds();
  result.tasks.blogDraft = await generateBlogDraft();
  result.tasks.securityAnalysis = await securityAnalysis();
  result.tasks.supplyChain = await supplyChainAudit();
  result.tasks.healthCheck = await selfHealthCheck();

  return new Response(JSON.stringify(result, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
