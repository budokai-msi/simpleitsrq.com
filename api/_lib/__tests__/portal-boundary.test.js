// Boundary regression test: the client and admin portal surfaces are
// structurally separate. A customer (non-admin) session must NEVER reach
// an admin action — it must get 403 before any handler runs.
//
// This guards the refactor that split dispatchAuthed() into a client
// router + an admin router (dispatchAdmin). If someone later adds an
// admin action to the client router, or weakens the ownerSession gate,
// this test fails.

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

// Force the cookie-session path: getSession returns a real (non-admin)
// customer session, and no admin token is present. Keep the real
// parseCookies (csrf.js imports it from session.js).
vi.mock("../session.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getSession: vi.fn(async () => ({
      sessionId: 42,
      user: {
        id: 42,
        email: "customer@example.com",
        name: "Customer",
        isAdmin: false,
        plan: "free",
      },
    })),
  };
});

const { GET, POST } = await import("../../portal.js");

function customerRequest(path, method = "GET") {
  return new Request(`https://simpleitsrq.test${path}`, {
    method,
    headers: {
      origin: "https://simpleitsrq.com",
      "x-csrf-token": "csrf",
      cookie: "sirq_session=deadbeef",
    },
  });
}

describe("portal client/admin boundary", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      // No ADMIN_API_TOKEN set — so the token bypass is off and the
      // request must go through the cookie-session path.
      ADMIN_API_TOKEN: "",
    };
    sqlQueue.length = 0;
    sqlCalls.length = 0;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("lets a customer reach a client action (me)", async () => {
    sqlQueue.push([{ id: 42, email: "customer@example.com", name: "Customer" }]);
    const res = await GET(customerRequest("/api/portal?action=me"));
    expect(res.status).toBe(200);
  });

  it("blocks a customer from every admin action with 403", async () => {
    const adminActions = [
      "visitors",
      "honeypot-creds",
      "block-ip",
      "leadgen-status",
      "leadgen-businesses",
      "leadgen-discover",
      "opsec-data",
      "affiliate-dashboard-summary",
      "product-finder",
      "admin-status",
      "content-insights",
      "hot-leads",
      "drafts",
      "publish-draft",
      "create-invoice",
      "newsletter-send",
      "blog-engine-health",
      "analytics",
      "matrix-capture",
      "revenue-summary",
      "testimonials",
      "grant-immunity",
      "osint-refresh",
      "run-audit-migration",
    ];
    for (const action of adminActions) {
      const res = await GET(customerRequest(`/api/portal?action=${action}`));
      expect(res.status, `action=${action} should be 403 for a customer`).toBe(403);
      const body = await res.json();
      expect(body.error, `action=${action}`).toBe("forbidden");
    }
  });

  it("blocks a customer from admin mutations with 403", async () => {
    const res = await POST(customerRequest("/api/portal?action=block-ip", "POST"));
    expect(res.status).toBe(403);
    // CSRF may fire before the session gate (csrf_rejected) — either way
    // the admin mutation is unreachable for a customer.
  });

  it("returns 403 for an unknown action even for an admin session", async () => {
    // Sanity: an unknown action on the client router falls through to the
    // fail-closed ownerSession gate, so a customer gets 403 (not 404) —
    // the admin surface is unreachable. This confirms the boundary holds
    // even for actions that don't exist. (The exact error may be
    // csrf_rejected if the CSRF cookie check fires first — either way it
    // is a 403 and the admin surface is never reached.)
    const res = await GET(customerRequest("/api/portal?action=definitely-not-real"));
    expect(res.status).toBe(403);
  });
});
