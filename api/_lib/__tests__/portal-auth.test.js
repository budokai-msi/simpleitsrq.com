import { describe, expect, it, vi } from "vitest";

vi.mock("../db.js", () => ({ sql: vi.fn(() => Promise.resolve([])) }));

const { POST } = await import("../../portal.js");

function portalPost(origin) {
  const token = "0123456789abcdef0123456789abcdef";
  const headers = {
    cookie: `sit_csrf=${token}`,
    "content-type": "application/json",
    "x-csrf-token": token,
  };
  if (origin !== undefined) headers.origin = origin;
  return POST(new Request("https://simpleitsrq.com/api/portal?action=leadgen-run-jobs", {
    method: "POST",
    headers,
    body: "{}",
  }));
}

describe("portal CSRF origin gate", () => {
  it("allows Vercel preview origins to reach the session gate", async () => {
    const response = await portalPost("https://simpleitsrq-preview-abc123.vercel.app");
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("unauthorized");
  });

  it("rejects unrelated origins before session lookup", async () => {
    const response = await portalPost("https://evil.example");
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("csrf_origin_rejected");
  });

  it("keeps browser mutations fail-closed when Origin is missing", async () => {
    const response = await portalPost(undefined);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("csrf_origin_rejected");
  });
});
