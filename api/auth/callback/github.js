// GET /api/auth/callback/github?code&state
//
// Same shape as the Google callback. GitHub's userinfo endpoint doesn't
// always include an email, so fetchUserProfile falls back to /user/emails
// behind the scenes.

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
    const consumed = await consumeOAuthState(state, "github");
    if (!consumed) return json(400, { ok: false, error: "invalid_state" });

    const accessToken = await exchangeCodeForToken("github", code, request);
    const profile = await fetchUserProfile("github", accessToken);
    if (!profile.email) {
      return redirect(`/portal?auth_error=no_email`);
    }

    const user = await upsertUserFromProfile("github", profile);
    const { cookie } = await createSession(user.id, request);
    const target = safeRedirectPath(consumed.redirectTo, "/portal");
    await logSecurityEvent({
      kind: "auth.login.success",
      severity: "info",
      ip: clientIp(request),
      userId: user.id,
      userAgent: request.headers.get("user-agent"),
      path: "/api/auth/callback/github",
      detail: { provider: "github" },
    });
    return redirect(target, { "Set-Cookie": cookie });
  } catch (err) {
    console.error("[auth/callback/github]", err);
    await logSecurityEvent({
      kind: "auth.login.failure",
      severity: "error",
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent"),
      path: "/api/auth/callback/github",
      detail: { provider: "github", message: String(err?.message || err) },
    });
    return redirect(`/portal?auth_error=server`);
  }
}
