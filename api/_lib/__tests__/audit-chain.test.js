// Round-trip tests for the tamper-evident audit log hash chain in
// api/_lib/security.js.
//
// Strategy: mock the `sql` tagged template so we can (a) feed auditVerify()
// exactly the rows we want and (b) capture the INSERT statements emitted by
// logSecurityEvent() and replay them through auditVerify() without a real DB.
//
// The hash computation itself is what we're verifying — not the INSERT. If
// the chain math is correct, tampering with any field must cause a row_hash
// mismatch on replay.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture every `sql` call and let each test enqueue the next fake result.
const sqlQueue = [];
const sqlCalls = [];
const fakeSql = vi.fn((strings, ...values) => {
  sqlCalls.push({ strings: Array.from(strings), values });
  const next = sqlQueue.shift();
  return Promise.resolve(next === undefined ? [] : next);
});

vi.mock("../db.js", () => ({ sql: fakeSql }));

const { logSecurityEvent, auditVerify } = await import("../security.js");

// Reimplement the private chainHash(parts) helper so the tests can build
// canonical row hashes the same way security.js does.
async function chainHash(parts) {
  const raw = parts.map((p) => (p == null ? "" : String(p))).join("\x00");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

beforeEach(() => {
  sqlQueue.length = 0;
  sqlCalls.length = 0;
  fakeSql.mockClear();
});

describe("auditVerify — happy path", () => {
  it("reports ok=true when every row's prev_hash and row_hash match", async () => {
    // Build two valid chained rows by hand.
    const ts1 = "2026-04-21T00:00:00.000Z";
    const ts2 = "2026-04-21T00:00:01.000Z";
    const row1Parts = ["GENESIS", "login.ok", "info", "1.1.1.1", "u1", "/x", null, ts1];
    const row1Hash = await chainHash(row1Parts);
    const row2Parts = [row1Hash, "login.fail", "warn", "2.2.2.2", null, "/y", null, ts2];
    const row2Hash = await chainHash(row2Parts);

    // First `sql` call inside auditVerify = SELECT of all rows.
    sqlQueue.push([
      { id: 1, kind: "login.ok", severity: "info", ip: "1.1.1.1", user_id: "u1", path: "/x", detail: null, ts: new Date(ts1), prev_hash: "GENESIS", row_hash: row1Hash },
      { id: 2, kind: "login.fail", severity: "warn", ip: "2.2.2.2", user_id: null, path: "/y", detail: null, ts: new Date(ts2), prev_hash: row1Hash, row_hash: row2Hash },
    ]);
    // Second `sql` call = SELECT COUNT(*).
    sqlQueue.push([{ n: 2 }]);

    const result = await auditVerify();
    expect(result.ok).toBe(true);
    expect(result.breaks).toEqual([]);
    expect(result.chainedRows).toBe(2);
    expect(result.totalRows).toBe(2);
  });
});

describe("auditVerify — tamper detection", () => {
  it("detects a mutated `detail` field (row_hash mismatch)", async () => {
    const ts = "2026-04-21T00:00:00.000Z";
    const originalDetail = { user: "alice" };
    const tamperedDetail = { user: "mallory" };
    const rowHash = await chainHash([
      "GENESIS", "admin.action", "warn", "1.1.1.1", "u1", "/admin",
      JSON.stringify(originalDetail), ts,
    ]);

    sqlQueue.push([
      {
        id: 1, kind: "admin.action", severity: "warn", ip: "1.1.1.1",
        user_id: "u1", path: "/admin",
        // DB returned the tampered value — but row_hash was computed from the
        // ORIGINAL detail. On recompute, they won't match.
        detail: tamperedDetail,
        ts: new Date(ts), prev_hash: "GENESIS", row_hash: rowHash,
      },
    ]);
    sqlQueue.push([{ n: 1 }]);

    const result = await auditVerify();
    expect(result.ok).toBe(false);
    expect(result.breaks.length).toBeGreaterThan(0);
    expect(result.breaks.some((b) => /row_hash mismatch/.test(b.reason))).toBe(true);
  });

  it("detects a broken chain link (prev_hash doesn't point back)", async () => {
    const ts1 = "2026-04-21T00:00:00.000Z";
    const ts2 = "2026-04-21T00:00:01.000Z";
    const row1Hash = await chainHash([
      "GENESIS", "k1", "info", null, null, null, null, ts1,
    ]);
    // Row 2 claims GENESIS as prev but the chain state is row1Hash. Its own
    // row_hash is internally consistent with that bogus prev so only the
    // prev_hash break should fire.
    const badPrev = "GENESIS";
    const row2Hash = await chainHash([badPrev, "k2", "info", null, null, null, null, ts2]);

    sqlQueue.push([
      { id: 1, kind: "k1", severity: "info", ip: null, user_id: null, path: null, detail: null, ts: new Date(ts1), prev_hash: "GENESIS", row_hash: row1Hash },
      { id: 2, kind: "k2", severity: "info", ip: null, user_id: null, path: null, detail: null, ts: new Date(ts2), prev_hash: badPrev, row_hash: row2Hash },
    ]);
    sqlQueue.push([{ n: 2 }]);

    const result = await auditVerify();
    expect(result.ok).toBe(false);
    expect(result.breaks.some((b) => /prev_hash mismatch/.test(b.reason))).toBe(true);
  });
});

describe("auditVerify — error handling", () => {
  it("returns migrationNeeded when the SELECT throws", async () => {
    fakeSql.mockImplementationOnce(() => Promise.reject(new Error("relation does not exist")));
    const result = await auditVerify();
    expect(result.ok).toBe(false);
    expect(result.migrationNeeded).toBe(true);
  });
});

describe("logSecurityEvent — chained insert round-trip", () => {
  it("computes a row_hash that verifies against the same inputs", async () => {
    // First call inside logSecurityEvent: getLastRowHash() SELECT. Return
    // empty → prev becomes "GENESIS" (the chained path).
    sqlQueue.push([]);
    // Second call: the actual INSERT. We only need it to resolve.
    sqlQueue.push([]);

    await logSecurityEvent({
      kind: "test.kind",
      severity: "info",
      ip: "9.9.9.9",
      userId: "u42",
      path: "/probe",
      detail: { foo: "bar" },
    });

    expect(fakeSql).toHaveBeenCalledTimes(2);
    const insertCall = sqlCalls[1];
    // The parameterized values include prev_hash and row_hash as the last
    // two positional args on the chained-INSERT path.
    const values = insertCall.values;
    const prevHash = values[values.length - 2];
    const rowHash = values[values.length - 1];
    expect(prevHash).toBe("GENESIS");

    // Recompute what the hash should be from the same inputs. The order
    // mirrors security.js: [prev, kind, severity, ip, userId, path, detailJson, ts].
    // Pull kind, severity, ip, userId, path, detailJson, ts from the captured
    // positional values. The insert template places these in order early.
    // Positions (from the template literal order in security.js):
    //   0: kind, 1: severity, 2: ip, 3: userId, 4: userAgent, 5: path,
    //   6: detailJson, 7: ts, 8: prevHash, 9: rowHash
    const [kind, severity, ip, userId, , path, detailJson, ts] = values;
    const recomputed = await chainHash([
      prevHash, kind, severity, ip, userId, path, detailJson, ts,
    ]);
    expect(rowHash).toBe(recomputed);

    // Negative — tampering with any input breaks the match.
    const tampered = await chainHash([
      prevHash, kind, severity, ip, userId, path, JSON.stringify({ foo: "evil" }), ts,
    ]);
    expect(rowHash).not.toBe(tampered);
  });

  it("falls back to the unchained INSERT when the prev-hash query fails", async () => {
    // getLastRowHash catches and returns null → legacy path → INSERT without
    // prev_hash / row_hash columns. `mockImplementationOnce` replaces the
    // default impl for exactly one call, so that failing SELECT never records
    // into sqlCalls — only the follow-up INSERT does.
    fakeSql.mockImplementationOnce(() =>
      Promise.reject(new Error("column row_hash does not exist")),
    );
    sqlQueue.push([]); // for the follow-up INSERT

    await logSecurityEvent({ kind: "legacy", severity: "info" });
    expect(fakeSql).toHaveBeenCalledTimes(2);
    // Only the legacy INSERT goes through the default impl and is captured.
    expect(sqlCalls.length).toBe(1);
    const legacyInsert = sqlCalls[0];
    // Legacy INSERT has 8 positional params: kind, severity, ip, userId,
    // userAgent, path, detailJson, ts. No prev/row hash columns.
    expect(legacyInsert.values.length).toBe(8);
  });
});
