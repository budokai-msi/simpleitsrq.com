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
import dns from "node:dns/promises";

const ABUSEIPDB_KEY = () => process.env.ABUSEIPDB_API_KEY || "";
const IPINFO_TOKEN  = () => process.env.IPINFO_TOKEN || "";

const PRIVATE_IP = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|::1|fd|fe80)/;

// Reverse DNS: PTR lookup. Resolves to the hostname associated with the IP
// per the IP owner's in-addr.arpa / ip6.arpa records. Crawlers almost always
// set a recognizable PTR (e.g. crawl-*.googlebot.com, *.amazonaws.com).
async function lookupReverseDns(ip) {
  try {
    const names = await Promise.race([
      dns.reverse(ip),
      new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 2000)),
    ]);
    return Array.isArray(names) && names.length > 0 ? names[0] : null;
  } catch {
    return null;
  }
}

// RDAP: the modern, JSON-based replacement for WHOIS. rdap.org is the
// IANA-operated bootstrap — it federates to whichever RIR owns the IP
// range (ARIN for NA, RIPE for EU, APNIC, LACNIC, AFRINIC). Data includes
// the registered allocation, the registrant organization, abuse contact
// email, and registration/last-changed dates.
function pickAbuseEmail(entities) {
  if (!Array.isArray(entities)) return null;
  const stack = [...entities];
  while (stack.length) {
    const e = stack.shift();
    if (!e) continue;
    const roles = Array.isArray(e.roles) ? e.roles : [];
    if (roles.includes("abuse")) {
      const vcard = Array.isArray(e.vcardArray) ? e.vcardArray[1] : null;
      if (Array.isArray(vcard)) {
        const emailEntry = vcard.find((v) => Array.isArray(v) && v[0] === "email");
        if (emailEntry && typeof emailEntry[3] === "string") return emailEntry[3].toLowerCase();
      }
    }
    if (Array.isArray(e.entities)) stack.push(...e.entities);
  }
  return null;
}

function pickRegistrant(entities) {
  if (!Array.isArray(entities)) return null;
  for (const e of entities) {
    const roles = Array.isArray(e.roles) ? e.roles : [];
    if (roles.includes("registrant") || roles.includes("administrative")) {
      const vcard = Array.isArray(e.vcardArray) ? e.vcardArray[1] : null;
      if (Array.isArray(vcard)) {
        const fn = vcard.find((v) => Array.isArray(v) && v[0] === "fn");
        if (fn && typeof fn[3] === "string") return fn[3];
      }
      if (e.handle) return e.handle;
    }
  }
  return null;
}

function pickEvent(events, action) {
  if (!Array.isArray(events)) return null;
  const e = events.find((x) => x && x.eventAction === action);
  return e && e.eventDate ? e.eventDate : null;
}

