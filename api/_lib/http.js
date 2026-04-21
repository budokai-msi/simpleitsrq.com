// api/_lib/http.js — tiny response helpers shared across API routes.

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
      "Cache-Control": "no-store",
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
      "Cache-Control": "no-store",
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
