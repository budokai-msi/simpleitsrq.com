// api/_lib/trends-fetch.js
//
// Daily trend fetchers shared by the Vercel cron endpoint (api/cron/trends.js)
// and the local script (scripts/trends/fetch-trends.mjs). Pulls trending
// topics from free, keyless open-source REST APIs and upserts them into the
// `trends_daily` table. Also seeds `search_terms` with a curated IT/MSP list
// the first time it runs.
//
// Sources (all keyless):
//   - Wikipedia Pageviews API (top articles by views)
//   - Hacker News Firebase API (top stories)
//   - Reddit JSON API (hot posts from tech/sysadmin subreddits)
//
// Exports `fetchTrends()` for both the cron and the local daemon.

import { sql } from "./db.js";

const SOURCES = ["wikipedia", "hackernews", "reddit", "duckduckgo"];
const TOP_N = 20;

// Curated IT/MSP-relevant keywords used to seed `search_terms` when empty.
const SEED_TERMS = [
  ["managed it services", "commercial", "it services"],
  ["computer repair", "transactional", "it services"],
  ["cybersecurity", "commercial", "security"],
  ["data backup", "commercial", "data"],
  ["cloud migration", "commercial", "cloud"],
  ["microsoft 365", "commercial", "productivity"],
  ["network security", "commercial", "security"],
  ["ransomware", "informational", "security"],
  ["voip", "commercial", "communications"],
  ["server maintenance", "commercial", "it services"],
  ["help desk", "commercial", "it services"],
  ["firewall", "commercial", "security"],
  ["vpn", "commercial", "security"],
  ["nas", "commercial", "hardware"],
  ["ssd upgrade", "transactional", "hardware"],
  ["laptop repair", "transactional", "it services"],
  ["data recovery", "transactional", "data"],
  ["email security", "commercial", "security"],
  ["remote work", "informational", "workplace"],
  ["ai in business", "informational", "ai"],
  ["business phone system", "commercial", "communications"],
  ["managed backup", "commercial", "data"],
  ["endpoint protection", "commercial", "security"],
  ["it support", "commercial", "it services"],
  ["network setup", "transactional", "it services"],
];

