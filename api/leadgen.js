import { json } from "./_lib/http.js";
import { discoverBusinessesByZip } from "./_lib/leadgen-osm.js";
import { INDUSTRY_OPTIONS } from "./_lib/leadgen-classify.js";
import { clientIp, rateLimit } from "./_lib/security.js";

const MAX_LIMIT = 80;

function cleanText(value, max = 240) {
  return String(value || "").trim().slice(0, max);
}

function parseBody(request) {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("application/json")) return {};
  return request.json().catch(() => ({}));
}

function rowForClient(row) {
  return {
    name: cleanText(row.name),
    address: cleanText(row.address),
    city: cleanText(row.city),
    state: cleanText(row.state),
    zip: cleanText(row.zip, 16),
    website: cleanText(row.website, 320),
    phone: cleanText(row.phone, 80),
    source_url: cleanText(row.source_url, 320),
    source_id: cleanText(row.source_id, 80),
    industry: cleanText(row.industry, 120),
    industry_group: cleanText(row.industry_group || "Other", 80),
    sub_industry: cleanText(row.sub_industry, 120),
    lat: Number.isFinite(Number(row.lat)) ? Number(row.lat) : null,
    lng: Number.isFinite(Number(row.lng)) ? Number(row.lng) : null,
  };
}

export async function POST(request) {
  const ip = clientIp(request);
  const rl = await rateLimit({ ip, bucket: "public_leadgen_scan", windowSeconds: 600, max: 8 });
  if (!rl.ok) {
    return json(429, {
      ok: false,
      error: "rate_limited",
      message: "Too many scans from this connection. Wait a few minutes and try again.",
    });
  }

  const body = await parseBody(request);
  const zip = cleanText(body.zip, 5);
  const niche = cleanText(body.niche || "All", 80);
  const limit = Math.min(MAX_LIMIT, Math.max(10, Number(body.limit) || 40));

  if (!/^\d{5}$/.test(zip)) {
    return json(400, {
      ok: false,
      error: "invalid_zip",
      message: "Enter a 5-digit US zip code.",
    });
  }

  try {
    const result = await discoverBusinessesByZip(zip);
    if (!result.ok) {
      return json(404, {
        ok: false,
        error: result.error || "scan_failed",
        message: result.error === "zip_not_found"
          ? "That zip code was not found in OpenStreetMap."
          : "The public-record scan did not finish.",
      });
    }

    const allRows = result.businesses.map(rowForClient);
    const filteredRows = niche && niche !== "All"
      ? allRows.filter((row) => row.industry_group === niche)
      : allRows;
    const sortedRows = filteredRows.sort((a, b) => {
      const aw = a.website ? 0 : 1;
      const bw = b.website ? 0 : 1;
      if (aw !== bw) return aw - bw;
      return a.name.localeCompare(b.name);
    });
    const rows = sortedRows.slice(0, limit);

    return json(200, {
      ok: true,
      zip,
      niche,
      industries: INDUSTRY_OPTIONS,
      total: allRows.length,
      matched: filteredRows.length,
      returned: rows.length,
      with_website: filteredRows.filter((row) => row.website).length,
      with_phone: filteredRows.filter((row) => row.phone).length,
      bbox: result.bbox,
      centroid: result.centroid,
      rows,
    });
  } catch (err) {
    return json(502, {
      ok: false,
      error: "scan_failed",
      message: cleanText(err?.message || "The public-record scan failed.", 240),
    });
  }
}

export async function GET() {
  return json(200, {
    ok: true,
    industries: ["All", ...INDUSTRY_OPTIONS],
    limit: MAX_LIMIT,
  });
}
