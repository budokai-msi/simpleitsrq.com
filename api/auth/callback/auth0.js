// GET /api/auth/callback/auth0?code&state
//
// Completes Auth0 Universal Login (enterprise SSO via Okta, Azure AD, etc.):
// verifies CSRF state, exchanges code → access token, fetches OIDC userinfo,
// upserts the user + linked oauth account, creates a session, sets the cookie,
// and redirects to the original page.

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
  const errorDesc = url.searchParams.get("error_description");

  if (error) {
    const msg = errorDesc || error;
    return redirect(`/portal?auth_error=${encodeURIComponent(msg)}`);
  }
  if (!code || !state) {
    return json(400, { ok: false, error: "missing_params" });
  }

  try {
    const consumed = await consumeOAuthState(state, "auth0");
    if (!consumed) return json(400, { ok: false, error: "invalid_state" });

    const accessToken = await exchangeCodeForToken("auth0", code, request);
    const profile = await fetchUserProfile("auth0", accessToken);
    if (!profile.emailVerified) {
      return redirect(`/portal?auth_error=unverified_email`);
    }

    const user = await upsertUserFromProfile("auth0", profile);
    const { cookie } = await createSession(user.id, request);
    const target = safeRedirectPath(consumed.redirectTo, "/portal");
    await logSecurityEvent({
      kind: "auth.login.success",
      severity: "info",
      ip: clientIp(request),
      userId: user.id,
      userAgent: request.headers.get("user-agent"),
      path: "/api/auth/callback/auth0",
      detail: { provider: "auth0", sub: profile.providerAccountId },
    });
    return redirect(target, { "Set-Cookie": cookie });
  } catch (err) {
    console.error("[auth/callback/auth0]", err);
    await logSecurityEvent({
      kind: "auth.login.failure",
      severity: "error",
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent"),
      path: "/api/auth/callback/auth0",
      detail: { provider: "auth0", message: String(err?.message || err) },
    });
    return redirect(`/portal?auth_error=server`);
  }
}
