// api/_lib/portal/leads.js
//
// Prospect/lead /api/portal actions: hot-leads, lead-intel, leads-inbox,
// lead-status.

import { sql } from "../db.js";
import { json } from "../http.js";
import { requireAdmin } from "./shared.js";

// Hot Leads — turn raw visitor sessions into a ranked prospect board for the
// IT business. Scores each recent engaged session by how likely it is to be a
// real local customer: local geo (the service area), high-intent pages
// (services / book / leadgen / contact / city pages), depth (pages, dwell,
// scroll), engagement, and arriving from search. Read-only; degrades to an
// empty list if the sessions table isn't available.
const HOT_LEAD_INTENT_RE = /\/(services|book|support|leadgen|exposure-scan|password-check)(\/|$|\?)|contact|-it-support(\/|$|\?)/i;
const SERVICE_AREA_CITY_RE = /sarasota|bradenton|venice|lakewood ranch|nokomis|palmetto|ellenton|parrish|osprey|englewood|north port|casey key/i;

function scoreHotLead(s) {
  const reasons = [];
  let score = 0;
  const region = String(s.region || "").toLowerCase();
  const city = String(s.city || "");
  const isFlorida = region === "florida" || region === "fl";
  if (isFlorida) { score += 30; reasons.push("Florida visitor"); }
  if (SERVICE_AREA_CITY_RE.test(city)) { score += 15; reasons.push(`Service area: ${city}`); }
  const pages = Number(s.page_count) || 0;
  if (pages >= 2) { score += Math.min(25, pages * 5); reasons.push(`${pages} pages`); }
  const dwellSec = Math.round((Number(s.total_dwell_ms) || 0) / 1000);
  if (dwellSec >= 180) { score += 25; reasons.push(`${dwellSec}s on site`); }
  else if (dwellSec >= 60) { score += 15; reasons.push(`${dwellSec}s on site`); }
  if ((Number(s.max_scroll_pct) || 0) >= 50) { score += 10; reasons.push("read deeply"); }
  if (s.engaged === true) { score += 20; reasons.push("engaged"); }
  const paths = `${s.landing_path || ""} ${s.exit_path || ""}`;
  if (HOT_LEAD_INTENT_RE.test(paths)) { score += 25; reasons.push("hit a high-intent page"); }
  if (/google|bing|duckduckgo|search/i.test(String(s.referrer || ""))) { score += 10; reasons.push("from search"); }
  return { score, reasons };
}

