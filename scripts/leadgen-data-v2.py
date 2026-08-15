from pathlib import Path
import re

# -----------------------------------------------------------------------------
# api/leadgen.js — Overture-first discovery, healthy-cache policy, OSM fallback.
# -----------------------------------------------------------------------------
Path('api/leadgen.js').write_text(r'''import { json } from "./_lib/http.js";
import { sql } from "./_lib/db.js";
import { bboxForZip, discoverBusinessesByZip } from "./_lib/leadgen-osm.js";
import { discoverOvertureBusinesses } from "./_lib/leadgen-overture.js";
import { classifyIndustry, INDUSTRY_OPTIONS, looksLikeChain } from "./_lib/leadgen-classify.js";
import { clientIp, isHostileGeo, logThreatActor, rateLimit } from "./_lib/security.js";

const MAX_LIMIT = 80;
const MAX_CACHE_ROWS = 600;
const SCAN_WINDOW_SECONDS = 600;
const SCAN_WINDOW_MAX = 8;
const CACHE_MIN_ROWS = Math.max(5, Number(process.env.LEADGEN_CACHE_MIN_ROWS || 20));
const CACHE_MAX_AGE_MS = Math.max(15 * 60_000, Number(process.env.LEADGEN_CACHE_MAX_AGE_MS || 24 * 60 * 60_000));
const OVERTURE_SUFFICIENT_ROWS = Math.max(5, Number(process.env.LEADGEN_OVERTURE_SUFFICIENT_ROWS || 12));
const ALLOWED_NICHES = new Set(["All", ...INDUSTRY_OPTIONS]);

function cleanText(value, max = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function parseBody(request) {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("application/json")) return {};
  return request.json().catch(() => ({}));
}

function sourceLabel(row) {
  if (row?.source_label) return cleanText(row.source_label, 80);
  if (row?.source === "overture") return "Overture Maps";
  if (row?.source === "osm") return "OpenStreetMap";
  return row?.source ? cleanText(row.source, 80) : "Public business data";
}

function scoreRow(row) {
  let score = 10;
  const reasons = [];
  if (row.website) { score += 20; reasons.push("Website available"); }
  else reasons.push("Website missing");
  if (row.phone) { score += 20; reasons.push("Phone available"); }
  else reasons.push("Phone missing");
  if (row.email) { score += 15; reasons.push("Email available"); }
  if (!row.is_chain) { score += 15; reasons.push("Likely independent"); }
  else { score -= 15; reasons.push("Chain/brand signal"); }
  if (row.address && row.city) { score += 10; reasons.push("Local address available"); }
  if (row.source && row.source_id) { score += 5; reasons.push(`${sourceLabel(row)} source record`); }
  if (row.sub_industry) { score += 5; reasons.push("Specific business category"); }
  const sourceConfidence = Number(row.source_confidence);
  if (Number.isFinite(sourceConfidence) && sourceConfidence >= 0.8) {
    score += 5;
    reasons.push("High source confidence");
  }
  score = Math.max(0, Math.min(100, score));
  return {
    opportunity_score: score,
    opportunity_grade: score >= 80 ? "A" : score >= 65 ? "B" : score >= 45 ? "C" : "D",
    opportunity_reasons: reasons,
  };
}

function rowForClient(row) {
  const classified = row.industry_group
    ? { industry: row.industry_group, sub_industry: row.sub_industry }
    : classifyIndustry(row.industry);
  const email = cleanText(row.email, 240);
  const emails = Array.from(new Set([
    email,
    ...(Array.isArray(row.emails) ? row.emails.map((item) => cleanText(item, 240)) : []),
  ].filter(Boolean))).slice(0, 8);
  const base = {
    name: cleanText(row.name),
    address: cleanText(row.address),
    city: cleanText(row.city),
    state: cleanText(row.state),
    zip: cleanText(row.zip, 16),
    website: cleanText(row.website, 320),
    phone: cleanText(row.phone, 80),
    email: emails[0] || "",
    emails,
    source: cleanText(row.source, 40),
    source_label: sourceLabel(row),
    source_url: cleanText(row.source_url, 320),
    source_id: cleanText(row.source_id, 140),
    source_confidence: Number.isFinite(Number(row.source_confidence)) ? Number(row.source_confidence) : null,
    source_datasets: Array.isArray(row.source_datasets) ? row.source_datasets.map((item) => cleanText(item, 80)).filter(Boolean).slice(0, 6) : [],
    industry: cleanText(row.industry, 160),
    industry_group: cleanText(row.industry_group || classified.industry || "Other", 80),
    sub_industry: cleanText(row.sub_industry || classified.sub_industry, 120),
    lat: Number.isFinite(Number(row.lat)) ? Number(row.lat) : null,
    lng: Number.isFinite(Number(row.lng)) ? Number(row.lng) : null,
    is_chain: Boolean(row.is_chain) || looksLikeChain(row.name),
    updated_at: row.updated_at || null,
  };
  return { ...base, ...scoreRow(base) };
}

function industryCounts(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const key = row.industry_group || "Other";
    const current = groups.get(key) || {
      industry: key, count: 0, with_website: 0, with_phone: 0, with_email: 0,
      independent: 0, avg_score: 0, score_total: 0,
    };
    current.count += 1;
    if (row.website) current.with_website += 1;
    if (row.phone) current.with_phone += 1;
    if (row.email) current.with_email += 1;
    if (!row.is_chain) current.independent += 1;
    current.score_total += Number(row.opportunity_score || 0);
    groups.set(key, current);
  }
  return Array.from(groups.values())
    .map((x) => ({ ...x, avg_score: x.count ? Math.round(x.score_total / x.count) : 0 }))
    .map(({ score_total, ...x }) => x)
    .sort((a, b) => b.count - a.count || a.industry.localeCompare(b.industry));
}

function marketInsights(rows) {
  const total = rows.length;
  const withWebsite = rows.filter((r) => r.website).length;
  const withPhone = rows.filter((r) => r.phone).length;
  const withEmail = rows.filter((r) => r.email).length;
  const independent = rows.filter((r) => !r.is_chain).length;
  const contactGap = rows.filter((r) => !r.phone && !r.email && !r.website).length;
  const highOpportunity = rows.filter((r) => Number(r.opportunity_score) >= 65).length;
  const groups = industryCounts(rows);
  const topIndustry = groups[0] || null;
  return {
    total,
    contactable_rate: total ? Math.round((rows.filter((r) => r.phone || r.email || r.website).length / total) * 100) : 0,
    website_rate: total ? Math.round((withWebsite / total) * 100) : 0,
    phone_rate: total ? Math.round((withPhone / total) * 100) : 0,
    email_rate: total ? Math.round((withEmail / total) * 100) : 0,
    independent_rate: total ? Math.round((independent / total) * 100) : 0,
    digital_gap_count: contactGap,
    high_opportunity_count: highOpportunity,
    top_industry: topIndustry ? {
      name: topIndustry.industry,
      count: topIndustry.count,
      share: Math.round((topIndustry.count / total) * 100),
      avg_score: topIndustry.avg_score,
    } : null,
  };
}

function centroidForRows(rows) {
  const points = (rows || []).map((r) => ({ lat: Number(r.lat), lng: Number(r.lng) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (!points.length) return null;
  return {
    lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
    lng: points.reduce((sum, p) => sum + p.lng, 0) / points.length,
  };
}

function bboxForRows(rows) {
  const points = (rows || []).map((r) => ({ lat: Number(r.lat), lng: Number(r.lng) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (!points.length) return null;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return [Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)];
}

function missingTaxonomyColumns(err) {
  return /column .*?(industry_group|sub_industry|is_chain).*?does not exist/i.test(String(err?.message || err || ""));
}

function rowMatchesNiche(row, niche) {
  if (!niche || niche === "All") return true;
  const classified = row.industry_group ? { industry: row.industry_group } : classifyIndustry(row.industry);
  return classified.industry === niche;
}

function hostKey(value) {
  if (!value) return "";
  try { return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}

function dedupeKey(row) {
  const host = hostKey(row.website);
  if (host) return `web:${host}`;
  const phone = String(row.phone || "").replace(/\D/g, "");
  if (phone.length >= 7) return `phone:${phone.slice(-10)}`;
  const name = cleanText(row.name, 160).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const address = cleanText(row.address, 200).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return `place:${name}|${address}`;
}

function completeness(row) {
  return [row.name, row.address, row.city, row.state, row.zip, row.website, row.phone, row.email, row.sub_industry]
    .filter(Boolean).length + (row.source === "overture" ? 1 : 0);
}

function mergeBusinessRows(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (!row?.name) continue;
    const key = dedupeKey(row);
    const existing = map.get(key);
    if (!existing) { map.set(key, row); continue; }
    const preferred = completeness(row) > completeness(existing) ? row : existing;
    const other = preferred === row ? existing : row;
    map.set(key, {
      ...other,
      ...preferred,
      email: preferred.email || other.email || null,
      emails: Array.from(new Set([...(preferred.emails || []), ...(other.emails || []), preferred.email, other.email].filter(Boolean))).slice(0, 8),
      source_datasets: Array.from(new Set([...(preferred.source_datasets || []), ...(other.source_datasets || [])].filter(Boolean))).slice(0, 8),
    });
  }
  return Array.from(map.values());
}

async function cachedBusinessesByZipLegacy(zip) {
  try {
    return await sql`
      SELECT b.name,b.address,b.city,b.state,b.zip,b.lat,b.lng,b.website,b.phone,
             b.source,b.source_id,b.source_url,b.industry,b.updated_at,
             e.email,e.email_confidence
      FROM lead_businesses b
      LEFT JOIN LATERAL (
        SELECT le.email,le.confidence AS email_confidence
        FROM lead_emails le
        WHERE le.business_id=b.id AND le.opted_out_at IS NULL AND le.bounced_at IS NULL
        ORDER BY le.confidence DESC,le.updated_at DESC
        LIMIT 1
      ) e ON true
      WHERE b.zip=${zip} AND b.status='active'
      ORDER BY b.updated_at DESC, lower(b.name)
      LIMIT ${MAX_CACHE_ROWS}`;
  } catch (err) {
    console.warn("[leadgen] legacy cache lookup failed", err?.message || err);
    return [];
  }
}

async function cachedBusinessesByZip(zip) {
  try {
    return await sql`
      SELECT b.name,b.address,b.city,b.state,b.zip,b.lat,b.lng,b.website,b.phone,
             b.source,b.source_id,b.source_url,b.industry,b.industry_group,b.sub_industry,b.is_chain,b.updated_at,
             e.email,e.email_confidence
      FROM lead_businesses b
      LEFT JOIN LATERAL (
        SELECT le.email,le.confidence AS email_confidence
        FROM lead_emails le
        WHERE le.business_id=b.id AND le.opted_out_at IS NULL AND le.bounced_at IS NULL
        ORDER BY le.confidence DESC,le.updated_at DESC
        LIMIT 1
      ) e ON true
      WHERE b.zip=${zip} AND b.status='active'
      ORDER BY b.updated_at DESC, lower(b.name)
      LIMIT ${MAX_CACHE_ROWS}`;
  } catch (err) {
    if (missingTaxonomyColumns(err)) return cachedBusinessesByZipLegacy(zip);
    console.warn("[leadgen] cache lookup failed", err?.message || err);
    return [];
  }
}

function cacheIsHealthy(rows, niche) {
  if (!rows?.length || rows.length < CACHE_MIN_ROWS) return false;
  if (niche !== "All" && !rows.some((row) => rowMatchesNiche(row, niche))) return false;
  const newest = Math.max(...rows.map((row) => new Date(row.updated_at || 0).getTime()).filter(Number.isFinite));
  return Number.isFinite(newest) && newest > 0 && Date.now() - newest <= CACHE_MAX_AGE_MS;
}

async function persistEmails(idRows, businesses) {
  const ids = new Map(idRows.map((row) => [`${row.source}:${row.source_id}`, row.id]));
  const payload = [];
  for (const business of businesses) {
    const businessId = ids.get(`${business.source}:${business.source_id}`);
    if (!businessId) continue;
    const emails = Array.from(new Set([business.email, ...(business.emails || [])].filter(Boolean))).slice(0, 8);
    for (const email of emails) {
      payload.push({
        business_id: Number(businessId),
        email: String(email).toLowerCase().trim(),
        source: business.source === "overture" ? "overture" : business.source === "osm" ? "osm" : "public_source",
        source_url: business.website || business.source_url || null,
        confidence: 0.8,
      });
    }
  }
  if (!payload.length) return;
  try {
    const raw = JSON.stringify(payload);
    await sql`
      INSERT INTO lead_emails (business_id,email,source,source_url,confidence,consent_basis)
      SELECT business_id,email,source,source_url,confidence,'public_record'
      FROM jsonb_to_recordset(${raw}::jsonb)
        AS x(business_id bigint,email text,source text,source_url text,confidence double precision)
      ON CONFLICT (business_id,email) DO UPDATE SET
        source=EXCLUDED.source,
        source_url=COALESCE(EXCLUDED.source_url,lead_emails.source_url),
        confidence=GREATEST(lead_emails.confidence,EXCLUDED.confidence),
        updated_at=now()`;
  } catch (err) {
    console.warn("[leadgen] source email persistence failed", err?.message || err);
  }
}

async function upsertBusinessesLegacy(businesses) {
  const payload = JSON.stringify(businesses.map((b) => ({
    name: b.name, legal_name: b.legal_name || null, address: b.address || null, city: b.city || null,
    state: b.state || null, zip: b.zip || null,
    lat: Number.isFinite(Number(b.lat)) ? Number(b.lat) : null,
    lng: Number.isFinite(Number(b.lng)) ? Number(b.lng) : null,
    website: b.website || null, phone: b.phone || null, source: b.source || "overture",
    source_id: b.source_id, source_url: b.source_url || null, industry: b.industry || null,
  })));
  return sql`
    INSERT INTO lead_businesses (name,legal_name,address,city,state,zip,lat,lng,website,phone,source,source_id,source_url,industry)
    SELECT * FROM jsonb_to_recordset(${payload}::jsonb)
      AS x(name text,legal_name text,address text,city text,state text,zip text,lat double precision,lng double precision,website text,phone text,source text,source_id text,source_url text,industry text)
    ON CONFLICT(source,source_id) DO UPDATE SET
      name=EXCLUDED.name,legal_name=EXCLUDED.legal_name,address=EXCLUDED.address,city=EXCLUDED.city,state=EXCLUDED.state,
      zip=EXCLUDED.zip,lat=EXCLUDED.lat,lng=EXCLUDED.lng,website=EXCLUDED.website,phone=EXCLUDED.phone,
      source_url=EXCLUDED.source_url,industry=EXCLUDED.industry,updated_at=now()
    RETURNING id,source,source_id`;
}

async function upsertBusinesses(businesses) {
  const clean = (businesses || []).filter((b) => b?.name && b?.source_id);
  if (!clean.length) return;
  let idRows = [];
  try {
    const payload = JSON.stringify(clean.map((b) => ({
      name: b.name, legal_name: b.legal_name || null, address: b.address || null, city: b.city || null,
      state: b.state || null, zip: b.zip || null,
      lat: Number.isFinite(Number(b.lat)) ? Number(b.lat) : null,
      lng: Number.isFinite(Number(b.lng)) ? Number(b.lng) : null,
      website: b.website || null, phone: b.phone || null, source: b.source || "overture",
      source_id: b.source_id, source_url: b.source_url || null, industry: b.industry || null,
      industry_group: b.industry_group || null, sub_industry: b.sub_industry || null, is_chain: Boolean(b.is_chain),
    })));
    idRows = await sql`
      INSERT INTO lead_businesses (name,legal_name,address,city,state,zip,lat,lng,website,phone,source,source_id,source_url,industry,industry_group,sub_industry,is_chain)
      SELECT * FROM jsonb_to_recordset(${payload}::jsonb)
        AS x(name text,legal_name text,address text,city text,state text,zip text,lat double precision,lng double precision,website text,phone text,source text,source_id text,source_url text,industry text,industry_group text,sub_industry text,is_chain boolean)
      ON CONFLICT(source,source_id) DO UPDATE SET
        name=EXCLUDED.name,legal_name=EXCLUDED.legal_name,address=EXCLUDED.address,city=EXCLUDED.city,state=EXCLUDED.state,
        zip=EXCLUDED.zip,lat=EXCLUDED.lat,lng=EXCLUDED.lng,website=EXCLUDED.website,phone=EXCLUDED.phone,
        source_url=EXCLUDED.source_url,industry=EXCLUDED.industry,industry_group=EXCLUDED.industry_group,
        sub_industry=EXCLUDED.sub_industry,is_chain=EXCLUDED.is_chain,updated_at=now()
      RETURNING id,source,source_id`;
  } catch (err) {
    if (!missingTaxonomyColumns(err)) {
      console.error("[leadgen] upsert failed", err?.message || err);
      return;
    }
    try { idRows = await upsertBusinessesLegacy(clean); }
    catch (legacyErr) { console.error("[leadgen] legacy upsert failed", legacyErr?.message || legacyErr); return; }
  }
  await persistEmails(idRows, clean);
}

async function discoverLiveBusinesses(zip) {
  let area = null;
  try { area = await bboxForZip(zip); }
  catch (err) { console.warn("[leadgen] zip boundary lookup failed", err?.message || err); }

  let overture = { ok: false, businesses: [] };
  if (area?.bbox) {
    try {
      overture = await discoverOvertureBusinesses({ zip, bbox: area.bbox, centroid: area.centroid });
    } catch (err) {
      console.warn("[leadgen] Overture discovery failed", err?.message || err);
    }
  }

  let osm = { ok: false, businesses: [] };
  const overtureRows = overture.ok ? overture.businesses || [] : [];
  if (overtureRows.length < OVERTURE_SUFFICIENT_ROWS) {
    try { osm = await discoverBusinessesByZip(zip); }
    catch (err) { console.warn("[leadgen] OSM fallback failed", err?.message || err); }
  }

  const osmRows = osm.ok ? osm.businesses || [] : [];
  const businesses = mergeBusinessRows([...overtureRows, ...osmRows]);
  if (!businesses.length) {
    return {
      ok: false,
      error: area ? "upstream_unavailable" : "zip_not_found",
      businesses: [],
      bbox: area?.bbox || osm?.bbox || null,
      centroid: area?.centroid || osm?.centroid || null,
    };
  }
  const source = overtureRows.length && osmRows.length ? "overture+osm" : overtureRows.length ? "overture" : "osm";
  await upsertBusinesses(businesses);
  return {
    ok: true,
    source,
    businesses,
    bbox: area?.bbox || osm?.bbox || bboxForRows(businesses),
    centroid: area?.centroid || osm?.centroid || centroidForRows(businesses),
    overture_release: overture.release || null,
    overture_tiles: overture.tiles || null,
  };
}

async function discoverOrLoadBusinesses(zip, niche = "All") {
  const cachedRows = mergeBusinessRows(await cachedBusinessesByZip(zip));
  if (cacheIsHealthy(cachedRows, niche)) {
    return {
      ok: true,
      source: "cache",
      businesses: cachedRows,
      bbox: bboxForRows(cachedRows),
      centroid: centroidForRows(cachedRows),
    };
  }

  try {
    const fresh = await discoverLiveBusinesses(zip);
    if (fresh.ok && fresh.businesses?.length) return fresh;
  } catch (err) {
    console.warn("[leadgen] live discovery failed", err?.message || err);
  }

  if (cachedRows.length) {
    return {
      ok: true,
      source: "stale_cache",
      businesses: cachedRows,
      bbox: bboxForRows(cachedRows),
      centroid: centroidForRows(cachedRows),
      degraded: true,
    };
  }
  return { ok: false, error: "upstream_unavailable", businesses: [], bbox: null, centroid: null };
}

export async function POST(request) {
  if (isHostileGeo(request)) {
    logThreatActor(request, { threatClass: "hostile_geo_leadgen_scan", path: "/api/leadgen" }).catch(() => {});
    return json(403, { ok: false, error: "forbidden", message: "Scan is unavailable for this request." });
  }
  const ip = clientIp(request);
  const rl = await rateLimit({ ip, bucket: "public_leadgen_scan", windowSeconds: SCAN_WINDOW_SECONDS, max: SCAN_WINDOW_MAX });
  if (!rl.ok) return json(429, { ok: false, error: "rate_limited", message: "Too many scans from this connection. Wait a few minutes and try again.", retry_after_seconds: SCAN_WINDOW_SECONDS });

  const body = await parseBody(request);
  const zip = cleanText(body.zip, 5);
  const niche = cleanText(body.niche || "All", 80);
  const requestedLimit = Number(body.limit);
  const limit = Number.isFinite(requestedLimit) ? Math.min(MAX_LIMIT, Math.max(10, Math.floor(requestedLimit))) : 40;
  if (!/^\d{5}$/.test(zip)) return json(400, { ok: false, error: "invalid_zip", message: "Enter a 5-digit US ZIP code." });
  if (!ALLOWED_NICHES.has(niche)) return json(400, { ok: false, error: "invalid_niche", message: "Choose a supported industry filter.", industries: INDUSTRY_OPTIONS });

  try {
    const result = await discoverOrLoadBusinesses(zip, niche);
    if (!result.ok) return json(result.error === "zip_not_found" ? 404 : 503, {
      ok: false,
      error: result.error || "scan_failed",
      message: result.error === "zip_not_found" ? "That ZIP code could not be resolved." : "Business discovery is temporarily unavailable. Try again shortly.",
    });
    const allRows = mergeBusinessRows(result.businesses).map(rowForClient);
    const filteredRows = niche !== "All" ? allRows.filter((r) => r.industry_group === niche) : allRows;
    const sortRows = (items) => items.sort((a, b) => Number(b.opportunity_score || 0) - Number(a.opportunity_score || 0) || a.name.localeCompare(b.name));
    const sortedRows = sortRows([...filteredRows]);
    const rows = sortedRows.slice(0, limit);
    const broadenedRows = niche !== "All" && !filteredRows.length ? sortRows([...allRows]).slice(0, limit) : [];
    const usesOverture = String(result.source).includes("overture") || allRows.some((row) => row.source === "overture");
    return json(200, {
      ok: true,
      zip,
      niche,
      industries: INDUSTRY_OPTIONS,
      total: allRows.length,
      matched: filteredRows.length,
      returned: rows.length,
      scan_source: result.source,
      degraded: Boolean(result.degraded),
      with_website: filteredRows.filter((r) => r.website).length,
      with_phone: filteredRows.filter((r) => r.phone).length,
      with_email: filteredRows.filter((r) => r.email).length,
      industry_counts: industryCounts(allRows),
      market_insights: marketInsights(allRows),
      broadened_rows: broadenedRows,
      bbox: result.bbox,
      centroid: result.centroid,
      attribution: {
        businesses: usesOverture ? "Overture Maps Foundation" : "OpenStreetMap contributors",
        map: "OpenStreetMap contributors",
      },
      rows,
    });
  } catch (err) {
    console.error("[leadgen] scan failed", err);
    return json(502, { ok: false, error: "scan_failed", message: "The business scan failed. Try again shortly." });
  }
}

export async function GET() {
  return json(200, {
    ok: true,
    industries: ["All", ...INDUSTRY_OPTIONS],
    limit: MAX_LIMIT,
    discovery: ["overture", "osm_fallback"],
    rate_limit: { window_seconds: SCAN_WINDOW_SECONDS, max_requests: SCAN_WINDOW_MAX },
  });
}

export default async function handler(req, res) {
  const method = (req.method || "GET").toUpperCase();
  let response;
  if (method === "GET") response = await GET();
  else if (method === "POST") {
    const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
    const request = new Request("https://simpleitsrq.com/api/leadgen", {
      method: "POST",
      headers: {
        "content-type": req.headers?.["content-type"] || "application/json",
        "cookie": req.headers?.cookie || "",
        "cf-connecting-ip": req.headers?.["cf-connecting-ip"] || "",
        "x-real-ip": req.headers?.["x-real-ip"] || "",
        "x-forwarded-for": req.headers?.["x-forwarded-for"] || "",
        "origin": req.headers?.origin || "",
        "user-agent": req.headers?.["user-agent"] || "",
        "x-vercel-ip-country": req.headers?.["x-vercel-ip-country"] || "",
      },
      body,
    });
    response = await POST(request);
  } else {
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  const payload = await response.text();
  res.status(response.status);
  for (const [key, value] of response.headers.entries()) res.setHeader(key, value);
  res.send(payload);
}
''')

