// Overture Maps Places discovery for Leadgen.
//
// Reads the official Overture Places PMTiles archive with bounded HTTP range
// requests. Overture's published z14 tiles contain the full place properties
// (nested structs encoded as JSON strings), so this gives us a much denser
// local-business source than OSM tags without copying Google Maps data.

import { PMTiles } from "pmtiles";
import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";
import { looksLikeChain } from "./leadgen-classify.js";

const RELEASE = process.env.OVERTURE_RELEASE || "2026-06-17.0";
const PMTILES_URL = process.env.OVERTURE_PLACES_PMTILES_URL
  || `https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/${RELEASE}/places.pmtiles`;
const TILE_ZOOM = 14;
const MAX_TILES = Math.max(4, Math.min(64, Number(process.env.LEADGEN_OVERTURE_MAX_TILES || 36)));
const MIN_CONFIDENCE = Math.max(0, Math.min(1, Number(process.env.LEADGEN_OVERTURE_MIN_CONFIDENCE || 0.5)));
const archive = new PMTiles(PMTILES_URL);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function tileX(lng, zoom = TILE_ZOOM) {
  const n = 2 ** zoom;
  return clamp(Math.floor(((Number(lng) + 180) / 360) * n), 0, n - 1);
}

function tileY(lat, zoom = TILE_ZOOM) {
  const n = 2 ** zoom;
  const rad = clamp(Number(lat), -85.05112878, 85.05112878) * Math.PI / 180;
  return clamp(Math.floor((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2 * n), 0, n - 1);
}

function insideBbox(lng, lat, bbox) {
  const [south, west, north, east] = bbox;
  return lat >= south && lat <= north && lng >= west && lng <= east;
}

function parseJsonish(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return value;
  try { return JSON.parse(trimmed); } catch { return fallback; }
}

function asArray(value) {
  const parsed = parseJsonish(value, value);
  if (Array.isArray(parsed)) return parsed.filter(Boolean);
  if (parsed == null || parsed === "") return [];
  return [parsed];
}

function cleanText(value, max = 320) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max) || null;
}

function firstText(value) {
  const parsed = parseJsonish(value, value);
  if (typeof parsed === "string" || typeof parsed === "number") return cleanText(parsed);
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const found = firstText(item);
      if (found) return found;
    }
    return null;
  }
  if (parsed && typeof parsed === "object") {
    for (const key of ["primary", "value", "name", "freeform"]) {
      const found = firstText(parsed[key]);
      if (found) return found;
    }
  }
  return null;
}

