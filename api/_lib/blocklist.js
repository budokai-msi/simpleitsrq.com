// api/_lib/blocklist.js
//
// Single source of truth for the hardcoded IP blocklist and CIDR ranges.
// Imported by middleware.js (edge), api/_lib/security.js (API layer),
// and api/portal.js (watchlist display). Editing this file updates ALL layers.

/** Individual IPs identified from coordinated attacks. */
export const BLOCKED_IPS = [
  { ip: "52.47.126.220",   label: "FR — coordinated .env/.git probing" },
  { ip: "208.115.211.186", label: "FR — .git directory probing" },
  { ip: "66.187.6.102",    label: "US — .env file targeting" },
  { ip: "20.199.112.200",  label: "FR — hellopress plugin exploitation" },
  { ip: "177.235.105.185", label: "BR — xmlrpc.php POST attacks" },
  { ip: "104.28.164.43",   label: "IN — wp-login brute-force scanning" },
  { ip: "146.70.102.182",  label: "AE — wp-login brute-force scanning" },
];

/** CIDR ranges — block entire subnets when multiple IPs from the same /24 attack. */
export const BLOCKED_CIDRS = [
  { cidr: "52.47.126.0/24",   label: "OVH France — .env/.git probing range" },
  { cidr: "208.115.211.0/24", label: "Leaseweb France — .git probing range" },
  { cidr: "20.199.112.0/24",  label: "Azure France — plugin exploitation range" },
];

/** Pre-built Set for O(1) individual IP lookups. */
export const BLOCKED_IP_SET = new Set(BLOCKED_IPS.map((e) => e.ip));

/** Pre-built Map for O(1) individual IP lookups with label. */
export const BLOCKED_IP_MAP = new Map(BLOCKED_IPS.map((e) => [e.ip, e.label]));

/** Parse an IPv4 address string to a 32-bit unsigned integer. Returns null for non-IPv4. */
export function ipToInt(ip) {
  if (!ip || typeof ip !== "string") return null;
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/** Return true if `ip` falls within the given CIDR (e.g. "10.0.0.0/24"). */
export function ipInCidr(ip, cidr) {
  const slash = cidr.indexOf("/");
  if (slash < 0) return false;
  const netStr = cidr.slice(0, slash);
  const bits = parseInt(cidr.slice(slash + 1), 10);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  const network = ipToInt(netStr);
  const ipInt = ipToInt(ip);
  if (network === null || ipInt === null) return false;
  return ((ipInt & mask) >>> 0) === ((network & mask) >>> 0);
}

/** Check if an IP is blocked by the hardcoded list (individual IPs + CIDRs). */
export function isHardBlocked(ip) {
  if (BLOCKED_IP_SET.has(ip)) return true;
  for (const { cidr } of BLOCKED_CIDRS) {
    if (ipInCidr(ip, cidr)) return true;
  }
  return false;
}

/**
 * Validate an IP address string. Supports IPv4 and basic IPv6.
 * Returns "v4", "v6", or null if invalid.
 */
export function validateIp(ip) {
  if (!ip || typeof ip !== "string") return null;
  // IPv4: strict dotted-quad
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
    const parts = ip.split(".");
    if (parts.every((p) => { const n = Number(p); return Number.isInteger(n) && n >= 0 && n <= 255; })) {
      return "v4";
    }
    return null;
  }
  // IPv6: colon-hex (simplified check — covers common formats)
  if (/^[0-9a-fA-F:]+$/.test(ip) && ip.includes(":")) {
    // At least 2 colons for a valid IPv6
    if ((ip.match(/:/g) || []).length >= 2) return "v6";
  }
  return null;
}
