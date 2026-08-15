// api/_lib/osint.js
//
// Pulls public OSINT threat feeds into threat_feeds and matches visitor IPs
// against the cache. Runs from /api/cron/report once a day and on-demand
// from the admin panel (/api/portal?action=osint-refresh). No API key
// required — all feeds below are freely published.
//
// Feeds:
//   - Spamhaus DROP v4/v6: high-confidence malicious netblocks.
//   - Emerging Threats compromised IPs: individual hosts flagged this week.
//
// Spamhaus merged the historical EDROP data into DROP in April 2024. Their
// current free datasets are newline-delimited JSON, so we consume those
// directly instead of depending on the legacy EDROP text endpoint.

import { sql } from "./db.js";

/** @typedef {import('./types.js').OsintFeedSummary} OsintFeedSummary */
/** @typedef {import('./types.js').OsintRefreshResult} OsintRefreshResult */
/** @typedef {import('./types.js').OsintMatch} OsintMatch */
/** @typedef {import('./types.js').OsintStatus} OsintStatus */

/**
 * Static config for one OSINT feed.
 * @typedef {Object} OsintFeed
 * @property {string} name
 * @property {string} url
 * @property {string} category
 * @property {'text'|'spamhaus-json'} [format]
 */

/** @type {OsintFeed[]} */
const FEEDS = [
  {
    name: "spamhaus_drop",
    url: "https://www.spamhaus.org/drop/drop_v4.json",
    category: "hijacked_netblock",
    format: "spamhaus-json",
  },
  {
    name: "spamhaus_drop_v6",
    url: "https://www.spamhaus.org/drop/drop_v6.json",
    category: "hijacked_netblock",
    format: "spamhaus-json",
  },
  {
    name: "et_compromised",
    url: "https://rules.emergingthreats.net/blockrules/compromised-ips.txt",
    category: "compromised_host",
    format: "text",
  },
];

/**
 * Parse one line of a text feed into a normalized CIDR, or null if
 * unparseable. ET format is normally one IP per line; comments are ignored.
 *
 * @param {string} line
 * @returns {string|null}
 */
function parseLine(line) {
  const stripped = line.split(/[;#]/)[0].trim();
  if (!stripped) return null;
  if (/^[0-9a-f:.]+\/[0-9]+$/i.test(stripped)) return stripped;
  if (/^[0-9a-f:.]+$/i.test(stripped)) {
    return stripped.includes(":") ? `${stripped}/128` : `${stripped}/32`;
  }
  return null;
}

/**
 * Parse Spamhaus' current newline-delimited DROP JSON. Metadata/copyright
 * records do not contain a cidr field and are intentionally skipped.
 *
 * @param {string} text
 * @returns {string[]}
 */
function parseSpamhausJson(text) {
  const cidrs = new Set();
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const row = JSON.parse(line);
      if (typeof row?.cidr === "string" && /^[0-9a-f:.]+\/[0-9]+$/i.test(row.cidr)) {
        cidrs.add(row.cidr);
      }
    } catch {
      // Ignore malformed individual records while retaining the valid dataset.
    }
  }
  return Array.from(cidrs);
}

/**
 * Fetch and parse one feed over HTTP. Throws on a non-2xx response.
 * Every parser returns unique CIDRs so one duplicated upstream record cannot
 * make PostgreSQL's ON CONFLICT statement touch the same row twice.
 *
 * @param {OsintFeed} feed
 * @returns {Promise<string[]>}
 */
