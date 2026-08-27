import 'dotenv/config';
import { sql } from '../api/_lib/db.js';
import { publishDraftToGitHub } from '../api/_lib/publish-draft.js';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const WRITER_MODEL  = process.env.LOCAL_LLM_WRITER  || 'qwen3.6:35b';
const CRITIC_MODEL  = process.env.LOCAL_LLM_CRITIC  || 'gemma4:12b';
const MAX_REVISIONS = Number(process.env.LOCAL_LLM_MAX_REVISIONS || 2);
// Slop score at or below which a post is allowed to publish.
const SLOP_THRESHOLD = Number(process.env.BLOG_SLOP_THRESHOLD || 8);

const HN_RELEVANT = /security|hack|breach|password|backup|cloud|aws|azure|vpn|firewall|malware|ransomware|phishing|privacy|encryption|network|server|infrastructure|devops|saas|outage|pricing|ai|llm|openai|chatgpt|microsoft|google|apple|linux|windows|update|patch|vulnerability|cve|zero.day|exploit|incident|response|disaster|recovery|continuity|legal|finance|healthcare|construction|real\.estate|remote|work|wifi|router|switch|camera|surveillance|ups|battery|power|hardware|laptop|dock|nas/i;
const HN_BANNED_TITLE = /who is hiring|ask hn|show hn|launch hn|tell hn|poll:|job:|hiring/i;
// Default lowered from 80 → 30: top 30 of HN rarely has multiple
// small-business-relevant stories above 80 in a single day. 30 still
// filters pure noise without leaving us with 21/30 days of "no_story".
const HN_MIN_SCORE = Number(process.env.HN_MIN_SCORE || 30);
const HN_TOP_N    = Number(process.env.HN_TOP_N || 30);

// Reddit sources — fallback for days HN top 30 is all hiring/Show HN.
const REDDIT_SOURCES = [
  { subreddit: 'sysadmin',        minScore: 50, limit: 25, label: 'r/sysadmin' },
  { subreddit: 'msp',             minScore: 20, limit: 25, label: 'r/msp' },
  { subreddit: 'cybersecurity',   minScore: 100, limit: 25, label: 'r/cybersecurity' },
  { subreddit: 'netsec',          minScore: 80, limit: 25, label: 'r/netsec' },
];
const REDDIT_BANNED = /\[meta\]|\[meme\]|\[discussion\]|weekly|monthly|megathread|ama:|daily|question|hire me|for hire|looking for/i;

