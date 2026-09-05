// OpenStreetMap-based business discovery via the Overpass API.
//
// Pipeline:
//   1. Resolve a US zip code → bounding box via Nominatim (free, OSM).
//      Falls back to the zip centroid + a fixed radius if no polygon.
//   2. Query Overpass for nodes/ways/relations tagged as a business
//      (shop=*, amenity=*, office=*, craft=*, healthcare=*, tourism=hotel)
//      inside the bounding box.
//   3. Normalize each result into a flat record ready for upsert into
//      the lead_businesses table.

const NOMINATIM = "https://nominatim.openstreetmap.org";
const OVERPASS  = "https://overpass-api.de/api/interpreter";
const OVERPASS_TIMEOUT_MS = Number(process.env.LEADGEN_OVERPASS_TIMEOUT_MS || 15000);
const OVERPASS_RETRY_DELAY_MS = Number(process.env.LEADGEN_OVERPASS_RETRY_DELAY_MS || 600);
const OVERPASS_SPLIT_AREA_THRESHOLD = Number(process.env.LEADGEN_OVERPASS_SPLIT_AREA_THRESHOLD || 0.0045);
const TRANSIENT_OVERPASS_RE = /overpass http (429|500|502|503|504)|timeout|out of memory|aborted|terminated|fetch failed/i;

import { classifyIndustry } from "./leadgen-classify.js";

function ua() {
  return process.env.LEADGEN_USER_AGENT
    || "simpleitsrq-leadgen/1.0 (+https://simpleitsrq.com; contact: hello@simpleitsrq.com)";
}

export async function bboxForZip(zip) {
  const z = String(zip || "").trim();
  if (!/^\d{5}$/.test(z)) throw new Error("invalid zip");
  const url = new URL(`${NOMINATIM}/search`);
  url.searchParams.set("postalcode", z);
  url.searchParams.set("country", "us");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  const res = await fetch(url, { headers: { "User-Agent": ua() } });
  if (!res.ok) throw new Error(`nominatim http ${res.status}`);
  const arr = await res.json();
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const hit = arr[0];
  const [south, north, west, east] = (hit.boundingbox || []).map(Number);
  if ([south, north, west, east].some((n) => !Number.isFinite(n))) return null;
  return {
    bbox: [south, west, north, east],
    centroid: { lat: Number(hit.lat), lng: Number(hit.lon) },
    displayName: hit.display_name || null,
  };
}

const BUSINESS_FILTERS = [
  "shop",
  "amenity~\"^(restaurant|cafe|bar|pub|fast_food|food_court|bank|pharmacy|clinic|dentist|doctors|veterinary|hairdresser|car_rental|car_wash|fuel|library|theatre|cinema|nightclub|gym|fitness_centre|kindergarten|childcare|driving_school|community_centre|coworking_space|marketplace)$\"",
  "office",
  "craft",
  "healthcare",
  "tourism~\"^(hotel|motel|guest_house|apartment|hostel|attraction|museum|gallery)$\"",
];