// Normalize a 1-based rank into a 0-100 score for a list of N items.
function rankScore(rank, n) {
  return Math.round(100 * (1 - (rank - 1) / n));
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// --- Source fetchers -------------------------------------------------------

async function fetchWikipedia() {
  const d = yesterday();
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia.org/all-access/${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  const data = await fetchJson(url);
  const articles = data?.items?.[0]?.articles || [];
  return articles.slice(0, TOP_N).map((a, i) => ({
    keyword: String(a.article || "").replace(/_/g, " ").trim(),
    score: rankScore(i + 1, TOP_N),
    volume: Number(a.views || 0),
    url: `https://en.wikipedia.org/wiki/${a.article}`,
  }));
}

async function fetchHackerNews() {
  const ids = await fetchJson("https://hacker-news.firebaseio.com/v0/topstories.json");
  const topIds = (Array.isArray(ids) ? ids : []).slice(0, TOP_N);
  const items = [];
  for (const id of topIds) {
    try {
      const item = await fetchJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
      if (item && item.title) items.push(item);
    } catch (err) {
      console.warn(`[trends] hackernews item ${id} failed: ${err.message}`);
    }
  }
  return items.slice(0, TOP_N).map((s, i) => ({
    keyword: String(s.title || "").trim(),
    score: rankScore(i + 1, TOP_N),
    volume: Number(s.score || 0),
    url: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
  }));
}

async function fetchReddit() {
  const subreddits = ["technology", "sysadmin"];
  const posts = [];
  for (const sub of subreddits) {
    try {
      const data = await fetchJson(`https://www.reddit.com/r/${sub}/hot.json?limit=${TOP_N}`, {
        headers: { "User-Agent": "SimpleITSRQ-trends/1.0" },
      });
      const children = data?.data?.children || [];
      for (const child of children) {
        const p = child?.data;
        if (p && p.title) posts.push(p);
      }
    } catch (err) {
      console.warn(`[trends] reddit r/${sub} failed: ${err.message}`);
    }
  }
  return posts.slice(0, TOP_N).map((p, i) => ({
    keyword: String(p.title || "").trim(),
    score: rankScore(i + 1, TOP_N),
    volume: Number(p.score || 0),
    url: `https://www.reddit.com${p.permalink || ""}`,
  }));
}

// DuckDuckGo Instant Answer API — keyless, returns a topic + abstract for a
// query. We probe a set of IT/MSP-relevant queries and record the top answers
// as "trending" search terms. Reliable where Reddit's JSON API 403s.
const DDG_QUERIES = [
  "managed it services",
  "cybersecurity",
  "data backup",
  "cloud migration",
  "microsoft 365",
  "network security",
  "ransomware",
  "voip",
  "firewall",
  "vpn",
  "nas storage",
  "ssd upgrade",
  "laptop repair",
  "data recovery",
  "email security",
  "remote work",
  "ai in business",
  "endpoint protection",
  "it support",
  "network setup",
];

async function fetchDuckDuckGo() {
  const items = [];
  for (const q of DDG_QUERIES) {
    try {
      const data = await fetchJson(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1`);
      const topic = data?.Heading || data?.AbstractText || "";
      if (topic) {
        items.push({
          keyword: String(topic).slice(0, 200).trim(),
          score: rankScore(items.length + 1, DDG_QUERIES.length),
          volume: 0,
          url: data?.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
        });
      }
    } catch (err) {
      console.warn(`[trends] duckduckgo "${q}" failed: ${err.message}`);
    }
  }
  return items;
}

const FETCHERS = {
  wikipedia: fetchWikipedia,
  hackernews: fetchHackerNews,
  reddit: fetchReddit,
  duckduckgo: fetchDuckDuckGo,
};

// --- DB helpers ------------------------------------------------------------

async function seedSearchTerms() {
  const rows = await sql`SELECT COUNT(*)::int AS n FROM search_terms`;
  if (Number(rows[0]?.n || 0) > 0) {
    console.log("[trends] search_terms already seeded, skipping.");
    return 0;
  }
  let inserted = 0;
  for (const [term, intent, category] of SEED_TERMS) {
    await sql`
      INSERT INTO search_terms (term, intent, category)
      VALUES (${term}, ${intent}, ${category})
      ON CONFLICT (term) DO NOTHING
    `;
    inserted += 1;
  }
  console.log(`[trends] Seeded ${inserted} search_terms.`);
  return inserted;
}

async function upsertTrends(date, source, items) {
  let count = 0;
  for (const item of items) {
    if (!item.keyword) continue;
    await sql`
      INSERT INTO trends_daily (date, source, keyword, score, volume, url, metadata)
      VALUES (${date}, ${source}, ${item.keyword}, ${item.score}, ${item.volume}, ${item.url}, '{}'::jsonb)
      ON CONFLICT (date, source, keyword)
      DO UPDATE SET
        score = EXCLUDED.score,
        volume = EXCLUDED.volume,
        url = EXCLUDED.url,
        metadata = EXCLUDED.metadata
    `;
    count += 1;
  }
  return count;
}

// --- Main entry ------------------------------------------------------------

export async function fetchTrends() {
  const date = yesterday().toISOString().slice(0, 10);
  console.log(`[trends] Fetching daily trends for ${date}...`);

  await seedSearchTerms();

  const summary = {};
  for (const source of SOURCES) {
    try {
      const items = await FETCHERS[source]();
      const count = await upsertTrends(date, source, items);
      summary[source] = count;
      console.log(`[trends] ${source}: ${count} rows upserted.`);
    } catch (err) {
      summary[source] = 0;
      console.error(`[trends] ${source} failed: ${err.message}`);
    }
  }

  console.log("[trends] Summary:", JSON.stringify(summary));
  return summary;
}