// ─────────────────────────────────────────────────────────────
// Local-SEO keyword bank — the PRIMARY source.
//
// The old pipeline only rewrote HN/Reddit/CISA stories, so every
// post was reactive tech news that nobody searching for a local IT
// provider would ever find. This bank targets the high-intent
// queries a Sarasota/Bradenton business owner actually types into
// Google. Each entry is an evergreen topic we can write authoritatively
// about regardless of the news cycle. Rotated round-robin so we don't
// repeat until the whole bank is exhausted.
//
// `query`  = the search phrase we're targeting (used in title/meta).
// `title`  = a concrete, human title template (not keyword-stuffed).
// `cat`    = blog category.
// `angle`  = the specific local angle the writer should lead with.
// ─────────────────────────────────────────────────────────────
const LOCAL_KEYWORDS = [
  { query: "IT support Sarasota", title: "IT Support in Sarasota: What a Local Provider Actually Does", cat: "Business Tech", angle: "why a local Sarasota provider beats a national helpdesk for a Gulf Coast business" },
  { query: "managed IT services Bradenton", title: "Managed IT Services in Bradenton: What You're Paying For", cat: "Business Tech", angle: "the flat-fee managed IT model and what it covers for a Bradenton office" },
  { query: "computer repair Sarasota", title: "Computer Repair in Sarasota: When to Fix It vs. Replace It", cat: "Business Tech", angle: "a practical fix-vs-replace decision guide for Sarasota businesses" },
  { query: "small business IT support Sarasota", title: "Small Business IT Support in Sarasota: What You Actually Need", cat: "Business Tech", angle: "right-sized IT for a 5-50 person Sarasota company, no enterprise bloat" },
  { query: "how much does managed IT cost", title: "How Much Does Managed IT Cost in 2026? A Straight Answer", cat: "Business Tech", angle: "real per-user pricing ranges for managed IT, and what changes the number" },
  { query: "IT support for law firms Sarasota", title: "IT Support for Law Firms in Sarasota: Security and Ethics Rules", cat: "Business Tech", angle: "the confidentiality, retention, and ABA-adjacent obligations a Sarasota firm can't ignore" },
  { query: "IT support for medical offices Sarasota", title: "IT Support for Medical Offices in Sarasota: HIPAA Without the Headache", cat: "Business Tech", angle: "HIPAA-compliant IT for Sarasota practices, from risk assessments to BAAs" },
  { query: "ransomware protection for small business", title: "Ransomware Protection for Small Business: The 5 Things That Actually Stop It", cat: "Cybersecurity", angle: "the concrete controls that stop ransomware, not the fear-mongering" },
  { query: "backup and disaster recovery Sarasota", title: "Backup and Disaster Recovery in Sarasota: Hurricane-Proof Your Data", cat: "Cybersecurity", angle: "why a Sarasota business needs offsite backup before hurricane season" },
  { query: "Microsoft 365 setup Sarasota", title: "Microsoft 365 Setup for Sarasota Businesses: Do It Right the First Time", cat: "Cloud", angle: "the right way to stand up M365 for a small business, avoiding the common misconfigs" },
  { query: "network security audit Sarasota", title: "Network Security Audit in Sarasota: What We Check and Why", cat: "Cybersecurity", angle: "what a real security audit covers for a Sarasota small business" },
  { query: "cloud migration for small business", title: "Cloud Migration for Small Business: A Sarasota IT Provider's Playbook", cat: "Cloud", angle: "moving a small business to the cloud without downtime or surprises" },
  { query: "cybersecurity for small business Sarasota", title: "Cybersecurity for Small Business in Sarasota: Where to Start", cat: "Cybersecurity", angle: "a prioritized starting point for Sarasota businesses with a limited budget" },
  { query: "IT help desk for small business", title: "IT Help Desk for Small Business: What Good Support Looks Like", cat: "Business Tech", angle: "what responsive, human IT support should feel like for a small business" },
  { query: "server maintenance Sarasota", title: "Server Maintenance in Sarasota: Keep It Running or Replace It", cat: "Business Tech", angle: "the maintenance that keeps a Sarasota office server alive, and when to move on" },
  { query: "data backup for small business", title: "Data Backup for Small Business: The 3-2-1 Rule, Plainly", cat: "Cybersecurity", angle: "the 3-2-1 backup rule explained for a non-technical business owner" },
  { query: "business internet setup Bradenton", title: "Business Internet in Bradenton: Picking the Right Connection", cat: "Business Tech", angle: "choosing the right business internet for a Bradenton office" },
  { query: "HIPAA compliant IT Sarasota", title: "HIPAA-Compliant IT in Sarasota: What a Practice Needs", cat: "Cybersecurity", angle: "the IT side of HIPAA compliance for Sarasota healthcare practices" },
  { query: "managed IT pricing", title: "Managed IT Pricing: Per-User vs. Per-Device, Explained", cat: "Business Tech", angle: "the two pricing models for managed IT and which fits a small business" },
  { query: "IT company Sarasota FL", title: "How to Choose an IT Company in Sarasota, FL", cat: "Business Tech", angle: "the questions to ask before hiring a Sarasota IT provider" },
];

// Round-robin pointer persisted in a tiny table so we don't repeat
// keywords until the whole bank is exhausted. Table is created
// idempotently so the pipeline works without a manual migration.
async function ensureLocalKeywordTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS local_keyword_used (
      keyword   text PRIMARY KEY,
      used_at   timestamptz NOT NULL DEFAULT now()
    )
  `.catch((err) => console.warn(`[local] ensure table failed: ${err.message?.slice(0, 100)}`));
}

async function nextLocalKeyword() {
  await ensureLocalKeywordTable();
  const used = await sql`SELECT keyword FROM local_keyword_used ORDER BY used_at DESC LIMIT 100`;
  const usedSet = new Set(used.map((r) => r.keyword));
  const fresh = LOCAL_KEYWORDS.filter((k) => !usedSet.has(k.query));
  const pool = fresh.length ? fresh : LOCAL_KEYWORDS; // exhausted → restart
  // Deterministic pick: rotate by count of used entries.
  const idx = used.length % pool.length;
  const kw = pool[idx];
  await sql`
    INSERT INTO local_keyword_used (keyword, used_at)
    VALUES (${kw.query}, now())
    ON CONFLICT (keyword) DO UPDATE SET used_at = now()
  `.catch(() => {});
  return kw;
}

async function fetchLocalKeyword() {
  try {
    const kw = await nextLocalKeyword();
    return {
      id: `local-${kw.query}`,
      title: kw.title,
      url: `https://simpleitsrq.com/blog`,
      score: 100,
      source: 'local',
      keyword: kw,
    };
  } catch (err) {
    console.warn(`[local] keyword pick failed: ${err.message?.slice(0, 100)}`);
    return null;
  }
}

