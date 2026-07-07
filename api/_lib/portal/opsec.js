// api/_lib/portal/opsec.js
//
// Internal OpSec /api/portal actions: opsec-data, opsec-hunt-brief, and
// the domain/IOC/note mutations.

import { sql } from "../db.js";
import { json } from "../http.js";
import { requireAdmin } from "./shared.js";

// ────────────────────────────────────────────────────────────
// Internal OpSec handlers. No public SPA route imports these screens.
// ────────────────────────────────────────────────────────────
//
// Personal defensive ops dashboard. Admin-only (gated by requireAdmin
// + ADMIN_TOKEN_ACTIONS allowlist). Backed by the three opsec_* tables
// from migration 015.
//
// All entries are scoped to created_by_user_id for a future multi-admin
// world but today only one admin row exists, so every list query returns
// every row.

const OPSEC_IOC_TYPES = new Set(["ip","domain","url","email","hash","cidr","user_agent","other"]);
const OPSEC_SEVERITIES = new Set(["low","medium","high","critical"]);

export async function handleOpsecData(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  // Run all reads in parallel; defensive try-per-query so a single
  // missing-table doesn't blow up first-render after a fresh deploy
  // where the migration hasn't been applied yet.
  const safe = async (q) => { try { return await q; } catch { return []; } };
  const [domains, iocs, notes, threatTop, threatTotal] = await Promise.all([
    safe(sql`SELECT id, domain, label, notes, is_active, created_at, last_scanned_at
             FROM opsec_watched_domains ORDER BY is_active DESC, created_at DESC LIMIT 100`),
    safe(sql`SELECT id, ioc_type, value, source, severity, notes, first_seen_at, last_seen_at, is_active
             FROM opsec_iocs ORDER BY is_active DESC, last_seen_at DESC LIMIT 200`),
    safe(sql`SELECT id, title, body, tags, created_at, updated_at
             FROM opsec_notes ORDER BY updated_at DESC LIMIT 50`),
    safe(sql`SELECT feed_name, count(*)::int AS n, max(fetched_at) AS fetched_at
             FROM threat_feeds GROUP BY feed_name ORDER BY n DESC LIMIT 10`),
    safe(sql`SELECT count(*)::int AS n FROM threat_feeds`),
  ]);

  return json(200, {
    ok: true,
    domains,
    iocs,
    notes,
    threats: { feeds: threatTop, total: threatTotal[0]?.n ?? 0 },
  });
}