async function lookupRdap(ip) {
  try {
    const res = await fetch(`https://rdap.org/ip/${encodeURIComponent(ip)}`, {
      headers: { Accept: "application/rdap+json" },
      signal: AbortSignal.timeout(4000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const d = await res.json();
    const regDate = pickEvent(d.events, "registration");
    return {
      handle:            d.handle || null,
      name:              d.name   || null,
      netRange:          d.startAddress && d.endAddress ? `${d.startAddress} – ${d.endAddress}` : null,
      registrant:        pickRegistrant(d.entities),
      abuseEmail:        pickAbuseEmail(d.entities),
      registrationDate:  regDate ? new Date(regDate).toISOString() : null,
      source:            d.port43 || (d.links?.find?.((l) => l.rel === "self")?.href) || null,
      raw:               d,
    };
  } catch {
    return null;
  }
}

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
    reverse_dns: null,
    rdap_handle: null, rdap_name: null, rdap_registrant: null,
    rdap_abuse_email: null, rdap_net_range: null,
    rdap_registration_date: null, rdap_source: null,
    raw_abuseipdb: null, raw_ipinfo: null, raw_rdap: null,
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

  // --- Reverse DNS (PTR) + RDAP in parallel — both are rate-friendly ---
  const [ptr, rdap] = await Promise.all([
    lookupReverseDns(ip),
    lookupRdap(ip),
  ]);
  intel.reverse_dns = ptr;
  if (rdap) {
    intel.rdap_handle            = rdap.handle;
    intel.rdap_name              = rdap.name;
    intel.rdap_registrant        = rdap.registrant;
    intel.rdap_abuse_email       = rdap.abuseEmail;
    intel.rdap_net_range         = rdap.netRange;
    intel.rdap_registration_date = rdap.registrationDate;
    intel.rdap_source            = rdap.source;
    intel.raw_rdap               = rdap.raw;
    // If ipinfo / AbuseIPDB didn't fill these in, fall back to RDAP.
    intel.org = intel.org || rdap.registrant || rdap.name;
  }

  // PTR-based bot/crawler flag: *.googlebot.com, *.bingbot.com etc all
  // resolve to an identifiable host. Stored on web_sessions.is_bot later.
  if (ptr && /(googlebot|bingbot|yandex\.(com|ru)|baiduspider|duckduckbot|applebot|facebookexternalhit|crawl|spider|bot\.)/i.test(ptr)) {
    intel.is_bot_hostname = true;
  }

  // --- Auto-block high-threat IPs on sight ---
  if (intel.abuse_score != null && intel.abuse_score >= 75) {
    try {
      const existing = await sql`SELECT 1 FROM ip_blocklist WHERE ip = ${ip}`;
      if (existing.length === 0) {
        await sql`INSERT INTO ip_blocklist (ip, reason) VALUES (${ip}, ${`auto: AbuseIPDB score ${intel.abuse_score}, ${intel.abuse_reports} reports, org=${intel.org || "unknown"}`})`;
        await sql`
          INSERT INTO security_events (kind, severity, ip, detail)
          VALUES ('auto_block.abuse_score', 'critical', ${ip},
                  ${JSON.stringify({ abuse_score: intel.abuse_score, abuse_reports: intel.abuse_reports, org: intel.org, is_tor: intel.is_tor, is_proxy: intel.is_proxy })}::jsonb)
        `;
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
        reverse_dns, rdap_handle, rdap_name, rdap_registrant,
        rdap_abuse_email, rdap_net_range, rdap_registration_date, rdap_source,
        raw_abuseipdb, raw_ipinfo, raw_rdap,
        enriched_at, expires_at
      ) VALUES (
        ${intel.ip}, ${intel.asn}, ${intel.org}, ${intel.isp},
        ${intel.country}, ${intel.region}, ${intel.city},
        ${intel.is_datacenter}, ${intel.is_tor}, ${intel.is_proxy}, ${intel.is_vpn},
        ${intel.abuse_score}, ${intel.abuse_reports}, ${intel.abuse_last_seen},
        ${intel.reverse_dns}, ${intel.rdap_handle}, ${intel.rdap_name}, ${intel.rdap_registrant},
        ${intel.rdap_abuse_email}, ${intel.rdap_net_range}, ${intel.rdap_registration_date}, ${intel.rdap_source},
        ${intel.raw_abuseipdb ? JSON.stringify(intel.raw_abuseipdb) : null}::jsonb,
        ${intel.raw_ipinfo    ? JSON.stringify(intel.raw_ipinfo)    : null}::jsonb,
        ${intel.raw_rdap      ? JSON.stringify(intel.raw_rdap)      : null}::jsonb,
        now(), now() + interval '7 days'
      )
      ON CONFLICT (ip) DO UPDATE
        SET asn = EXCLUDED.asn, org = EXCLUDED.org, isp = EXCLUDED.isp,
            country = EXCLUDED.country, region = EXCLUDED.region, city = EXCLUDED.city,
            is_datacenter = EXCLUDED.is_datacenter, is_tor = EXCLUDED.is_tor,
            is_proxy = EXCLUDED.is_proxy, is_vpn = EXCLUDED.is_vpn,
            abuse_score = EXCLUDED.abuse_score, abuse_reports = EXCLUDED.abuse_reports,
            abuse_last_seen = EXCLUDED.abuse_last_seen,
            reverse_dns = EXCLUDED.reverse_dns,
            rdap_handle = EXCLUDED.rdap_handle, rdap_name = EXCLUDED.rdap_name,
            rdap_registrant = EXCLUDED.rdap_registrant, rdap_abuse_email = EXCLUDED.rdap_abuse_email,
            rdap_net_range = EXCLUDED.rdap_net_range,
            rdap_registration_date = EXCLUDED.rdap_registration_date,
            rdap_source = EXCLUDED.rdap_source,
            raw_abuseipdb = EXCLUDED.raw_abuseipdb, raw_ipinfo = EXCLUDED.raw_ipinfo,
            raw_rdap = EXCLUDED.raw_rdap,
            enriched_at = now(), expires_at = now() + interval '7 days'
    `;
  } catch (err) {
    console.error("[ipintel] cache write failed", err);
  }

  return intel;
}
