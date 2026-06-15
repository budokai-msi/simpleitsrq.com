// Central admin allowlist. Server-side only.
//
// Hard-locked to a single owner account. This is intentionally NOT driven by
// env vars: a stray or misconfigured ADMIN_EMAIL/ADMIN_EMAILS value (or anyone
// with access to the Vercel dashboard) must never be able to grant admin to
// another address. ivanovspccenter@gmail.com is the sole admin, full stop.
export const OWNER_EMAIL = "ivanovspccenter@gmail.com";

// Returns the canonical admin allowlist. Always exactly the owner — the `env`
// parameter is ignored and kept only for signature compatibility with callers.
export function adminEmailsFromEnv() {
  return [OWNER_EMAIL];
}

export function isAdminEmail(email) {
  return String(email || "").trim().toLowerCase() === OWNER_EMAIL;
}
