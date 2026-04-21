// Unit tests for api/_lib/session.js.
//
// The module uses opaque-token sessions (not signed JWTs), so the "round-trip"
// isn't sign+verify — it's createSession() issuing a token whose SHA-256 hash
// is what getSession() later looks up in the DB. We mock the DB, intercept the
// hash the issuer stores, and assert the lookup queries with that same hash.

import { describe, it, expect, vi, beforeEach } from "vitest";

const sqlQueue = [];
const sqlCalls = [];
const fakeSql = vi.fn((strings, ...values) => {
  sqlCalls.push({ strings: Array.from(strings), values });
  const next = sqlQueue.shift();
  if (next instanceof Error) return Promise.reject(next);
  const p = Promise.resolve(next === undefined ? [] : next);
  // Provide a .catch hook — several callsites in session.js append .catch().
  return p;
});

vi.mock("../db.js", () => ({ sql: fakeSql }));

const {
  parseCookies,
  createSession,
  destroySession,
  clearSessionCookie,
  SESSION_COOKIE_NAME,
} = await import("../session.js");

beforeEach(() => {
  sqlQueue.length = 0;
  sqlCalls.length = 0;
  fakeSql.mockClear();
});

// Mirror of session.js internal hashToken. Pure SHA-256 hex.
async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function mkRequest(headers = {}) {
  return new Request("https://example.com/", { headers });
}

describe("parseCookies", () => {
  it("parses a well-formed cookie header", () => {
    const req = mkRequest({ cookie: "a=1; b=hello; c=three" });
    expect(parseCookies(req)).toEqual({ a: "1", b: "hello", c: "three" });
  });

  it("URL-decodes values", () => {
    const req = mkRequest({ cookie: "greeting=hello%20world" });
    expect(parseCookies(req).greeting).toBe("hello world");
  });

  it("skips malformed parts with no '='", () => {
    const req = mkRequest({ cookie: "justname; a=1" });
    const out = parseCookies(req);
    expect(out).toEqual({ a: "1" });
  });

  it("returns {} when the cookie header is missing", () => {
    expect(parseCookies(mkRequest({}))).toEqual({});
  });

  it("handles a single cookie without a trailing semicolon", () => {
    expect(parseCookies(mkRequest({ cookie: "only=yes" }))).toEqual({ only: "yes" });
  });

  it("trims whitespace around keys and values", () => {
    const req = mkRequest({ cookie: "  a  =  1  ;  b=2  " });
    expect(parseCookies(req)).toEqual({ a: "1", b: "2" });
  });
});

describe("clearSessionCookie", () => {
  it("emits a Max-Age=0 cookie string with HttpOnly + SameSite=Lax", () => {
    const cookie = clearSessionCookie();
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
  });
});

describe("createSession — token / hash round-trip", () => {
  it("stores the SHA-256 hash of the token (not the token itself)", async () => {
    sqlQueue.push([{ id: "sess-1" }]); // INSERT RETURNING id
    sqlQueue.push([]); // fire-and-forget session_tracking log

    const request = mkRequest({
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "Mozilla/5.0",
      "accept-language": "en-US",
    });
    const { token, cookie } = await createSession("user-42", request);

    // Token should be 64 hex chars (32 bytes).
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=${token}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Max-Age=");

    // The INSERT should have been called with the *hash*, never the token.
    const insertCall = sqlCalls[0];
    const [userId, tokenHash] = insertCall.values;
    expect(userId).toBe("user-42");
    expect(tokenHash).toBe(await sha256Hex(token));
    // Defense-in-depth: the raw token must not appear anywhere in the query.
    expect(insertCall.values.includes(token)).toBe(false);
  });

  it("emits distinct tokens on repeated calls (no reuse)", async () => {
    sqlQueue.push([{ id: "s1" }], [], [{ id: "s2" }], []);
    const req = mkRequest({});
    const a = await createSession("u", req);
    const b = await createSession("u", req);
    expect(a.token).not.toBe(b.token);
  });
});

describe("destroySession", () => {
  it("returns a cleared cookie when no session cookie is present", async () => {
    const req = mkRequest({});
    const { cookie } = await destroySession(req);
    expect(cookie).toContain("Max-Age=0");
    // No DB queries should have fired.
    expect(fakeSql).not.toHaveBeenCalled();
  });

  it("looks up by token hash, then DELETEs, then returns a cleared cookie", async () => {
    const token = "a".repeat(64);
    const expectedHash = await sha256Hex(token);

    sqlQueue.push([{ id: "sess-1", user_id: "u1" }]); // SELECT
    sqlQueue.push([]); // tracking log
    sqlQueue.push([]); // DELETE

    const req = mkRequest({ cookie: `${SESSION_COOKIE_NAME}=${token}` });
    const { cookie } = await destroySession(req);

    // SELECT values include the hash, not the raw token.
    expect(sqlCalls[0].values).toEqual([expectedHash]);
    // DELETE is the last call and also uses the hash.
    const deleteCall = sqlCalls[sqlCalls.length - 1];
    expect(deleteCall.values).toEqual([expectedHash]);
    expect(cookie).toContain("Max-Age=0");
  });
});