// CISA — perfect for an IT services company. Two complementary sources:
//
//   1. advisories RSS at /ncas/alerts.xml — slow but long-form, covers
//      the high-impact advisories (one per week, maybe).
//   2. KEV (Known Exploited Vulnerabilities) JSON catalog — daily-updated,
//      lists every CVE currently being exploited in the wild. Much higher
//      cadence; we pick the most recent 1-3 to give the writer a story.
//
// Both are free, no key, no rate limit.
const CISA_ADVISORIES_RSS = 'https://www.cisa.gov/ncas/alerts.xml';
const CISA_KEV_JSON      = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
const CISA_RELEVANT = /microsoft|google|apple|linux|windows|vmware|cisco|fortinet|sophos|exchange|office|chrome|safari|firefox|edge|aws|azure|gcp|okta|ad\.|active directory|kerberos|ransomware|phishing|exploit|vulnerability|cve/i;

// ---------------------------------------------------------------
// Ollama helpers
// ---------------------------------------------------------------

async function ollamaGenerate(model, system, prompt, { timeoutMs = 20 * 60 * 1000 } = {}) {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // think:false — thinking models (qwen3.6) otherwise spend the whole budget
    // reasoning and return an empty `response` field.
    body: JSON.stringify({ model, system, prompt, stream: false, format: 'json', think: false }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Ollama ${model} error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.response || '';
}

function parseJsonLoose(text, fallbackAttempt = 0) {
  try {
    return JSON.parse(text);
  } catch {
    // Some models wrap JSON in prose or fences despite format:json — recover.
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); }
      catch { /* fall through to repair */ }
    }
  }
  // Last resort: common LLM JSON breakages — raw newlines/tabs inside strings
  // and unescaped quotes. Escape control chars inside string bodies.
  const m2 = text.match(/\{[\s\S]*\}/);
  const raw = m2 ? m2[0] : text;
  const repaired = raw
    .replace(/"(?:[^"\\]|\\.)*"/g, (s) => s.replace(/[\b\f\n\r\t\v]/g, (c) => ({ '\b':'\\b','\f':'\\f','\n':'\\n','\r':'\\r','\t':'\\t','\v':'\\u000b' }[c])))
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  try {
    return JSON.parse(repaired);
  } catch (err) {
    throw new Error(`Unparseable JSON (${err.message.slice(0, 120)}): ${raw.slice(0, 200)}`);
  }
}

// ---------------------------------------------------------------
// Story selection — pluggable sources
// ---------------------------------------------------------------
//
// Order: HN (tech-savvy readers, fresh) → Reddit (sub-communities,
// broader audience) → CISA (official, always relevant, lower volume).
// Each source is independent; we accept the first non-null result.
//
// All stories share the shape { id, title, url, score, source } so
// downstream code doesn't care which one won.

async function fetchHNTopStory() {
  try {
    const topRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
    const topIds = await topRes.json();
    const candidates = await Promise.all(
      topIds.slice(0, HN_TOP_N).map(async (id) => {
        const res = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
        return res.json();
      })
    );

    // Don't repeat stories already covered by published drafts.
    let seenUrls = new Set();
    try {
      const rows = await sql`SELECT title FROM draft_posts WHERE title IS NOT NULL`;
      seenUrls = new Set(rows.map((r) => r.title.toLowerCase().trim()));
    } catch { /* table column may not exist yet */ }

    const scored = candidates
      .filter((s) => s && s.type === 'story' && s.score > HN_MIN_SCORE && s.title && s.url)
      .filter((s) => !HN_BANNED_TITLE.test(s.title))
      .filter((s) => !seenUrls.has(s.title.toLowerCase().trim()))
      .filter((s) => HN_RELEVANT.test(`${s.title} ${s.url || ''}`))
      .map((s) => ({ ...s, weight: s.score * (HN_RELEVANT.test(s.title) ? 2 : 1) }))
      .sort((a, b) => b.weight - a.weight);

    const winner = scored[0];
    if (!winner) return null;
    return { ...winner, source: 'hn' };
  } catch (err) {
    console.error('[hn] fetch error', err);
    return null;
  }
}

