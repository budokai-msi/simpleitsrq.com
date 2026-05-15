// Central admin allowlist. Server-side only.

export function adminEmailsFromEnv(env = process.env) {
  return [
    env.ADMIN_EMAIL || "",
    ...(env.ADMIN_EMAILS || "").split(","),
  ]
    .map((email) => String(email || "").trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email, env = process.env) {
  const normalized = String(email || "").trim().toLowerCase();
  return Boolean(normalized) && adminEmailsFromEnv(env).includes(normalized);
}

