// Central admin identity check. Server-side only.
//
// The raw owner email must never live in source control. Authorization is
// hard-locked to a salted SHA-256 digest committed here; environment variables
// cannot add another admin identity. The comparison uses timingSafeEqual.

import { createHash, timingSafeEqual } from "node:crypto";

const OWNER_EMAIL_DIGEST = Buffer.from("f3eba6be9575c9f822a9a319a688dec5f03d0885c75ab8d32ea3aefcdf47f3d2", "hex");
const OWNER_EMAIL_NAMESPACE = "simpleitsrq-owner-v1:";

function digestEmail(email) {
  return createHash("sha256")
    .update(OWNER_EMAIL_NAMESPACE + String(email || "").trim().toLowerCase(), "utf8")
    .digest();
}

export function isAdminEmail(email) {
  return timingSafeEqual(digestEmail(email), OWNER_EMAIL_DIGEST);
}
