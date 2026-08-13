// Unified, versioned scoring for public scans and customer workspaces.
// Opportunity and evidence confidence are intentionally separate concepts.
export const LEAD_INTELLIGENCE_MODEL = "market-intel-v2";

const SOURCE_RELIABILITY = { manual: 96, sunbiz: 94, osm: 84, csv: 82, local_directory: 72, unknown: 60 };
const DAY_MS = 86400000;
const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Number(n) || 0));
const text = (v) => String(v || "").trim();
const pct = (n, d) => d ? Math.round((n / d) * 100) : 0;

function host(value) {
  try { return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}
function phone(value) { const d = text(value).replace(/\D/g, ""); return d.length >= 10 ? d.slice(-10) : ""; }
function nameKey(value) { return text(value).toLowerCase().replace(/\b(inc|corp|co|llc|ltd|pllc|pa)\b/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim(); }
function age(row, now = Date.now()) {
  const ms = new Date(row.updated_at || row.last_crawled_at || row.fetched_at || "").getTime();
  if (!Number.isFinite(ms)) return { days: null, score: 58 };
  const days = Math.max(0, (now - ms) / DAY_MS);
  return { days: Math.round(days), score: clamp(100 * Math.exp((-Math.LN2 * days) / 180)) };
}
function completeness(row) {
  const fields = [[row.name,16],[row.address,11],[row.city,8],[row.state,5],[row.zip,7],[row.website,14],[row.phone,14],[row.source_url,8],[row.source_id,5],[row.industry_group||row.industry,7],[row.sub_industry,5]];
  return clamp(fields.reduce((s,[v,w]) => s + (text(v) ? w : 0), 0));
}
function dimensions(row, now) {
  const fresh = age(row, now);
  const emailCount = Number(row.email_count || (row.email ? 1 : 0)) || 0;
  let contact = (row.phone ? 34 : 0) + (row.website ? 21 : 0) + (emailCount ? 34 : 0) + (Number(row.email_confidence) >= .8 ? 7 : 0);
  let fit = 15 + (row.zip ? 22 : 0) + (row.city ? 18 : 0) + (row.address ? 17 : 0) + (Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng)) ? 13 : 0) + (row.is_chain ? -25 : 20);
  let specific = 20 + (row.industry_group && row.industry_group !== "Other" ? 30 : 0) + (row.sub_industry && row.sub_industry !== "Other" ? 32 : 0) + (row.naics ? 18 : 0);
  const intel = row.website_intel || row.websiteSignals || {};
  let digital = 20 + (!row.website ? 52 : 0) + (!row.phone ? 8 : 0);
  if (row.website) digital += (intel.secure === false ? 18 : 0) + (intel.has_viewport === false ? 16 : 0) + (intel.has_contact_form === false ? 8 : 0) + (intel.has_schema === false ? 7 : 0);
  const perf = Number(intel.pagespeed?.performance); if (Number.isFinite(perf)) digital += perf < 55 ? 18 : perf >= 85 ? -10 : 0;
  const source = SOURCE_RELIABILITY[text(row.source).toLowerCase()] ?? SOURCE_RELIABILITY.unknown;
  const complete = completeness(row);
  let confidence = source * .36 + complete * .32 + fresh.score * .20 + (row.source_url ? 5 : 0) + (row.source_id ? 3 : 0) + (emailCount && Number(row.email_confidence) >= .8 ? 4 : 0);
  return { contactability:clamp(contact), local_fit:clamp(fit), digital_opportunity:clamp(digital), specificity:clamp(specific), completeness:complete, freshness:clamp(fresh.score), evidence_confidence:clamp(confidence), data_age_days:fresh.days };
}
function percentile(value, values) {
  if (values.length <= 1) return 50;
  let below = 0, equal = 0; for (const v of values) { if (v < value) below++; else if (v === value) equal++; }
  return clamp(((below + equal * .5) / values.length) * 100);
}
function grade(score) { return score >= 82 ? "A" : score >= 68 ? "B" : score >= 50 ? "C" : "D"; }

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