export async function handleHotLeads(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const rows = await sql`
    SELECT id, anon_id, ip, country, region, city,
           landing_path, exit_path, referrer, page_count,
           total_dwell_ms, max_scroll_pct, event_count, engaged,
           started_at, last_activity
    FROM web_sessions
    WHERE last_activity > now() - interval '21 days'
      AND page_count >= 2
    ORDER BY last_activity DESC
    LIMIT 400
  `.catch(() => []);
  const leads = rows
    .map((s) => {
      const { score, reasons } = scoreHotLead(s);
      return {
        id: s.id,
        anon_id: s.anon_id,
        ip: s.ip,
        location: [s.city, s.region, s.country].filter(Boolean).join(", ") || "Unknown",
        is_local: SERVICE_AREA_CITY_RE.test(String(s.city || "")) || ["florida", "fl"].includes(String(s.region || "").toLowerCase()),
        landing_path: s.landing_path,
        exit_path: s.exit_path,
        referrer: s.referrer || "(direct)",
        page_count: Number(s.page_count) || 0,
        dwell_sec: Math.round((Number(s.total_dwell_ms) || 0) / 1000),
        max_scroll_pct: Number(s.max_scroll_pct) || 0,
        engaged: s.engaged === true,
        last_activity: s.last_activity,
        score,
        reasons,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 40);
  return json(200, {
    ok: true,
    generated_at: new Date().toISOString(),
    total_sessions: rows.length,
    local_count: leads.filter((l) => l.is_local).length,
    leads,
  });
}

// Lead intelligence — conversion funnel, returning-visitor watchlist, and
// traffic-source/campaign attribution, all from web_sessions (14d funnel/
// sources, 30d returning). Each query is independently fault-tolerant so one
// failure can't blank the whole panel.
export async function handleLeadIntel(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const INTENT = "(services|book|support|leadgen|exposure-scan|password-check|partners|-it-support)";
  const CONVERT = "(book|support|portal|contact)";
  const [funnelRows, returningRows, sourceRows] = await Promise.all([
    sql`
      SELECT
        COUNT(*)::int AS sessions,
        COUNT(*) FILTER (WHERE engaged)::int AS engaged,
        COUNT(*) FILTER (WHERE landing_path ~* ${INTENT} OR exit_path ~* ${INTENT})::int AS high_intent,
        COUNT(*) FILTER (WHERE landing_path ~* ${CONVERT} OR exit_path ~* ${CONVERT})::int AS reached_booking
      FROM web_sessions
      WHERE started_at > now() - interval '14 days'
    `.catch(() => []),
    sql`
      SELECT anon_id,
             COUNT(*)::int AS sessions,
             COUNT(DISTINCT date_trunc('day', started_at))::int AS days,
             SUM(page_count)::int AS total_pages,
             bool_or(engaged) AS ever_engaged,
             MAX(city) AS city, MAX(region) AS region, MAX(country) AS country,
             MAX(last_activity) AS last_seen
      FROM web_sessions
      WHERE started_at > now() - interval '30 days' AND anon_id IS NOT NULL
      GROUP BY anon_id
      HAVING COUNT(*) >= 2
      ORDER BY sessions DESC, last_seen DESC
      LIMIT 25
    `.catch(() => []),
    sql`
      SELECT
        COALESCE(
          NULLIF(substring(landing_path from 'utm_source=([^&]+)'), ''),
          NULLIF(regexp_replace(COALESCE(referrer, ''), '^https?://(www\.)?([^/]+).*$', '\2'), ''),
          '(direct)'
        ) AS source,
        COUNT(*)::int AS sessions,
        COUNT(*) FILTER (WHERE engaged)::int AS engaged
      FROM web_sessions
      WHERE started_at > now() - interval '14 days'
      GROUP BY source
      ORDER BY sessions DESC
      LIMIT 12
    `.catch(() => []),
  ]);
  const f = funnelRows[0] || {};
  const sessions = Number(f.sessions) || 0;
  const pct = (n) => (sessions ? Math.round((Number(n) || 0) / sessions * 100) : 0);
  return json(200, {
    ok: true,
    generated_at: new Date().toISOString(),
    funnel: {
      sessions,
      engaged: Number(f.engaged) || 0,
      high_intent: Number(f.high_intent) || 0,
      reached_booking: Number(f.reached_booking) || 0,
      engaged_pct: pct(f.engaged),
      high_intent_pct: pct(f.high_intent),
      reached_booking_pct: pct(f.reached_booking),
    },
    returning: returningRows.map((r) => ({
      anon_id: r.anon_id,
      sessions: Number(r.sessions) || 0,
      days: Number(r.days) || 0,
      total_pages: Number(r.total_pages) || 0,
      ever_engaged: r.ever_engaged === true,
      location: [r.city, r.region, r.country].filter(Boolean).join(", ") || "Unknown",
      last_seen: r.last_seen,
    })),
    sources: sourceRows.map((s) => ({
      source: s.source,
      sessions: Number(s.sessions) || 0,
      engaged: Number(s.engaged) || 0,
      engaged_pct: Number(s.sessions) ? Math.round((Number(s.engaged) || 0) / Number(s.sessions) * 100) : 0,
    })),
  });
}

// Leads inbox — the CRM follow-up queue fed by every human form submission
// (contact form, service reservations, city-landing audit requests). Read +
// status-update; fault-tolerant so a missing leads table (migration not yet
// applied) shows an empty inbox rather than erroring.
const LEAD_STATUSES = ["new", "contacted", "won", "lost"];

export async function handleLeadsInbox(session, url) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const want = String(url.searchParams.get("status") || "").trim();
  const filter = LEAD_STATUSES.includes(want) ? want : null;
  const [rows, counts] = await Promise.all([
    (filter
      ? sql`SELECT id, name, email, phone, message, source, page, country, region, city, status, notes, created_at
            FROM leads WHERE status = ${filter} ORDER BY created_at DESC LIMIT 200`
      : sql`SELECT id, name, email, phone, message, source, page, country, region, city, status, notes, created_at
            FROM leads ORDER BY created_at DESC LIMIT 200`
    ).catch(() => []),
    sql`SELECT status, COUNT(*)::int AS n FROM leads GROUP BY status`.catch(() => []),
  ]);
  const countMap = {};
  for (const c of counts) countMap[c.status] = Number(c.n) || 0;
  return json(200, {
    ok: true,
    generated_at: new Date().toISOString(),
    filter,
    counts: countMap,
    total: rows.length,
    leads: rows,
  });
}

export async function handleLeadStatus(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const body = await request.json().catch(() => ({}));
  const id = Number.parseInt(body.id, 10);
  const status = String(body.status || "").trim();
  if (!Number.isFinite(id) || id <= 0) return json(400, { ok: false, error: "invalid_id" });
  if (!LEAD_STATUSES.includes(status)) return json(400, { ok: false, error: "invalid_status" });
  const notes = body.notes !== undefined ? String(body.notes).slice(0, 2000) : null;
  if (notes !== null) {
    await sql`UPDATE leads SET status = ${status}, notes = ${notes}, updated_at = now() WHERE id = ${id}`.catch(() => {});
  } else {
    await sql`UPDATE leads SET status = ${status}, updated_at = now() WHERE id = ${id}`.catch(() => {});
  }
  return json(200, { ok: true });
}
