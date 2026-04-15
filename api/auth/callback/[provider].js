// GET /api/auth/callback/:provider?code&state
//
// Unified OAuth callback for Google, GitHub, and Auth0. Verifies CSRF state,
// exchanges the code for an access token, fetches the profile, upserts the
// user, creates a session, and redirects back. Consolidated into one file
// to stay under Vercel Hobby's 12-function limit.

import {
  consumeOAuthState,
  exchangeCodeForToken,
  fetchUserProfile,
  upsertUserFromProfile,
} from "../../_lib/oauth.js";
import { createSession } from "../../_lib/session.js";
import { redirect, json, safeRedirectPath } from "../../_lib/http.js";
import { clientIp, logSecurityEvent } from "../../_lib/security.js";

const SUPPORTED = new Set(["google", "github", "auth0"]);

function providerFromPath(pathname) {
  const m = pathname.match(/\/api\/auth\/callback\/([^/?]+)/);
  return m ? m[1].toLowerCase() : null;
}

export async function GET(request) {
  const url = new URL(request.url);
  const provider = providerFromPath(url.pathname);
  if (!provider || !SUPPORTED.has(provider)) {
    return json(404, { ok: false, error: "unknown_provider" });
  }

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

  const path = `/api/auth/callback/${provider}`;

  try {
    const consumed = await consumeOAuthState(state, provider);
    if (!consumed) return json(400, { ok: false, error: "invalid_state" });

    const accessToken = await exchangeCodeForToken(provider, code, request);
    const profile = await fetchUserProfile(provider, accessToken);

    // GitHub doesn't return emailVerified; require an email instead.
    if (provider === "github") {
      if (!profile.email) return redirect(`/portal?auth_error=no_email`);
    } else if (!profile.emailVerified) {
      return redirect(`/portal?auth_error=unverified_email`);
    }

    const user = await upsertUserFromProfile(provider, profile);
    const { cookie } = await createSession(user.id, request);
    const target = safeRedirectPath(consumed.redirectTo, "/portal");
    await logSecurityEvent({
      kind: "auth.login.success",
      severity: "info",
      ip: clientIp(request),
      userId: user.id,
      userAgent: request.headers.get("user-agent"),
      path,
      detail: provider === "auth0"
        ? { provider, sub: profile.providerAccountId }
        : { provider },
    });
    return redirect(target, { "Set-Cookie": cookie });
  } catch (err) {
    console.error(`[auth/callback/${provider}]`, err);
    await logSecurityEvent({
      kind: "auth.login.failure",
      severity: "error",
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent"),
      path,
      detail: { provider, message: String(err?.message || err) },
    });
    return redirect(`/portal?auth_error=server`);
  }
}
