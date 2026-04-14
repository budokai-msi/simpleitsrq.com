// GET /api/auth/session
//
// Returns the current user if signed in, otherwise { user: null }. The
// frontend polls this once on load to hydrate its auth context.

import { getSession } from "../_lib/session.js";
import { json } from "../_lib/http.js";

export async function GET(request) {
  const providers = [];
  if (process.env.GOOGLE_CLIENT_ID) providers.push("google");
  if (process.env.GITHUB_CLIENT_ID) providers.push("github");
  if (process.env.AUTH0_CLIENT_ID && process.env.AUTH0_DOMAIN) providers.push("auth0");

  try {
    const session = await getSession(request);
    if (!session) return json(200, { user: null, providers });
    return json(200, { user: session.user, providers });
  } catch (err) {
    console.error("[auth/session]", err);
    return json(200, { user: null, providers });
  }
}