async function fetchRedditTopStory() {
  // Try each subreddit in turn; return first non-null hit.
  for (const src of REDDIT_SOURCES) {
    try {
      const url = `https://www.reddit.com/r/${src.subreddit}/top.json?t=day&limit=${src.limit}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'simpleitsrq-blog-publisher/1.0 (by /u/simpleitsrq)' },
      });
      if (!res.ok) {
        console.warn(`[reddit] ${src.label} HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      const posts = (data?.data?.children || []).map((c) => c.data);

      let seenTitles = new Set();
      try {
        const rows = await sql`SELECT title FROM draft_posts WHERE title IS NOT NULL`;
        seenTitles = new Set(rows.map((r) => r.title.toLowerCase().trim()));
      } catch { /* table column may not exist yet */ }

      const winner = posts
        .filter((p) => p && p.score >= src.minScore)
        .filter((p) => !p.over_18 && !p.spoiler && !p.stickied)
        .filter((p) => !REDDIT_BANNED.test(p.title || ''))
        .filter((p) => HN_RELEVANT.test(`${p.title} ${p.url || ''}`))
        .filter((p) => p.url && /^https?:\/\//.test(p.url) && !p.url.includes('reddit.com'))
        .filter((p) => !seenTitles.has((p.title || '').toLowerCase().trim()))
        .sort((a, b) => b.score - a.score)[0];

      if (winner) {
        return {
          id: winner.id,
          title: winner.title,
          url: winner.url,
          score: winner.score,
          source: src.label,
        };
      }
    } catch (err) {
      console.warn(`[reddit] ${src.label} error: ${err.message?.slice(0, 100)}`);
    }
  }
  return null;
}

async function fetchCISAAlert() {
  // Try KEV (Known Exploited Vulnerabilities) first — it's a JSON
  // catalog updated daily with a list of CVEs actively being exploited
  // in the wild. Higher cadence, easier to parse, and immediately
  // relevant to an IT services company. Falls back to the advisories
  // RSS for longer-form coverage.
  try {
    const res = await fetch(CISA_KEV_JSON, {
      headers: { 'User-Agent': 'simpleitsrq-blog-publisher/1.0' },
    });
    if (res.ok) {
      const data = await res.json();
      const vulns = Array.isArray(data?.vulnerabilities) ? data.vulnerabilities : [];

      let seenTitles = new Set();
      try {
        const rows = await sql`SELECT title FROM draft_posts WHERE title IS NOT NULL`;
        seenTitles = new Set(rows.map((r) => r.title.toLowerCase().trim()));
      } catch { /* table column may not exist yet */ }

      // Pick the most recent KEV entry whose vendor+product is relevant
      // and whose title we haven't already covered.
      const winner = vulns
        .filter((v) => v && v.cveID && v.vendorProject && v.product)
        .filter((v) => CISA_RELEVANT.test(`${v.vendorProject} ${v.product} ${v.vulnerabilityName || ''}`))
        .sort((a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || ''))
        .find((v) => {
          const title = `${v.cveID} ${v.vendorProject} ${v.product}`.toLowerCase().trim();
          return !seenTitles.has(title);
        });

      if (winner) {
        // Build a richer story from the CVE so the writer has real
        // material to work with — not just a bare CVE number.
        return {
          id: winner.cveID,
          title: `${winner.cveID}: ${winner.vendorProject} ${winner.product} ${winner.vulnerabilityName || 'actively exploited'}`,
          url: `https://nvd.nist.gov/vuln/detail/${winner.cveID}`,
          score: 1000, // KEV = always high-signal
          source: 'cisa-kev',
          cveID: winner.cveID,
          vendor: winner.vendorProject,
          product: winner.product,
          cveName: winner.vulnerabilityName,
          shortDescription: winner.shortDescription,
          requiredAction: winner.requiredAction,
          dateAdded: winner.dateAdded,
        };
      }
    }
  } catch (err) {
    console.warn(`[cisa] KEV fetch error: ${err.message?.slice(0, 100)}`);
  }

  // Fallback: advisories RSS (long-form, lower cadence).
  try {
    const res = await fetch(CISA_ADVISORIES_RSS, {
      headers: { 'User-Agent': 'simpleitsrq-blog-publisher/1.0' },
    });
    if (!res.ok) return null;
    const xml = await res.text();
    const items = [];
    const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/g;
    const titleRe = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/;
    const linkRe = /<link>(?:<!\[CDATA\[)?(https?:\/\/[^\s<]+)(?:\]\]>)?<\/link>/;
    let m;
    while ((m = itemRe.exec(xml))) {
      const block = m[1];
      const t = titleRe.exec(block)?.[1]?.trim();
      const l = linkRe.exec(block)?.[1]?.trim();
      if (t && l) items.push({ title: t, url: l });
    }

    let seenTitles = new Set();
    try {
      const rows = await sql`SELECT title FROM draft_posts WHERE title IS NOT NULL`;
      seenTitles = new Set(rows.map((r) => r.title.toLowerCase().trim()));
    } catch { /* table column may not exist yet */ }

    const winner = items
      .filter((it) => CISA_RELEVANT.test(`${it.title} ${it.url}`))
      .find((it) => !seenTitles.has(it.title.toLowerCase().trim()));

    if (!winner) return null;
    return {
      id: winner.url,
      title: winner.title,
      url: winner.url,
      score: 1000, // CISA is always high-signal
      source: 'cisa',
    };
  } catch (err) {
    console.warn(`[cisa] advisories fetch error: ${err.message?.slice(0, 100)}`);
  }
  return null;
}

// Try each source in priority order; first non-null wins.
// Order: Local-SEO keyword (evergreen, targets real search queries) →
// HN (tech-savvy readers, fresh) → Reddit (sub-communities,
// fallback) → CISA (long-tail security fallback).
async function fetchStory() {
  const sources = [
    { name: 'local',  fn: fetchLocalKeyword },
    { name: 'hn',     fn: fetchHNTopStory },
    { name: 'reddit', fn: fetchRedditTopStory },
    { name: 'cisa',   fn: fetchCISAAlert },
  ];
  for (const src of sources) {
    const t0 = Date.now();
    const story = await src.fn();
    if (story) {
      console.log(`[story] Picked from ${src.name} in ${Date.now() - t0}ms: ${story.title}`);
      return story;
    }
    console.log(`[story] ${src.name} had no publishable story (${Date.now() - t0}ms).`);
  }
  return null;
}

// ---------------------------------------------------------------
// Slop scoring — same rules as scripts/audit-ai-slop.mjs
// ---------------------------------------------------------------

const SLOP_RULES = [
  { label: 'em-dash', re: /—/g, weight: 2, cap: 30 },
  { label: 'double-hyphen-as-em', re: / -- /g, weight: 2, cap: 10 },
  { label: 'as-a-X-you-know', re: /\bas an? [a-z]+ (?:owner|operator|leader|professional|user)[, ]/gi, weight: 5, cap: 5 },
  { label: 'in-todays-X-landscape', re: /\bin today'?s (?:fast-paced|digital|business|competitive|ever-evolving|complex|modern) [a-z ]*landscape\b/gi, weight: 8, cap: 5 },
  { label: 'navigate-the-X', re: /\bnavigate the (?:complex|complexities|challenges|landscape|world)\b/gi, weight: 5, cap: 5 },
  { label: 'delve-into', re: /\bdelve\s+into\b/gi, weight: 4, cap: 5 },
  { label: 'tapestry', re: /\btapestry\b/gi, weight: 6, cap: 5 },
  { label: 'embark', re: /\bembark\b/gi, weight: 4, cap: 5 },
  { label: 'in-the-realm-of', re: /\bin the realm of\b/gi, weight: 6, cap: 5 },
  { label: 'it-is-important-to-note', re: /\b(?:it is important to note|it'?s important to note|it should be noted)\b/gi, weight: 4, cap: 5 },
  { label: 'in-conclusion', re: /\b(?:in conclusion|to conclude|in summary)\b/gi, weight: 3, cap: 5 },
  { label: 'leverage', re: /\bleverag(?:e|es|ed|ing)\b/gi, weight: 3, cap: 8 },
  { label: 'synergy', re: /\bsynerg(?:y|ies|istic)\b/gi, weight: 4, cap: 5 },
  { label: 'robust', re: /\brobust\b/gi, weight: 2, cap: 8 },
  { label: 'cutting-edge', re: /\bcutting[- ]edge\b/gi, weight: 3, cap: 5 },
  { label: 'seamless', re: /\bseamless(?:ly)?\b/gi, weight: 2, cap: 8 },
  { label: 'streamline', re: /\bstreamlin(?:e|es|ed|ing)\b/gi, weight: 2, cap: 8 },
  { label: 'best-in-class', re: /\bbest[- ]in[- ]class\b/gi, weight: 3, cap: 5 },
  { label: 'unlock-the-power', re: /\bunlock(?:ing)? the (?:power|potential|secrets?)\b/gi, weight: 5, cap: 5 },
  { label: 'empower', re: /\bempower(?:s|ed|ing|ment)?\b/gi, weight: 2, cap: 8 },
  { label: 'tailored-solution', re: /\btailored (?:solution|approach|strategy|service)/gi, weight: 3, cap: 5 },
  { label: 'peace-of-mind', re: /\bpeace of mind\b/gi, weight: 1, cap: 5 },
  { label: 'ever-evolving', re: /\bever[- ]evolving\b/gi, weight: 4, cap: 5 },
  { label: 'fast-paced', re: /\bfast[- ]paced\b/gi, weight: 3, cap: 5 },
  { label: 'moreover-furthermore', re: /\b(?:moreover|furthermore|in addition,)/gi, weight: 1, cap: 8 },
  { label: 'crucial-paramount-vital', re: /\b(?:crucial|paramount|of utmost importance)\b/gi, weight: 1, cap: 8 },
  { label: 'feel-free-to', re: /\bfeel free to\b/gi, weight: 2, cap: 5 },
  { label: 'dont-hesitate', re: /\bdon'?t hesitate\b/gi, weight: 3, cap: 5 },
  { label: 'game-changer', re: /\bgame[- ]changer\b/gi, weight: 3, cap: 3 },
  { label: 'unparalleled', re: /\bunparalleled\b/gi, weight: 3, cap: 5 },
  { label: 'plethora', re: /\bplethora\b/gi, weight: 4, cap: 5 },
  { label: 'X-is-more-than-just', re: /\b[A-Z][a-z]+ is more than just\b/g, weight: 4, cap: 3 },
  { label: 'whether-youre-X-or-Y', re: /\bwhether you'?re [a-z]+ or [a-z]+,/gi, weight: 2, cap: 5 },
];

function slopScore(body) {
  const hits = [];
  let total = 0;
  for (const rule of SLOP_RULES) {
    const matches = body.match(rule.re) || [];
    if (!matches.length) continue;
    const counted = Math.min(matches.length, rule.cap);
    total += counted * rule.weight;
    hits.push(`${rule.label}×${matches.length}`);
  }
  const wc = body.split(/\s+/).filter(Boolean).length;
  const firstPerson = (body.match(/\b(?:I |I'm |I've |I'd |my |me )/g) || []).length;
  if (wc > 600 && firstPerson < 3) {
    total += 6;
    hits.push('no-first-person');
  }
  return { score: total, wc, hits };
}

// ---------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------

const WRITER_SYSTEM = `You are Dancho Ivanov, founder of Simple IT SRQ — a managed IT services and computer repair company serving Sarasota and Bradenton, Florida. You have run this business for years: you've pulled dead drives out of flooded offices after hurricanes, cleaned up after ransomware at law firms on Main St, and talked worried practice managers near Sarasota Memorial through backup restores at 7am.

Write like that person writes: specific, first-person, practical, occasionally opinionated. Reference real local context (Manatee County, Lakewood Ranch, SRQ, seasonal snowbirds, hurricane season). Never generic.

HARD BANS — these phrases mark text as AI-generated and will get the post rejected:
- "navigate the complexities", "in today's fast-paced world", "delve into", "game-changer", "seamless", "leverage" (as a verb), "robust", "peace of mind", "crucial", "cutting-edge", "it's important to note", "feel free to", "don't hesitate to"
- Em dashes (—). Use commas, periods, or parentheses instead.
- Opening with "As a business owner..."

STRUCTURE (exact Markdown H2 headings):
## The Short Answer
## Local Impact for Sarasota & Bradenton Businesses
## Recommended Gear & Solutions
(pick 2-3 concrete products that fit this topic — e.g. Ubiquiti UniFi, Synology NAS, YubiKey, Bitwarden, Malwarebytes — say who each is for and why, plainly)
## Action Plan for This Week
(numbered, concrete, do-this-then-this)
## Need Hands-On Help in SRQ?
(close by inviting readers to book a free 30-minute strategy call at /book or browse /services)

Use "I" naturally at least 5 times. Include one short anecdote or field observation that sounds lived-in. 800-1100 words.

Respond with ONLY valid JSON, no markdown fencing:
{"title": "...", "slug": "kebab-case-slug", "category": "Cybersecurity|AI & Productivity|Cloud|Business Tech", "excerpt": "...", "metaDescription": "<=155 chars", "body": "markdown body"}`;

const CRITIC_SYSTEM = `You are a ruthless blog editor for a local IT services company. You receive a draft post as JSON. Your job:

1. Score AI-sounding tells. Count instances of: em dashes, "delve", "leverage" (verb), "seamless", "robust", "crucial", "navigate the", "game-changer", "in today's...", "it's important to note", "peace of mind", "feel free to". Also check: does it use first person ("I") at least 5 times? Does it contain at least one concrete anecdote? Does it mention Sarasota/Bradenton naturally more than once?

2. Check facts lightly: does the advice match the story it's based on? Any claim that seems wrong or dangerous for a small business to follow?

3. Check structure: all six required H2 sections present? Word count 700-1200?

Respond with ONLY valid JSON:
{"verdict": "accept" | "revise",
 "issues": ["specific problem 1", "problem 2"],
 "rewrite_instructions": "if revise: one paragraph of concrete, prioritized instructions for what to change"}`;

function revisionPrompt(post, issues) {
  return `Here is your previous draft:

${JSON.stringify(post)}

Your editor rejected it with these issues:
${issues.map((i, n) => `${n + 1}. ${i}`).join('\n')}

Rewrite the FULL post fixing every issue. Keep what works; cut everything the editor flagged. Same JSON schema, no fencing.`;
}

// ---------------------------------------------------------------
// Slug + persistence
// ---------------------------------------------------------------

// Return the slug only if it is free. On collision, return null so the
// caller SKIPS the story entirely — we never publish -NNNN numbered
// duplicate variants of an existing post.
async function pickFreeSlug(base) {
  const attempt = String(base || 'post').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96) || 'post';
  const existing = await sql`SELECT 1 FROM draft_posts WHERE slug = ${attempt} LIMIT 1`;
  if (existing.length === 0) return attempt;
  console.log(`[blog] Slug already exists: ${attempt}. Skipping story instead of creating a numbered variant.`);
  return null;
}

// ---------------------------------------------------------------
// Main pipeline: story → write → critique → revise → publish
// ---------------------------------------------------------------

export async function generateLocalDraft() {
  console.log(`[blog] writer=${WRITER_MODEL} critic=${CRITIC_MODEL} slop_threshold=${SLOP_THRESHOLD}`);

  const story = await fetchStory();
  if (!story) {
    console.log('[blog] No fresh relevant story from any source. Skipping.');
    return { ok: false, reason: 'no_story' };
  }
  const hnUrl = story.source === 'hn'
    ? `https://news.ycombinator.com/item?id=${story.id}`
    : story.url;
  console.log(`[blog] Story (${story.source}): ${story.title} (score ${story.score})`);

  const sourceLabel = {
    local:    'a local search query',
    hn:     'Hacker News',
    'r/sysadmin':     'the r/sysadmin subreddit',
    'r/msp':          'the r/msp subreddit',
    'r/cybersecurity': 'the r/cybersecurity subreddit',
    'r/netsec':       'the r/netsec subreddit',
    cisa:     'a CISA cybersecurity advisory',
    'cisa-kev': 'a CISA Known Exploited Vulnerability (KEV) entry',
  }[story.source] || 'a tech news story';

  // For the local-SEO source, feed the writer the target query + angle
  // so the post is written to rank for that phrase, not to react to news.
  const localContext = story.source === 'local' ? `
Target search query: ${story.keyword.query}
Local angle to lead with: ${story.keyword.angle}
Write this as an evergreen, authoritative guide that answers the query
directly. Use the query phrase naturally in the title, first paragraph,
and at least one H2. Do NOT reference a news story or date — this is a
timeless local guide.` : '';

  // For CISA-KEV we have rich structured data — feed it to the writer
  // so the post is grounded in the real CVE details, not invented.
  const cveContext = story.source === 'cisa-kev' ? `
CVE: ${story.cveID}
Vendor/Product: ${story.vendor} ${story.product}
Vulnerability: ${story.cveName || ''}
Description: ${story.shortDescription || ''}
Required action: ${story.requiredAction || ''}
Date added to KEV: ${story.dateAdded || ''}
` : '';

  const userPrompt = `Rewrite this ${sourceLabel} story for the Simple IT SRQ blog.
Title: ${story.title}
URL: ${story.url}
${story.source === 'hn' ? `HN discussion: ${hnUrl}\n` : ''}Score: ${story.score}${cveContext}${localContext}`;

  // --- Write ---
  console.log(`[blog] Drafting with ${WRITER_MODEL}...`);
  let post = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      post = parseJsonLoose(await ollamaGenerate(WRITER_MODEL, WRITER_SYSTEM, userPrompt));
      if (post.title && post.body) break;
      console.warn(`[blog] Attempt ${attempt}: writer JSON missing title/body (got keys: ${Object.keys(post || {}).join(',')})`);
    } catch (err) {
      console.warn(`[blog] Attempt ${attempt}: writer failed: ${String(err.message).slice(0, 160)}`);
    }
    post = null;
  }
  if (!post) throw new Error('Writer returned no usable post after 3 attempts');

  // --- Critique loop ---
  for (let round = 1; round <= MAX_REVISIONS + 1; round++) {
    const slop = slopScore(post.body || '');
    console.log(`[blog] Round ${round}: slop score ${slop.score} (${slop.hits.slice(0, 4).join(', ') || 'clean'}), ${slop.wc} words`);

    let critique;
    try {
      critique = parseJsonLoose(await ollamaGenerate(
        CRITIC_MODEL,
        CRITIC_SYSTEM,
        `Draft:\n${JSON.stringify(post)}\n\nHeuristic slop scan found: ${slop.hits.join(', ') || 'nothing'}. Slop score ${slop.score}/100-ish (lower is better, under ${SLOP_THRESHOLD} publishes).`,
      ));
    } catch (err) {
      console.warn('[blog] Critic failed, relying on heuristic alone:', err.message);
      critique = { verdict: slop.score <= SLOP_THRESHOLD ? 'accept' : 'revise', issues: slop.hits, rewrite_instructions: 'Remove every flagged phrase; replace with plain talk.' };
    }

    if (critique.verdict === 'accept' && slop.score <= SLOP_THRESHOLD) {
      console.log('[blog] Critic accepted the draft.');
      break;
    }
    if (round > MAX_REVISIONS) {
      if (slop.score <= SLOP_THRESHOLD + 4) {
        console.log(`[blog] Max revisions reached; slop ${slop.score} within grace margin. Publishing anyway.`);
        break;
      }
      console.error(`[blog] Draft still too sloppy after ${MAX_REVISIONS} revisions (score ${slop.score}). Aborting without publishing.`);
      return { ok: false, reason: 'quality_gate', slop: slop.score };
    }

    console.log(`[blog] Revising per critic: ${critique.rewrite_instructions?.slice(0, 140) || '(heuristic flags)'}`);
    post = parseJsonLoose(await ollamaGenerate(WRITER_MODEL, WRITER_SYSTEM, revisionPrompt(post, [...(critique.issues || []), ...slop.hits])));
  }

  // --- Persist + publish ---
  const finalSlug = await pickFreeSlug(post.slug);
  if (!finalSlug) {
    console.log('[blog] Slug collision — skipping story entirely.');
    return { ok: false, reason: 'slug_collision', slug: post.slug };
  }

  const inserted = await sql`
    INSERT INTO draft_posts (title, slug, category, excerpt, body, meta_desc, model)
    VALUES (${post.title}, ${finalSlug}, ${post.category || 'Business Tech'},
            ${post.excerpt || ''}, ${post.body}, ${post.metaDescription || ''},
            ${`${WRITER_MODEL}+${CRITIC_MODEL}`})
    RETURNING id`;
  console.log(`[blog] Draft ID ${inserted[0].id}: ${post.title}`);

  const publishResult = await publishDraftToGitHub({
    title: post.title,
    slug: finalSlug,
    category: post.category || 'Business Tech',
    excerpt: post.excerpt || '',
    body: post.body,
    meta_desc: post.metaDescription || '',
    tags: story.source === 'local'
      ? ['local-it', 'sarasota', 'bradenton', 'managed-it']
      : ['hacker-news', 'local-it'],
    sourceUrl: story.url,
  });

  if (publishResult.ok) {
    await sql`UPDATE draft_posts SET status='published', reviewed_at=now(), published_at=now() WHERE id=${inserted[0].id}`;
    console.log(`[blog] Published to GitHub → Vercel deploy triggered. ${publishResult.htmlUrl || ''}`);
    return { ok: true, slug: finalSlug };
  }
  console.error('[blog] GitHub publish failed:', publishResult.error, publishResult.detail);
  return { ok: false, reason: 'publish_failed' };
}

// CLI entry: `node scripts/local-publisher.mjs`
if (process.argv[1] && process.argv[1].endsWith('local-publisher.mjs')) {
  generateLocalDraft()
    .then((r) => { process.exit(r.ok ? 0 : 1); })
    .catch((err) => { console.error('[blog] Fatal:', err); process.exit(1); });
}
