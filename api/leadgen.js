import { json } from "./_lib/http.js";
import { sql } from "./_lib/db.js";
import { discoverBusinessesByZip } from "./_lib/leadgen-osm.js";
import { classifyIndustry, INDUSTRY_OPTIONS, looksLikeChain } from "./_lib/leadgen-classify.js";
import { clientIp, isHostileGeo, logThreatActor, rateLimit } from "./_lib/security.js";

const MAX_LIMIT = 80;
const MAX_CACHE_ROWS = 600;
const SCAN_WINDOW_SECONDS = 600;
const SCAN_WINDOW_MAX = 8;
const ALLOWED_NICHES = new Set(["All", ...INDUSTRY_OPTIONS]);

function cleanText(value, max = 240) { return String(value || "").trim().slice(0, max); }
function parseBody(request) { const type = request.headers.get("content-type") || ""; if (!type.includes("application/json")) return {}; return request.json().catch(() => ({})); }
function scoreRow(row) {
  let score = 20;
  const reasons = [];
  if (row.website) { score += 20; reasons.push("Website present"); }
  else reasons.push("No website");
  if (row.phone) { score += 20; reasons.push("Phone present"); }
  else reasons.push("No phone");
  if (!row.is_chain) { score += 20; reasons.push("Likely independent"); }
  else { score -= 20; reasons.push("Chain/brand signal"); }
  if (row.address && row.city) { score += 10; reasons.push("Local address present"); }
  if (row.source_url) { score += 5; reasons.push("Source provenance"); }
  if (row.sub_industry) { score += 5; reasons.push("Specific sub-industry"); }
  score = Math.max(0, Math.min(100, score));
  return { opportunity_score: score, opportunity_grade: score >= 80 ? "A" : score >= 65 ? "B" : score >= 45 ? "C" : "D", opportunity_reasons: reasons };
}
function rowForClient(row) {
  const classified = row.industry_group ? { industry: row.industry_group, sub_industry: row.sub_industry } : classifyIndustry(row.industry);
  const base = {
    name: cleanText(row.name), address: cleanText(row.address), city: cleanText(row.city), state: cleanText(row.state), zip: cleanText(row.zip, 16),
    website: cleanText(row.website, 320), phone: cleanText(row.phone, 80), source_url: cleanText(row.source_url, 320), source_id: cleanText(row.source_id, 80),
    industry: cleanText(row.industry, 120), industry_group: cleanText(row.industry_group || classified.industry || "Other", 80), sub_industry: cleanText(row.sub_industry || classified.sub_industry, 120),
    lat: Number.isFinite(Number(row.lat)) ? Number(row.lat) : null, lng: Number.isFinite(Number(row.lng)) ? Number(row.lng) : null,
    is_chain: Boolean(row.is_chain) || looksLikeChain(row.name),
  };
  return { ...base, ...scoreRow(base) };
}
function industryCounts(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const key = row.industry_group || "Other";
    const cur = groups.get(key) || { industry:key, count:0, with_website:0, with_phone:0, independent:0, avg_score:0, score_total:0 };
    cur.count += 1; if (row.website) cur.with_website += 1; if (row.phone) cur.with_phone += 1; if (!row.is_chain) cur.independent += 1; cur.score_total += Number(row.opportunity_score || 0); groups.set(key, cur);
  }
  return Array.from(groups.values()).map((x)=>({ ...x, avg_score:x.count?Math.round(x.score_total/x.count):0 })).map(({score_total,...x})=>x).sort((a,b)=>b.count-a.count||a.industry.localeCompare(b.industry));
}
function marketInsights(rows) {
  const total = rows.length;
  const withWebsite = rows.filter(r=>r.website).length;
  const withPhone = rows.filter(r=>r.phone).length;
  const independent = rows.filter(r=>!r.is_chain).length;
  const digitalGap = rows.filter(r=>!r.website || !r.phone).length;
  const highOpportunity = rows.filter(r=>Number(r.opportunity_score)>=65).length;
  const groups = industryCounts(rows);
  const topIndustry = groups[0] || null;
  return {
    total,
    contactable_rate: total ? Math.round((rows.filter(r=>r.website||r.phone).length/total)*100) : 0,
    website_rate: total ? Math.round((withWebsite/total)*100) : 0,
    phone_rate: total ? Math.round((withPhone/total)*100) : 0,
    independent_rate: total ? Math.round((independent/total)*100) : 0,
    digital_gap_count: digitalGap,
    high_opportunity_count: highOpportunity,
    top_industry: topIndustry ? { name: topIndustry.industry, count: topIndustry.count, share: Math.round((topIndustry.count/total)*100), avg_score: topIndustry.avg_score } : null,
  };
}
function centroidForRows(rows) { const points=(rows||[]).map(r=>({lat:Number(r.lat),lng:Number(r.lng)})).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)); if(!points.length)return null; return {lat:points.reduce((s,p)=>s+p.lat,0)/points.length,lng:points.reduce((s,p)=>s+p.lng,0)/points.length}; }
function bboxForRows(rows) { const points=(rows||[]).map(r=>({lat:Number(r.lat),lng:Number(r.lng)})).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)); if(!points.length)return null; const lats=points.map(p=>p.lat),lngs=points.map(p=>p.lng); return [Math.min(...lats),Math.min(...lngs),Math.max(...lats),Math.max(...lngs)]; }
function missingTaxonomyColumns(err){return /column .*?(industry_group|sub_industry).*?does not exist/i.test(String(err?.message||err||""));}
function rowMatchesNiche(row,niche){if(!niche||niche==="All")return true; const classified=row.industry_group?{industry:row.industry_group}:classifyIndustry(row.industry); return classified.industry===niche;}
async function cachedBusinessesByZipLegacy(zip){try{return await sql`SELECT name,address,city,state,zip,lat,lng,website,phone,source_id,source_url,industry FROM lead_businesses WHERE zip=${zip} AND status='active' ORDER BY CASE WHEN lat IS NOT NULL AND lng IS NOT NULL THEN 0 ELSE 1 END, CASE WHEN website IS NOT NULL AND website<>'' THEN 0 ELSE 1 END, lower(name) LIMIT ${MAX_CACHE_ROWS}`;}catch(err){console.warn("[leadgen] legacy cache lookup failed",err?.message||err);return[];}}
async function cachedBusinessesByZip(zip){try{return await sql`SELECT name,address,city,state,zip,lat,lng,website,phone,source_id,source_url,industry,industry_group,sub_industry,is_chain FROM lead_businesses WHERE zip=${zip} AND status='active' ORDER BY CASE WHEN lat IS NOT NULL AND lng IS NOT NULL THEN 0 ELSE 1 END, CASE WHEN website IS NOT NULL AND website<>'' THEN 0 ELSE 1 END, lower(name) LIMIT ${MAX_CACHE_ROWS}`;}catch(err){if(missingTaxonomyColumns(err))return cachedBusinessesByZipLegacy(zip);console.warn("[leadgen] cache lookup failed",err?.message||err);return[];}}
async function upsertBusinesses(businesses){if(!businesses?.length)return;try{const payload=JSON.stringify(businesses.map(b=>({name:b.name,legal_name:b.legal_name||null,address:b.address||null,city:b.city||null,state:b.state||null,zip:b.zip||null,lat:Number.isFinite(Number(b.lat))?Number(b.lat):null,lng:Number.isFinite(Number(b.lng))?Number(b.lng):null,website:b.website||null,phone:b.phone||null,source:b.source||"osm",source_id:b.source_id,source_url:b.source_url||null,industry:b.industry||null,industry_group:b.industry_group||null,sub_industry:b.sub_industry||null,is_chain:Boolean(b.is_chain)})));await sql`INSERT INTO lead_businesses (name,legal_name,address,city,state,zip,lat,lng,website,phone,source,source_id,source_url,industry,industry_group,sub_industry,is_chain) SELECT * FROM jsonb_to_recordset(${payload}::jsonb) AS x(name text,legal_name text,address text,city text,state text,zip text,lat double precision,lng double precision,website text,phone text,source text,source_id text,source_url text,industry text,industry_group text,sub_industry text,is_chain boolean) ON CONFLICT(source,source_id) DO UPDATE SET name=EXCLUDED.name,legal_name=EXCLUDED.legal_name,address=EXCLUDED.address,city=EXCLUDED.city,state=EXCLUDED.state,zip=EXCLUDED.zip,lat=EXCLUDED.lat,lng=EXCLUDED.lng,website=EXCLUDED.website,phone=EXCLUDED.phone,source_url=EXCLUDED.source_url,industry=EXCLUDED.industry,industry_group=EXCLUDED.industry_group,sub_industry=EXCLUDED.sub_industry,is_chain=EXCLUDED.is_chain,updated_at=now()`;}catch(err){console.error("[leadgen] upsert failed",err?.message||err);}}
async function discoverLiveBusinesses(zip,source="live_osm"){const discovered=await discoverBusinessesByZip(zip);if(discovered.ok&&discovered.businesses?.length)upsertBusinesses(discovered.businesses).catch(()=>{});return{...discovered,source};}
async function discoverOrLoadBusinesses(zip,niche="All"){const cachedRows=await cachedBusinessesByZip(zip);if(cachedRows.length){const cacheHasRequestedNiche=cachedRows.some(r=>rowMatchesNiche(r,niche));if(!cacheHasRequestedNiche&&niche!=="All"){try{const refreshed=await discoverLiveBusinesses(zip,"live_osm_refresh");if(refreshed.ok&&Array.isArray(refreshed.businesses)&&refreshed.businesses.some(r=>rowMatchesNiche(r,niche)))return refreshed;}catch(err){console.warn("[leadgen] live niche refresh failed",err?.message||err);}}return{ok:true,source:"cache",businesses:cachedRows,bbox:bboxForRows(cachedRows),centroid:centroidForRows(cachedRows)};}return discoverLiveBusinesses(zip);}

