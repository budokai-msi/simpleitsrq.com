// Unit tests for the in-memory L1 cache layered in front of rateLimit().
//
// The DB remains authoritative — the cache only short-circuits when a request
// is CONFIDENTLY under the per-bucket limit (count + 1 < max / 2). These
// tests verify: population from first DB call, short-circuit on subsequent
// under-limit calls, fall-through on window expiry, fall-through near the
// limit boundary, and LRU eviction at the 5000-entry cap.

import { describe, it, expect, vi, beforeEach } from "vitest";

const sqlQueue = [];
const fakeSql = vi.fn(() => {
  const next = sqlQueue.shift();
  if (next instanceof Error) return Promise.reject(next);
  return Promise.resolve(next === undefined ? [] : next);
});

vi.mock("../db.js", () => ({ sql: fakeSql }));

const { rateLimit, rateLimit_cacheStats, rateLimit_clearCache } =
  await import("../security.js");

beforeEach(() => {
  sqlQueue.length = 0;
  fakeSql.mockClear();
  rateLimit_clearCache();
  // Stats are cumulative across the module lifetime; we read deltas below.
});

describe("rateLimit L1 cache", () => {
  it("first request populates the cache via a DB call and is not marked cached", async () => {
    sqlQueue.push([{ count: 1 }]);
    const before = rateLimit_cacheStats();
    const result = await rateLimit({
      ip: "10.0.0.1", bucket: "login", windowSeconds: 60, max: 20,
    });

    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
    // First call always falls through — there was nothing cached.
    expect(result.cached).toBeUndefined();
    expect(fakeSql).toHaveBeenCalledTimes(1);

    const after = rateLimit_cacheStats();
    expect(after.dbFallbacks).toBe(before.dbFallbacks + 1);
    expect(after.size).toBeGreaterThanOrEqual(1);
  });

  it("serves 10 under-limit requests from cache after the first DB call", async () => {
    // max=20 so the confidence gate (count + 1 < max/2 == 10) lets us stay
    // cached through counts 1..8. That's 1 DB call + 8 cache hits = 9 under
    // the gate. The 10th request crosses the gate (count would become 10,
    // 10 < 10 is false) so it falls back to DB.
    sqlQueue.push([{ count: 1 }]);           // first call: DB
    // No more DB responses queued — if the cache misses, fakeSql returns [].

    const before = rateLimit_cacheStats();

    for (let i = 0; i < 9; i++) {
      const r = await rateLimit({
        ip: "10.0.0.2", bucket: "login", windowSeconds: 60, max: 20,
      });
      expect(r.ok).toBe(true);
      if (i === 0) {
        expect(r.cached).toBeUndefined();    // first request: DB path
      } else {
        expect(r.cached).toBe(true);         // rest: cache hits
      }
    }

    // Exactly one DB call, the rest served from cache.
    expect(fakeSql).toHaveBeenCalledTimes(1);
    const after = rateLimit_cacheStats();
    expect(after.hits - before.hits).toBe(8);
    expect(after.dbFallbacks - before.dbFallbacks).toBe(1);
  });

  it("falls through to the DB once the cached resetAt has passed", async () => {
    sqlQueue.push([{ count: 1 }]);
    await rateLimit({
      ip: "10.0.0.3", bucket: "login", windowSeconds: 60, max: 20,
    });
    expect(fakeSql).toHaveBeenCalledTimes(1);

    // Advance mocked time past the cached resetAt (60s + 1ms).
    const realNow = Date.now;
    const advanced = realNow() + 61_000;
    vi.spyOn(Date, "now").mockReturnValue(advanced);

    sqlQueue.push([{ count: 1 }]);
    const r = await rateLimit({
      ip: "10.0.0.3", bucket: "login", windowSeconds: 60, max: 20,
    });
    expect(r.ok).toBe(true);
    expect(r.cached).toBeUndefined();
    expect(fakeSql).toHaveBeenCalledTimes(2);

    Date.now = realNow;
  });

  it("falls through to the DB once the cached count reaches max/2", async () => {
    // max=10 so the gate fires at count+1 >= 5. Seed the cache with count=4,
    // which would make the next request count=5 — not < 5 — so it must go to
    // the DB.
    sqlQueue.push([{ count: 4 }]);
    const first = await rateLimit({
      ip: "10.0.0.4", bucket: "login", windowSeconds: 60, max: 10,
    });
    expect(first.count).toBe(4);
    expect(fakeSql).toHaveBeenCalledTimes(1);

    sqlQueue.push([{ count: 5 }]);
    const second = await rateLimit({
      ip: "10.0.0.4", bucket: "login", windowSeconds: 60, max: 10,
    });
    expect(second.ok).toBe(true);
    expect(second.cached).toBeUndefined();   // must hit DB at the boundary
    expect(fakeSql).toHaveBeenCalledTimes(2);
  });

  it("always falls through to the DB when the limit is tiny (max < 4)", async () => {
    // With max=2 the gate (count+1 < 1) can never be satisfied — every
    // request goes to the DB. Proves we never short-circuit in a regime
    // where the cache could hide a real violation.
    for (let i = 1; i <= 3; i++) {
      sqlQueue.push([{ count: i }]);
      const r = await rateLimit({
        ip: "10.0.0.5", bucket: "login", windowSeconds: 60, max: 2,
      });
      expect(r.cached).toBeUndefined();
    }
    expect(fakeSql).toHaveBeenCalledTimes(3);
  });

  it("evicts the oldest entry when the cache exceeds 5000 entries", async () => {
    // Insert 5001 distinct IPs (distinct keys since bucket is shared). After
    // the 5001st insert the first should be evicted. We then ask about IP #0
    // again: because its entry is gone, the call must fall through to the
    // DB. IP #5000 (the most recently inserted) stays cached, so a follow-up
    // call for it that stays under the confidence gate should cache-hit.

    for (let i = 0; i < 5001; i++) {
      sqlQueue.push([{ count: 1 }]);
      await rateLimit({
        ip: `192.0.2.${i}`, bucket: "bulk", windowSeconds: 300, max: 100,
      });
    }
    expect(rateLimit_cacheStats().size).toBe(5000);

    // IP #0 was evicted — next call must go to the DB.
    const before = rateLimit_cacheStats();
    sqlQueue.push([{ count: 1 }]);
    const evicted = await rateLimit({
      ip: "192.0.2.0", bucket: "bulk", windowSeconds: 300, max: 100,
    });
    expect(evicted.cached).toBeUndefined();
    expect(rateLimit_cacheStats().dbFallbacks).toBe(before.dbFallbacks + 1);

    // IP #5000 (the newest pre-eviction) is still cached. A follow-up stays
    // under the confidence gate (count+1=2 < 50) and should be a cache hit.
    const stillCached = await rateLimit({
      ip: "192.0.2.5000", bucket: "bulk", windowSeconds: 300, max: 100,
    });
    expect(stillCached.cached).toBe(true);
  });

  it("rateLimit_clearCache() wipes entries and forces a DB round-trip", async () => {
    sqlQueue.push([{ count: 1 }]);
    await rateLimit({
      ip: "10.0.0.6", bucket: "login", windowSeconds: 60, max: 20,
    });
    const r1 = await rateLimit({
      ip: "10.0.0.6", bucket: "login", windowSeconds: 60, max: 20,
    });
    expect(r1.cached).toBe(true);

    rateLimit_clearCache();
    expect(rateLimit_cacheStats().size).toBe(0);

    sqlQueue.push([{ count: 1 }]);
    const r2 = await rateLimit({
      ip: "10.0.0.6", bucket: "login", windowSeconds: 60, max: 20,
    });
    expect(r2.cached).toBeUndefined();
  });

  it("returns the expected shape from rateLimit_cacheStats()", async () => {
    const s = rateLimit_cacheStats();
    expect(s).toEqual({
      size: expect.any(Number),
      hits: expect.any(Number),
      dbFallbacks: expect.any(Number),
    });
  });
});