# -----------------------------------------------------------------------------
# api/_lib/leadgen-emailcrawler.js — contact-only, bounded, redirect-safe.
# -----------------------------------------------------------------------------
Path('api/_lib/leadgen-emailcrawler.js').write_text(r'''// Bounded public website contact finder for Leadgen.
// Purposefully narrow: emails, contact-form presence, and public social links.
// No DNS scoring, domain-age scoring, PageSpeed, technology fingerprinting, or
// speculative business signals.

import dns from "node:dns/promises";
import net from "node:net";

const PAGE_BYTES_CAP = 220 * 1024;
const HOST_PAGES_CAP = 4;
const FETCH_TIMEOUT_MS = 7000;
const MAX_REDIRECTS = 3;
const CONTACT_PATHS = ["/contact", "/contact-us", "/about", "/about-us", "/team", "/staff"];
const REJECT_SUBSTR = ["example.com", "example.org", "domain.com", "yourdomain", "@sentry.io", "@wix.com", "@wixsite", "@squarespace.com", "u003c", "u003e"];
const REJECT_LOCAL = new Set(["noreply", "no-reply", "donotreply", "do-not-reply", "postmaster", "abuse", "webmaster", "hostmaster", "mailer-daemon"]);
const EMAIL_RE = /([A-Z0-9._%+-]+)@([A-Z0-9.-]+\.[A-Z]{2,24})/gi;

function ua() {
  return process.env.LEADGEN_USER_AGENT || "simpleitsrq-leadgen/3.0 (+https://simpleitsrq.com; contact: hello@simpleitsrq.com)";
}

function isPrivateAddress(address) {
  if (!address) return true;
  if (net.isIPv4(address)) {
    const p = address.split(".").map(Number);
    return p[0] === 0 || p[0] === 10 || p[0] === 127 || (p[0] === 169 && p[1] === 254)
      || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168)
      || p[0] >= 224;
  }
  if (net.isIPv6(address)) {
    const lower = address.toLowerCase();
    return lower === "::1" || lower === "::" || lower.startsWith("fc") || lower.startsWith("fd") || /^fe[89ab]/.test(lower);
  }
  return true;
}

async function assertPublicUrl(input) {
  const url = new URL(input);
  if (!/^https?:$/.test(url.protocol)) throw new Error("unsupported_protocol");
  const host = url.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) throw new Error("private_host");
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("private_host");
    return url;
  }
  const records = await dns.lookup(host, { all: true, verbatim: true });
  if (!records.length || records.some((record) => isPrivateAddress(record.address))) throw new Error("private_host");
  return url;
}

function originOf(url) {
  try { return new URL(url).origin; } catch { return null; }
}

function safeUrl(input, base) {
  try { return new URL(input, base).toString(); } catch { return null; }
}

async function fetchWithTimeout(input, ms = FETCH_TIMEOUT_MS, redirects = 0) {
  const url = await assertPublicUrl(input);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": ua(), Accept: "text/html,text/plain,*/*;q=0.5" },
      redirect: "manual",
      signal: ctrl.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      if (redirects >= MAX_REDIRECTS) throw new Error("too_many_redirects");
      const location = response.headers.get("location");
      if (!location) return response;
      return fetchWithTimeout(new URL(location, url).toString(), ms, redirects + 1);
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBodyCapped(url) {
  const res = await fetchWithTimeout(url);
  if (!res.ok) return { ok: false, status: res.status, body: "", finalUrl: res.url, headers: res.headers };
  const contentType = res.headers.get("content-type") || "";
  if (!/text\/|application\/xhtml/i.test(contentType)) return { ok: false, status: 415, body: "", finalUrl: res.url, headers: res.headers };
  const reader = res.body?.getReader();
  if (!reader) {
    const text = await res.text();
    return { ok: true, status: res.status, body: text.slice(0, PAGE_BYTES_CAP), finalUrl: res.url, headers: res.headers };
  }
  const chunks = [];
  let total = 0;
  while (total < PAGE_BYTES_CAP) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    const remaining = PAGE_BYTES_CAP - total;
    chunks.push(value.slice(0, remaining));
    total += Math.min(value.length, remaining);
  }
  try { await reader.cancel(); } catch {}
  let length = 0;
  for (const chunk of chunks) length += chunk.length;
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
  return { ok: true, status: res.status, body: new TextDecoder().decode(joined), finalUrl: res.url, headers: res.headers };
}

async function robotsAllowsRoot(origin) {
  try {
    const response = await fetchWithTimeout(`${origin}/robots.txt`, 3500);
    if (!response.ok) return true;
    const text = await response.text();
    let applies = false;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/#.*/, "").trim();
      if (!line) continue;
      const index = line.indexOf(":");
      if (index < 0) continue;
      const key = line.slice(0, index).trim().toLowerCase();
      const value = line.slice(index + 1).trim();
      if (key === "user-agent") applies = value === "*";
      if (applies && key === "disallow" && value === "/") return false;
    }
    return true;
  } catch { return true; }
}

function isJunkEmail(email) {
  const lower = email.toLowerCase();
  if (REJECT_SUBSTR.some((part) => lower.includes(part))) return true;
  const local = lower.split("@")[0];
  if (REJECT_LOCAL.has(local)) return true;
  return /\.(png|jpe?g|gif|svg|webp|ico|css|js)$/i.test(lower);
}

function snippet(body, index, len) {
  return body.slice(Math.max(0, index - 60), Math.min(body.length, index + len + 60)).replace(/\s+/g, " ").trim();
}

function extractEmails(body, pageUrl) {
  const found = new Map();
  const mailtoRe = /href\s*=\s*["']mailto:([^"'?#]+)/gi;
  let match;
  while ((match = mailtoRe.exec(body)) !== null) {
    let raw = "";
    try { raw = decodeURIComponent(match[1]).trim().toLowerCase(); } catch { raw = match[1].trim().toLowerCase(); }
    if (!raw || isJunkEmail(raw)) continue;
    found.set(raw, { email: raw, source: "website_mailto", source_url: pageUrl, context_snippet: snippet(body, match.index, match[0].length), confidence: 1.0 });
  }
  EMAIL_RE.lastIndex = 0;
  let textMatch;
  while ((textMatch = EMAIL_RE.exec(body)) !== null) {
    const raw = textMatch[0].toLowerCase();
    if (isJunkEmail(raw) || found.has(raw)) continue;
    const role = new Set(["info", "sales", "contact", "hello", "support", "office", "reception"]);
    found.set(raw, { email: raw, source: "website_text", source_url: pageUrl, context_snippet: snippet(body, textMatch.index, textMatch[0].length), confidence: role.has(raw.split("@")[0]) ? 0.8 : 0.55 });
  }
  return Array.from(found.values());
}

function extractContactLinks(homepageBody, origin) {
  const set = new Set(CONTACT_PATHS.map((path) => `${origin}${path}`));
  const linkRe = /href\s*=\s*["']([^"'#]+)/gi;
  let match;
  while ((match = linkRe.exec(homepageBody)) !== null && set.size < HOST_PAGES_CAP * 4) {
    const url = safeUrl(match[1], origin);
    if (!url || originOf(url) !== origin) continue;
    const path = new URL(url).pathname.toLowerCase().replace(/\/$/, "");
    if (CONTACT_PATHS.some((candidate) => path === candidate || path.startsWith(`${candidate}/`))) set.add(url);
  }
  return Array.from(set);
}

function extractContactSignals(body, finalUrl) {
  const html = String(body || "");
  const social = {};
  const patterns = {
    linkedin: /https?:\/\/(?:www\.)?linkedin\.com\/[^"'\s<>]+/i,
    facebook: /https?:\/\/(?:www\.)?facebook\.com\/[^"'\s<>]+/i,
    instagram: /https?:\/\/(?:www\.)?instagram\.com\/[^"'\s<>]+/i,
  };
  for (const [key, pattern] of Object.entries(patterns)) {
    const match = html.match(pattern);
    if (match) social[key] = match[0].replace(/&amp;/g, "&");
  }
  return {
    source: "website_contact_check",
    source_url: finalUrl,
    fetched_at: new Date().toISOString(),
    has_contact_form: /<form[\s\S]{0,10000}(contact|message|inquiry|quote|email)/i.test(html),
    social,
  };
}

export async function crawlEmails(websiteUrl) {
  const origin = originOf(websiteUrl);
  if (!origin) return { ok: false, error: "invalid_url", emails: [], websiteSignals: null };
  try { await assertPublicUrl(origin); }
  catch { return { ok: false, error: "unsafe_host", emails: [], websiteSignals: null }; }

  const robotsAllowed = await robotsAllowsRoot(origin);
  if (!robotsAllowed) return { ok: true, host: origin, robotsAllowed: false, pagesFetched: 0, emails: [], websiteSignals: null };

  const home = await fetchBodyCapped(origin).catch((error) => ({ ok: false, error: String(error?.message || error) }));
  if (!home.ok) return { ok: false, host: origin, error: home.error || `home_${home.status}`, emails: [], websiteSignals: null };

  const websiteSignals = extractContactSignals(home.body, home.finalUrl);
  const out = new Map();
  for (const email of extractEmails(home.body, home.finalUrl)) out.set(email.email, email);
  const candidates = extractContactLinks(home.body, origin).slice(0, HOST_PAGES_CAP - 1);
  let pagesFetched = 1;
  for (const url of candidates) {
    if (pagesFetched >= HOST_PAGES_CAP) break;
    const response = await fetchBodyCapped(url).catch(() => null);
    if (!response?.ok) continue;
    pagesFetched += 1;
    for (const email of extractEmails(response.body, response.finalUrl)) {
      const previous = out.get(email.email);
      if (!previous || email.confidence > previous.confidence) out.set(email.email, email);
    }
    const extraSignals = extractContactSignals(response.body, response.finalUrl);
    websiteSignals.has_contact_form ||= extraSignals.has_contact_form;
    websiteSignals.social = { ...websiteSignals.social, ...extraSignals.social };
  }

  websiteSignals.pages_fetched = pagesFetched;
  websiteSignals.robots_allowed = true;
  return {
    ok: true,
    host: origin,
    robotsAllowed: true,
    pagesFetched,
    websiteSignals,
    emails: Array.from(out.values()).sort((a, b) => b.confidence - a.confidence),
  };
}
''')

