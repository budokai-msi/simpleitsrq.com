// api/_lib/http.js — tiny response helpers shared across API routes.

export const json = (status, body, extraHeaders = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });

export const redirect = (location, extraHeaders = {}) =>
  new Response(null, {
    status: 302,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });

export const safeRedirectPath = (value, fallback = "/portal") => {
  if (typeof value !== "string") return fallback;
  // Only accept same-site absolute paths. No protocol-relative (//evil.com)
  // or absolute URLs.
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
};
