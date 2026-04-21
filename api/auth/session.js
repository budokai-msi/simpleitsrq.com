// GET /api/auth/session
//
// Returns the current user if signed in, otherwise { user: null }. The
// frontend polls this once on load to hydrate its auth context.
//
// This endpoint also mints the `sit_csrf` cookie used by the double-submit
// CSRF scheme — the frontend needs to read it before making any mutating
// request, so piggy-backing on the existing hydration call means there's
// no extra round-trip.

import { getSession } from "../_lib/session.js";
import { ensureCsrfCookie } from "../_lib/csrf.js";
import { json } from "../_lib/http.js";

export async function GET(request) {
  const providers = [];
  if (process.env.GOOGLE_CLIENT_ID) providers.push("google");
  if (process.env.GITHUB_CLIENT_ID) providers.push("github");
  if (process.env.AUTH0_CLIENT_ID && process.env.AUTH0_DOMAIN) providers.push("auth0");

  const extraHeaders = {};
  ensureCsrfCookie(request, extraHeaders);

  try {
    const session = await getSession(request);
    if (!session) return json(200, { user: null, providers }, extraHeaders);
    return json(200, { user: session.user, providers }, extraHeaders);
  } catch (err) {
    console.error("[auth/session]", err);
    return json(200, { user: null, providers }, extraHeaders);
  }
}
