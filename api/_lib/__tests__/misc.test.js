// Unit tests for the remaining pure helpers:
//   - api/_lib/http.js       → safeRedirectPath (open-redirect guard)
//   - api/_lib/ua.js         → parseUA classifier
//   - api/_lib/oauth.js      → appBaseUrl, redirectUri, buildAuthorizeUrl
//
// oauth.js imports ./db.js so we mock it even though these helpers don't
// actually call the DB.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../db.js", () => ({ sql: vi.fn() }));

const { safeRedirectPath } = await import("../http.js");
const { parseUA } = await import("../ua.js");
const { appBaseUrl, redirectUri, buildAuthorizeUrl } = await import("../oauth.js");

function mkRequest(url = "https://example.com/", headers = {}) {
  return new Request(url, { headers });
}

describe("safeRedirectPath — open-redirect guard", () => {
  it("accepts same-site absolute paths", () => {
    expect(safeRedirectPath("/portal")).toBe("/portal");
    expect(safeRedirectPath("/tickets/123?tab=notes")).toBe("/tickets/123?tab=notes");
  });

  it("rejects protocol-relative URLs (//evil.com)", () => {
    expect(safeRedirectPath("//evil.com/steal")).toBe("/portal");
  });

  it("rejects absolute URLs", () => {
    expect(safeRedirectPath("https://evil.com/steal")).toBe("/portal");
    expect(safeRedirectPath("http://example.com/foo")).toBe("/portal");
  });

  it("rejects relative paths without a leading /", () => {
    expect(safeRedirectPath("portal")).toBe("/portal");
    expect(safeRedirectPath("../admin")).toBe("/portal");
  });

  it("uses the custom fallback when provided", () => {
    expect(safeRedirectPath("evil", "/home")).toBe("/home");
    expect(safeRedirectPath(null, "/home")).toBe("/home");
  });

  it("rejects non-string inputs", () => {
    expect(safeRedirectPath(undefined)).toBe("/portal");
    expect(safeRedirectPath(42)).toBe("/portal");
    expect(safeRedirectPath({ path: "/x" })).toBe("/portal");
  });
});

describe("parseUA", () => {
  it("returns all-null for empty input", () => {
    expect(parseUA("")).toEqual({ browser: null, os: null, device: null });
    expect(parseUA()).toEqual({ browser: null, os: null, device: null });
  });

  it("classifies Chrome on Windows Desktop", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";
    expect(parseUA(ua)).toEqual({ browser: "Chrome", os: "Windows", device: "Desktop" });
  });

  it("classifies Safari on iOS as Mobile", () => {
    const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1";
    expect(parseUA(ua)).toEqual({ browser: "Safari", os: "iOS", device: "Mobile" });
  });

  it("classifies Edge ahead of Chrome (order matters — Edge UA contains 'Chrome')", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0";
    expect(parseUA(ua).browser).toBe("Edge");
  });

  it("detects Firefox on Linux", () => {
    const ua = "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0";
    expect(parseUA(ua)).toEqual({ browser: "Firefox", os: "Linux", device: "Desktop" });
  });

  it("flags known bot UAs and sets device=Bot", () => {
    const ua = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
    const parsed = parseUA(ua);
    expect(parsed.browser).toBe("Bot");
    expect(parsed.device).toBe("Bot");
  });

  it("classifies iPad as Tablet", () => {
    const ua = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
    expect(parseUA(ua).device).toBe("Tablet");
  });

  it("falls back to 'Other' for unknown UAs", () => {
    const parsed = parseUA("curl/8.0");
    expect(parsed.browser).toBe("Other");
    expect(parsed.os).toBe("Other");
  });
});

