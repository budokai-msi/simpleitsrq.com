// api/_lib/osint.js
//
// Pulls public OSINT threat feeds into threat_feeds and matches visitor IPs
// against the cache. Runs from /api/cron/report once a day and on-demand
// from the admin panel (/api/portal?action=osint-refresh). No API key
// required — all feeds below are freely published in plain text.
//
// Feeds:
//   - Spamhaus DROP: CIDRs hijacked or sold to cybercriminals (~300 rows).
//   - Spamhaus EDROP: extended DROP list, sublets within legit ASNs (~100).
//   - Emerging Threats compromised IPs: individual /32s flagged this week.
//
// The admin UI LEFT JOINs against this table to add an `osintMatches` array
// to every threat actor / blocked IP / visited IP — real-time in the sense
// that every admin query surfaces the latest cached match instantly.

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
 */

/** @type {OsintFeed[]} */
const FEEDS = [
  {
    name: "spamhaus_drop",
    url: "https://www.spamhaus.org/drop/drop.txt",
    category: "hijacked_netblock",
  },
  {
    name: "spamhaus_edrop",
    url: "https://www.spamhaus.org/drop/edrop.txt",
    category: "hijacked_netblock",
  },
  {
    name: "et_compromised",
    url: "https://rules.emergingthreats.net/blockrules/compromised-ips.txt",
    category: "compromised_host",
  },
];

/**
 * Parse one line of a feed file into a normalized CIDR, or null if unparseable.
 * Spamhaus DROP format: "203.0.113.0/24 ; SBL123456" (one CIDR per line).
 * ET format: "203.0.113.5" (one IP per line).
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
 * Fetch and parse one feed over HTTP. Throws on a non-2xx response.
 *
 * @param {OsintFeed} feed
 * @returns {Promise<string[]>}
 */
async function fetchFeed(feed) {
  const res = await fetch(feed.url, {
    signal: AbortSignal.timeout(8000),
    headers: { "User-Agent": "simpleitsrq-osint/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const cidrs = text
    .split(/\r?\n/)
    .map(parseLine)
    .filter(Boolean);
  return cidrs;
}

/**
 * Pulls every configured feed in parallel and upserts each CIDR under its
 * (feed_name, cidr) unique constraint. Returns a per-feed summary so the
 * caller can log / surface it to the admin. A single-feed failure does not
 * abort the others — an outage on Spamhaus shouldn't block ET.
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
        // Purge entries that disappeared from the upstream list (keep the
        // cache honest — a CIDR removed by Spamhaus should stop matching).
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