# -----------------------------------------------------------------------------
# api/leadgen-emails.js — same route contract, contact-only implementation.
# -----------------------------------------------------------------------------
Path('api/leadgen-emails.js').write_text(r'''// /api/leadgen-emails — on-demand contact discovery from public business websites.
// Premium feature. Kept intentionally narrow so the feature stays useful and
// maintainable: email addresses, contact-form presence, and public social links.

import { json } from "./_lib/http.js";
import { getSession } from "./_lib/session.js";
import { crawlEmails } from "./_lib/leadgen-emailcrawler.js";
import { clientIp, rateLimit } from "./_lib/security.js";

const ALLOWED_PLANS = new Set(["growth", "pro", "lifetime"]);
const BULK_PLANS = new Set(["pro", "lifetime"]);
const BULK_MAX = 10;

function isPrivateLiteral(host) {
  const h = String(host || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h === "::1") return true;
  if (/^(fc|fd|fe8|fe9|fea|feb)[0-9a-f]*:/i.test(h)) return true;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(h)) return false;
  const p = h.split(".").map(Number);
  return p[0] === 0 || p[0] === 10 || p[0] === 127 || (p[0] === 169 && p[1] === 254)
    || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168);
}

function normalizeDomain(input) {
  let value = String(input || "").trim().toLowerCase();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const parsed = new URL(value);
    if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname.includes(".") || isPrivateLiteral(parsed.hostname)) return null;
    return parsed.origin;
  } catch { return null; }
}

async function requirePremiumSession(request) {
  const session = await getSession(request);
  if (!session) return { error: json(401, { ok: false, error: "unauthorized" }) };
  const { plan, isAdmin } = session.user;
  if (!isAdmin && !ALLOWED_PLANS.has(plan)) {
    return { error: json(403, { ok: false, error: "plan_required", message: "Contact enrichment is available on Growth, Pro, and Lifetime plans.", upgrade_url: "/leadgen#pricing" }) };
  }
  return { session, user: session.user };
}

async function enrichOne(origin) {
  const result = await crawlEmails(origin);
  return {
    ...result,
    websiteSignals: result.websiteSignals ? {
      ...result.websiteSignals,
      pages_fetched: result.pagesFetched || result.websiteSignals.pages_fetched || 0,
      robots_allowed: result.robotsAllowed !== false,
    } : null,
  };
}

export async function POST(request) {
  const { user, error } = await requirePremiumSession(request);
  if (error) return error;
  const ip = clientIp(request);
  const rl = await rateLimit({ ip, bucket: "leadgen_email_crawl", windowSeconds: 60, max: 20 });
  if (!rl.ok) return json(429, { ok: false, error: "rate_limited", message: "Too many contact checks. Wait a minute." });

  let body;
  try { body = await request.json(); } catch { body = {}; }

  if (Array.isArray(body.domains)) {
    if (!user.isAdmin && !BULK_PLANS.has(user.plan)) {
      return json(403, { ok: false, error: "plan_required", message: "Bulk contact enrichment requires Pro or Lifetime." });
    }
    const domains = body.domains.slice(0, BULK_MAX).map(normalizeDomain).filter(Boolean);
    if (!domains.length) return json(400, { ok: false, error: "invalid_domains" });
    const results = await Promise.allSettled(domains.map((domain) => enrichOne(domain)));
    return json(200, {
      ok: true,
      results: results.map((result, index) => result.status === "fulfilled"
        ? { domain: domains[index], ...result.value }
        : { domain: domains[index], ok: false, error: "contact_check_failed", emails: [], websiteSignals: null }),
    });
  }

  const origin = normalizeDomain(body.domain || body.url || "");
  if (!origin) return json(400, { ok: false, error: "invalid_domain", message: "Provide a valid public business website." });
  try {
    const result = await enrichOne(origin);
    return json(200, { ok: true, ...result });
  } catch (err) {
    return json(502, { ok: false, error: "contact_check_failed", message: String(err?.message || "Contact check failed.") });
  }
}

export async function GET() {
  return json(200, {
    ok: true,
    description: "POST { domain } or { domains: [] } to find public business contact details.",
    signals: ["emails", "contact form", "LinkedIn", "Facebook", "Instagram"],
    plans: ["growth", "pro", "lifetime"],
  });
}

export default async function handler(req, res) {
  const method = (req.method || "GET").toUpperCase();
  const buildRequest = () => new Request("https://simpleitsrq.com/api/leadgen-emails", {
    method: req.method,
    headers: {
      "content-type": req.headers?.["content-type"] || "application/json",
      "cookie": req.headers?.cookie || "",
      "cf-connecting-ip": req.headers?.["cf-connecting-ip"] || "",
      "x-real-ip": req.headers?.["x-real-ip"] || "",
      "x-forwarded-for": req.headers?.["x-forwarded-for"] || "",
    },
    body: method === "POST" ? (typeof req.body === "string" ? req.body : JSON.stringify(req.body || {})) : undefined,
  });
  const response = method === "GET" ? await GET() : method === "POST" ? await POST(buildRequest()) : null;
  if (!response) { res.status(405).json({ ok: false, error: "method_not_allowed" }); return; }
  const payload = await response.text();
  res.status(response.status);
  for (const [key, value] of response.headers.entries()) res.setHeader(key, value);
  res.send(payload);
}
''')

