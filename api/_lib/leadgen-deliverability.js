// api/_lib/leadgen-deliverability.js
//
// Lightweight deliverability signal for crawled emails. Checks the email
// domain's DNS MX records — a domain with no MX record cannot receive email,
// so the address is effectively undeliverable. This is a cheap, safe, no-I/O
// (besides DNS) way to drop obvious junk before a campaign is built.
//
// This does NOT do an SMTP handshake / mailbox probe (smtp_verified is left
// null). SMTP probing against arbitrary third-party mailboxes is ethically
// and legally dicey (can be seen as a probe), so we only mark mx_valid here
// and let real bounce-back during actual sends set bounced_at.

import { resolveMx } from "node:dns/promises";

// Domains that are structurally unable to receive external email. Catching
// these avoids a pointless DNS lookup and keeps obviously-dead addresses out.
const NO_MX_TLDS = new Set(["example", "invalid", "test", "localhost"]);
const NO_MX_SUFFIXES = [".local", ".internal", ".lan"];

/**
 * Return true if the given email's domain has at least one MX record that
 * resolves to a host. Returns false for structurally invalid addresses,
 * domains with no MX, or domains on known non-deliverable TLDs.
 *
 * Uses dns.resolveMx. A domain with NO MX record (but a valid A record)
 * technically can still receive on the A host per RFC 5321, but for lead-gen
 * purposes a missing MX is a strong undeliverable signal worth surfacing.
 */
export async function hasDeliverableMx(email) {
  const addr = String(email || "").trim().toLowerCase();
  const at = addr.lastIndexOf("@");
  if (at <= 0 || at === addr.length - 1) return false;
  const domain = addr.slice(at + 1);
  if (!domain || domain.length > 255 || domain.includes(" ")) return false;

  const lower = domain.toLowerCase();
  const lastLabel = lower.split(".").pop();
  if (NO_MX_TLDS.has(lastLabel)) return false;
  if (NO_MX_SUFFIXES.some((s) => lower.endsWith(s))) return false;

  try {
    const records = await resolveMx(lower);
    // MX records with preference 0 and hostname "." indicate "no mail"
    // (RFC 7505 null MX). Treat as undeliverable.
    if (!records.length) return false;
    return records.some((r) => r.exchange && r.exchange !== "." && r.exchange !== "");
  } catch {
    // NXDOMAIN / no MX / query error → treat as not deliverable.
    return false;
  }
}
