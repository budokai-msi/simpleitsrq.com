import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sqlQueue = [];
const sqlCalls = [];

vi.mock("../db.js", () => ({
  sql: vi.fn((strings, ...values) => {
    sqlCalls.push({ text: Array.from(strings).join("?"), values });
    const next = sqlQueue.shift();
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next || []);
  }),
}));

const { GET } = await import("../../portal.js");

function authedRequest(path) {
  return new Request(`https://simpleitsrq.test${path}`, {
    headers: { "x-admin-token": process.env.ADMIN_API_TOKEN },
  });
}

describe("portal leadgen business list", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ADMIN_API_TOKEN: "test-token-1234567890123456789012",
      ADMIN_EMAIL: "admin@simpleitsrq.com",
    };
    sqlQueue.length = 0;
    sqlCalls.length = 0;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns a compatibility list instead of 500 when taxonomy schema work fails", async () => {
    sqlQueue.push(
      new Error("permission denied for schema public"),
      new Error('column "industry_group" does not exist'),
      [{
        id: 7,
        name: "Example Clinic",
        zip: "34207",
        lat: 27.45,
        lng: -82.58,
        website: "https://example.test",
        industry: "healthcare",
        industry_group: "healthcare",
        sub_industry: null,
        tags: [],
        status: "active",
        deliverable_emails: 1,
      }],
      [{ total: 1 }],
      [{ industry_group: "healthcare", n: 1 }],
    );

    const response = await GET(authedRequest("/api/portal?action=leadgen-businesses&zip=34207&has_email=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.degraded).toBe(true);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].name).toBe("Example Clinic");
    expect(body.facets.groups[0].industry_group).toBe("healthcare");
    expect(sqlCalls.length).toBe(5);
  });

  it("keeps compatibility rows when count and facet queries fail", async () => {
    sqlQueue.push(
      new Error("permission denied for schema public"),
      new Error('column "industry_group" does not exist'),
      [{
        id: 8,
        name: "Example Trades",
        zip: "34207",
        lat: 27.46,
        lng: -82.59,
        website: "https://trades.example",
        industry: "craft:electrician",
        industry_group: "craft:electrician",
        sub_industry: null,
        tags: [],
        status: "active",
        deliverable_emails: 0,
      }],
      new Error('column "opted_out_at" does not exist'),
      new Error("permission denied for relation lead_businesses"),
    );

    const response = await GET(authedRequest("/api/portal?action=leadgen-businesses&zip=34207&no_email=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.degraded).toBe(true);
    expect(body.total).toBe(1);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].name).toBe("Example Trades");
    expect(body.facets.groups).toEqual([]);
    expect(body.warning).toContain("count:");
    expect(body.warning).toContain("facets:");
  });

  it("returns a bare business list when email-dependent compatibility queries fail", async () => {
    sqlQueue.push(
      new Error("permission denied for schema public"),
      new Error('column "industry_group" does not exist'),
      new Error('column "opted_out_at" does not exist'),
      [{
        id: 9,
        name: "Example Services",
        zip: "34207",
        lat: 27.47,
        lng: -82.57,
        website: "https://services.example",
        industry: "office:company",
        industry_group: "office:company",
        sub_industry: null,
        tags: [],
        status: "active",
        deliverable_emails: 0,
      }],
      [{ total: 1 }],
      [{ industry_group: "office:company", n: 1 }],
    );

    const response = await GET(authedRequest("/api/portal?action=leadgen-businesses&zip=34207&status=active"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.degraded).toBe(true);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].name).toBe("Example Services");
    expect(body.rows[0].deliverable_emails).toBe(0);
    expect(body.warning).toContain("bare business");
  });
});
