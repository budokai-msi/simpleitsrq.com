import { json } from "./_lib/http.js";
import { discoverBusinessesByZip } from "./_lib/leadgen-osm.js";
import { INDUSTRY_OPTIONS } from "./_lib/leadgen-classify.js";
import { clientIp, isHostileGeo, logThreatActor, rateLimit } from "./_lib/security.js";

const MAX_LIMIT = 80;
const SCAN_WINDOW_SECONDS = 600;
const SCAN_WINDOW_MAX = 8;
const ALLOWED_NICHES = new Set(["All", ...INDUSTRY_OPTIONS]);

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
  if (isHostileGeo(request)) {
    logThreatActor(request, { threatClass: "hostile_geo_leadgen_scan", path: "/api/leadgen" }).catch(() => {});
    return json(403, { ok: false, error: "forbidden", message: "Scan is unavailable for this request." });
  }

  const ip = clientIp(request);
  const rl = await rateLimit({ ip, bucket: "public_leadgen_scan", windowSeconds: SCAN_WINDOW_SECONDS, max: SCAN_WINDOW_MAX });
  if (!rl.ok) {
    return json(429, {
      ok: false,
      error: "rate_limited",
      message: "Too many scans from this connection. Wait a few minutes and try again.",
      retry_after_seconds: SCAN_WINDOW_SECONDS,
    });
  }

  const body = await parseBody(request);
  const zip = cleanText(body.zip, 5);
  const niche = cleanText(body.niche || "All", 80);
  const requestedLimit = Number(body.limit);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(MAX_LIMIT, Math.max(10, Math.floor(requestedLimit)))
    : 40;

  if (!/^\d{5}$/.test(zip)) {
    return json(400, {
      ok: false,
      error: "invalid_zip",
      message: "Enter a 5-digit US zip code.",
    });
  }

  if (!ALLOWED_NICHES.has(niche)) {
    return json(400, {
      ok: false,
      error: "invalid_niche",
      message: "Choose a supported niche filter.",
      industries: INDUSTRY_OPTIONS,
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
    rate_limit: {
      window_seconds: SCAN_WINDOW_SECONDS,
      max_requests: SCAN_WINDOW_MAX,
    },
  });
}

// Compatibility handler for runtimes that invoke default exports for /api/*
// routes instead of Web Fetch named methods.
export default async function handler(req, res) {
  const method = (req.method || "GET").toUpperCase();
  let response;
  if (method === "GET") {
    response = await GET();
  } else if (method === "POST") {
    const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
    const request = new Request("https://simpleitsrq.com/api/leadgen", {
      method: "POST",
      headers: {
        "content-type": req.headers?.["content-type"] || "application/json",
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
  for (const [key, value] of response.headers.entries()) {
    res.setHeader(key, value);
  }
  res.send(payload);
}