describe("oauth — pure URL helpers", () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    // Isolate env per test.
    process.env = { ...originalEnv };
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  describe("appBaseUrl", () => {
    it("prefers APP_URL env var over request headers", () => {
      process.env.APP_URL = "https://simpleitsrq.com/";
      const req = mkRequest("http://localhost/x", { host: "localhost" });
      // Trailing slash should be stripped.
      expect(appBaseUrl(req)).toBe("https://simpleitsrq.com");
    });

    it("reads x-forwarded-proto and x-forwarded-host when APP_URL is unset", () => {
      delete process.env.APP_URL;
      const req = mkRequest("http://internal/x", {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "simpleitsrq.com",
        host: "internal",
      });
      expect(appBaseUrl(req)).toBe("https://simpleitsrq.com");
    });

    it("falls back to request URL proto/host when no forwarded headers", () => {
      delete process.env.APP_URL;
      const req = mkRequest("https://example.org:8443/foo");
      expect(appBaseUrl(req)).toBe("https://example.org:8443");
    });
  });

  describe("redirectUri", () => {
    it("builds the provider callback URL off appBaseUrl", () => {
      process.env.APP_URL = "https://simpleitsrq.com";
      const req = mkRequest("http://localhost/x");
      expect(redirectUri(req, "google")).toBe("https://simpleitsrq.com/api/auth/callback/google");
      expect(redirectUri(req, "github")).toBe("https://simpleitsrq.com/api/auth/callback/github");
    });
  });

  describe("buildAuthorizeUrl", () => {
    it("builds a valid Google authorize URL with all required params", () => {
      process.env.APP_URL = "https://simpleitsrq.com";
      process.env.GOOGLE_CLIENT_ID = "test-google-id";
      const req = mkRequest("http://localhost/x");
      const url = new URL(buildAuthorizeUrl("google", "state-xyz", req));
      expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
      expect(url.searchParams.get("client_id")).toBe("test-google-id");
      expect(url.searchParams.get("state")).toBe("state-xyz");
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("redirect_uri")).toBe("https://simpleitsrq.com/api/auth/callback/google");
      expect(url.searchParams.get("scope")).toBe("openid email profile");
      // Google-specific params.
      expect(url.searchParams.get("access_type")).toBe("online");
      expect(url.searchParams.get("prompt")).toBe("select_account");
    });

    it("adds allow_signup for GitHub", () => {
      process.env.APP_URL = "https://simpleitsrq.com";
      process.env.GITHUB_CLIENT_ID = "test-github-id";
      const req = mkRequest("http://localhost/x");
      const url = new URL(buildAuthorizeUrl("github", "s1", req));
      expect(url.searchParams.get("allow_signup")).toBe("true");
      expect(url.searchParams.get("client_id")).toBe("test-github-id");
    });

    it("throws when the provider's client id env var is missing", () => {
      delete process.env.GOOGLE_CLIENT_ID;
      const req = mkRequest("http://localhost/x");
      expect(() => buildAuthorizeUrl("google", "s", req)).toThrow(/GOOGLE_CLIENT_ID/);
    });

    it("resolves Auth0 endpoints from AUTH0_DOMAIN", () => {
      process.env.APP_URL = "https://simpleitsrq.com";
      process.env.AUTH0_CLIENT_ID = "auth0-id";
      process.env.AUTH0_DOMAIN = "tenant.us.auth0.com";
      const req = mkRequest("http://localhost/x");
      const url = new URL(buildAuthorizeUrl("auth0", "s", req));
      expect(url.origin).toBe("https://tenant.us.auth0.com");
      expect(url.pathname).toBe("/authorize");
      expect(url.searchParams.get("client_id")).toBe("auth0-id");
    });

    it("throws when Auth0 is selected without AUTH0_DOMAIN", () => {
      process.env.AUTH0_CLIENT_ID = "auth0-id";
      delete process.env.AUTH0_DOMAIN;
      const req = mkRequest("http://localhost/x");
      expect(() => buildAuthorizeUrl("auth0", "s", req)).toThrow(/AUTH0_DOMAIN/);
    });
  });
});