# -----------------------------------------------------------------------------
# Refine Overture category handling: hierarchy for broad group, basic for label.
# -----------------------------------------------------------------------------
overture_path = Path('api/_lib/leadgen-overture.js')
overture = overture_path.read_text()
old_primary = '''function primaryCategory(props) {
  const basic = firstText(props.basic_category);
  if (basic) return basic;
  const taxonomy = parseJsonish(props.taxonomy, null);
  const taxonomyPrimary = firstText(taxonomy?.primary || taxonomy?.category || taxonomy);
  if (taxonomyPrimary) return taxonomyPrimary;
  const categories = parseJsonish(props.categories, null);
  return firstText(categories?.primary || categories) || null;
}'''
new_primary = '''function categoryDetails(props) {
  const basic = firstText(props.basic_category);
  const taxonomy = parseJsonish(props.taxonomy, null);
  const taxonomyPrimary = firstText(taxonomy?.primary || taxonomy?.category || taxonomy);
  const hierarchy = Array.isArray(taxonomy?.hierarchy) ? taxonomy.hierarchy.map(firstText).filter(Boolean) : [];
  const categories = parseJsonish(props.categories, null);
  const legacyPrimary = firstText(categories?.primary || categories);
  return {
    label: basic || taxonomyPrimary || legacyPrimary || null,
    specific: taxonomyPrimary || legacyPrimary || basic || null,
    classifier: [basic, taxonomyPrimary, legacyPrimary, ...hierarchy].filter(Boolean).join(" "),
  };
}'''
if old_primary not in overture:
    raise SystemExit('Overture category anchor missing')
