// Unified data-quality analysis shared by public scans and workspaces.
export const LEAD_INTELLIGENCE_MODEL = "market-intel-v2";

const SOURCE_RELIABILITY = { manual: 96, sunbiz: 94, osm: 84, csv: 82, local_directory: 72, unknown: 60 };
const DAY_MS = 86400000;
const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Number(n) || 0));
const text = (v) => String(v || "").trim();

function host(value) {
  try { return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}
function phone(value) { const d = text(value).replace(/\D/g, ""); return d.length >= 10 ? d.slice(-10) : ""; }
function nameKey(value) { return text(value).toLowerCase().replace(/\b(inc|corp|co|llc|ltd|pllc|pa)\b/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim(); }
function age(row, now = Date.now()) {
  const ms = new Date(row.updated_at || row.last_crawled_at || row.fetched_at || "").getTime();
  if (!Number.isFinite(ms)) return { days: null, quality: 58 };
  const days = Math.max(0, (now - ms) / DAY_MS);
  return { days: Math.round(days), quality: clamp(100 * Math.exp((-Math.LN2 * days) / 180)) };
}
function completeness(row) {
  const fields = [[row.name,16],[row.address,11],[row.city,8],[row.state,5],[row.zip,7],[row.website,14],[row.phone,14],[row.source_url,8],[row.source_id,5],[row.industry_group||row.industry,7],[row.sub_industry,5]];
  return clamp(fields.reduce((s,[v,w]) => s + (text(v) ? w : 0), 0));
}

export function analyzeBusinessRecord(row, { now = Date.now() } = {}) {
  const fresh = age(row, now);
  const emailCount = Number(row.email_count || (row.email ? 1 : 0)) || 0;
  const source = SOURCE_RELIABILITY[text(row.source).toLowerCase()] ?? SOURCE_RELIABILITY.unknown;
  const complete = completeness(row);
  const provenance = clamp(source * .48 + complete * .32 + fresh.quality * .20 + (row.source_url ? 5 : 0) + (row.source_id ? 3 : 0));
  const contactCoverage = clamp((row.phone ? 34 : 0) + (row.website ? 22 : 0) + (emailCount ? 36 : 0) + (Number(row.email_confidence) >= .8 ? 8 : 0));
  const locationCoverage = clamp((row.zip ? 28 : 0) + (row.city ? 24 : 0) + (row.address ? 24 : 0) + (Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng)) ? 24 : 0));
  return {
    data_quality: Math.round(clamp(complete * .35 + provenance * .35 + contactCoverage * .18 + locationCoverage * .12)),
    provenance_confidence: Math.round(provenance),
    completeness: Math.round(complete),
    contact_coverage: Math.round(contactCoverage),
    location_coverage: Math.round(locationCoverage),
    freshness: Math.round(fresh.quality),
    data_age_days: fresh.days,
    model_version: LEAD_INTELLIGENCE_MODEL,
  };
}

export function deduplicateBusinesses(rows = []) {
  const clusters = [], index = new Map();
  for (const row of rows) {
    const keys = [host(row.website) && `h:${host(row.website)}`, phone(row.phone) && `p:${phone(row.phone)}`, nameKey(row.name) && row.zip && `n:${nameKey(row.name)}|${row.zip}`].filter(Boolean);
    let i = keys.map(k => index.get(k)).find(v => v !== undefined);
    if (i === undefined) { i = clusters.length; clusters.push([]); }
    clusters[i].push(row); keys.forEach(k => index.set(k, i));
  }
  return clusters.map(items => {
    const ranked = [...items].sort((a,b) => completeness(b) - completeness(a));
    const out = { ...ranked[0], duplicate_evidence_count: items.length };
    for (const key of ["address","city","state","zip","website","phone","source_url","industry","industry_group","sub_industry","naics","lat","lng"]) if (!out[key]) out[key] = ranked.find(x => x[key])?.[key] ?? out[key];
    out.is_chain = items.some(x => Boolean(x.is_chain));
    out.email_count = Math.max(...items.map(x => Number(x.email_count || 0)));
    out.email_confidence = Math.max(...items.map(x => Number(x.email_confidence || 0)));
    return out;
  });
}
