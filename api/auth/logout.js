// POST /api/auth/logout
//
// Deletes the current session server-side and clears the cookie.

import { destroySession } from "../_lib/session.js";
import { json } from "../_lib/http.js";

export async function POST(request) {
  try {
    const { cookie } = await destroySession(request);
    return json(200, { ok: true }, { "Set-Cookie": cookie });
  } catch (err) {
    console.error("[auth/logout]", err);
    return json(500, { ok: false, error: "logout_failed" });
  }
}
