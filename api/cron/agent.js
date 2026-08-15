// GET /api/cron/agent
//
// Autonomous AI agent that runs on a schedule:
//   - Every 15 min: auto counter-measures (block repeat attackers, alert on critical events)
//   - Daily: generate one guarded Hacker News -> local field-note blog post
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
import { fetchImapReplies, markImapSeen } from "../_lib/leadgen-imap.js";
import { decryptSecret } from "../_lib/crypto.js";
import { dispatchPush } from "../leadgen-integrations.js";
import nodemailer from "nodemailer";
import { sendCampaignEmail, renderTemplate } from "../_lib/leadgen-smtp.js";
import { publishDraftToGitHub } from "../_lib/publish-draft.js";
import { fetchHnSourceContext } from "../_lib/hn-source-context.js";
import { affiliateOpportunities, rankFreshStories, seoBriefForStory } from "../_lib/blog-editorial.js";

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

async function generateBlogDraft(options = {}) {
  // Backward-compatible manual trigger: ?task=blog now runs the guarded HN
  // pipeline instead of the old broad topic generator.
  return generateHNDraft(options);
}
// ========== HACKERNEWS DAILY DRAFT (free — Groq) ==========

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL && !process.env.GROQ_MODEL.startsWith("llama-3.3-") ? process.env.GROQ_MODEL : "qwen/qwen3.6-27b";

// HN story relevance keywords for IT / security / business audience.
// Keep this tight: the goal is local operator insight, not generic tech news.
const HN_RELEVANT = /security|hack|breach|password|backup|cloud|aws|azure|vpn|firewall|malware|ransomware|phishing|privacy|encryption|network|server|infrastructure|devops|saas|outage|pricing|ai|llm|openai|chatgpt|microsoft|google|apple|linux|windows|update|patch|vulnerability|cve|zero.day|exploit|incident|response|disaster|recovery|continuity|legal|finance|healthcare|construction|real.estate|remote|work|wifi|router|switch|camera|surveillance|ups|battery|power|hardware|laptop|dock|nas/i;

const HN_BANNED_TITLE = /who is hiring|ask hn|show hn|launch hn|tell hn|poll:|job:|hiring/i;

const AMAZON_GADGETS = [
  {
    key: "yubikey",
    match: /password|mfa|2fa|phishing|account|identity|breach|login|security/i,
    token: "amazon:B07HBD71HL|YubiKey 5C NFC",
    why: "phishing-resistant MFA for Microsoft 365, Google Workspace, and admin accounts",
  },
  {
    key: "ups",
    match: /power|outage|battery|storm|server|router|switch|network|office/i,
    token: "amazon_search:APC Back-UPS Pro 1500VA sine wave|APC Back-UPS Pro 1500VA",
    why: "battery backup for the modem, firewall, switch, and one key workstation",
  },
  {
    key: "nas",
    match: /backup|storage|ransomware|restore|file|server|nas|disaster/i,
    token: "amazon_search:Synology 2 bay NAS DS224+|Synology 2-bay NAS",
    why: "local backup and file restore for small offices that cannot wait days for cloud recovery",
  },
  {
    key: "dock",
    match: /laptop|macbook|windows|hybrid|remote|monitor|desk|workstation|usb-c|thunderbolt/i,
    token: "amazon:B09GK8LBWS|CalDigit TS4 Thunderbolt 4 Dock",
    why: "one-cable desks for laptop-heavy offices with dual displays and wired Ethernet",
  },
  {
    key: "unifi",
    match: /wifi|wireless|router|network|switch|access point|office|latency/i,
    token: "amazon_search:Ubiquiti UniFi U6 Pro access point|UniFi U6 Pro access point",
    why: "business-grade WiFi with guest isolation and sane centralized management",
  },
  {
    key: "shredder",
    match: /privacy|legal|healthcare|records|paper|document|hipaa|client data/i,
    token: "amazon_search:Fellowes micro cut shredder 12 sheet|Fellowes micro-cut shredder",
    why: "cheap, boring protection for misprints, intake forms, and client paperwork",
  },
  {
    key: "camera",
    match: /camera|surveillance|physical|retail|warehouse|theft|office/i,
    token: "amazon_search:Reolink PoE camera system NVR|Reolink PoE camera system",
    why: "simple PoE cameras for front desks, stock rooms, and after-hours visibility",
  },
];

