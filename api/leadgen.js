import { json } from "./_lib/http.js";
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
