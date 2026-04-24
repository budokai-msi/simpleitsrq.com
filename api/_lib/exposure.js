// Passive exposure-surface scanner.
//
// Given a domain, runs a bounded set of public-internet lookups that
// would normally be spread across several tools and explains the
// result in plain English. Everything is PASSIVE — no port scanning,
// no authenticated requests, no anything that could tip off the
// target or violate a TOS. The goal is to look like a free preview
// of "here's what an attacker sees about you without even trying".
//
// Sources (all public, no API keys, all free):
//   • Cloudflare DoH (cloudflare-dns.com) for A / MX / TXT / DMARC /
//     SPF / DKIM lookups — no local resolver dependency needed.
//   • crt.sh JSON endpoint for Certificate Transparency subdomain
//     enumeration — every TLS cert issued for the domain is in there.
//
// Nothing here should throw — failures in any one lookup degrade
// gracefully so the report still renders with partial data.

const DOH = "https://cloudflare-dns.com/dns-query";
const CRT_SH = "https://crt.sh/?output=json&q=";

// DNS record types Cloudflare DoH accepts by integer code.
const DNS_TYPES = { A: 1, AAAA: 28, MX: 15, TXT: 16, CNAME: 5, NS: 2 };

// Common DKIM selectors a publisher might use. We guess-and-check a
// handful because there's no RFC-standard way to enumerate selectors
// without the private key; these cover most SaaS email providers.
const DKIM_SELECTORS = [
  "resend", "selector1", "selector2", "google", "k1", "k2", "mail",
  "dkim", "zoho", "mailchimp", "mandrill", "sendgrid", "amazonses",
  "smtpapi", "fastmail",
];

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

/** Strip the DNS-quoted wire format ("v=spf1 ..."). */
function unquote(s) {
  return String(s || "").replace(/^"/, "").replace(/"$/, "").replace(/"\s+"/g, "");
}

/** Normalize a user-entered domain — strip scheme, path, trailing dot. */
export function normalizeDomain(raw) {
  if (!raw) return "";
  let d = String(raw).trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "");
  d = d.replace(/^www\./, "");
  d = d.split("/")[0].split("?")[0];
  d = d.replace(/\.+$/, "");
  // Minimum sanity check — at least one dot, no spaces, no weird chars.
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(d)) return "";
  return d;
}

async function scanDkim(domain) {
  // Try the selector list in parallel — whichever returns a valid v=DKIM1
  // record wins. We stop reporting after the first 3 to keep the output
  // scannable.
  const probes = await Promise.all(
    DKIM_SELECTORS.map(async (sel) => {
      const r = await doh(`${sel}._domainkey.${domain}`, DNS_TYPES.TXT, 3000);
      const txt = (r.Answer || []).map((a) => unquote(a.data)).join(" ");
      if (/v=DKIM1/i.test(txt)) return { selector: sel, present: true };
      return null;
    }),
  );
  return probes.filter(Boolean).slice(0, 3);
}

