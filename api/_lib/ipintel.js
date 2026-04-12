// IP intelligence enrichment via AbuseIPDB + ipinfo.io.
//
// Results are cached in the ip_intel table for 7 days. Callers should
// call enrichIp() on every request — it returns instantly from cache on
// repeat visits and only hits external APIs on first-time or expired IPs.
//
// Env vars (optional — enrichment degrades gracefully without them):
//   ABUSEIPDB_API_KEY  — https://www.abuseipdb.com/account/api (1000/day free)
//   IPINFO_TOKEN       — https://ipinfo.io/account (50K/month free, optional)

import { sql } from "./db.js";

const ABUSEIPDB_KEY = () => process.env.ABUSEIPDB_API_KEY || "";
const IPINFO_TOKEN  = () => process.env.IPINFO_TOKEN || "";

const PRIVATE_IP = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|::1|fd|fe80)/;

export async function enrichIp(ip) {
  if (!ip || PRIVATE_IP.test(ip)) return null;

  // Check cache first.
  const cached = await sql`
    SELECT * FROM ip_intel
    WHERE ip = ${ip} AND expires_at > now()
    LIMIT 1
  `.catch(() => []);
  if (cached.length > 0) return cached[0];

  const intel = {
    ip,
    asn: null, org: null, isp: null,
    country: null, region: null, city: null,
    is_datacenter: false, is_tor: false, is_proxy: false, is_vpn: false,
    abuse_score: null, abuse_reports: null, abuse_last_seen: null,
    raw_abuseipdb: null, raw_ipinfo: null,
  };

  // --- ipinfo.io (geo + ASN + org + privacy flags) ---
  try {
    const token = IPINFO_TOKEN();
    const url = token
      ? `https://ipinfo.io/${ip}/json?token=${token}`
      : `https://ipinfo.io/${ip}/json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const d = await res.json();
      intel.raw_ipinfo = d;
      intel.asn     = d.asn?.asn   || (d.org?.split(" ")[0]) || null;
      intel.org     = d.asn?.name  || d.org || d.company?.name || null;
      intel.isp     = d.company?.name || d.org || null;
      intel.country = d.country || null;
      intel.region  = d.region  || null;
      intel.city    = d.city    || null;
      if (d.privacy) {
        intel.is_vpn       = !!d.privacy.vpn;
        intel.is_proxy     = !!d.privacy.proxy;
        intel.is_tor       = !!d.privacy.tor;
        intel.is_datacenter = !!d.privacy.hosting;
      }
      // Heuristic: known cloud ASNs
      const orgLower = (intel.org || "").toLowerCase();
      if (/amazon|aws|google cloud|microsoft azure|digitalocean|linode|ovh|hetzner|vultr/.test(orgLower)) {
        intel.is_datacenter = true;
      }
    }
  } catch { /* best effort */ }

  // --- AbuseIPDB (abuse confidence score + report count) ---
  const abuseKey = ABUSEIPDB_KEY();
  if (abuseKey) {
    try {
      const res = await fetch(
        `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`,
        {
          headers: { Key: abuseKey, Accept: "application/json" },
          signal: AbortSignal.timeout(5000),
        },
      );
      if (res.ok) {
        const d = await res.json();
        const data = d.data || {};
        intel.raw_abuseipdb   = data;
        intel.abuse_score     = data.abuseConfidenceScore ?? null;
        intel.abuse_reports   = data.totalReports ?? null;
        intel.abuse_last_seen = data.lastReportedAt || null;
        intel.isp             = intel.isp || data.isp || null;
        intel.is_tor          = intel.is_tor || !!data.isTor;
        if (data.usageType === "Data Center/Web Hosting/Transit") {
          intel.is_datacenter = true;
        }
      }
    } catch { /* best effort */ }
  }

  // --- Persist to cache ---
  try {
    await sql`
      INSERT INTO ip_intel (
        ip, asn, org, isp, country, region, city,
        is_datacenter, is_tor, is_proxy, is_vpn,
        abuse_score, abuse_reports, abuse_last_seen,
        raw_abuseipdb, raw_ipinfo
      ) VALUES (
        ${intel.ip}, ${intel.asn}, ${intel.org}, ${intel.isp},
        ${intel.country}, ${intel.region}, ${intel.city},
        ${intel.is_datacenter}, ${intel.is_tor}, ${intel.is_proxy}, ${intel.is_vpn},
        ${intel.abuse_score}, ${intel.abuse_reports}, ${intel.abuse_last_seen},
        ${intel.raw_abuseipdb ? JSON.stringify(intel.raw_abuseipdb) : null}::jsonb,
        ${intel.raw_ipinfo    ? JSON.stringify(intel.raw_ipinfo)    : null}::jsonb
      )
      ON CONFLICT (ip) DO UPDATE
        SET asn = EXCLUDED.asn, org = EXCLUDED.org, isp = EXCLUDED.isp,
            country = EXCLUDED.country, region = EXCLUDED.region, city = EXCLUDED.city,
            is_datacenter = EXCLUDED.is_datacenter, is_tor = EXCLUDED.is_tor,
            is_proxy = EXCLUDED.is_proxy, is_vpn = EXCLUDED.is_vpn,
            abuse_score = EXCLUDED.abuse_score, abuse_reports = EXCLUDED.abuse_reports,
            abuse_last_seen = EXCLUDED.abuse_last_seen,
            raw_abuseipdb = EXCLUDED.raw_abuseipdb, raw_ipinfo = EXCLUDED.raw_ipinfo,
            enriched_at = now(), expires_at = now() + interval '7 days'
    `;
  } catch (err) {
    console.error("[ipintel] cache write failed", err);
  }

  return intel;
}