overture = overture.replace(old_primary, new_primary, 1)
old_use = '''  const category = primaryCategory(props);
  const industryGroup = classifyCategory(category);'''
new_use = '''  const category = categoryDetails(props);
  const industryGroup = classifyCategory(category.classifier);'''
if old_use not in overture:
    raise SystemExit('Overture category use anchor missing')
overture = overture.replace(old_use, new_use, 1)
overture = overture.replace('''    industry: category ? `overture:${category}` : null,
    industry_group: industryGroup,
    sub_industry: prettifyCategory(category),''', '''    industry: category.specific ? `overture:${category.specific}` : null,
    industry_group: industryGroup,
    sub_industry: prettifyCategory(category.label),''', 1)
overture_path.write_text(overture)

# -----------------------------------------------------------------------------
# src/pages/Leadgen.jsx — remove technical-intel UI; contact-centric enrichment.
# -----------------------------------------------------------------------------
page_path = Path('src/pages/Leadgen.jsx')
text = page_path.read_text()

technical_block = re.compile(r'''function isFiniteNumber\(value\) \{.*?\n\}\n\nfunction websiteInsightLabels\(signal\) \{.*?\n\}\n\n''', re.S)
replacement = r'''function contactInsightLabels(signal) {
  if (!signal) return [];
  const labels = [];
  if (signal.has_contact_form) labels.push("Contact form");
  if (signal.social?.linkedin) labels.push("LinkedIn");
  if (signal.social?.facebook) labels.push("Facebook");
  if (signal.social?.instagram) labels.push("Instagram");
  if (Number(signal.pages_fetched) > 0) labels.push(`${Number(signal.pages_fetched)} pages checked`);
  return labels;
}

'''
text, count = technical_block.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit('technical helper block not found')
text = text.replace('websiteInsightLabels(row.website_intel)', 'contactInsightLabels(row.website_intel)')