function pickGadgetForStory(story) {
  const text = `${story?.title || ""} ${story?.url || ""}`;
  return AMAZON_GADGETS.find((g) => g.match.test(text)) ||
    AMAZON_GADGETS[Math.abs(Number(story?.id) || 0) % AMAZON_GADGETS.length];
}

function scoreSlop(markdown) {
  const body = String(markdown || "");
  const rules = [
    /\bin today'?s (?:fast-paced|digital|business|competitive|ever-evolving|complex|modern) [a-z ]*landscape\b/gi,
    /\bnavigate the (?:complex|complexities|challenges|landscape|world)\b/gi,
    /\bdelve\s+into\b/gi,
    /\b(?:in conclusion|to conclude|in summary)\b/gi,
    /\bleverag(?:e|es|ed|ing)\b/gi,
    /\bcutting[- ]edge\b/gi,
    /\bseamless(?:ly)?\b/gi,
    /\bunlock(?:ing)? the (?:power|potential|secrets?)\b/gi,
    /\bcomprehensive guide\b/gi,
  ];
  return rules.reduce((sum, re) => sum + ((body.match(re) || []).length * 3), 0);
}

function validateAutoPost(post) {
  const issues = [];
  const title = String(post?.title || "");
  const meta = String(post?.metaDescription || "");
  const body = String(post?.body || "");
  const all = `${title}\n${meta}\n${body}`.toLowerCase();

  if (!title || title.length > 70) issues.push("title_missing_or_too_long");
  if (meta.length < 50 || meta.length > 200) issues.push("meta_description_length");
  if (!post?.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug)) {
  issues.push("slug_invalid");
}
if (!/\[Original source\]\(https?:\/\/[^)]+\)/i.test(body)) {
  issues.push("missing_original_source_link");
}
  if (!/\]\(\/(?:(?:services|tools|leadgen|book|sarasota|bradenton|venice|lakewood-ranch|nokomis|blog)(?:[^)]*)|#contact)\)/i.test(body)) {
    issues.push("missing_internal_link");
  }
  if (/\/store\b|\/cyber-insurance-quote\b|\/compliance-audit-referral\b/.test(all)) {
    issues.push("dead_or_banned_link");
  }
  if (/cyber[- ]insurance quote|insurance broker|broker partner|policy referral|bound policy|audit partner|compliance-audit quote/i.test(all)) {
    issues.push("banned_offer_language");
  }
  if (/\[\[(?:amazon|amazon_search):[^\]]+\]\]/.test(body) && !/affiliate|commission|qualifying purchases/i.test(body)) {
    issues.push("missing_affiliate_note");
  }
  if (!/^## Short answer/m.test(body)) issues.push("missing_short_answer_section");
  if (!/^## What to do this week/m.test(body)) issues.push("missing_action_section");
  if (!/^## When to call IT/m.test(body)) issues.push("missing_call_it_section");
  if (scoreSlop(body) > 12) issues.push("ai_slop_score_too_high");

  return { ok: issues.length === 0, issues, slopScore: scoreSlop(body) };
}

async function fetchHNTopStory() {
  try {
    const topRes = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json", { signal: AbortSignal.timeout(8000) });
    if (!topRes.ok) return null;
    const topIds = await topRes.json();
    if (!Array.isArray(topIds)) return null;

    // Look beyond the first screen of Hacker News. Velocity matters more than
    // yesterday's raw score when the goal is timely organic-search coverage.
    const candidates = await Promise.all(
      topIds.slice(0, 80).map(async (id, rank) => {
        try {
          const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { signal: AbortSignal.timeout(5000) });
          if (!r.ok) return null;
          const story = await r.json();
          return story ? { ...story, hnRank: rank } : null;
        } catch { return null; }
      })
    );

    const recentDrafts = await sql`
      SELECT title, body
      FROM draft_posts
      WHERE ts > now() - interval '120 days'
      ORDER BY ts DESC
      LIMIT 250
    `.catch(() => []);
    const recentOutcomes = await sql`
      SELECT detail->>'hnTitle' AS title, detail->>'hnUrl' AS source_url
      FROM auto_actions
      WHERE action = 'blog_draft'
        AND ts > now() - interval '120 days'
      ORDER BY ts DESC
      LIMIT 250
    `.catch(() => []);

    const eligible = candidates
      .filter((s) => s && s.type === "story" && s.score >= 35 && s.title && s.url)
      .filter((s) => !HN_BANNED_TITLE.test(s.title))
      .filter((s) => HN_RELEVANT.test(`${s.title} ${s.url || ""}`));

    return rankFreshStories(eligible, [...recentDrafts, ...recentOutcomes])[0] || null;
  } catch (err) {
    console.error("[hn] fetch error", err);
    return null;
  }
}

async function generateHNDraft({ force = false } = {}) {
  if (!force) {
    const todayCheck = await sql`
      SELECT 1 FROM draft_posts
      WHERE (ts AT TIME ZONE 'America/New_York')::date
          = (now() AT TIME ZONE 'America/New_York')::date
      LIMIT 1
    `.catch(() => []);
    if (todayCheck.length > 0) {
      const out = { skipped: true, reason: "already generated draft today" };
      await logBlogOutcome(out);
      return out;
    }
  }

  const story = await fetchHNTopStory();
if (!story) {
  const out = { skipped: true, reason: "no eligible Hacker News story today" };
  await logBlogOutcome(out);
  return out;
}

const context = await fetchHnSourceContext(story);
if (!context.ok) {
  const out = { skipped: true, reason: "source article could not be extracted", source: story.url, detail: context.error };
  await logBlogOutcome(out);
  return out;
}

try {
  const hnUrl = context.hnDiscussionUrl;
  const affiliateCandidates = affiliateOpportunities(story, context.article.text);
  const seoBrief = seoBriefForStory(story);

  const systemPrompt = `You are the editorial engine for Simple IT SRQ, a computer repair and business IT company serving Sarasota and Bradenton, Florida. Your job is to turn a source article discovered through Hacker News into an original, useful field note for small-business readers.

EDITORIAL STANDARD:
- Write for the reader first. Help someone understand what happened, whether it matters to them, and what they can reasonably do next.
- Treat the supplied source article as the factual basis. The Hacker News discussion is secondary context and opinion, not evidence.
- Add original technical analysis and practical context. Do not merely summarize or closely paraphrase the source.
- Do not copy sentences from the source. Avoid verbatim quotations unless a very short phrase is essential.
- Never invent statistics, incidents, customer stories, breach counts, cost figures, product performance claims, or local events.
- If the source does not support a factual claim, do not state it as fact. Mark reasonable interpretation as analysis.
- Mention Sarasota or Bradenton only when the local context genuinely helps the reader. Do not repeat city names for SEO.
- Use plain language. Avoid hype such as "secret sauce", "game-changing", "massive", "critical enterprise-grade investment", "impenetrable", or fear-based urgency.
- Be concise and well organized. There is no target word count; stop when the reader has enough information to act.
- Title must be clear, specific, natural, and no more than 70 characters. Use the supplied primary search query only when it reads naturally and accurately describes the article.
- Meta description must accurately summarize this specific article in one useful sentence and make the practical value clear without clickbait.
- Category must be one of: Cybersecurity, AI & Productivity, Cloud, Privacy, Business Tech, Industry News.
- Slug must be lowercase kebab case and describe the actual topic. Do not stuff locations or service keywords into it.\n- Answer the primary search intent in the first 120 words. Use related terms naturally in headings/body; never repeat a phrase just for SEO.\n- Prefer evergreen explanatory angles around a trending event: what changed, who is affected, what to check, and what to do next.

REQUIRED STRUCTURE:
- Begin with a one-sentence source note linking to the original article: [Original source](${story.url}).
- Include these Markdown H2 sections: "## Short answer", "## What the source actually says", "## Why it matters", "## What to do this week", "## When to call IT".
- If the HN discussion adds a useful disagreement or implementation detail, include a short "## What practitioners are debating" section and clearly attribute it to Hacker News discussion.
- End with one relevant internal link to /services, /leadgen, /tools, /book, or /#contact. Do not force multiple CTAs.

PRODUCT LINKS:
- Zero to three affiliate candidates may be supplied. Every candidate is OPTIONAL.
- Use at most one affiliate link unless two products solve clearly different problems in the article.
- Include a candidate only when the source-backed advice creates a real buying decision for the reader.
- Never force a product into general news, policy, AI-model, or industry commentary.
- If you use a product, include its exact shortcode once and explain the practical use case without unsupported superlatives.
- If any affiliate shortcode is used, end with: "Product links may be affiliate links; we may earn a small commission on qualifying purchases."

Respond with ONLY a JSON object (no Markdown fence):
{
  "title": "...",
  "slug": "...",
  "category": "...",
  "excerpt": "...",
  "metaDescription": "...",
  "body": "..."
}`;

  const userPrompt = `Create an original Simple IT SRQ field note from the source material below.

DISCOVERY CONTEXT
Hacker News title: ${story.title}
Original URL: ${story.url}
Hacker News discussion: ${hnUrl}
Hacker News points when selected: ${story.score}
Hacker News comments when selected: ${story.descendants || 0}
Trend score: ${story.editorial?.trendScore || "n/a"}
Story age in hours: ${story.editorial?.ageHours || "n/a"}
Points per hour: ${story.editorial?.pointsPerHour || "n/a"}

SEO / SEARCH INTENT BRIEF
Primary query: ${seoBrief.primaryQuery}
Search intent: ${seoBrief.searchIntent}
Related queries: ${seoBrief.secondaryQueries.join(" | ")}
Preferred internal CTA: ${seoBrief.preferredInternalCta}

ORIGINAL ARTICLE EXTRACT
${context.article.text}

HACKER NEWS DISCUSSION EXCERPTS
${context.discussion?.text || "No useful discussion excerpts were available."}

OPTIONAL AFFILIATE CANDIDATES
${affiliateCandidates.length ? affiliateCandidates.map((candidate) => `- ${candidate.label}: ${candidate.why} — exact shortcode [[${candidate.token}]]`).join("\n") : "No relevant affiliate candidate was found. Do not add a product link."}

Write a standalone analysis that adds value beyond the original article. Explain what is confirmed by the source, what is interpretation, and what a small business reader can do with the information. Do not imitate the source's wording and do not manufacture a Sarasota/Bradenton angle when one is not useful.`;
  let post = null;
  let usedModel = GROQ_MODEL;

  if (GROQ_API_KEY) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.55,
          max_tokens: 4096,
          stream: false,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content || "";
        const cleaned = text.replace(/```json\s*/, "").replace(/```\s*$/, "").trim();
        post = JSON.parse(cleaned);
      }
    } catch (e) {
      console.warn("[blog-cron] Qwen generation failed", e);
    }
  }

  if (!post || !post.title || !post.body) {
  const out = { error: "qwen_generation_failed", source: story.url, model: usedModel };
  await logBlogOutcome(out);
  return out;
}

  if (!post.title || !post.slug || !post.body) {
      const out = { error: "incomplete_qwen_post", source: story.url };
      await logBlogOutcome(out);
      return out;
    }

    const finalSlug = await pickFreeSlug(post.slug);
    if (!finalSlug) {
      const out = { error: "slug_collision_unresolvable", originalSlug: post.slug };
      await logBlogOutcome(out);
      return out;
    }

    let inserted;
    try {
      inserted = await sql`
        INSERT INTO draft_posts (title, slug, category, excerpt, body, meta_desc, model)
        VALUES (${post.title}, ${finalSlug}, ${post.category || "Business Tech"},
                ${post.excerpt || ""}, ${post.body}, ${post.metaDescription || ""},
                ${usedModel})
        RETURNING id
      `;
    } catch (dbErr) {
      const out = { error: `db_insert_failed: ${String(dbErr.message || dbErr).slice(0, 200)}`, slug: finalSlug };
      await logBlogOutcome(out);
      return out;
    }

    const draftId = inserted[0]?.id;
    const reviewUrl = `https://simpleitsrq.com/portal?tab=drafts${draftId ? `&id=${draftId}` : ""}`;
    const quality = validateAutoPost({ ...post, slug: finalSlug });

    // Auto-publish only when the generated post passes the same hard gates
    // we would enforce in review. Failures remain in draft_posts for manual
    // repair instead of becoming public content.
    let publishResult = null;
    if (!quality.ok) {
      publishResult = { ok: false, blocked: true, error: `quality_gate_failed:${quality.issues.join(",")}` };
    } else {
      try {
        publishResult = await publishDraftToGitHub({
          title: post.title,
          slug: finalSlug,
          category: post.category || "Business Tech",
          excerpt: post.excerpt || "",
          body: post.body,
          meta_desc: post.metaDescription || "",
          tags: ["hacker-news", "source-backed", "local-it", /\[\[(?:amazon|amazon_search|onepassword|backblaze|acronis|ubiquiti)(?::|\]\])/.test(post.body) ? "affiliate" : null].filter(Boolean),
          sourceUrl: story.url,
        });
        if (publishResult.ok) {
          await sql`
            UPDATE draft_posts
            SET status = 'published',
                reviewed_at = now(),
                published_at = now()
            WHERE id = ${draftId}
          `;
        }
      } catch (pubErr) {
        publishResult = { ok: false, error: String(pubErr.message || pubErr) };
      }
    }

    const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
    if (resend && REPORT_TO) {
      try {
        await resend.emails.send({
          from: FROM,
          to: [REPORT_TO],
          subject: `[HN Draft] ${post.title}`,
          text:
            `New source-backed Hacker News analysis generated by the Qwen editorial pipeline.\n\n` +
            `Title: ${post.title}\n` +
            `Slug: ${finalSlug}\n` +
            `Category: ${post.category}\n` +
            `HN Source: ${story.title}\n` +
            `HN URL: ${story.url}\n` +
            `HN Discussion: ${hnUrl}\n\n` +
            `Quality gate: ${quality.ok ? "passed" : `blocked (${quality.issues.join(", ")})`}\n` +
            `Auto-publish: ${publishResult?.ok ? (publishResult.alreadyInFile ? "already in MDX" : `published ${publishResult.path || ""}`) : `failed (${publishResult?.error})`}\n` +
            `Review + publish: ${reviewUrl}\n\n` +
            `---\n\n${post.body}\n\n---\n`,
        });
      } catch { /* best effort */ }
    }

    const out = {
      generated: true,
      title: post.title,
      slug: finalSlug,
      draftId,
      reviewUrl,
      source: "hn",
      hnTitle: story.title,
      hnUrl: story.url,
      affiliateOpportunities: affiliateCandidates.map((candidate) => candidate.label),
      trend: story.editorial || null,
      seoBrief,
      quality,
      published: publishResult?.ok === true,
      alreadyInFile: publishResult?.alreadyInFile === true,
      publishError: publishResult?.ok === false ? publishResult.error : undefined,
    };
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
         website, phone, source, source_id, source_url,
         industry, industry_group, sub_industry, naics, status)
      VALUES
        (${b.name}, ${b.legal_name}, ${b.address}, ${b.city}, ${b.state}, ${b.zip},
         ${b.lat}, ${b.lng}, ${b.website}, ${b.phone},
         ${b.source}, ${b.source_id}, ${b.source_url},
         ${b.industry}, ${b.industry_group}, ${b.sub_industry},
         ${b.naics}, 'active')
      ON CONFLICT (source, source_id) DO UPDATE SET
        name           = EXCLUDED.name,
        address        = COALESCE(EXCLUDED.address, lead_businesses.address),
        city           = COALESCE(EXCLUDED.city, lead_businesses.city),
        state          = COALESCE(EXCLUDED.state, lead_businesses.state),
        zip            = COALESCE(EXCLUDED.zip, lead_businesses.zip),
        lat            = COALESCE(EXCLUDED.lat, lead_businesses.lat),
        lng            = COALESCE(EXCLUDED.lng, lead_businesses.lng),
        website        = COALESCE(EXCLUDED.website, lead_businesses.website),
        phone          = COALESCE(EXCLUDED.phone, lead_businesses.phone),
        industry       = COALESCE(EXCLUDED.industry, lead_businesses.industry),
        industry_group = COALESCE(EXCLUDED.industry_group, lead_businesses.industry_group),
        sub_industry   = COALESCE(EXCLUDED.sub_industry, lead_businesses.sub_industry),
        updated_at     = now()
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