function listOfStrings(value, max = 8) {
  const out = [];
  for (const item of asArray(value)) {
    const text = firstText(item);
    if (text && !out.includes(text)) out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function normalizeState(value) {
  const raw = cleanText(value, 32);
  if (!raw) return null;
  const match = raw.toUpperCase().match(/(?:US[-_])?([A-Z]{2})$/);
  return match ? match[1] : raw;
}

function prettifyCategory(value) {
  const raw = cleanText(value, 120);
  if (!raw) return null;
  return raw.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function classifyCategory(rawCategory) {
  const raw = String(rawCategory || "").toLowerCase();
  const rules = [
    ["Healthcare", /doctor|dentist|hospital|clinic|medical|health|pharmacy|chiropr|physio|therapy|optometr|veterinar|hearing/],
    ["Trades", /plumb|electric|roof|contractor|construction|carpenter|hvac|heating|air_condition|landscap|lawn|pest|handyman|builder|paint/],
    ["Automotive", /auto|automotive|car_|car |vehicle|tire|tyre|mechanic|body_shop|gas_station|fuel|motorcycle/],
    ["Food & Drink", /restaurant|cafe|coffee|bar$|pub$|bakery|food|pizza|burger|sandwich|ice_cream|brewery|winery|deli/],
    ["Hospitality", /hotel|motel|lodging|hostel|guest_house|vacation|resort/],
    ["Personal Services", /barber|hair|salon|beauty|massage|tattoo|nail|laundry|dry_clean|funeral|grooming/],
    ["Cleaning & Maintenance", /cleaning|janitor|maintenance|pool_service|window_clean|carpet_clean/],
    ["Real Estate", /real_estate|property_management|mortgage|rental_agency|realtor/],
    ["Media & Creative", /graphic|photograph|video_production|marketing_agency|advertising|web_design|print_shop|creative/],
    ["Education", /school|college|university|childcare|daycare|kindergarten|library|tutor|education|training/],
    ["Recreation", /gym|fitness|sports|theatre|theater|cinema|bowling|dance|recreation|event_venue|museum|gallery/],
    ["Professional Services", /lawyer|law_firm|account|financial|insurance|consult|architect|engineer|notary|tax_|business_service|office|it_service|technology/],
    ["Retail", /store|shop|retail|market|supermarket|grocery|clothing|shoe|jewel|book|electronic|furniture|hardware|florist|pet_|sporting_good|gift/],
  ];
  for (const [industry, re] of rules) if (re.test(raw)) return industry;
  return "Other";
}

function categoryDetails(props) {
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
}

function primaryName(props) {
  return cleanText(props["@name"] || props.name || firstText(parseJsonish(props.names, null)), 240);
}

function pickAddress(props, zip) {
  const addresses = asArray(props.addresses).map((item) => parseJsonish(item, item)).filter((item) => item && typeof item === "object");
  const preferred = addresses.find((a) => String(a.postcode || "").slice(0, 5) === zip)
    || addresses.find((a) => String(a.country || "").toUpperCase() === "US")
    || addresses[0]
    || {};
  return {
    address: cleanText(preferred.freeform || preferred.address || preferred.street_address, 280),
    city: cleanText(preferred.locality || preferred.city, 120),
    state: normalizeState(preferred.region || preferred.state),
    zip: cleanText(preferred.postcode || zip, 16)?.split("-")[0] || zip,
    country: cleanText(preferred.country, 8),
  };
}

function normalizeFeature(feature, x, y, zoom, requestedZip, bbox) {
  const props = feature?.properties || {};
  const geo = feature.toGeoJSON(x, y, zoom);
  const coords = geo?.geometry?.coordinates || [];
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !insideBbox(lng, lat, bbox)) return null;

  const name = primaryName(props);
  if (!name) return null;
  const confidenceRaw = Number(props.confidence);
  const confidence = Number.isFinite(confidenceRaw) ? confidenceRaw : null;
  const status = cleanText(props.operating_status, 48)?.toLowerCase() || null;
  if (status === "permanently_closed" || confidence === 0) return null;
  if (confidence !== null && confidence < MIN_CONFIDENCE) return null;

  const address = pickAddress(props, requestedZip);
  if (address.country && address.country.toUpperCase() !== "US") return null;
  if (address.zip && requestedZip && address.zip !== requestedZip) return null;

  const category = categoryDetails(props);
  const industryGroup = classifyCategory(category.classifier);
  const websites = listOfStrings(props.websites, 4);
  const phones = listOfStrings(props.phones, 4);
  const emails = listOfStrings(props.emails, 6);
  const socials = listOfStrings(props.socials, 6);
  const brand = parseJsonish(props.brand, null);
  const brandName = firstText(brand?.names || brand?.name || brand);
  const sources = asArray(props.sources).map((s) => parseJsonish(s, s)).filter(Boolean);
  const sourceDatasets = Array.from(new Set(sources.map((s) => cleanText(s?.dataset || s?.provider, 80)).filter(Boolean))).slice(0, 6);
  const id = cleanText(props.id || geo?.id || feature?.id, 120);

  return {
    name,
    legal_name: null,
    brand: brandName,
    is_chain: Boolean(brandName) || looksLikeChain(name),
    ...address,
    lat,
    lng,
    website: websites[0] || null,
    phone: phones[0] || null,
    email: emails[0] || null,
    emails,
    socials,
    source: "overture",
    source_label: "Overture Maps",
    source_id: id || `tile/${zoom}/${x}/${y}/${feature?.id ?? name}`,
    source_url: null,
    source_confidence: confidence,
    source_datasets: sourceDatasets,
    industry: category.specific ? `overture:${category.specific}` : null,
    industry_group: industryGroup,
    sub_industry: prettifyCategory(category.label),
  };
}

function tileListForBbox(bbox, centroid) {
  const [south, west, north, east] = bbox;
  const minX = tileX(west);
  const maxX = tileX(east);
  const minY = tileY(north);
  const maxY = tileY(south);
  const centerX = tileX(centroid?.lng ?? (west + east) / 2);
  const centerY = tileY(centroid?.lat ?? (south + north) / 2);
  const out = [];
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      out.push({ x, y, distance: Math.abs(x - centerX) + Math.abs(y - centerY) });
    }
  }
  out.sort((a, b) => a.distance - b.distance || a.x - b.x || a.y - b.y);
  return out.slice(0, MAX_TILES);
}

async function readTile(tile) {
  const response = await archive.getZxy(TILE_ZOOM, tile.x, tile.y);
  if (!response?.data) return [];
  const decoded = new VectorTile(new Pbf(new Uint8Array(response.data)));
  const layers = Object.values(decoded.layers || {});
  const layer = decoded.layers?.place || decoded.layers?.places || layers[0];
  if (!layer) return [];
  const out = [];
  for (let i = 0; i < layer.length; i += 1) out.push(layer.feature(i));
  return out;
}

export async function discoverOvertureBusinesses({ zip, bbox, centroid }) {
  if (!/^\d{5}$/.test(String(zip || "")) || !Array.isArray(bbox) || bbox.length !== 4) {
    return { ok: false, error: "invalid_area", businesses: [] };
  }
  const tiles = tileListForBbox(bbox, centroid);
  if (!tiles.length) return { ok: true, businesses: [], tiles: 0, release: RELEASE };

  const settled = await Promise.allSettled(tiles.map((tile) => readTile(tile).then((features) => ({ tile, features }))));
  const businesses = [];
  const seen = new Set();
  let successfulTiles = 0;
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    successfulTiles += 1;
    const { tile, features } = result.value;
    for (const feature of features) {
      const row = normalizeFeature(feature, tile.x, tile.y, TILE_ZOOM, String(zip), bbox);
      if (!row) continue;
      const key = row.source_id || `${row.name}|${row.address || ""}|${row.lat.toFixed(5)}|${row.lng.toFixed(5)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      businesses.push(row);
    }
  }

  if (!successfulTiles) return { ok: false, error: "overture_unavailable", businesses: [], tiles: tiles.length, release: RELEASE };
  businesses.sort((a, b) => Number(b.source_confidence ?? -1) - Number(a.source_confidence ?? -1) || a.name.localeCompare(b.name));
  return {
    ok: true,
    businesses,
    tiles: tiles.length,
    successful_tiles: successfulTiles,
    release: RELEASE,
    source: "overture",
  };
}

export const OVERTURE_ATTRIBUTION = "Overture Maps Foundation";