export async function handleOpsecHuntBrief(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const safe = async (q, fallback = []) => { try { return await q; } catch { return fallback; } };
  const [
    threat24,
    threat7,
    security24,
    topAttackers,
    campaigns,
    blocked,
    opsecCounts,
    feedCounts,
  ] = await Promise.all([
    safe(sql`
      SELECT COUNT(*)::int AS hits,
             COUNT(DISTINCT ip)::int AS ips,
             COUNT(DISTINCT device_hash)::int AS devices,
             MAX(ts) AS last_seen
      FROM threat_actors
      WHERE ts > now() - interval '24 hours'
    `, [{}]),
    safe(sql`
      SELECT COUNT(*)::int AS hits,
             COUNT(DISTINCT ip)::int AS ips,
             COUNT(DISTINCT device_hash)::int AS devices
      FROM threat_actors
      WHERE ts > now() - interval '7 days'
    `, [{}]),
    safe(sql`
      SELECT
        COUNT(*) FILTER (WHERE severity IN ('critical','error'))::int AS critical,
        COUNT(*) FILTER (WHERE kind = 'honeypot.credential')::int AS credentials,
        COUNT(*) FILTER (WHERE kind = 'exploit_attempt' OR detail ? 'cve')::int AS exploits,
        MAX(ts) AS last_seen
      FROM security_events
      WHERE ts > now() - interval '24 hours'
    `, [{}]),
    safe(sql`
      SELECT ip,
             COUNT(*)::int AS hits,
             MAX(country) AS country,
             MAX(ts) AS last_seen,
             array_remove(array_agg(DISTINCT threat_class), NULL) AS classes,
             array_remove((array_agg(DISTINCT path))[1:8], NULL) AS paths
      FROM threat_actors
      WHERE ts > now() - interval '24 hours'
      GROUP BY ip
      ORDER BY hits DESC, last_seen DESC
      LIMIT 8
    `),
    safe(sql`
      SELECT device_hash,
             COUNT(DISTINCT ip)::int AS ip_count,
             COUNT(*)::int AS hits,
             MIN(ts) AS first_seen,
             MAX(ts) AS last_seen,
             array_remove((array_agg(DISTINCT ip))[1:8], NULL) AS ips,
             array_remove((array_agg(DISTINCT threat_class))[1:8], NULL) AS classes
      FROM threat_actors
      WHERE ts > now() - interval '24 hours'
        AND device_hash IS NOT NULL
      GROUP BY device_hash
      HAVING COUNT(DISTINCT ip) > 1 OR COUNT(*) >= 12
      ORDER BY hits DESC, ip_count DESC
      LIMIT 6
    `),
    safe(sql`
      SELECT ip, reason, created_at
      FROM ip_blocklist
      ORDER BY created_at DESC
      LIMIT 8
    `),
    safe(sql`
      SELECT
        (SELECT COUNT(*)::int FROM opsec_watched_domains WHERE is_active = true) AS watched_domains,
        (SELECT COUNT(*)::int FROM opsec_iocs WHERE is_active = true) AS active_iocs,
        (SELECT COUNT(*)::int FROM opsec_notes) AS notes
    `, [{}]),
    safe(sql`
      SELECT COUNT(*)::int AS feeds,
             COUNT(DISTINCT feed_name)::int AS sources,
             MAX(fetched_at) AS last_refresh
      FROM threat_feeds
    `, [{}]),
  ]);

  const t24 = threat24[0] || {};
  const t7 = threat7[0] || {};
  const sec = security24[0] || {};
  const opsec = opsecCounts[0] || {};
  const feeds = feedCounts[0] || {};
  const topHits = Number(topAttackers[0]?.hits || 0);
  const exploits = Number(sec.exploits || 0);
  const critical = Number(sec.critical || 0);
  const credentials = Number(sec.credentials || 0);
  const campaignCount = campaigns.length;

  let level = "calm";
  if (exploits > 0 || critical > 0 || topHits >= 75) level = "critical";
  else if (campaignCount > 0 || credentials >= 3 || Number(t24.ips || 0) >= 20) level = "elevated";
  else if (Number(t24.hits || 0) > 0) level = "watch";

  const headline =
    level === "critical"
      ? "Active defensive review recommended."
      : level === "elevated"
        ? "Coordinated or high-volume probing detected."
        : level === "watch"
          ? "Routine internet noise, but worth logging."
          : "Quiet window.";

  const actionQueue = [];
  if (exploits > 0) actionQueue.push({
    priority: "P0",
    action: "Review exploit payloads",
    reason: `${exploits} exploit-shaped event${exploits === 1 ? "" : "s"} landed in the last 24h.`,
  });
  if (campaignCount > 0) actionQueue.push({
    priority: "P1",
    action: "Investigate rotating device fingerprints",
    reason: `${campaignCount} campaign-like fingerprint${campaignCount === 1 ? "" : "s"} used multiple IPs or high request volume.`,
  });
  if (credentials > 0) actionQueue.push({
    priority: credentials >= 3 ? "P1" : "P2",
    action: "Review honeypot credential attempts",
    reason: `${credentials} fake-login credential capture${credentials === 1 ? "" : "s"} in the last 24h.`,
  });
  if (topHits >= 10 && topAttackers[0]?.ip) actionQueue.push({
    priority: topHits >= 75 ? "P1" : "P2",
    action: `Investigate ${topAttackers[0].ip}`,
    reason: `${topAttackers[0].ip} produced ${topHits} hit${topHits === 1 ? "" : "s"} in the last 24h.`,
  });
  if (!Number(opsec.watched_domains || 0)) actionQueue.push({
    priority: "P2",
    action: "Add watched domains",
    reason: "OpSec cannot detect DNS/certificate drift until the critical domains are registered here.",
  });
  if (!Number(opsec.active_iocs || 0)) actionQueue.push({
    priority: "P3",
    action: "Seed the IOC notebook",
    reason: "Saving known bad IPs/domains makes future reviews faster and gives you continuity across incidents.",
  });
  if (!actionQueue.length) actionQueue.push({
    priority: "P3",
    action: "Keep monitoring",
    reason: "No urgent defensive work from this window.",
  });

  return json(200, {
    ok: true,
    generatedAt: new Date().toISOString(),
    level,
    headline,
    objective: "Defensive triage only: correlate what touched the site, what was blocked, and what needs human review.",
    metrics: {
      threats24h: Number(t24.hits || 0),
      threatIps24h: Number(t24.ips || 0),
      devices24h: Number(t24.devices || 0),
      threats7d: Number(t7.hits || 0),
      threatIps7d: Number(t7.ips || 0),
      criticalEvents24h: critical,
      exploitEvents24h: exploits,
      honeypotCredentials24h: credentials,
      watchedDomains: Number(opsec.watched_domains || 0),
      activeIocs: Number(opsec.active_iocs || 0),
      threatFeedEntries: Number(feeds.feeds || 0),
      threatFeedSources: Number(feeds.sources || 0),
    },
    actionQueue,
    topAttackers: topAttackers.map((row) => ({
      ip: row.ip,
      hits: row.hits,
      country: row.country,
      lastSeen: row.last_seen,
      classes: row.classes || [],
      paths: row.paths || [],
    })),
    campaigns: campaigns.map((row) => ({
      deviceHash: row.device_hash,
      ipCount: row.ip_count,
      hits: row.hits,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      ips: row.ips || [],
      classes: row.classes || [],
    })),
    recentBlocks: blocked.map((row) => ({
      ip: row.ip,
      reason: row.reason,
      createdAt: row.created_at,
    })),
    feeds: {
      entries: Number(feeds.feeds || 0),
      sources: Number(feeds.sources || 0),
      lastRefresh: feeds.last_refresh || null,
    },
  });
}

