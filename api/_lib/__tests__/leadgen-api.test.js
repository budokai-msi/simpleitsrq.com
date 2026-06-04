import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDiscoverBusinessesByZip = vi.fn();
const mockSql = vi.fn();
const mockClientIp = vi.fn();
const mockIsHostileGeo = vi.fn();
const mockLogThreatActor = vi.fn();
const mockRateLimit = vi.fn();

vi.mock("../db.js", () => ({
  sql: mockSql,
}));

vi.mock("../leadgen-osm.js", () => ({
  discoverBusinessesByZip: mockDiscoverBusinessesByZip,
}));

vi.mock("../leadgen-classify.js", () => ({
  classifyIndustry: (rawTag) => (
    rawTag === "craft:electrician"
      ? { industry: "Trades", sub_industry: "Electrician" }
      : { industry: "Other", sub_industry: null }
  ),
  INDUSTRY_OPTIONS: ["Healthcare", "Trades", "Professional Services"],
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
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
}

async function readJson(response) {
  return response.json();
}

describe("api/leadgen", () => {
  beforeEach(() => {
    mockDiscoverBusinessesByZip.mockReset();
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
    mockDiscoverBusinessesByZip.mockResolvedValue({
      ok: true,
      businesses: [],
      bbox: [0, 0, 0, 0],
      centroid: { lat: 0, lng: 0 },
    });
  });

  it("GET returns industries and published rate-limit metadata", async () => {
    const response = await GET();
    const data = await readJson(response);
    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.industries).toEqual(["All", "Healthcare", "Trades", "Professional Services"]);
    expect(data.rate_limit).toEqual({
      window_seconds: 600,
      max_requests: 8,
    });
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
    expect(mockDiscoverBusinessesByZip).not.toHaveBeenCalled();
  });

  it("rejects unknown niche with 400 and returns supported industries", async () => {
    const response = await POST(mkRequest({ body: { zip: "34239", niche: "Space Law" } }));
    const data = await readJson(response);
    expect(response.status).toBe(400);
    expect(data.error).toBe("invalid_niche");
    expect(data.industries).toEqual(["Healthcare", "Trades", "Professional Services"]);
    expect(mockDiscoverBusinessesByZip).not.toHaveBeenCalled();
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
    expect(data.industry_counts).toEqual([
      { industry: "Retail", count: 2 },
      { industry: "Professional Services", count: 1 },
    ]);
    expect(data.broadened_rows).toHaveLength(3);
    expect(data.broadened_rows[0].name).toBe("A Retail");
  });

  it("uses cached database records before live OSM discovery", async () => {
    mockSql.mockResolvedValue([
      {
        name: "Cached Clinic",
        zip: "34239",
        industry_group: "Healthcare",
        sub_industry: "Clinic",
        website: "https://clinic.example",
        lat: 27.32,
        lng: -82.54,
      },
      {
        name: "Cached Dental",
        zip: "34239",
        industry_group: "Healthcare",
        sub_industry: "Dentist",
        lat: 27.34,
        lng: -82.52,
      },
    ]);

    const response = await POST(mkRequest({ body: { zip: "34239", niche: "Healthcare", limit: 20 } }));
    const data = await readJson(response);

    expect(response.status).toBe(200);
    expect(mockDiscoverBusinessesByZip).not.toHaveBeenCalled();
    expect(data.scan_source).toBe("cache");
    expect(data.total).toBe(2);
    expect(data.matched).toBe(2);
    expect(data.rows).toHaveLength(2);
    expect(data.centroid.lat).toBeCloseTo(27.33);
    expect(data.bbox).toEqual([27.32, -82.54, 27.34, -82.52]);
  });

  it("uses legacy cached records when taxonomy columns are missing", async () => {
    mockSql
      .mockRejectedValueOnce(new Error('column "industry_group" does not exist'))
      .mockResolvedValueOnce([
        {
          name: "Legacy Electric",
          zip: "34239",
          industry: "craft:electrician",
          lat: 27.32,
          lng: -82.54,
        },
      ]);

    const response = await POST(mkRequest({ body: { zip: "34239", niche: "Trades", limit: 20 } }));
    const data = await readJson(response);

    expect(response.status, JSON.stringify(data)).toBe(200);
    expect(mockDiscoverBusinessesByZip).not.toHaveBeenCalled();
    expect(data.scan_source).toBe("cache");
    expect(data.matched).toBe(1);
    expect(data.rows[0].industry_group).toBe("Trades");
    expect(data.rows[0].sub_industry).toBe("Electrician");
  });

  it("falls back to live OSM when the cache lookup fails", async () => {
    mockSql.mockRejectedValue(new Error("database unavailable"));
    mockDiscoverBusinessesByZip.mockResolvedValue({
      ok: true,
      businesses: [
        {
          name: "Live Contractor",
          zip: "34239",
          industry_group: "Trades",
          sub_industry: "Contractor",
          lat: 27.31,
          lng: -82.53,
        },
      ],
      bbox: [27.3, -82.55, 27.35, -82.5],
      centroid: { lat: 27.325, lng: -82.525 },
    });

    const response = await POST(mkRequest({ body: { zip: "34239", niche: "Trades", limit: 20 } }));
    const data = await readJson(response);

    expect(response.status).toBe(200);
    expect(mockDiscoverBusinessesByZip).toHaveBeenCalledWith("34239");
    expect(data.scan_source).toBe("live_osm");
    expect(data.rows).toHaveLength(1);
  });
});
