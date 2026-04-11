// GET /api/auth/callback/google?code&state
//
// Completes Google OAuth: verifies CSRF state, exchanges code → access token,
// fetches userinfo, upserts the user + linked oauth account, creates a
// session, sets the cookie, and redirects to the original page.

import {
  consumeOAuthState,
  exchangeCodeForToken,
  fetchUserProfile,
  upsertUserFromProfile,
} from "../../_lib/oauth.js";
import { createSession } from "../../_lib/session.js";
import { redirect, json, safeRedirectPath } from "../../_lib/http.js";
import { clientIp, logSecurityEvent } from "../../_lib/security.js";

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return redirect(`/portal?auth_error=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return json(400, { ok: false, error: "missing_params" });
  }

  try {
    const consumed = await consumeOAuthState(state, "google");
    if (!consumed) return json(400, { ok: false, error: "invalid_state" });

    const accessToken = await exchangeCodeForToken("google", code, request);
    const profile = await fetchUserProfile("google", accessToken);
    if (!profile.emailVerified) {
      return redirect(`/portal?auth_error=unverified_email`);
    }

    const user = await upsertUserFromProfile("google", profile);
    const { cookie } = await createSession(user.id, request);
    const target = safeRedirectPath(consumed.redirectTo, "/portal");
    await logSecurityEvent({
      kind: "auth.login.success",
      severity: "info",
      ip: clientIp(request),
      userId: user.id,
      userAgent: request.headers.get("user-agent"),
      path: "/api/auth/callback/google",
      detail: { provider: "google" },
    });
    return redirect(target, { "Set-Cookie": cookie });
  } catch (err) {
    console.error("[auth/callback/google]", err);
    await logSecurityEvent({
      kind: "auth.login.failure",
      severity: "error",
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent"),
      path: "/api/auth/callback/google",
      detail: { provider: "google", message: String(err?.message || err) },
    });
    return redirect(`/portal?auth_error=server`);
  }
}
