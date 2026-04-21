// api/_lib/oauth.js
//
// OAuth helpers for Google + GitHub. Keeps URL building and token exchange
// in one place so the login/callback routes stay thin.

import { sql } from "./db.js";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Hard cap on every outbound call to an IdP. Without this, a hung token
// endpoint would pin the serverless function until Vercel's global timeout.
const IDP_FETCH_TIMEOUT_MS = 8000;

export const PROVIDERS = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  },
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    emailsUrl: "https://api.github.com/user/emails",
    scope: "read:user user:email",
    clientIdEnv: "GITHUB_CLIENT_ID",
    clientSecretEnv: "GITHUB_CLIENT_SECRET",
  },
  // Auth0 Universal Login — enterprise SSO gateway (Okta, Azure AD, Ping, etc.)
  // The user signs in via your Auth0 tenant's hosted login page. Auth0 handles
  // the IdP selection and SAML/OIDC federation behind the scenes.
  auth0: {
    // These are built dynamically from AUTH0_DOMAIN env var.
    authorizeUrl: null,
    tokenUrl: null,
    userInfoUrl: null,
    scope: "openid email profile",
    clientIdEnv: "AUTH0_CLIENT_ID",
    clientSecretEnv: "AUTH0_CLIENT_SECRET",
  },
};

export function appBaseUrl(request) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
  return `${proto}://${host}`;
}

export function redirectUri(request, provider) {
  return `${appBaseUrl(request)}/api/auth/callback/${provider}`;
}

function randomState() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createOAuthState(provider, redirectTo) {
  const state = randomState();
  await sql`
    INSERT INTO oauth_states (state, provider, redirect_to)
    VALUES (${state}, ${provider}, ${redirectTo || null})
  `;
  // Best-effort prune of expired states.
  sql`DELETE FROM oauth_states WHERE created_at < now() - interval '30 minutes'`.catch(() => {});
  return state;
}

export async function consumeOAuthState(state, provider) {
  if (!state) return null;
  const rows = await sql`
    DELETE FROM oauth_states
    WHERE state = ${state} AND provider = ${provider}
    RETURNING redirect_to, created_at
  `;
  if (rows.length === 0) return null;
  const row = rows[0];
  if (Date.now() - new Date(row.created_at).getTime() > STATE_TTL_MS) return null;
  return { redirectTo: row.redirect_to };
}

/**
 * Resolve Auth0 endpoint URLs from the AUTH0_DOMAIN env var.
 * Auth0 is special: all URLs are derived from the tenant domain,
 * unlike Google/GitHub which have fixed authorize/token endpoints.
 */
function resolveAuth0Urls() {
  const domain = process.env.AUTH0_DOMAIN;
  if (!domain) return null;
  const base = domain.startsWith("https://") ? domain : `https://${domain}`;
  return {
    authorizeUrl: `${base}/authorize`,
    tokenUrl: `${base}/oauth/token`,
    userInfoUrl: `${base}/userinfo`,
  };
}

export function buildAuthorizeUrl(provider, state, request) {
  const cfg = PROVIDERS[provider];
  const clientId = process.env[cfg.clientIdEnv];
  if (!clientId) throw new Error(`${cfg.clientIdEnv} not set`);

  // Auth0 endpoints are dynamic — resolve from AUTH0_DOMAIN.
  let authorizeUrl = cfg.authorizeUrl;
  if (provider === "auth0") {
    const urls = resolveAuth0Urls();
    if (!urls) throw new Error("AUTH0_DOMAIN env var not set");
    authorizeUrl = urls.authorizeUrl;
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(request, provider),
    scope: cfg.scope,
    state,
    response_type: "code",
  });
  if (provider === "google") {
    params.set("access_type", "online");
    params.set("prompt", "select_account");
  }
  if (provider === "github") {
    params.set("allow_signup", "true");
  }
  // Auth0: add connection param if specified (e.g. "okta", "azure-ad").
  // Omit it to show the Universal Login page with all enabled connections.
  if (provider === "auth0" && process.env.AUTH0_CONNECTION) {
    params.set("connection", process.env.AUTH0_CONNECTION);
  }
  return `${authorizeUrl}?${params.toString()}`;
}

export async function exchangeCodeForToken(provider, code, request) {
  const cfg = PROVIDERS[provider];
  const clientId = process.env[cfg.clientIdEnv];
  const clientSecret = process.env[cfg.clientSecretEnv];
  if (!clientId || !clientSecret) {
    throw new Error(`${cfg.clientIdEnv}/${cfg.clientSecretEnv} not set`);
  }

  // Resolve Auth0 token URL dynamically.
  let tokenUrl = cfg.tokenUrl;
  if (provider === "auth0") {
    const urls = resolveAuth0Urls();
    if (!urls) throw new Error("AUTH0_DOMAIN env var not set");
    tokenUrl = urls.tokenUrl;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri(request, provider),
    grant_type: "authorization_code",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
    signal: AbortSignal.timeout(IDP_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${provider} token exchange failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`${provider} token response missing access_token`);
  }
  return data.access_token;
}