export async function handleOpsecDomainAdd(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const body = await request.json().catch(() => ({}));
  const domain = String(body.domain || "").trim().toLowerCase();
  if (!/^[a-z0-9.-]{3,253}$/.test(domain) || !domain.includes(".")) {
    return json(400, { ok: false, error: "invalid_domain" });
  }
  const label = String(body.label || "").slice(0, 200) || null;
  const notes = String(body.notes || "").slice(0, 2000) || null;
  const userId = (typeof session.user.id === "string" && session.user.id.length === 36) ? session.user.id : null;
  const rows = await sql`
    INSERT INTO opsec_watched_domains (domain, label, notes, created_by_user_id)
    VALUES (${domain}, ${label}, ${notes}, ${userId})
    ON CONFLICT (domain) DO UPDATE SET
      label = EXCLUDED.label,
      notes = EXCLUDED.notes,
      is_active = true
    RETURNING id, domain, label, notes, is_active, created_at, last_scanned_at
  `;
  return json(200, { ok: true, domain: rows[0] });
}

export async function handleOpsecDomainToggle(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const body = await request.json().catch(() => ({}));
  const id = Number.parseInt(body.id, 10);
  if (!Number.isFinite(id) || id <= 0) return json(400, { ok: false, error: "invalid_id" });
  const isActive = body.is_active !== false;
  await sql`UPDATE opsec_watched_domains SET is_active = ${isActive} WHERE id = ${id}`;
  return json(200, { ok: true });
}

export async function handleOpsecIocAdd(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const body = await request.json().catch(() => ({}));
  const ioc_type = String(body.ioc_type || "").toLowerCase();
  if (!OPSEC_IOC_TYPES.has(ioc_type)) return json(400, { ok: false, error: "invalid_type" });
  const value = String(body.value || "").trim();
  if (!value || value.length > 500) return json(400, { ok: false, error: "invalid_value" });
  const severity = OPSEC_SEVERITIES.has(body.severity) ? body.severity : "medium";
  const source = String(body.source || "").slice(0, 200) || null;
  const notes = String(body.notes || "").slice(0, 2000) || null;
  const userId = (typeof session.user.id === "string" && session.user.id.length === 36) ? session.user.id : null;
  const rows = await sql`
    INSERT INTO opsec_iocs (ioc_type, value, source, severity, notes, created_by_user_id)
    VALUES (${ioc_type}, ${value}, ${source}, ${severity}, ${notes}, ${userId})
    ON CONFLICT (ioc_type, value) DO UPDATE SET
      source = COALESCE(EXCLUDED.source, opsec_iocs.source),
      severity = EXCLUDED.severity,
      notes = COALESCE(EXCLUDED.notes, opsec_iocs.notes),
      last_seen_at = now(),
      is_active = true
    RETURNING id, ioc_type, value, source, severity, notes, first_seen_at, last_seen_at, is_active
  `;
  return json(200, { ok: true, ioc: rows[0] });
}

export async function handleOpsecIocToggle(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const body = await request.json().catch(() => ({}));
  const id = Number.parseInt(body.id, 10);
  if (!Number.isFinite(id) || id <= 0) return json(400, { ok: false, error: "invalid_id" });
  const isActive = body.is_active !== false;
  await sql`UPDATE opsec_iocs SET is_active = ${isActive}, last_seen_at = now() WHERE id = ${id}`;
  return json(200, { ok: true });
}

export async function handleOpsecNoteSave(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const body = await request.json().catch(() => ({}));
  const title = String(body.title || "").slice(0, 200) || null;
  const noteBody = String(body.body || "").slice(0, 50_000);
  if (!noteBody.trim()) return json(400, { ok: false, error: "empty_body" });
  const tags = Array.isArray(body.tags)
    ? body.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 16)
    : [];
  const id = Number.parseInt(body.id, 10);
  const userId = (typeof session.user.id === "string" && session.user.id.length === 36) ? session.user.id : null;
  let rows;
  if (Number.isFinite(id) && id > 0) {
    rows = await sql`
      UPDATE opsec_notes
      SET title = ${title}, body = ${noteBody}, tags = ${tags}, updated_at = now()
      WHERE id = ${id}
      RETURNING id, title, body, tags, created_at, updated_at
    `;
  } else {
    rows = await sql`
      INSERT INTO opsec_notes (title, body, tags, created_by_user_id)
      VALUES (${title}, ${noteBody}, ${tags}, ${userId})
      RETURNING id, title, body, tags, created_at, updated_at
    `;
  }
  return json(200, { ok: true, note: rows[0] });
}

export async function handleOpsecNoteDelete(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const body = await request.json().catch(() => ({}));
  const id = Number.parseInt(body.id, 10);
  if (!Number.isFinite(id) || id <= 0) return json(400, { ok: false, error: "invalid_id" });
  await sql`DELETE FROM opsec_notes WHERE id = ${id}`;
  return json(200, { ok: true });
}
