import { describe, expect, it, vi } from "vitest";

const sqlMock = vi.fn((strings) => {
  const query = Array.isArray(strings) ? strings.join("") : String(strings || "");
  if (query.includes("SELECT 1 AS ping")) return Promise.resolve([{ ping: 1 }]);
  if (query.includes("security_events")) return Promise.resolve([{ cnt: 0 }]);
  return Promise.resolve([]);
});

vi.mock("../db.js", () => ({ sql: sqlMock }));

const { GET, HEAD } = await import("../../health.js");

describe("/api/health public response", () => {
  it("returns monitor-safe uptime without internal DB or security counts", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe("ok");
    expect(body.service).toBe("simpleitsrq-web");
    expect(body.uptime.timestamp).toEqual(expect.any(String));
    expect(body).not.toHaveProperty("checks");
  });

  it("mirrors GET status and headers for HEAD probes without a body", async () => {
    const response = await HEAD();
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(text).toBe("");
  });
});
