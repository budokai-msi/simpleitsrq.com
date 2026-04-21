// Unit tests for rateLimit() from api/_lib/security.js.
//
// The limiter delegates the windowing math to Postgres via an ON CONFLICT
// UPSERT, so the JS-side logic we're verifying is thin: (a) skip on unknown
// IP, (b) pass the right inputs, (c) interpret the RETURNING count correctly,
// (d) fail-open when the DB errors.

import { describe, it, expect, vi, beforeEach } from "vitest";

const sqlQueue = [];
const fakeSql = vi.fn(() => {
  const next = sqlQueue.shift();
  if (next instanceof Error) return Promise.reject(next);
  return Promise.resolve(next === undefined ? [] : next);
});

vi.mock("../db.js", () => ({ sql: fakeSql }));

const { rateLimit } = await import("../security.js");

beforeEach(() => {
  sqlQueue.length = 0;
  fakeSql.mockClear();
});

describe("rateLimit", () => {
  it("short-circuits with ok=true when ip is missing", async () => {
    const result = await rateLimit({
      ip: null, bucket: "login", windowSeconds: 60, max: 5,
    });
    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(5);
    expect(fakeSql).not.toHaveBeenCalled();
  });

  it("short-circuits when ip is literally 'unknown'", async () => {
    const result = await rateLimit({
      ip: "unknown", bucket: "login", windowSeconds: 60, max: 5,
    });
    expect(result.ok).toBe(true);
    expect(fakeSql).not.toHaveBeenCalled();
  });

  it("returns ok=true and decrements remaining while under max", async () => {
    sqlQueue.push([{ count: 3 }]);
    const result = await rateLimit({
      ip: "1.2.3.4", bucket: "login", windowSeconds: 60, max: 5,
    });
    expect(result.ok).toBe(true);
    expect(result.count).toBe(3);
    expect(result.remaining).toBe(2);
  });

  it("returns ok=true exactly at the limit (count === max)", async () => {
    // The source uses `count <= max`, so hitting the cap is still allowed.
    sqlQueue.push([{ count: 5 }]);
    const result = await rateLimit({
      ip: "1.2.3.4", bucket: "login", windowSeconds: 60, max: 5,
    });
    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("returns ok=false once count exceeds max", async () => {
    sqlQueue.push([{ count: 6 }]);
    const result = await rateLimit({
      ip: "1.2.3.4", bucket: "login", windowSeconds: 60, max: 5,
    });
    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("clamps remaining to 0 when count is way over max", async () => {
    sqlQueue.push([{ count: 999 }]);
    const result = await rateLimit({
      ip: "1.2.3.4", bucket: "login", windowSeconds: 60, max: 5,
    });
    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("fails open (ok=true) when the DB query throws", async () => {
    // Per the security.js comment: 'better to serve the request than to
    // false-positive-429'.
    sqlQueue.push(new Error("connection refused"));
    const result = await rateLimit({
      ip: "1.2.3.4", bucket: "login", windowSeconds: 60, max: 5,
    });
    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(5);
  });

  it("defaults count to 1 when the RETURNING row is missing", async () => {
    sqlQueue.push([]);
    const result = await rateLimit({
      ip: "1.2.3.4", bucket: "login", windowSeconds: 60, max: 5,
    });
    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
    expect(result.remaining).toBe(4);
  });
});