export async function fetchUserProfile(provider, accessToken) {
  const cfg = PROVIDERS[provider];

  // Resolve Auth0 userinfo URL dynamically.
  let userInfoUrl = cfg.userInfoUrl;
  if (provider === "auth0") {
    const urls = resolveAuth0Urls();
    if (!urls) throw new Error("AUTH0_DOMAIN env var not set");
    userInfoUrl = urls.userInfoUrl;
  }

  const res = await fetch(userInfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "User-Agent": "simpleitsrq-web",
    },
    signal: AbortSignal.timeout(IDP_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`${provider} userinfo failed: ${res.status}`);
  }
  const raw = await res.json();

  if (provider === "google") {
    return {
      providerAccountId: String(raw.sub),
      email: raw.email,
      emailVerified: raw.email_verified === true,
      name: raw.name || raw.given_name || null,
      avatarUrl: raw.picture || null,
    };
  }

  // Auth0 returns standard OIDC claims — same shape as Google.
  // The `sub` field is the unique identifier scoped to the Auth0 tenant.
  if (provider === "auth0") {
    return {
      providerAccountId: String(raw.sub),
      email: raw.email || null,
      emailVerified: raw.email_verified === true,
      name: raw.name || raw.given_name || raw.nickname || null,
      avatarUrl: raw.picture || null,
    };
  }

  // GitHub: userinfo omits email when user has set it to private. Fall back to
  // /user/emails and pick the primary verified address.
  let email = raw.email;
  if (!email) {
    try {
      const er = await fetch(cfg.emailsUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "simpleitsrq-web",
        },
        signal: AbortSignal.timeout(IDP_FETCH_TIMEOUT_MS),
      });
      if (er.ok) {
        const emails = await er.json();
        const primary = Array.isArray(emails)
          ? emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified)
          : null;
        if (primary) email = primary.email;
      }
    } catch {
      // leave email null
    }
  }
  return {
    providerAccountId: String(raw.id),
    email: email || null,
    emailVerified: true, // only verified email is picked above
    name: raw.name || raw.login || null,
    avatarUrl: raw.avatar_url || null,
  };
}

// Upsert the user + link the oauth account. Returns the user row.
export async function upsertUserFromProfile(provider, profile) {
  if (!profile.email) {
    throw new Error(`${provider} account has no verified email`);
  }

  // Try to find by provider linkage first.
  const byProvider = await sql`
    SELECT u.*
    FROM oauth_accounts oa
    JOIN users u ON u.id = oa.user_id
    WHERE oa.provider = ${provider}
      AND oa.provider_account_id = ${profile.providerAccountId}
    LIMIT 1
  `;
  if (byProvider.length > 0) {
    const u = byProvider[0];
    // Keep name + avatar fresh.
    await sql`
      UPDATE users
      SET name = COALESCE(${profile.name}, name),
          avatar_url = COALESCE(${profile.avatarUrl}, avatar_url),
          updated_at = now()
      WHERE id = ${u.id}
    `;
    return u;
  }

  // Otherwise look up by email, create if missing, and link the oauth account.
  const byEmail = await sql`
    SELECT * FROM users WHERE lower(email) = lower(${profile.email}) LIMIT 1
  `;
  let user;
  if (byEmail.length > 0) {
    user = byEmail[0];
    await sql`
      UPDATE users
      SET name = COALESCE(${profile.name}, name),
          avatar_url = COALESCE(${profile.avatarUrl}, avatar_url),
          updated_at = now()
      WHERE id = ${user.id}
    `;
  } else {
    // Only the owner email gets admin. Everyone else is a regular client.
    const adminEmail = process.env.ADMIN_EMAIL || "";
    const isOwner = adminEmail && profile.email.toLowerCase() === adminEmail.toLowerCase();

    const inserted = await sql`
      INSERT INTO users (email, name, avatar_url, is_admin)
      VALUES (${profile.email}, ${profile.name}, ${profile.avatarUrl}, ${isOwner})
      RETURNING *
    `;
    user = inserted[0];
  }

  await sql`
    INSERT INTO oauth_accounts (user_id, provider, provider_account_id)
    VALUES (${user.id}, ${provider}, ${profile.providerAccountId})
    ON CONFLICT (provider, provider_account_id) DO NOTHING
  `;

  // Adopt any orphan tickets previously filed by this email while signed out.
  await sql`
    UPDATE tickets
    SET user_id = ${user.id}, updated_at = now()
    WHERE user_id IS NULL
      AND lower(email) = lower(${profile.email})
  `;

  return user;
}
