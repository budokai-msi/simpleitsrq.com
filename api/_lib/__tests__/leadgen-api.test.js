import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDiscoverBusinessesByZip = vi.fn();
const mockClientIp = vi.fn();
const mockIsHostileGeo = vi.fn();
const mockLogThreatActor = vi.fn();
const mockRateLimit = vi.fn();

vi.mock("../leadgen-osm.js", () => ({
  discoverBusinessesByZip: mockDiscoverBusinessesByZip,
}));

vi.mock("../leadgen-classify.js", () => ({
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
    mockClientIp.mockReset();
    mockIsHostileGeo.mockReset();
    mockLogThreatActor.mockReset();
    mockRateLimit.mockReset();

    mockClientIp.mockReturnValue("127.0.0.1");
    mockIsHostileGeo.mockReturnValue(false);
    mockLogThreatActor.mockResolvedValue(undefined);
    mockRateLimit.mockResolvedValue({ ok: true, count: 1, remaining: 7 });
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
});
