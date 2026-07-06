// api/_lib/portal/shared.js
//
// Helpers shared by every /api/portal action module: the memoized
// per-request admin check and the standard admin gate.

import { json } from "../http.js";
import { isAdminEmail } from "../admin.js";

// Memoized per-request admin check. Hard-locked to ADMIN_EMAIL env var.
// No DB fallback — even if someone manually edits users.is_admin, only
// the owner email can pass. This is the single source of truth for admin.
export async function resolveAdmin(session) {
  if (session.__isAdmin !== undefined) return session.__isAdmin;
  session.__isAdmin = isAdminEmail(session?.user?.email);
  return session.__isAdmin;
}

export async function requireAdmin(session) {
  if (!(await resolveAdmin(session))) {
    return json(403, { ok: false, error: "forbidden" });
  }
  return null;
}
