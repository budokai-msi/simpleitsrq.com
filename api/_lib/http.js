// api/_lib/http.js — tiny response helpers shared across API routes.

export const API_SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

/**
 * Serialize a value to a JSON `Response` with no-store caching. Any extra
 * headers are merged after the defaults so callers can override them.
 *
 * @param {number} status
 * @param {unknown} body
 * @param {Record<string, string>} [extraHeaders]
 * @returns {Response}
 */
export const json = (status, body, extraHeaders = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...API_SECURITY_HEADERS,
      ...extraHeaders,
    },
  });

/**
 * Build a 302 redirect response to `location`. Extra headers are merged in
 * so callers can tack on `Set-Cookie` or similar.
 *
 * @param {string} location
 * @param {Record<string, string>} [extraHeaders]
 * @returns {Response}
 */
export const redirect = (location, extraHeaders = {}) =>
  new Response(null, {
    status: 302,
    headers: {
      Location: location,
      ...API_SECURITY_HEADERS,
      ...extraHeaders,
    },
  });

/**
 * Normalize an untrusted redirect target to a safe same-site path. Rejects
 * protocol-relative (`//evil.com`) and absolute URLs.
 *
 * @param {unknown} value
 * @param {string} [fallback]
 * @returns {string}
 */
export const safeRedirectPath = (value, fallback = "/portal") => {
  if (typeof value !== "string") return fallback;
  // Only accept same-site absolute paths. No protocol-relative (//evil.com)
  // or absolute URLs.
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
};