function buildOverpassQuery(bbox) {
  const [s, w, n, e] = bbox;
  const filters = BUSINESS_FILTERS.map(
    (f) => `node[${f}](${s},${w},${n},${e});\n  way[${f}](${s},${w},${n},${e});\n  relation[${f}](${s},${w},${n},${e});`
  ).join("\n  ");
  return `[out:json][timeout:60];\n(\n  ${filters}\n);\nout center tags;`;
}
function shouldSplitBbox(bbox) { const [s,w,n,e]=bbox; return Math.abs((n-s)*(e-w)) >= OVERPASS_SPLIT_AREA_THRESHOLD; }
function splitBbox(bbox) { const [s,w,n,e]=bbox; const ml=(s+n)/2, mg=(w+e)/2; return [[s,w,ml,mg],[s,mg,ml,e],[ml,w,n,mg],[ml,mg,n,e]]; }
function isTransientOverpassError(err) { return TRANSIENT_OVERPASS_RE.test(String(err?.message || err || "")); }
function uniqueElements(elements) { const seen=new Set(), out=[]; for(const el of elements||[]){const key=`${el?.type||"unknown"}/${el?.id??""}`; if(!el?.id||seen.has(key))continue; seen.add(key); out.push(el);} return out; }
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
async function fetchWithTimeout(url, options, ms, label) { const c=new AbortController(); const t=setTimeout(()=>c.abort(`${label} aborted after ${ms}ms`),ms); try{return await fetch(url,{...options,signal:c.signal});} catch(err){if(err?.name==="AbortError"||c.signal.aborted) throw new Error(`${label} aborted after ${ms}ms`,{cause:err}); throw err;} finally{clearTimeout(t);} }
export async function overpassBusinesses(bbox) { const body=`data=${encodeURIComponent(buildOverpassQuery(bbox))}`; const res=await fetchWithTimeout(OVERPASS,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","User-Agent":ua()},body},OVERPASS_TIMEOUT_MS,"overpass"); if(!res.ok) throw new Error(`overpass http ${res.status}`); const json=await res.json(); if(json.remark&&/timeout|out of memory/i.test(json.remark)) throw new Error(`overpass remark: ${json.remark}`); return Array.isArray(json.elements)?json.elements:[]; }
export async function overpassBusinessesResilient(bbox) { if(!shouldSplitBbox(bbox)) return overpassBusinesses(bbox); try{return await overpassBusinesses(bbox);} catch(err){if(!isTransientOverpassError(err)) throw err; await sleep(OVERPASS_RETRY_DELAY_MS); try{return await overpassBusinesses(bbox);} catch(retryErr){if(!isTransientOverpassError(retryErr)) throw retryErr; const chunks=splitBbox(bbox), elements=[]; let successes=0, first=retryErr; for(const chunk of chunks){try{elements.push(...await overpassBusinesses(chunk));successes++;}catch(chunkErr){if(!isTransientOverpassError(chunkErr)) throw chunkErr; first=first||chunkErr;}} if(!successes) throw first; return uniqueElements(elements);}} }

function pickIndustry(tags) { if(!tags)return null; if(tags.shop)return `shop:${tags.shop}`; if(tags.healthcare)return `healthcare:${tags.healthcare}`; if(tags.office)return `office:${tags.office}`; if(tags.craft)return `craft:${tags.craft}`; if(tags.amenity)return `amenity:${tags.amenity}`; if(tags.tourism)return `tourism:${tags.tourism}`; return null; }
function buildAddress(tags) { if(!tags)return null; const parts=[ [tags["addr:housenumber"],tags["addr:street"]].filter(Boolean).join(" "), tags["addr:unit"]?`# ${tags["addr:unit"]}`:null ].filter(Boolean); return parts.join(", ")||null; }
export function normalizeOsmElement(el) {
  const tags=el?.tags||{}; const name=tags.name||tags["name:en"]||null; if(!name)return null;
  const lat=el.lat??el.center?.lat??null, lng=el.lon??el.center?.lon??null;
  const industry=pickIndustry(tags); const {industry:industry_group,sub_industry}=classifyIndustry(industry);
  const brand=tags.brand||tags["brand:en"]||null; const isChain=Boolean(brand||tags["brand:wikidata"]);
  const email=tags.email||tags["contact:email"]||null; const socialTags=[];
  if(tags["contact:facebook"]||tags.facebook) socialTags.push(`facebook:${tags["contact:facebook"]||tags.facebook}`);
  if(tags["contact:linkedin"]||tags.linkedin) socialTags.push(`linkedin:${tags["contact:linkedin"]||tags.linkedin}`);
  if(tags["contact:twitter"]||tags.twitter) socialTags.push(`twitter:${tags["contact:twitter"]||tags.twitter}`);
  if(tags["contact:instagram"]||tags.instagram) socialTags.push(`instagram:${tags["contact:instagram"]||tags.instagram}`);
  return { name, legal_name:tags.operator||null, brand, is_chain:isChain, address:buildAddress(tags), city:tags["addr:city"]||null, state:tags["addr:state"]||null, zip:tags["addr:postcode"]?.split("-")[0]||null, lat, lng, website:tags.website||tags["contact:website"]||tags.url||null, phone:tags.phone||tags["contact:phone"]||null, source:"osm", source_id:`${el.type}/${el.id}`, source_url:`https://www.openstreetmap.org/${el.type}/${el.id}`, industry, industry_group, sub_industry, naics:tags.naics||null, email, socialTags };
}

export async function discoverBusinessesByZip(zip) {
  let box=null;
  try { box=await bboxForZip(zip); } catch(e) { console.warn("[leadgen-osm] Nominatim zip lookup failed",e); }
  if (!box?.bbox) return { ok:false, error:"zip_not_found", businesses:[], bbox:null, centroid:null };
  let elements;
  try { elements=await overpassBusinessesResilient(box.bbox); }
  catch(e) { console.warn("[leadgen-osm] Overpass query failed",e); return { ok:false, error:"upstream_unavailable", businesses:[], bbox:box.bbox, centroid:box.centroid }; }
  const businesses=elements.map(normalizeOsmElement).filter(Boolean).map((b)=>({...b,zip:b.zip||zip}));
  return { ok:true, businesses, bbox:box.bbox, centroid:box.centroid };
}