csv_block = re.compile(r'''function downloadCsv\(filename, rows\) \{.*?\n\}\n\n\nfunction escapeMapHtml''', re.S)
csv_new = r'''function downloadCsv(filename, rows) {
  const headers = ["status", "name", "industry", "sub_industry", "address", "city", "state", "zip", "website", "phone", "email", "opportunity_score", "opportunity_grade", "data_coverage", "source", "source_confidence", "source_url"];
  const lines = [headers.map(csvCell).join(",")];
  rows.forEach((row) => {
    const coverage = dataCoverage(row, row.email || row.emails?.[0]?.email || "");
    const record = { ...row, data_coverage: coverage.percent };
    lines.push(headers.map((key) => csvCell(record[key])).join(","));
  });
  const blob = new Blob([lines.join("\\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}


function escapeMapHtml'''
text, count = csv_block.subn(csv_new, text, count=1)
if count != 1:
    raise SystemExit('CSV block not found')

# Remove redundant sticky selected-actions bar; the Use section is canonical.
selbar = re.compile(r'''      \{scan && selectedRows\.length \? \(\n        <div className="leadgen-selbar">.*?\n      \) : null\}\n\n''', re.S)
text, count = selbar.subn('', text, count=1)
if count != 1:
    raise SystemExit('selected sticky bar not found')