export async function runLeadgenWorker() {
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

      // Normalize progress semantics:
      // - osm_zip: processed == discovered, total == discovered
      // - website_emails: processed one business job, total one business job
      const normalizedTotal = job.kind === "osm_zip"
        ? Number(out?.discovered ?? 0)
        : 1;
      const normalizedProgress = job.kind === "osm_zip"
        ? Number(out?.discovered ?? 0)
        : 1;

      await sql`
        UPDATE lead_crawl_jobs
        SET status='done', finished_at=now(),
            progress=${normalizedProgress},
            total=${normalizedTotal},
            result=${JSON.stringify(out || {})}::jsonb
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

// ========== LEAD GENERATION SENDER (every 15 min) ==========
//
// Drains lead_campaign_sends rows in 'queued' state, respecting per-campaign
// throttle_per_hour and daily_cap. Renders subject/body templates against
// the recipient business profile, calls SES, records provider_message_id
// or error.
//
// Throttle enforcement is approximate (per-cron-tick budget = throttle/4
// since cron fires every 15 min) and is also bounded by an overall
// LEADGEN_SEND_BUDGET ceiling to prevent a misconfigured campaign from
// blowing through SES quota in one tick.

const LEADGEN_SEND_BUDGET     = Number(process.env.LEADGEN_SEND_BUDGET) || 50;
const LEADGEN_SEND_TIME_BUDGET_MS = Number(process.env.LEADGEN_SEND_TIME_BUDGET_MS) || 30_000;

function deriveFirstName(name) {
  if (!name) return "there";
  // OSM business names rarely have a person; fall back to a friendly default.
  // Heuristic: if the name looks like "Firstname Lastname" (two capitalized
  // words, no &/comma/Inc/LLC), use the first word.
  const trimmed = name.trim();
  if (/[,&]|\b(LLC|Inc|Corp|Co|Ltd|PLLC|PA)\b/i.test(trimmed)) return "there";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 2 && /^[A-Z][a-z]+$/.test(parts[0]) && /^[A-Z][a-z]+$/.test(parts[1])) {
    return parts[0];
  }
  return "there";
}

async function runLeadgenSequenceScheduler() {
  const summary = { processed_campaigns: 0, total_queued: 0 };
  
  const campaigns = await sql`
    SELECT id, (segment->>'follow_up_campaign_id')::bigint AS parent_id,
           COALESCE((segment->>'follow_up_delay_days')::int, 3) AS delay_days
    FROM lead_campaigns
    WHERE status = 'running'
      AND segment->>'follow_up_campaign_id' IS NOT NULL
  `;
  
  for (const c of campaigns) {
    if (!c.parent_id) continue;
    summary.processed_campaigns += 1;
    
    const queued = await sql`
      WITH eligible AS (
        SELECT s.business_id, s.email_id, s.to_email
        FROM lead_campaign_sends s
        JOIN lead_emails e ON e.id = s.email_id
        WHERE s.campaign_id = ${c.parent_id}
          AND s.sent_at < now() - interval '1 day' * ${c.delay_days}
          AND s.replied_at IS NULL
          AND s.bounced_at IS NULL
          AND e.opted_out_at IS NULL
          AND e.bounced_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM lead_campaign_sends child
            WHERE child.campaign_id = ${c.id}
              AND child.email_id = s.email_id
          )
      )
      INSERT INTO lead_campaign_sends
        (campaign_id, business_id, email_id, to_email, status, unsubscribe_token)
      SELECT
        ${c.id}, business_id, email_id, to_email, 'queued',
        replace(gen_random_uuid()::text, '-', '')
      FROM eligible
      RETURNING id
    `;
    summary.total_queued += queued.length;
  }
  return summary;
}

async function runLeadgenSender() {
  const summary = { sent: 0, failed: 0, throttled: 0, sends: [] };
  const started = Date.now();

  // Fetch a batch of queued sends with the campaign + business joined in.
  // We sort by campaign so we can apply per-campaign throttle accounting
  // in one pass. Cap the read at LEADGEN_SEND_BUDGET so we never hold a
  // huge result in memory.
  const candidates = await sql`
    SELECT s.id, s.campaign_id, s.business_id, s.email_id, s.to_email,
           s.unsubscribe_token,
           c.subject_template, c.body_template, c.from_email, c.reply_to,
           c.throttle_per_hour, c.daily_cap, c.status AS campaign_status,
           b.name AS business_name, b.city, b.state, b.zip, b.notes AS icebreaker
    FROM lead_campaign_sends s
    JOIN lead_campaigns  c ON c.id = s.campaign_id
    JOIN lead_businesses b ON b.id = s.business_id
    WHERE s.status = 'queued'
      AND c.status = 'running'
    ORDER BY s.campaign_id, s.id
    LIMIT ${LEADGEN_SEND_BUDGET}
  `;

  if (!candidates.length) return { ...summary, picked: 0 };

  // Per-campaign send accounting for this tick. Each campaign gets at most
  // ceil(throttle_per_hour / 4) sends per 15-min tick. Daily cap is
  // enforced via a DB count over the last 24h.
  const tickQuotaUsed = new Map(); // campaignId -> sends emitted this run

  for (const s of candidates) {
    if (Date.now() - started > LEADGEN_SEND_TIME_BUDGET_MS) {
      summary.budget_exhausted = true;
      break;
    }

    const tickCap = Math.max(1, Math.ceil(s.throttle_per_hour / 4));
    if ((tickQuotaUsed.get(s.campaign_id) || 0) >= tickCap) {
      summary.throttled += 1;
      continue;
    }

    // Daily cap: count how many sends from this campaign already left in
    // the last rolling 24h. One query per row is fine — the candidate
    // batch is capped at 50.
    const sentCountRow = await sql`
      SELECT COUNT(*)::int AS cnt FROM lead_campaign_sends
      WHERE campaign_id = ${s.campaign_id}
        AND sent_at IS NOT NULL
        AND sent_at > now() - interval '24 hours'
    `;
    if ((sentCountRow[0]?.cnt || 0) >= s.daily_cap) {
      summary.throttled += 1;
      continue;
    }

    // Atomic claim: flip queued → sending so a parallel cron tick can't
    // double-send the same row.
    const claimed = await sql`
      UPDATE lead_campaign_sends
      SET status='sending'
      WHERE id=${s.id} AND status='queued'
      RETURNING id
    `;
    if (!claimed.length) continue;

    const vars = {
      business_name: s.business_name || "",
      first_name:    deriveFirstName(s.business_name),
      city:          s.city || "",
      state:         s.state || "",
      zip:           s.zip || "",
      icebreaker:    s.icebreaker || "",
      // {{custom_intro}} is reserved for a future Claude pre-render step.
      custom_intro:  "",
    };
    const subject = renderTemplate(s.subject_template, vars);
    const textBody = renderTemplate(s.body_template, vars);
    const openToken = (globalThis.crypto || (await import("node:crypto")).webcrypto)
      .randomUUID().replace(/-/g, "");

    const result = await sendCampaignEmail({
      to: s.to_email,
      subject,
      textBody,
      from: s.from_email,
      replyTo: s.reply_to || null,
      openToken,
      unsubscribeToken: s.unsubscribe_token,
      campaignId: s.campaign_id,
      sendId: s.id,
    });

    if (result.ok) {
      await sql`
        UPDATE lead_campaign_sends
        SET status='sent', sent_at=now(),
            provider='smtp', provider_message_id=${result.messageId},
            open_token=${openToken},
            rendered_subject=${subject}, rendered_body=${textBody}
        WHERE id=${s.id}
      `;
      await sql`UPDATE lead_emails SET last_sent_at=now() WHERE id=${s.email_id}`;
      tickQuotaUsed.set(s.campaign_id, (tickQuotaUsed.get(s.campaign_id) || 0) + 1);
      summary.sent += 1;
      summary.sends.push({ id: s.id, status: "sent" });
    } else {
      await sql`
        UPDATE lead_campaign_sends
        SET status=${result.permanent ? "failed" : "queued"},
            error=${result.error}
        WHERE id=${s.id}
      `;
      summary.failed += 1;
      summary.sends.push({ id: s.id, status: "failed", error: result.error });
    }
  }

  // Mark campaigns as 'done' if no queued or sending rows remain.
  const exhausted = await sql`
    UPDATE lead_campaigns SET status='done', completed_at=now(), updated_at=now()
    WHERE status='running'
      AND NOT EXISTS (
        SELECT 1 FROM lead_campaign_sends
        WHERE campaign_id = lead_campaigns.id
          AND status IN ('queued','sending')
      )
    RETURNING id
  `;
  if (exhausted.length) summary.completed_campaigns = exhausted.map((r) => r.id);

  return { ...summary, picked: candidates.length };
}

async function runLeadgenImapSync() {
  const summary = { new_replies: 0, errors: 0 };
  const integrations = await sql`SELECT id, user_id, config FROM user_integrations WHERE kind = 'imap' AND enabled = true`;
  
  for (const integ of integrations) {
    try {
      const cfg = decryptSecret(integ.config);
      const replies = await fetchImapReplies(cfg);
      const uidsToMark = [];

      for (const msg of replies) {
        if (msg.isWarmup) {
          uidsToMark.push(msg.uid);
          continue;
        }

        let matchedSend = null;
        // Try to match reply to a sent campaign email
        const [res] = await sql`
          SELECT s.id, s.campaign_id 
          FROM lead_campaign_sends s
          JOIN lead_emails e ON e.id = s.email_id
          WHERE e.email = ${msg.from} AND s.sent_at IS NOT NULL
          ORDER BY s.sent_at DESC LIMIT 1
        `;
        
        if (res) {
          matchedSend = res;
          await sql`UPDATE lead_campaign_sends SET replied_at = NOW() WHERE id = ${matchedSend.id}`;
          summary.new_replies++;
          uidsToMark.push(msg.uid);

          // Push to CRM integrations
          try {
            const leadData = await sql`
              SELECT b.name, b.legal_name, b.website, b.phone, e.email
              FROM lead_campaign_sends s
              JOIN lead_businesses b ON b.id = s.business_id
              JOIN lead_emails e ON e.id = s.email_id
              WHERE s.id = ${matchedSend.id}
            `;
            if (leadData.length > 0) {
              const activeCrms = await sql`SELECT id, kind, config FROM user_integrations WHERE user_id = ${integ.user_id} AND enabled = true AND kind != 'smtp'`;
              for (const ui of activeCrms) {
                try {
                  const config = decryptSecret(ui.config);
                  await dispatchPush({ ...ui, config }, leadData);
                  await sql`UPDATE user_integrations SET last_used_at = now(), last_error = null WHERE id = ${ui.id}`;
                } catch(err) {
                  await sql`UPDATE user_integrations SET last_error = ${String(err?.message||err).slice(0, 255)} WHERE id = ${ui.id}`;
                }
              }
            }
          } catch (crmErr) {
            console.warn("[imap-sync] CRM push failed", crmErr);
          }
        }
      }
      if (uidsToMark.length > 0) await markImapSeen(cfg, uidsToMark);
    } catch (err) {
      summary.errors++;
      console.warn("[imap-sync] failed", err);
    }
  }
  return summary;
}

async function runLeadgenWarmup() {
  const summary = { sent: 0, errors: 0 };
  const integrations = await sql`
    SELECT id, user_id, config FROM user_integrations 
    WHERE kind = 'smtp' AND enabled = true
  `;
  
  const byUser = {};
  for (const integ of integrations) {
    const cfg = decryptSecret(integ.config);
    if (cfg.is_warmup) {
      if (!byUser[integ.user_id]) byUser[integ.user_id] = [];
      byUser[integ.user_id].push({ id: integ.id, ...cfg });
    }
  }

  for (const [userId, accounts] of Object.entries(byUser)) {
    if (accounts.length < 2) continue;

    const sender = accounts[Math.floor(Math.random() * accounts.length)];
    const receivers = accounts.filter(a => a.id !== sender.id);
    if (receivers.length === 0) continue;
    const receiver = receivers[Math.floor(Math.random() * receivers.length)];

    try {
      const transporter = nodemailer.createTransport({
        host: sender.host,
        port: Number(sender.port) || 587,
        secure: sender.secure === true || Number(sender.port) === 465,
        auth: { user: sender.user, pass: sender.pass },
        connectionTimeout: 10000,
      });

      const bodyId = Math.random().toString(36).substring(7);
      const subjectId = Math.random().toString(36).substring(7);

      const mail = {
        from: sender.user,
        to: receiver.user,
        subject: `Re: Quick question about your services ${subjectId}`,
        text: `Hey there, just following up on my last email. Looking forward to hearing back! ${bodyId}`,
        headers: {
          "X-SimpleITSRQ-Warmup": "true"
        }
      };

      await transporter.sendMail(mail);
      summary.sent++;
    } catch (err) {
      console.warn("[warmup] failed for user", userId, err);
      summary.errors++;
    }
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

  if (taskParam === "hn") {
    result.tasks.hnDraft = await generateHNDraft({ force });
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

  if (taskParam === "leadgen-send") {
    result.tasks.leadgenSequenceScheduler = await runLeadgenSequenceScheduler();
    result.tasks.leadgenSender = await runLeadgenSender();
    return new Response(JSON.stringify(result, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  result.tasks.autoCounter = await autoCounter();
  result.tasks.threatFeeds = await ingestThreatFeeds();
  result.tasks.hnDraft = await generateHNDraft({ force });
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
  result.tasks.leadgenSequenceScheduler = await runLeadgenSequenceScheduler().catch((e) => ({
    error: String(e.message || e).slice(0, 200),
  }));
  result.tasks.leadgenSender = await runLeadgenSender().catch((e) => ({
    error: String(e.message || e).slice(0, 200),
  }));
  result.tasks.leadgenImapSync = await runLeadgenImapSync().catch((e) => ({
    error: String(e.message || e).slice(0, 200),
  }));
  result.tasks.leadgenWarmup = await runLeadgenWarmup().catch((e) => ({
    error: String(e.message || e).slice(0, 200),
  }));

  return new Response(JSON.stringify(result, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
