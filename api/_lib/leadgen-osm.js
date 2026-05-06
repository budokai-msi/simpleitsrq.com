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
//
// Compliance / etiquette:
//   - Both APIs are free but require a User-Agent identifying us. Set via
//     LEADGEN_USER_AGENT env var; falls back to a static string referencing
//     this codebase so the OSM ops team can find us if a query misbehaves.
//   - Nominatim asks for max 1 req/sec. Overpass enforces its own rate
//     limit and will 429 us if we abuse it; callers should batch zips
//     serially, not in parallel.

const NOMINATIM = "https://nominatim.openstreetmap.org";
const OVERPASS  = "https://overpass-api.de/api/interpreter";

function ua() {
  return process.env.LEADGEN_USER_AGENT
    || "simpleitsrq-leadgen/1.0 (+https://simpleitsrq.com; contact: hello@simpleitsrq.com)";
}

// ---------- bounding box lookup ----------

/**
 * Resolve a US zip code to a [south, west, north, east] bounding box and a
 * { lat, lng } centroid using Nominatim. Returns null if Nominatim has no
 * record for the zip (rare for valid US zips, but possible for newly
 * created or PO-box-only zips).
 */
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
  // boundingbox order is [south, north, west, east] as strings.
  const [south, north, west, east] = (hit.boundingbox || []).map(Number);
  if ([south, north, west, east].some((n) => !Number.isFinite(n))) return null;
  return {
    bbox: [south, west, north, east],
    centroid: { lat: Number(hit.lat), lng: Number(hit.lon) },
    displayName: hit.display_name || null,
  };
}

// ---------- Overpass query ----------

// Tag groups we treat as "business". Tuned for SMB-heavy categories the
// outreach stack would care about; deliberately omits things like
// natural=*, leisure=park, public_transport=*, etc.
const BUSINESS_FILTERS = [
  "shop",
  "amenity~\"^(restaurant|cafe|bar|pub|fast_food|food_court|bank|pharmacy|clinic|dentist|doctors|veterinary|hairdresser|car_rental|car_wash|fuel|library|theatre|cinema|nightclub|gym|fitness_centre|kindergarten|childcare|driving_school|community_centre|coworking_space|marketplace)$\"",
  "office",
  "craft",
  "healthcare",
  "tourism~\"^(hotel|motel|guest_house|apartment|hostel|attraction|museum|gallery)$\"",
];

/**
 * Build the Overpass QL query for one bounding box.
 *
 * Uses `out center;` so ways/relations return a single representative
 * lat/lng even though their geometry is a polygon. `[timeout:60]` keeps
 * us inside Overpass's default per-query envelope.
 */
function buildOverpassQuery(bbox) {
  const [s, w, n, e] = bbox;
  const filters = BUSINESS_FILTERS.map(
    (f) => `node[${f}](${s},${w},${n},${e});\n  way[${f}](${s},${w},${n},${e});\n  relation[${f}](${s},${w},${n},${e});`
  ).join("\n  ");
  return `[out:json][timeout:60];\n(\n  ${filters}\n);\nout center tags;`;
}

/**
 * Run an Overpass query and return raw elements. Throws on HTTP error or
 * Overpass remark indicating quota/timeout — caller can retry with a
 * smaller bbox.
 */
export async function overpassBusinesses(bbox) {
  const body = `data=${encodeURIComponent(buildOverpassQuery(bbox))}`;
  const res = await fetch(OVERPASS, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": ua(),
    },
    body,
  });
  if (!res.ok) throw new Error(`overpass http ${res.status}`);
  const json = await res.json();
  if (json.remark && /timeout|out of memory/i.test(json.remark)) {
    throw new Error(`overpass remark: ${json.remark}`);
  }
  return Array.isArray(json.elements) ? json.elements : [];
}

// ---------- normalization ----------

/**
 * Pick a canonical "industry" string from the OSM tag soup. Order matters:
 * we prefer specific tags (healthcare:specialty, shop=foo) over generic
 * (amenity=clinic). Returns null if nothing useful.
 */
function pickIndustry(tags) {
  if (!tags) return null;
  if (tags.shop) return `shop:${tags.shop}`;
  if (tags.healthcare) return `healthcare:${tags.healthcare}`;
  if (tags.office) return `office:${tags.office}`;
  if (tags.craft) return `craft:${tags.craft}`;
  if (tags.amenity) return `amenity:${tags.amenity}`;
  if (tags.tourism) return `tourism:${tags.tourism}`;
  return null;
}

function buildAddress(tags) {
  if (!tags) return null;
  const parts = [
    [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" "),
    tags["addr:unit"] ? `# ${tags["addr:unit"]}` : null,
  ].filter(Boolean);
  return parts.join(", ") || null;
}

/**
 * Map raw Overpass element → canonical lead_businesses row. Skips elements
 * with no name (anonymous shops aren't useful for outreach).
 *
 * Returns null when the element should be discarded.
 */
export function normalizeOsmElement(el) {
  const tags = el?.tags || {};
  const name = tags.name || tags["name:en"] || null;
  if (!name) return null;

  // Lat/lng: nodes carry it directly, ways/relations carry it under .center
  // when we requested `out center`.
  const lat = el.lat ?? el.center?.lat ?? null;
  const lng = el.lon ?? el.center?.lon ?? null;

  return {
    name,
    legal_name: tags.operator || null,
    address: buildAddress(tags),
    city: tags["addr:city"] || null,
    state: tags["addr:state"] || null,
    zip: tags["addr:postcode"]?.split("-")[0] || null,
    lat,
    lng,
    website: tags.website || tags["contact:website"] || tags.url || null,
    phone: tags.phone || tags["contact:phone"] || null,
    source: "osm",
    source_id: `${el.type}/${el.id}`,
    source_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    industry: pickIndustry(tags),
    naics: null,
  };
}

/**
 * High-level helper: zip → discovered business records, ready for upsert.
 * Returns the array (possibly empty) along with the bbox used so callers
 * can persist the discovery context for debugging / future re-scans.
 */
export async function discoverBusinessesByZip(zip) {
  const box = await bboxForZip(zip);
  if (!box) return { ok: false, error: "zip_not_found", businesses: [], bbox: null };
  const elements = await overpassBusinesses(box.bbox);
  const businesses = elements
    .map(normalizeOsmElement)
    .filter(Boolean)
    .map((b) => ({ ...b, zip: b.zip || zip }));
  return { ok: true, businesses, bbox: box.bbox, centroid: box.centroid };
}