async function fetchFeed(feed) {
  const res = await fetch(feed.url, {
    signal: AbortSignal.timeout(8000),
    headers: { "User-Agent": "simpleitsrq-osint/1.1 (+https://simpleitsrq.com)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();

  if (feed.format === "spamhaus-json") return parseSpamhausJson(text);

  const cidrs = new Set();
  for (const raw of text.split(/\r?\n/)) {
    const parsed = parseLine(raw);
    if (parsed) cidrs.add(parsed);
  }
  return Array.from(cidrs);
}

/**
 * Pulls every configured feed in parallel and upserts each CIDR under its
 * (feed_name, cidr) unique constraint. Returns a per-feed summary so the
 * caller can log / surface it to the admin. A single-feed failure does not
 * abort the others — an upstream outage should not erase the last known-good
 * cache or block other feeds from refreshing.
 *
 * @returns {Promise<OsintRefreshResult>}
 */
export async function refreshThreatFeeds() {
  const start = Date.now();
  /** @type {OsintFeedSummary[]} */
  const summary = [];

  await Promise.all(
    FEEDS.map(async (feed) => {
      try {
        const cidrs = await fetchFeed(feed);
        if (cidrs.length === 0) {
          // Preserve the existing cache on an empty/malformed upstream response.
          summary.push({ feed: feed.name, ok: false, error: "empty_response" });
          return;
        }
        // Single batched upsert via UNNEST — safe (parameterized) and one
        // round-trip per feed. UNIQUE (feed_name, cidr) from migration 003
        // makes re-runs idempotent; known CIDRs just bump fetched_at.
        await sql`
          INSERT INTO threat_feeds (feed_name, source_url, cidr, category, fetched_at)
          SELECT ${feed.name}, ${feed.url}, c::cidr, ${feed.category}, now()
          FROM unnest(${cidrs}::text[]) AS c
          ON CONFLICT (feed_name, cidr) DO UPDATE SET fetched_at = EXCLUDED.fetched_at
        `;
        // Purge entries that disappeared from a successfully parsed upstream
        // list. Failed/empty feeds never reach this branch, preserving the
        // last known-good cache until the source recovers.
        const cutoff = new Date(start - 5 * 60 * 1000).toISOString();
        const removed = await sql`
          DELETE FROM threat_feeds
          WHERE feed_name = ${feed.name} AND fetched_at < ${cutoff}
          RETURNING id
        `;
        summary.push({
          feed: feed.name,
          ok: true,
          fetched: cidrs.length,
          removed: removed.length,
        });
      } catch (err) {
        summary.push({ feed: feed.name, ok: false, error: String(err.message || err).slice(0, 200) });
      }
    }),
  );

  return { ok: summary.some((s) => s.ok), elapsedMs: Date.now() - start, feeds: summary };
}

/**
 * Returns every threat_feeds row whose CIDR contains the given IP. Used by
 * the admin panels to badge live matches on visitor / threat-actor rows.
 *
 * @param {string[]} ips
 * @returns {Promise<Record<string, OsintMatch[]>>}
 *   Map from IP → matching feed entries. Empty object when `ips` is empty or
 *   the underlying query fails (e.g. migration not yet run).
 */
export async function matchOsintFeeds(ips) {
  if (!Array.isArray(ips) || ips.length === 0) return {};
  try {
    const rows = await sql`
      SELECT v.ip, f.feed_name, f.category, f.cidr, f.fetched_at
      FROM (
        SELECT unnest(${ips}::text[]) AS ip
      ) v
      JOIN threat_feeds f ON v.ip::inet <<= f.cidr
      ORDER BY f.fetched_at DESC
    `;
    /** @type {Record<string, OsintMatch[]>} */
    const byIp = {};
    for (const r of rows) {
      const key = r.ip;
      if (!byIp[key]) byIp[key] = [];
      byIp[key].push({
        feed: r.feed_name,
        category: r.category,
        cidr: String(r.cidr),
        fetchedAt: r.fetched_at,
      });
    }
    return byIp;
  } catch {
    // Most likely: migration 003 not yet run. Return empty map so callers
    // degrade gracefully instead of 500-ing the admin panel.
    return {};
  }
}

/**
 * Lightweight summary for the admin dashboard: row counts per feed, last
 * refresh time, and the 20 most-recent matches against actual visit data.
 *
 * @returns {Promise<OsintStatus>}
 */
export async function osintStatus() {
  try {
    const perFeed = await sql`
      SELECT feed_name,
             COUNT(*)::int       AS cidr_count,
             MAX(fetched_at)     AS last_fetched
      FROM threat_feeds
      GROUP BY feed_name
      ORDER BY feed_name
    `;
    const recentHits = await sql`
      SELECT ta.ip, ta.country, ta.ts, f.feed_name, f.category, f.cidr
      FROM threat_actors ta
      JOIN threat_feeds f ON ta.ip::inet <<= f.cidr
      WHERE ta.ts > now() - interval '7 days'
      ORDER BY ta.ts DESC
      LIMIT 20
    `.catch(() => []);
    return {
      ok: true,
      feeds: perFeed,
      recentHits: recentHits.map((r) => ({
        ip: r.ip,
        country: r.country,
        ts: r.ts,
        feed: r.feed_name,
        category: r.category,
        cidr: String(r.cidr),
      })),
    };
  } catch (err) {
    return { ok: false, error: String(err.message || err), migrationNeeded: true };
  }
}
