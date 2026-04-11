// GET /api/auth/login?provider=google|github&redirect=/portal
//
// Starts the OAuth round trip. Stores a CSRF state in the DB, builds the
// provider consent URL, and 302s the browser to it.

import { buildAuthorizeUrl, createOAuthState, PROVIDERS } from "../_lib/oauth.js";
import { json, redirect, safeRedirectPath } from "../_lib/http.js";
import { clientIp, isIpBlocked, logSecurityEvent, rateLimit } from "../_lib/security.js";

export async function GET(request) {
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider");
  const redirectTo = safeRedirectPath(url.searchParams.get("redirect"), "/portal");
  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") || null;

  if (await isIpBlocked(ip)) {
    await logSecurityEvent({ kind: "auth.login.blocked", severity: "warn", ip, userAgent: ua, path: "/api/auth/login" });
    return json(403, { ok: false, error: "blocked" });
  }

  // 20 login attempts per 10 minutes per IP. Plenty for legitimate
  // clients, tight enough that a scripted attack gets curbed fast.
  const rl = await rateLimit({ ip, bucket: "auth_login", windowSeconds: 600, max: 20 });
  if (!rl.ok) {
    await logSecurityEvent({ kind: "auth.login.rate_limited", severity: "warn", ip, userAgent: ua, path: "/api/auth/login" });
    return json(429, { ok: false, error: "rate_limited" });
  }

  if (!provider || !PROVIDERS[provider]) {
    return json(400, { ok: false, error: "invalid_provider" });
  }

  try {
    const state = await createOAuthState(provider, redirectTo);
    const authorizeUrl = buildAuthorizeUrl(provider, state, request);
    await logSecurityEvent({ kind: "auth.login.start", severity: "info", ip, userAgent: ua, path: "/api/auth/login", detail: { provider } });
    return redirect(authorizeUrl);
  } catch (err) {
    console.error("[auth/login]", err);
    await logSecurityEvent({ kind: "auth.login.error", severity: "error", ip, userAgent: ua, path: "/api/auth/login", detail: { message: String(err?.message || err) } });
    return json(500, { ok: false, error: "login_init_failed" });
  }
}
