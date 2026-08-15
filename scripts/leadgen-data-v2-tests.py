from pathlib import Path

Path('api/_lib/__tests__/leadgen-api.test.js').write_text(r'''import { beforeEach, describe, expect, it, vi } from "vitest";

const mockBboxForZip = vi.fn();
const mockDiscoverBusinessesByZip = vi.fn();
const mockDiscoverOvertureBusinesses = vi.fn();
const mockSql = vi.fn();
const mockClientIp = vi.fn();
const mockIsHostileGeo = vi.fn();
const mockLogThreatActor = vi.fn();
const mockRateLimit = vi.fn();

vi.mock("../db.js", () => ({ sql: mockSql }));

vi.mock("../leadgen-osm.js", () => ({
  bboxForZip: mockBboxForZip,
  discoverBusinessesByZip: mockDiscoverBusinessesByZip,
}));

vi.mock("../leadgen-overture.js", () => ({
  discoverOvertureBusinesses: mockDiscoverOvertureBusinesses,
}));

vi.mock("../leadgen-classify.js", () => ({
  classifyIndustry: (rawTag) => (
    rawTag === "craft:electrician"
      ? { industry: "Trades", sub_industry: "Electrician" }
      : { industry: "Other", sub_industry: null }
  ),
  INDUSTRY_OPTIONS: ["Healthcare", "Trades", "Professional Services"],
  looksLikeChain: (name) => /walmart|7-?eleven|aldi|mcdonald|starbucks|cvs|walgreens/i.test(String(name || "")),
}));

vi.mock("../security.js", () => ({
  clientIp: mockClientIp,
  isHostileGeo: mockIsHostileGeo,
  logThreatActor: mockLogThreatActor,
  rateLimit: mockRateLimit,
}));

const { GET, POST } = await import("../../leadgen.js");

function mkRequest({ method = "POST", body, headers = {} } = {}) {
  return new Request("https://simpleitsrq.com/api/leadgen", {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body == null ? undefined : JSON.stringify(body),
  });
}

async function readJson(response) { return response.json(); }

function freshCacheRows(count = 20, industry = "Healthcare") {
  const updated = new Date().toISOString();
  return Array.from({ length: count }, (_, index) => ({
    name: `Cached Business ${index + 1}`,
    zip: "34239",
    industry_group: industry,
    sub_industry: industry === "Healthcare" ? "Clinic" : "Restaurant",
    website: `https://cached-${index + 1}.example`,
    lat: 27.32 + index * 0.0001,
    lng: -82.54 + index * 0.0001,
    source: "overture",
    source_id: `cache-${index + 1}`,
    updated_at: updated,
  }));
}

function overtureRows(count = 12, industry = "Healthcare") {
  return Array.from({ length: count }, (_, index) => ({
    name: `Overture Business ${index + 1}`,
    zip: "34239",
    industry_group: industry,
    sub_industry: industry === "Healthcare" ? "Clinic" : "Electrician",
    website: `https://overture-${index + 1}.example`,
    phone: `+1 941 555 ${String(1000 + index)}`,
    email: `hello${index + 1}@overture-${index + 1}.example`,
    lat: 27.31 + index * 0.0001,
    lng: -82.53 + index * 0.0001,
    source: "overture",
    source_label: "Overture Maps",
    source_id: `ov-${index + 1}`,
    source_confidence: 0.9,
  }));
}

describe("api/leadgen", () => {
  beforeEach(() => {
    mockBboxForZip.mockReset();
    mockDiscoverBusinessesByZip.mockReset();
    mockDiscoverOvertureBusinesses.mockReset();
    mockSql.mockReset();
    mockClientIp.mockReset();
    mockIsHostileGeo.mockReset();
    mockLogThreatActor.mockReset();
    mockRateLimit.mockReset();

    mockClientIp.mockReturnValue("127.0.0.1");
    mockIsHostileGeo.mockReturnValue(false);
    mockLogThreatActor.mockResolvedValue(undefined);
    mockRateLimit.mockResolvedValue({ ok: true, count: 1, remaining: 7 });
    mockSql.mockResolvedValue([]);
    mockBboxForZip.mockResolvedValue({
      bbox: [27.3, -82.55, 27.35, -82.5],
      centroid: { lat: 27.325, lng: -82.525 },
    });
    mockDiscoverOvertureBusinesses.mockResolvedValue({ ok: true, businesses: [], tiles: 1, successful_tiles: 1, release: "test" });
    mockDiscoverBusinessesByZip.mockResolvedValue({ ok: true, businesses: [], bbox: [27.3, -82.55, 27.35, -82.5], centroid: { lat: 27.325, lng: -82.525 } });
  });

  it("GET returns industries, discovery sources, and rate-limit metadata", async () => {
    const response = await GET();
    const data = await readJson(response);
    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.industries).toEqual(["All", "Healthcare", "Trades", "Professional Services"]);
    expect(data.discovery).toEqual(["overture", "osm_fallback"]);
    expect(data.rate_limit).toEqual({ window_seconds: 600, max_requests: 8 });
  });

  it("rejects hostile-geo requests before scanning", async () => {
    mockIsHostileGeo.mockReturnValue(true);
    const response = await POST(mkRequest({ body: { zip: "34239", niche: "All" } }));
    const data = await readJson(response);
    expect(response.status).toBe(403);
    expect(data.error).toBe("forbidden");
    expect(mockLogThreatActor).toHaveBeenCalledTimes(1);
    expect(mockRateLimit).not.toHaveBeenCalled();
  });

  it("rejects invalid zip with 400", async () => {
    const response = await POST(mkRequest({ body: { zip: "34x39", niche: "All" } }));
    const data = await readJson(response);
    expect(response.status).toBe(400);
    expect(data.error).toBe("invalid_zip");
    expect(mockBboxForZip).not.toHaveBeenCalled();
  });

  it("rejects unknown niche with 400 and returns supported industries", async () => {
    const response = await POST(mkRequest({ body: { zip: "34239", niche: "Space Law" } }));
    const data = await readJson(response);
    expect(response.status).toBe(400);
    expect(data.error).toBe("invalid_niche");
    expect(data.industries).toEqual(["Healthcare", "Trades", "Professional Services"]);
    expect(mockBboxForZip).not.toHaveBeenCalled();
  });

  it("returns 429 with retry hint when rate-limited", async () => {
    mockRateLimit.mockResolvedValue({ ok: false, count: 9, remaining: 0 });
    const response = await POST(mkRequest({ body: { zip: "34239", niche: "All" } }));
    const data = await readJson(response);
    expect(response.status).toBe(429);
    expect(data.error).toBe("rate_limited");
    expect(data.retry_after_seconds).toBe(600);
  });

  it("returns industry counts and broader map rows for zero-match niche scans", async () => {
    mockDiscoverBusinessesByZip.mockResolvedValue({
      ok: true,
      businesses: [
        { name: "A Retail", industry_group: "Retail", website: "https://a.example", lat: 27.1, lng: -82.1 },
        { name: "B Pro", industry_group: "Professional Services", lat: 27.2, lng: -82.2 },
        { name: "C Retail", industry_group: "Retail", lat: 27.3, lng: -82.3 },
      ],
      bbox: [0, 0, 0, 0],
      centroid: { lat: 0, lng: 0 },
    });

    const response = await POST(mkRequest({ body: { zip: "34239", niche: "Trades", limit: 20 } }));
    const data = await readJson(response);
    expect(response.status).toBe(200);
    expect(data.matched).toBe(0);
    expect(data.rows).toEqual([]);
    expect(data.industry_counts).toMatchObject([
      { industry: "Retail", count: 2 },
      { industry: "Professional Services", count: 1 },
    ]);
    expect(data.broadened_rows).toHaveLength(3);
  });

  it("uses a healthy fresh cache without hitting discovery providers", async () => {
    mockSql.mockResolvedValue(freshCacheRows(20));
    const response = await POST(mkRequest({ body: { zip: "34239", niche: "Healthcare", limit: 20 } }));
    const data = await readJson(response);
    expect(response.status).toBe(200);
    expect(mockBboxForZip).not.toHaveBeenCalled();
    expect(mockDiscoverOvertureBusinesses).not.toHaveBeenCalled();
    expect(mockDiscoverBusinessesByZip).not.toHaveBeenCalled();
    expect(data.scan_source).toBe("cache");
    expect(data.total).toBe(20);
    expect(data.matched).toBe(20);
  });

  it("refreshes a sparse cache instead of freezing a ZIP at two records", async () => {
    mockSql
      .mockResolvedValueOnce(freshCacheRows(2))
      .mockResolvedValue([]);
    mockDiscoverOvertureBusinesses.mockResolvedValue({
      ok: true,
      businesses: overtureRows(12),
      tiles: 4,
      successful_tiles: 4,
      release: "test",
    });

    const response = await POST(mkRequest({ body: { zip: "34239", niche: "Healthcare", limit: 20 } }));
    const data = await readJson(response);
    expect(response.status).toBe(200);
    expect(mockBboxForZip).toHaveBeenCalledWith("34239");
    expect(mockDiscoverOvertureBusinesses).toHaveBeenCalledTimes(1);
    expect(mockDiscoverBusinessesByZip).not.toHaveBeenCalled();
    expect(data.scan_source).toBe("overture");
    expect(data.total).toBe(12);
    expect(data.with_email).toBe(12);
    expect(data.attribution.businesses).toBe("Overture Maps Foundation");
  });

  it("refreshes live discovery when a healthy cache misses the selected niche", async () => {
    mockSql.mockResolvedValue(freshCacheRows(20, "Food & Drink"));
    mockDiscoverBusinessesByZip.mockResolvedValue({
      ok: true,
      businesses: [{ name: "Live Electric", zip: "34239", industry: "craft:electrician", lat: 27.31, lng: -82.53 }],
      bbox: [27.3, -82.55, 27.35, -82.5],
      centroid: { lat: 27.325, lng: -82.525 },
    });

    const response = await POST(mkRequest({ body: { zip: "34239", niche: "Trades", limit: 20 } }));
    const data = await readJson(response);
    expect(response.status).toBe(200);
    expect(mockDiscoverBusinessesByZip).toHaveBeenCalledWith("34239");
    expect(data.scan_source).toBe("osm");
    expect(data.matched).toBe(1);
    expect(data.rows[0].name).toBe("Live Electric");
  });

  it("keeps legacy cached records as degraded fallback when live providers are unavailable", async () => {
    mockSql
      .mockRejectedValueOnce(new Error('column "industry_group" does not exist'))
      .mockResolvedValueOnce([{ name: "Legacy Electric", zip: "34239", industry: "craft:electrician", lat: 27.32, lng: -82.54, updated_at: new Date().toISOString() }]);
    mockBboxForZip.mockRejectedValue(new Error("geocoder unavailable"));
    mockDiscoverBusinessesByZip.mockResolvedValue({ ok: false, error: "upstream_unavailable", businesses: [], bbox: null, centroid: null });

    const response = await POST(mkRequest({ body: { zip: "34239", niche: "Trades", limit: 20 } }));
    const data = await readJson(response);
    expect(response.status, JSON.stringify(data)).toBe(200);
    expect(data.scan_source).toBe("stale_cache");
    expect(data.degraded).toBe(true);
    expect(data.matched).toBe(1);
    expect(data.rows[0].industry_group).toBe("Trades");
  });

  it("falls back to live OSM when the cache lookup fails and Overture is empty", async () => {
    mockSql.mockRejectedValue(new Error("database unavailable"));
    mockDiscoverBusinessesByZip.mockResolvedValue({
      ok: true,
      businesses: [{ name: "Live Contractor", zip: "34239", industry_group: "Trades", sub_industry: "Contractor", lat: 27.31, lng: -82.53 }],
      bbox: [27.3, -82.55, 27.35, -82.5],
      centroid: { lat: 27.325, lng: -82.525 },
    });

    const response = await POST(mkRequest({ body: { zip: "34239", niche: "Trades", limit: 20 } }));
    const data = await readJson(response);
    expect(response.status).toBe(200);
    expect(mockDiscoverOvertureBusinesses).toHaveBeenCalledTimes(1);
    expect(mockDiscoverBusinessesByZip).toHaveBeenCalledWith("34239");
    expect(data.scan_source).toBe("osm");
    expect(data.rows).toHaveLength(1);
  });
});
''')

print('Leadgen v2 tests patched')
