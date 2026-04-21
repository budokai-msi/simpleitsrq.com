// api/_lib/csrf.js
//
// Double-submit-cookie CSRF protection.
//
// Model:
//   - A random 32-hex-char token is stored in a non-HttpOnly cookie
//     (`sit_csrf`, SameSite=Lax, 30d). JS must be able to read it so the
//     client can echo it back in a header.
//   - On every mutating request (POST/PATCH/DELETE/PUT) the server compares
//     the `x-csrf-token` request header against the `sit_csrf` cookie using
//     a timing-safe equality check.
//   - On top of that we also require the `Origin` header (when present) to
//     match an allowed site origin. Together these make it impossible for
//     a cross-origin request to both read the cookie AND forge the header.
//
// This is layered ON TOP of the existing origin check in portal.js, BotID,
// Turnstile, and rate limiting — it does not replace any of them.

import { parseCookies } from "./session.js";

/**
 * Result of ensureCsrfCookie(): the current (or freshly minted) CSRF token
 * plus the (possibly mutated) response-headers object.
 *
 * @typedef {Object} CsrfEnsureResult
 * @property {string} token
 * @property {Record<string, string>} headers
 */

const CSRF_COOKIE = "sit_csrf";
const CSRF_HEADER = "x-csrf-token";
const CSRF_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
/** @type {Set<string>} */
const MUTATING_METHODS = new Set(["POST", "PATCH", "DELETE", "PUT"]);

/** @type {Set<string>} */
const ALLOWED_ORIGIN_EXACT = new Set([
  "https://simpleitsrq.com",
  "https://www.simpleitsrq.com",
]);

/**
 * Generate a 32-char hex token (16 bytes of entropy).
 *
 * @returns {string}
 */
export function generateCsrfToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Serialized Set-Cookie value for the CSRF token. Not HttpOnly so the
 * client JS can read and echo it.
 *
 * @param {string} token
 * @param {number} [maxAge] Seconds. Defaults to 30 days.
 * @returns {string}
 */
export function csrfCookieValue(token, maxAge = CSRF_TTL_SECONDS) {
  const parts = [
    `${CSRF_COOKIE}=${token}`,
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

/**
 * Return the existing token from the request cookie, or mint a new one.
 * `extraHeaders` is a mutable object that will have `Set-Cookie` merged
 * into it if we had to mint a fresh token.
 *
 * @param {Request} request
 * @param {Record<string, string>} [extraHeaders]
 * @returns {CsrfEnsureResult}
 */
export function ensureCsrfCookie(request, extraHeaders = {}) {
  const cookies = parseCookies(request);
  const existing = cookies[CSRF_COOKIE];
  if (existing && /^[a-f0-9]{32}$/.test(existing)) {
    return { token: existing, headers: extraHeaders };
  }
  const token = generateCsrfToken();
  extraHeaders["Set-Cookie"] = csrfCookieValue(token);
  return { token, headers: extraHeaders };
}

/**
 * Timing-safe hex-string compare. Both inputs must be the same length.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * True iff the `Origin` header (if present) is an allowed site origin.
 * Non-browser clients with no Origin are accepted.
 *
 * @param {string | null | undefined} origin
 * @returns {boolean}
 */
function originAllowed(origin) {
  if (!origin) return true; // non-browser clients (curl, server-to-server) have no Origin
  if (ALLOWED_ORIGIN_EXACT.has(origin)) return true;
  // Vercel preview deployments: https://<project>-<hash>.vercel.app
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return true;
  // Local dev
  if (/^http:\/\/localhost(:\d+)?$/i.test(origin)) return true;
  if (/^http:\/\/127\.0\.0\.1(:\d+)?$/i.test(origin)) return true;
  return false;
}

/**
 * True iff the request passes CSRF checks. Safe methods (GET/HEAD/OPTIONS)
 * always pass. Mutating methods must (a) have an allowed Origin and (b)
 * present an x-csrf-token header matching the sit_csrf cookie.
 *
 * @param {Request} request
 * @returns {boolean}
 */
export function csrfValid(request) {
  const method = (request.method || "GET").toUpperCase();
  if (!MUTATING_METHODS.has(method)) return true;

  const origin = request.headers.get("origin") || "";
  if (!originAllowed(origin)) return false;

  const cookies = parseCookies(request);
  const cookieToken = cookies[CSRF_COOKIE] || "";
  const headerToken = request.headers.get(CSRF_HEADER) || "";
  if (!cookieToken || !headerToken) return false;
  if (!/^[a-f0-9]{32}$/.test(cookieToken)) return false;
  return timingSafeEqual(cookieToken, headerToken);
}

/**
 * Handler-friendly guard. Returns a 403 Response if the request fails the
 * check, or null to proceed.
 *
 *     const bad = requireCsrf(request); if (bad) return bad;
 *
 * @param {Request} request
 * @returns {Response | null}
 */
export function requireCsrf(request) {
  if (csrfValid(request)) return null;
  return new Response(
    JSON.stringify({ ok: false, error: "csrf_rejected" }),
    {
      status: 403,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );
}

/** @type {string} */
export const CSRF_COOKIE_NAME = CSRF_COOKIE;
/** @type {string} */
export const CSRF_HEADER_NAME = CSRF_HEADER;
