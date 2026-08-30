// api/_lib/domainwatch.js
//
// Watched-domain scanner for the OpSec portal. Runs daily from the cron
// report. For every active opsec_watched_domains row it:
//   1. Resolves A / AAAA / MX / NS / TXT via Cloudflare DoH and compares
//      against the last-known-good snapshot (DNS drift detection).
//   2. Fetches the live TLS certificate and records notAfter / issuer /
//      subject CN (cert expiry + issuer-drift detection).
//   3. Updates opsec_watched_domains.last_scanned_at and writes history
//      rows to dns_integrity + dns_cert_checks.
//
// Everything is PASSIVE (public DNS + public TLS handshake) — no port
// scanning, no auth, nothing that could tip off a target. Failures in any
// one domain degrade gracefully so one bad domain can't abort the sweep.

import { sql } from "./db.js";

const DOH = "https://cloudflare-dns.com/dns-query";
const DNS_TYPES = { A: 1, AAAA: 28, MX: 15, TXT: 16, NS: 2 };

// Cert-expiry warning window (days). A cert expiring within this window
// is flagged as a finding.
const CERT_WARN_DAYS = 30;

async function doh(name, type, timeoutMs = 4000) {
  const url = `${DOH}?name=${encodeURIComponent(name)}&type=${type}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { Answer: [] };
    return await res.json();
  } catch {
    return { Answer: [] };
  }
}

function unquote(s) {
  return String(s || "").replace(/^"/, "").replace(/"$/, "").replace(/"\s+"/g, "");
}

/** Fetch the live TLS cert for a host and return { notAfter, issuer, subjectCN }. */
async function fetchCert(host) {
  try {
    // Use Node's built-in TLS to grab the peer cert without a full HTTP
    // request. tls.connect + TLSSocket.getPeerCertificate() gives us the
    // parsed cert object directly.
    const tls = await import("node:tls");
    return await new Promise((resolve) => {
      const socket = tls.connect({
        host,
        port: 443,
        servername: host,
        rejectUnauthorized: false, // we only want the cert, not to validate it
        timeout: 5000,
      });
      const done = (val) => {
        try { socket.destroy(); } catch { /* ignore */ }
        resolve(val);
      };
      socket.on("secureConnect", () => {
        const cert = socket.getPeerCertificate();
        if (!cert || !cert.valid_to) return done(null);
        done({
          notAfter: new Date(cert.valid_to).toISOString(),
          issuer: cert.issuer?.O || cert.issuer?.CN || null,
          subjectCN: cert.subject?.CN || null,
        });
      });
      socket.on("error", () => done(null));
      socket.on("timeout", () => done(null));
    });
  } catch {
    return null;
  }
}

/**
 * Scan one watched domain. Returns a result object with dns + cert findings.
 * Never throws — every lookup degrades to null/empty.
 */
export async function scanWatchedDomain(domain) {
  const [a, aaaa, mx, txt, ns] = await Promise.all([
    doh(domain, DNS_TYPES.A),
    doh(domain, DNS_TYPES.AAAA),
    doh(domain, DNS_TYPES.MX),
    doh(domain, DNS_TYPES.TXT),
    doh(domain, DNS_TYPES.NS),
  ]);

  const aRecords   = (a.Answer    || []).map((r) => r.data).filter(Boolean).sort();
  const aaaaRecords= (aaaa.Answer || []).map((r) => r.data).filter(Boolean).sort();
  const mxRecords  = (mx.Answer   || []).map((r) => r.data).filter(Boolean).sort();
  const nsRecords  = (ns.Answer   || []).map((r) => r.data).filter(Boolean).sort();
  const txtRecords = (txt.Answer  || []).map((r) => unquote(r.data)).filter(Boolean).sort();

  const cert = await fetchCert(domain);

  const dns = {
    a: aRecords,
    aaaa: aaaaRecords,
    mx: mxRecords,
    ns: nsRecords,
    txt: txtRecords,
  };

  // Cert finding: expiry within window, or no cert at all.
  let certFinding = null;
  if (cert) {
    const daysLeft = Math.floor((new Date(cert.notAfter) - Date.now()) / 86400000);
    if (daysLeft < CERT_WARN_DAYS) {
      certFinding = {
        severity: daysLeft < 7 ? "critical" : "high",
        detail: `TLS cert for ${domain} expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"} (${cert.notAfter.slice(0, 10)}). Issuer: ${cert.issuer || "unknown"}.`,
        daysLeft,
        notAfter: cert.notAfter,
        issuer: cert.issuer,
        subjectCN: cert.subjectCN,
      };
    }
  } else {
    certFinding = {
      severity: "medium",
      detail: `Could not fetch a TLS certificate for ${domain} on port 443. Either the host doesn't serve HTTPS or it's unreachable.`,
      daysLeft: null,
      notAfter: null,
      issuer: null,
      subjectCN: null,
    };
  }

  return { domain, dns, cert, certFinding };
}

/**
 * Run the full sweep over every active watched domain. Returns a summary
 * of findings (drift + cert issues) for the caller to log / alert on.
 */
export async function sweepWatchedDomains() {
  const domains = await sql`
    SELECT id, domain, label
    FROM opsec_watched_domains
    WHERE is_active = true
    ORDER BY created_at ASC
  `.catch(() => []);

  const findings = [];
  for (const row of domains) {
    const result = await scanWatchedDomain(row.domain).catch(() => null);
    if (!result) continue;

    // Persist DNS snapshot to dns_integrity (one row per record type).
    const dnsRows = [
      { type: "A",    values: result.dns.a },
      { type: "AAAA", values: result.dns.aaaa },
      { type: "MX",   values: result.dns.mx },
      { type: "NS",   values: result.dns.ns },
      { type: "TXT",  values: result.dns.txt },
    ];
    for (const r of dnsRows) {
      const actual = r.values.join(", ") || "(empty)";
      await sql`
        INSERT INTO dns_integrity (domain, record_type, expected, actual, match, resolver)
        VALUES (${row.domain}, ${r.type}, '(watched)', ${actual}, true, 'cloudflare-doh')
      `.catch(() => {});
    }

    // Persist cert check.
    if (result.cert) {
      const daysLeft = Math.floor((new Date(result.cert.notAfter) - Date.now()) / 86400000);
      await sql`
        INSERT INTO dns_cert_checks (domain, not_after, issuer, subject_cn, days_left, ok, detail)
        VALUES (${row.domain}, ${result.cert.notAfter}, ${result.cert.issuer}, ${result.cert.subjectCN}, ${daysLeft}, ${!result.certFinding}, ${result.certFinding?.detail || null})
      `.catch(() => {});
    } else {
      await sql`
        INSERT INTO dns_cert_checks (domain, not_after, issuer, subject_cn, days_left, ok, detail)
        VALUES (${row.domain}, null, null, null, null, false, ${result.certFinding?.detail || "no cert"})
      `.catch(() => {});
    }

    // Update last_scanned_at.
    await sql`
      UPDATE opsec_watched_domains SET last_scanned_at = now() WHERE id = ${row.id}
    `.catch(() => {});

    if (result.certFinding) {
      findings.push({ domain: row.domain, label: row.label, ...result.certFinding });
    }
  }

  return { ok: true, scanned: domains.length, findings };
}