export async function POST(request){
  if(isHostileGeo(request)){logThreatActor(request,{threatClass:"hostile_geo_leadgen_scan",path:"/api/leadgen"}).catch(()=>{});return json(403,{ok:false,error:"forbidden",message:"Scan is unavailable for this request."});}
  const ip=clientIp(request); const rl=await rateLimit({ip,bucket:"public_leadgen_scan",windowSeconds:SCAN_WINDOW_SECONDS,max:SCAN_WINDOW_MAX}); if(!rl.ok)return json(429,{ok:false,error:"rate_limited",message:"Too many scans from this connection. Wait a few minutes and try again.",retry_after_seconds:SCAN_WINDOW_SECONDS});
  const body=await parseBody(request); const zip=cleanText(body.zip,5); const niche=cleanText(body.niche||"All",80); const requestedLimit=Number(body.limit); const limit=Number.isFinite(requestedLimit)?Math.min(MAX_LIMIT,Math.max(10,Math.floor(requestedLimit))):40;
  if(!/^\d{5}$/.test(zip))return json(400,{ok:false,error:"invalid_zip",message:"Enter a 5-digit US zip code."});
  if(!ALLOWED_NICHES.has(niche))return json(400,{ok:false,error:"invalid_niche",message:"Choose a supported niche filter.",industries:INDUSTRY_OPTIONS});
  try{
    const result=await discoverOrLoadBusinesses(zip,niche); if(!result.ok)return json(result.error==="upstream_unavailable"?503:404,{ok:false,error:result.error||"scan_failed",message:result.error==="zip_not_found"?"That zip code was not found in OpenStreetMap.":"Live business data is temporarily unavailable. Try again shortly."});
    const allRows=result.businesses.map(rowForClient); const filteredRows=niche&&niche!=="All"?allRows.filter(r=>r.industry_group===niche):allRows;
    const sortRows=(rows)=>rows.sort((a,b)=>Number(b.opportunity_score||0)-Number(a.opportunity_score||0)||a.name.localeCompare(b.name)); const sortedRows=sortRows([...filteredRows]); const rows=sortedRows.slice(0,limit); const broadenedRows=niche&&niche!=="All"&&!filteredRows.length?sortRows([...allRows]).slice(0,limit):[];
    return json(200,{ok:true,zip,niche,industries:INDUSTRY_OPTIONS,total:allRows.length,matched:filteredRows.length,returned:rows.length,scan_source:result.source,with_website:filteredRows.filter(r=>r.website).length,with_phone:filteredRows.filter(r=>r.phone).length,industry_counts:industryCounts(allRows),market_insights:marketInsights(allRows),broadened_rows:broadenedRows,bbox:result.bbox,centroid:result.centroid,rows});
  }catch(err){return json(502,{ok:false,error:"scan_failed",message:cleanText(err?.message||"The public-record scan failed.",240)});}
}
export async function GET(){return json(200,{ok:true,industries:["All",...INDUSTRY_OPTIONS],limit:MAX_LIMIT,rate_limit:{window_seconds:SCAN_WINDOW_SECONDS,max_requests:SCAN_WINDOW_MAX}});}
export default async function handler(req,res){const method=(req.method||"GET").toUpperCase();let response;if(method==="GET")response=await GET();else if(method==="POST"){const body=typeof req.body==="string"?req.body:JSON.stringify(req.body||{});const request=new Request("https://simpleitsrq.com/api/leadgen",{method:"POST",headers:{"content-type":req.headers?.["content-type"]||"application/json","x-real-ip":req.headers?.["x-real-ip"]||"","x-forwarded-for":req.headers?.["x-forwarded-for"]||"","origin":req.headers?.origin||"","user-agent":req.headers?.["user-agent"]||"","x-vercel-ip-country":req.headers?.["x-vercel-ip-country"]||""},body});response=await POST(request);}else{res.setHeader("Allow","GET, POST");res.status(405).json({ok:false,error:"method_not_allowed"});return;}const payload=await response.text();res.status(response.status);for(const [key,value] of response.headers.entries())res.setHeader(key,value);res.send(payload);}
