// Unit tests for pure helpers in api/_lib/security.js.
//
// We mock ./db.js so importing security.js doesn't try to open a Neon
// connection. Only functions that don't actually hit the DB are covered here —
// rateLimit, auditVerify, and logSecurityEvent (all DB-bound) live in their
// own test file so this suite stays pure.

import { describe, it, expect, vi } from "vitest";

vi.mock("../db.js", () => ({ sql: vi.fn() }));

const {
  clientIp,
  geoFromHeaders,
  isHostileGeo,
  safeStr,
  isValidEmail,
} = await import("../security.js");

// Tiny helper — build a Request-ish object whose `headers.get(k)` reads from
// a lower-cased key map. We use the real `Headers` constructor so behavior
// (case-insensitive lookup, null for missing keys) matches what the helpers
// see in production on Vercel's edge runtime.
function mkRequest(headers = {}, url = "https://example.com/") {
  return new Request(url, { headers });
}

describe("clientIp", () => {
  it("prefers x-real-ip over x-forwarded-for (spoofed XFF must not win)", () => {
    // This is the regression guarded by the comment in security.js — a
    // client-supplied XFF used to be able to poison the rate-limit bucket.
    const req = mkRequest({
      "x-real-ip": "203.0.113.10",
      "x-forwarded-for": "1.2.3.4, 5.6.7.8",
    });
    expect(clientIp(req)).toBe("203.0.113.10");
  });

  it("falls back to first XFF entry when x-real-ip is absent", () => {
    const req = mkRequest({ "x-forwarded-for": "198.51.100.7, 10.0.0.1" });
    expect(clientIp(req)).toBe("198.51.100.7");
  });

  it("trims whitespace from the first XFF entry", () => {
    const req = mkRequest({ "x-forwarded-for": "   198.51.100.7   , 10.0.0.1" });
    expect(clientIp(req)).toBe("198.51.100.7");
  });

  it("returns 'unknown' when neither header is set", () => {
    const req = mkRequest({});
    expect(clientIp(req)).toBe("unknown");
  });

  it("handles an IPv6 address in x-real-ip", () => {
    const req = mkRequest({ "x-real-ip": "2001:db8::1" });
    expect(clientIp(req)).toBe("2001:db8::1");
  });

  it("handles an IPv6 address as the first XFF entry", () => {
    const req = mkRequest({ "x-forwarded-for": "2001:db8::dead, 10.0.0.1" });
    expect(clientIp(req)).toBe("2001:db8::dead");
  });

  it("returns 'unknown' when XFF is empty string", () => {
    const req = mkRequest({ "x-forwarded-for": "" });
    expect(clientIp(req)).toBe("unknown");
  });
});

describe("geoFromHeaders", () => {
  it("reads every known Vercel geo header", () => {
    const req = mkRequest({
      "x-vercel-ip-country": "US",
      "x-vercel-ip-country-region": "FL",
      "x-vercel-ip-city": "Sarasota",
      "x-vercel-ip-latitude": "27.3364",
      "x-vercel-ip-longitude": "-82.5307",
      "x-vercel-ip-timezone": "America/New_York",
    });
    const geo = geoFromHeaders(req);
    expect(geo.country).toBe("US");
    expect(geo.region).toBe("FL");
    expect(geo.city).toBe("Sarasota");
    expect(geo.latitude).toBe("27.3364");
    expect(geo.longitude).toBe("-82.5307");
    expect(geo.timezone).toBe("America/New_York");
  });

  it("URL-decodes the city header (Vercel percent-encodes spaces)", () => {
    const req = mkRequest({ "x-vercel-ip-city": "New%20York" });
    expect(geoFromHeaders(req).city).toBe("New York");
  });

  it("returns null for every missing header", () => {
    const geo = geoFromHeaders(mkRequest({}));
    expect(geo.country).toBeNull();
    expect(geo.region).toBeNull();
    expect(geo.city).toBeNull();
    expect(geo.latitude).toBeNull();
    expect(geo.longitude).toBeNull();
    expect(geo.timezone).toBeNull();
  });
});

describe("isHostileGeo", () => {
  it("flags CN/RU/KP as hostile", () => {
    expect(isHostileGeo(mkRequest({ "x-vercel-ip-country": "CN" }))).toBe(true);
    expect(isHostileGeo(mkRequest({ "x-vercel-ip-country": "RU" }))).toBe(true);
    expect(isHostileGeo(mkRequest({ "x-vercel-ip-country": "KP" }))).toBe(true);
  });

  it("handles lower-case country codes", () => {
    expect(isHostileGeo(mkRequest({ "x-vercel-ip-country": "cn" }))).toBe(true);
  });

  it("does not flag allied / unknown countries", () => {
    expect(isHostileGeo(mkRequest({ "x-vercel-ip-country": "US" }))).toBe(false);
    expect(isHostileGeo(mkRequest({ "x-vercel-ip-country": "GB" }))).toBe(false);
    expect(isHostileGeo(mkRequest({}))).toBe(false);
  });
});

describe("safeStr", () => {
  it("trims and coerces to string", () => {
    expect(safeStr("  hello  ")).toBe("hello");
    expect(safeStr(42)).toBe("42");
  });

  it("enforces max length", () => {
    const long = "a".repeat(500);
    expect(safeStr(long, 10)).toBe("aaaaaaaaaa");
    expect(safeStr(long, 10).length).toBe(10);
  });

  it("returns empty string for null / undefined", () => {
    expect(safeStr(null)).toBe("");
    expect(safeStr(undefined)).toBe("");
  });

  it("defaults to a 200-char cap", () => {
    const long = "x".repeat(300);
    expect(safeStr(long).length).toBe(200);
  });
});

describe("isValidEmail", () => {
  it("accepts well-formed addresses", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("a.b+tag@sub.example.co.uk")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("no-at-sign")).toBe(false);
    expect(isValidEmail("missing@tld")).toBe(false);
    expect(isValidEmail("two@@at.com")).toBe(false);
    expect(isValidEmail("spaces in@ex.com")).toBe(false);
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
  });
});