text = text.replace('const selectedWithEmail = selectedRows.filter((row) => bestEmail(row));\n', '')
text = text.replace('const enrichedCount = reviewedRows.filter((row) => row.website_intel).length;', 'const contactCheckedCount = reviewedRows.filter((row) => row.website_intel).length;')
text = text.replace('''    const foundIntel = { ...websiteIntel };
    let emailCount = 0;
    let intelCount = 0;''', '''    const foundIntel = { ...websiteIntel };
    let emailCount = 0;
    let checkedCount = 0;''')
text = text.replace('''          if (result.websiteSignals) {
            foundIntel[key] = result.websiteSignals;
            intelCount += 1;
          }''', '''          if (result.websiteSignals) {
            foundIntel[key] = result.websiteSignals;
            checkedCount += 1;
          }''')
text = text.replace('''      setExtractMsg({ ok: true, text: `Checked ${intelCount} website${intelCount === 1 ? "" : "s"}${emailCount ? ` · found ${emailCount} email${emailCount === 1 ? "" : "s"}` : ""}.` });''', '''      setExtractMsg({ ok: true, text: `Checked ${checkedCount} website${checkedCount === 1 ? "" : "s"}${emailCount ? ` · found ${emailCount} email${emailCount === 1 ? "" : "s"}` : " · no new public email found"}.` });''')
text = text.replace('Website enrichment failed.', 'Contact lookup failed.')

text = text.replace('const analyzeProspect = async (row) => {', 'const findProspectContacts = async (row) => {')
text = text.replace('Deep website analysis updated.', 'Contact check updated.')
text = text.replace('source: "leadgen_site_analysis"', 'source: "leadgen_contact_enrichment"')
text = text.replace('Could not analyze this website.', 'Could not check this website for contacts.')

text = text.replace('<article><strong>{enrichedCount}</strong><span>websites with added intelligence</span></article>', '<article><strong>{contactCheckedCount}</strong><span>websites checked for contacts</span></article>')
text = text.replace('''<Sparkles size={14} /> {extracting ? "Checking sites…" : "Enrich selected"}''', '''<Sparkles size={14} /> {extracting ? "Checking sites…" : "Find contacts"}''')
text = text.replace('Open a category, compare its businesses, then expand a prospect for contact coverage, website intelligence and source evidence.', 'Open a category, compare its businesses, then expand a prospect for contact details and source evidence.')

text = text.replace('''                            const tech = technicalSnapshot(row.website_intel);
                            const intel = contactInsightLabels(row.website_intel);''', '''                            const contactSignals = contactInsightLabels(row.website_intel);''')
text = text.replace('''                                  {tech.quality !== null ? <span className="is-intel">Tech quality {tech.quality}</span> : row.website_intel ? <span className="is-intel">Website checked</span> : null}''', '''                                  {row.website_intel ? <span className="is-intel">Contacts checked</span> : null}
                                  {Number.isFinite(Number(row.source_confidence)) ? <span className="is-intel">Source {Math.round(Number(row.source_confidence) * 100)}%</span> : null}''')
