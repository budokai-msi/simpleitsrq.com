// src/lib/csrf.js
//
// Client-side helpers for the double-submit-cookie CSRF scheme.
//
// Flow:
//   1. On first GET request (e.g. /api/auth/session), the server sets a
//      non-HttpOnly `sit_csrf` cookie.
//   2. `getCsrfToken()` reads that cookie from document.cookie.
//   3. Every mutating fetch() (POST/PATCH/DELETE/PUT) must include the
//      cookie's value as an `x-csrf-token` header.
//
// `csrfFetch(url, init)` is a thin wrapper that adds the header and sets
// credentials:"same-origin" automatically.

const CSRF_COOKIE = "sit_csrf";

export function getCsrfToken() {
  if (typeof document === "undefined") return "";
  const cookie = document.cookie || "";
  for (const part of cookie.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === CSRF_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return "";
}

// Prime the cookie by hitting /api/auth/session (which is the canonical
// GET that sets it). Returns the token once available.
export async function primeCsrfToken() {
  let token = getCsrfToken();
  if (token) return token;
  try {
    await fetch("/api/auth/session", { credentials: "same-origin" });
  } catch { /* best-effort */ }
  token = getCsrfToken();
  return token;
}

// Drop-in replacement for fetch() that attaches CSRF + credentials for
// same-origin mutating requests. Non-mutating requests also get
// credentials so cookies flow, but no CSRF header is added.
export async function csrfFetch(url, init = {}) {
  const method = (init.method || "GET").toUpperCase();
  const mutating = method === "POST" || method === "PATCH" || method === "DELETE" || method === "PUT";
  const headers = new Headers(init.headers || {});
  if (mutating) {
    let token = getCsrfToken();
    if (!token) token = await primeCsrfToken();
    if (token) headers.set("x-csrf-token", token);
  }
  return fetch(url, {
    credentials: "same-origin",
    ...init,
    headers,
  });
}