async function scanSubdomains(domain) {
  // crt.sh returns a long list of every cert ever issued. We de-dupe
  // by name and cap at 30 to keep the UI readable. No auth, ~1s.
  try {
    const res = await fetch(`${CRT_SH}${encodeURIComponent("%." + domain)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const rows = await res.json().catch(() => []);
    const names = new Set();
    for (const r of rows) {
      const n = String(r.name_value || "").toLowerCase();
      for (const line of n.split(/\n+/)) {
        const clean = line.trim();
        if (!clean || clean.startsWith("*")) continue;
        if (clean === domain) continue;
        if (clean.endsWith("." + domain)) names.add(clean);
      }
    }
    return [...names].sort().slice(0, 30);
  } catch {
    return [];
  }
}

/**
 * Run a full scan. Returns a structured report with findings +
 * plain-English summary + overall grade.
 */
export async function runExposureScan(rawDomain) {
  const domain = normalizeDomain(rawDomain);
  if (!domain) {
    return { ok: false, error: "invalid_domain" };
  }

  const [a, aaaa, mx, txt, dmarcTxt, subdomains, dkim, ns] = await Promise.all([
    doh(domain,          DNS_TYPES.A),
    doh(domain,          DNS_TYPES.AAAA),
    doh(domain,          DNS_TYPES.MX),
    doh(domain,          DNS_TYPES.TXT),
    doh(`_dmarc.${domain}`, DNS_TYPES.TXT),
    scanSubdomains(domain),
    scanDkim(domain),
    doh(domain,          DNS_TYPES.NS),
  ]);

  const aRecords   = (a.Answer    || []).map((r) => r.data).filter(Boolean);
  const aaaaRecords= (aaaa.Answer || []).map((r) => r.data).filter(Boolean);
  const mxRecords  = (mx.Answer   || []).map((r) => r.data).filter(Boolean);
  const nsRecords  = (ns.Answer   || []).map((r) => r.data).filter(Boolean);
  const txtRecords = (txt.Answer  || []).map((r) => unquote(r.data));
  const dmarcRecords = (dmarcTxt.Answer || []).map((r) => unquote(r.data));

  const spf = txtRecords.find((t) => /^v=spf1\b/i.test(t)) || null;
  const dmarc = dmarcRecords.find((t) => /^v=DMARC1\b/i.test(t)) || null;

  // Grade individual controls, then roll up.
  const findings = [];

  // MX presence
  if (mxRecords.length === 0) {
    findings.push({
      area: "Email receiving",
      severity: "critical",
      title: "No MX records — this domain can't receive email",
      detail: "Every inbound message to your domain will bounce. Either set up MX records (Cloudflare Email Routing, Google Workspace, ImprovMX) or accept that email@yourdomain.com will never deliver.",
    });
  }

  // SPF presence and strength
  if (!spf) {
    findings.push({
      area: "Email sending",
      severity: "high",
      title: "No SPF record",
      detail: "Without SPF, any attacker can send email claiming to be from your domain. Gmail and Outlook will still accept it — your customers won't know it's fake. Add a TXT record: v=spf1 include:<your-mail-provider> ~all",
    });
  } else if (!/[~-]all\s*$/.test(spf)) {
    findings.push({
      area: "Email sending",
      severity: "medium",
      title: "SPF exists but doesn't enforce",
      detail: `Your SPF ends with '?all' or '+all' instead of '~all' or '-all'. That tells receivers "accept anyone." Change to '~all' (soft-fail) or '-all' (hard-fail). Current: ${spf}`,
    });
  }

  // DMARC presence and policy
  if (!dmarc) {
    findings.push({
      area: "Email sending",
      severity: "high",
      title: "No DMARC record",
      detail: "DMARC tells Gmail/Outlook what to do with spoofed mail claiming to be from your domain. Without it, spammers can forge you with impunity. Minimum fix: add a TXT record at _dmarc.yourdomain.com with 'v=DMARC1; p=none; rua=mailto:you@yourdomain.com' to start getting reports.",
    });
  } else {
    const policyMatch = dmarc.match(/p=(\w+)/i);
    const policy = policyMatch ? policyMatch[1].toLowerCase() : "unknown";
    if (policy === "none") {
      findings.push({
        area: "Email sending",
        severity: "medium",
        title: "DMARC is in monitoring mode (p=none)",
        detail: "You're collecting reports but not blocking spoofed mail. Once you've confirmed your legit senders are SPF/DKIM-aligned (usually 2-4 weeks), upgrade to p=quarantine or p=reject.",
      });
    }
  }

  // DKIM presence
  if (dkim.length === 0) {
    findings.push({
      area: "Email sending",
      severity: "low",
      title: "No DKIM record found (common selectors checked)",
      detail: `We tried ${DKIM_SELECTORS.length} common DKIM selectors (resend, google, selector1, etc.) and didn't find a signing key. If you don't send email from this domain, that's fine — but if you do, your outgoing mail is probably unsigned.`,
    });
  }

  // Subdomain exposure
  if (subdomains.length >= 10) {
    findings.push({
      area: "Attack surface",
      severity: "info",
      title: `${subdomains.length}+ subdomains exposed in Certificate Transparency logs`,
      detail: "CT logs are public and searchable by every scanner on the internet. Every subdomain listed (staging, dev, vpn, etc.) is a potential target. Review the list below — if any of these aren't supposed to be public, they need to be off the internet or behind auth.",
    });
  }

  // IPv6 presence
  if (aRecords.length > 0 && aaaaRecords.length === 0) {
    findings.push({
      area: "Modern readiness",
      severity: "info",
      title: "No IPv6 (AAAA) records",
      detail: "Most of the internet now runs on IPv6. Missing AAAA means your site is harder to reach from mobile networks that have gone IPv6-only. Cosmetic, not a security issue.",
    });
  }

  // Overall grade
  const critical = findings.filter((f) => f.severity === "critical").length;
  const high     = findings.filter((f) => f.severity === "high").length;
  const medium   = findings.filter((f) => f.severity === "medium").length;

  let grade = "A";
  let gradeNarrative = "Your domain is in good shape. Keep monitoring DMARC reports and review exposed subdomains quarterly.";
  if (critical > 0) {
    grade = "F";
    gradeNarrative = "You have a critical exposure problem. Start with the critical findings below — they're things a real attacker would notice and use.";
  } else if (high >= 2) {
    grade = "D";
    gradeNarrative = "Your email-sending posture is weak enough that attackers can spoof your domain convincingly. Fix the SPF + DMARC gaps this week.";
  } else if (high === 1) {
    grade = "C";
    gradeNarrative = "One important gap in your email authentication. Not catastrophic, but worth fixing before a customer gets phished with your name on the envelope.";
  } else if (medium > 0) {
    grade = "B";
    gradeNarrative = "Basics are covered; a few quality tweaks remaining. You're ahead of most small businesses.";
  }

  return {
    ok: true,
    domain,
    generatedAt: new Date().toISOString(),
    grade,
    gradeNarrative,
    findings,
    records: {
      a: aRecords,
      aaaa: aaaaRecords,
      mx: mxRecords,
      ns: nsRecords,
      spf,
      dmarc,
      dkimSelectors: dkim.map((d) => d.selector),
    },
    subdomains,
    counts: { critical, high, medium, low: findings.filter((f) => f.severity === "low").length },
  };
}