text = text.replace('''                                    <button type="button" className="leadgen-card-action is-primary" onClick={() => analyzeProspect(row)} disabled={analyzing}>
                                      <Sparkles size={13} /> {analyzing ? "Analyzing…" : row.website_intel ? "Refresh analysis" : "Analyze site"}
                                    </button>''', '''                                    <button type="button" className="leadgen-card-action is-primary" onClick={() => findProspectContacts(row)} disabled={analyzing}>
                                      <Sparkles size={13} /> {analyzing ? "Checking…" : row.website_intel ? "Recheck contacts" : "Find contacts"}
                                    </button>''')

website_section = re.compile(r'''                                      <section className="is-wide">\n                                        <strong>Website intelligence</strong>.*?                                      </section>\n\n                                      <section className="is-wide">\n                                        <strong>Evidence & provenance</strong>''', re.S)
website_replacement = r'''                                      <section className="is-wide">
                                        <strong>Contact enrichment</strong>
                                        {row.website_intel ? (
                                          <>
                                            {contactSignals.length ? <div className="leadgen-signal-chips is-intel">{contactSignals.map((label) => <span key={label}>{label}</span>)}</div> : null}
                                            <p className="leadgen-evidence-note">Checked the business website for public email addresses, a contact form, and public social links. Missing details are left unknown.</p>
                                          </>
                                        ) : (
                                          <p className="leadgen-card-empty">Use Find contacts to check a small set of public pages on this business website. It does not run domain-age, DNS, PageSpeed, or technology scoring.</p>
                                        )}
                                      </section>

                                      <section className="is-wide">
                                        <strong>Evidence & provenance</strong>'''
text, count = website_section.subn(website_replacement, text, count=1)
if count != 1:
    raise SystemExit('website intelligence UI block not found')

text = text.replace('''                                        <p className="leadgen-evidence-note">Discovery source: {scan.scan_source || "public business data"}{row.source_id ? ` · record ${row.source_id}` : ""}. Website intelligence is added only when you run enrichment; unavailable metrics remain unknown rather than being inferred.</p>''', '''                                        <p className="leadgen-evidence-note">Discovery source: {row.source_label || scan.scan_source || "public business data"}{Number.isFinite(Number(row.source_confidence)) ? ` · source confidence ${Math.round(Number(row.source_confidence) * 100)}%` : ""}{row.source_id ? ` · record ${row.source_id}` : ""}. Contact enrichment only checks public website pages you request.</p>''')

# Show data attribution directly under the map.
text = text.replace('''            <LeadgenMap rows={visibleRows} scan={scan} />
            </section>''', '''            <LeadgenMap rows={visibleRows} scan={scan} />
            {scan.attribution ? <p className="leadgen-data-attribution">Business data © {scan.attribution.businesses}. Map data © {scan.attribution.map}.</p> : null}
            </section>''', 1)

text = text.replace('Research local businesses by ZIP code and industry, compare opportunity and data coverage, analyze website signals, enrich contact data, and export the prospects you choose.', 'Research local businesses by ZIP code and industry, compare records, find public contact details, and export only the prospects you choose.')
text = text.replace('Pro adds saved markets, recurring monitoring, deeper enrichment, CRM sync, suppression, and attribution', 'Pro adds saved markets, recurring monitoring, contact enrichment, CRM sync, suppression, and attribution')

if 'technicalSnapshot(' in text or 'PageSpeed' in text or 'domain age' in text.lower() or 'DNS/MX' in text:
    raise SystemExit('technical enrichment language still present in Leadgen.jsx')
page_path.write_text(text)

# Card CSS: add attribution only; obsolete metric CSS can remain harmless for now,
# but the JS no longer renders those components.
css_path = Path('src/styles/leadgen-cards.css')
css = css_path.read_text()
if '.leadgen-data-attribution {' not in css:
    css += r'''

.leadgen-data-attribution {
  margin: 6px 2px 0;
  color: var(--lg-faint);
  font-size: .62rem;
  line-height: 1.4;
}
'''
css_path.write_text(css)

# Environment documentation for the open primary source and cache policy.
env_path = Path('.env.example')
env = env_path.read_text()
if 'OVERTURE_RELEASE=' not in env:
    marker = '# --- Google Business Profile reviews ---'
    block = '''# --- Leadgen discovery (Overture Maps primary, OpenStreetMap fallback) ---\n# Open public-business dataset. Defaults track a tested Overture release; override\n# only when intentionally validating a newer release. No API key required.\nOVERTURE_RELEASE=2026-06-17.0\n# OVERTURE_PLACES_PMTILES_URL=https://.../places.pmtiles\nLEADGEN_OVERTURE_MIN_CONFIDENCE=0.5\nLEADGEN_OVERTURE_MAX_TILES=36\nLEADGEN_OVERTURE_SUFFICIENT_ROWS=12\nLEADGEN_CACHE_MIN_ROWS=20\nLEADGEN_CACHE_MAX_AGE_MS=86400000\n\n'''
    if marker not in env:
        raise SystemExit('.env Overture insertion anchor missing')
    env = env.replace(marker, block + marker, 1)
env_path.write_text(env)

# Update schema comments only; no structural DB migration is required.
migration_path = Path('db/migrations/013_leadgen.sql')
migration = migration_path.read_text()
migration = migration.replace('1. Discovery   (lead_businesses)  — OSM Overpass (Sunbiz/manual later)', '1. Discovery   (lead_businesses)  — Overture Places primary, OSM fallback')
migration = migration.replace("source          text NOT NULL,        -- 'osm' | 'sunbiz' | 'manual' | 'csv'", "source          text NOT NULL,        -- 'overture' | 'osm' | 'sunbiz' | 'manual' | 'csv'")
migration_path.write_text(migration)

# Temporary network smoke test for the exact Huntington complaint area.
Path('scripts/smoke-overture.mjs').write_text(r'''import { discoverOvertureBusinesses } from "../api/_lib/leadgen-overture.js";

// Center is adjacent to 416/417 25th St, Huntington WV 25703. The bbox is
// intentionally small enough to test the user's problem area rather than the
// entire city. Address-derived rows are still filtered to ZIP 25703.
const centroid = { lat: 38.425537, lng: -82.412639 };
const bbox = [38.4000, -82.4400, 38.4500, -82.3850];
const result = await discoverOvertureBusinesses({ zip: "25703", bbox, centroid });
if (!result.ok) throw new Error(`Overture smoke failed: ${result.error || "unknown"}`);
console.log(`Overture Huntington 25703 smoke: ${result.businesses.length} businesses across ${result.successful_tiles}/${result.tiles} tiles`);
console.log(result.businesses.slice(0, 12).map((row) => `${row.name} | ${row.address || "no address"} | ${row.sub_industry || "uncategorized"}`).join("\n"));
if (result.businesses.length <= 2) throw new Error(`Expected materially more than the old 2-record result; got ${result.businesses.length}`);
''')

print('Leadgen data v2 migration prepared')
