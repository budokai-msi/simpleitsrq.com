// Scanner / tool / CVE fingerprinting.
//
// Turns raw (user_agent, path) pairs into a named tool family so the
// OPSEC dashboard can answer "which scanner is hitting us most" instead
// of just counting hits. Also flags CVE-targeted requests so we can
// distinguish opportunistic scanning from active exploitation attempts.
//
// Contract:
//   identifyScanner({ userAgent, path }) → {
//     tool:       canonical short ID (e.g. "nuclei"), or null
//     family:     "scanner" | "exploit" | "recon" | "library" | null
//     cms:        targeted CMS / product (e.g. "wordpress"), or null
//     cve:        targeted CVE / named vuln (e.g. "log4shell"), or null
//     confidence: "high" | "medium" | "low"
//   }
//
// Pure function — no I/O, no state. Safe to call per-request.

// User-agent substrings (lowercase) → tool ID. Order matters: more
// specific matches first (e.g. "wpscan" before "ruby"). High confidence
// because the tool literally announces itself; low-skill operators don't
// bother spoofing the UA.
const UA_SIGNATURES = [
  // --- Vulnerability scanners (named, advertised) ---
  { match: "nuclei",          tool: "nuclei",       family: "scanner" },
  { match: "nikto",           tool: "nikto",        family: "scanner" },
  { match: "sqlmap",          tool: "sqlmap",       family: "exploit" },
  { match: "wpscan",          tool: "wpscan",       family: "scanner", cms: "wordpress" },
  { match: "acunetix",        tool: "acunetix",     family: "scanner" },
  { match: "netsparker",      tool: "netsparker",   family: "scanner" },
  { match: "qualys",          tool: "qualys",       family: "scanner" },
  { match: "nessus",          tool: "nessus",       family: "scanner" },
  { match: "openvas",         tool: "openvas",      family: "scanner" },
  { match: "burpsuite",       tool: "burp",         family: "scanner" },
  { match: "burp",            tool: "burp",         family: "scanner" },
  { match: "zaproxy",         tool: "zap",          family: "scanner" },
  { match: "owasp zap",       tool: "zap",          family: "scanner" },
  { match: "appscan",         tool: "appscan",      family: "scanner" },

  // --- Recon / mapping tools ---
  { match: "masscan",         tool: "masscan",      family: "recon" },
  { match: "zmap",            tool: "zmap",         family: "recon" },
  { match: "zgrab",           tool: "zgrab",        family: "recon" },
  { match: "shodan",          tool: "shodan",       family: "recon" },
  { match: "censys",          tool: "censys",       family: "recon" },
  { match: "binaryedge",      tool: "binaryedge",   family: "recon" },
  { match: "internet-measurement", tool: "research", family: "recon" },
  { match: "research-scan",   tool: "research",     family: "recon" },
  { match: "internetcensus",  tool: "research",     family: "recon" },
  { match: "leakix",          tool: "leakix",       family: "recon" },

  // --- Brute-force / dir-busters ---
  { match: "dirb",            tool: "dirb",         family: "scanner" },
  { match: "dirbuster",       tool: "dirbuster",    family: "scanner" },
  { match: "gobuster",        tool: "gobuster",     family: "scanner" },
  { match: "ffuf",            tool: "ffuf",         family: "scanner" },
  { match: "feroxbuster",     tool: "feroxbuster",  family: "scanner" },
  { match: "wfuzz",           tool: "wfuzz",        family: "scanner" },
  { match: "hydra",           tool: "hydra",        family: "exploit" },
  { match: "medusa",          tool: "medusa",       family: "exploit" },
  { match: "patator",         tool: "patator",      family: "exploit" },

  // --- Generic clients used by scripts (lower confidence) ---
  { match: "go-http-client",  tool: "go-http",      family: "library" },
  { match: "python-requests", tool: "python-req",   family: "library" },
  { match: "python-urllib",   tool: "python-urllib", family: "library" },
  { match: "aiohttp",         tool: "aiohttp",      family: "library" },
  { match: "okhttp",          tool: "okhttp",       family: "library" },
  { match: "ruby",            tool: "ruby",         family: "library" },
  { match: "perl",            tool: "perl",         family: "library" },
  { match: "java/",           tool: "java",         family: "library" },
  { match: "libwww",          tool: "libwww",       family: "library" },
  { match: "wget/",           tool: "wget",         family: "library" },
  { match: "curl/",           tool: "curl",         family: "library" },
];

// Path patterns (regex tested case-insensitively against the URL pathname)
// → product/CMS being targeted. These signal *what* an attacker thinks
// you're running, even when the UA is spoofed to a real browser.
const PATH_SIGNATURES = [
  // WordPress
  { re: /^\/wp-(login|admin|content|includes|json|cron)/i,  cms: "wordpress" },
  { re: /^\/xmlrpc\.php$/i,                                  cms: "wordpress" },
  { re: /^\/wp-config(\.php(\.bak|\.old|~)?)?$/i,            cms: "wordpress" },
  // Joomla
  { re: /^\/administrator(\/|$)/i,                           cms: "joomla" },
  { re: /^\/components\/com_/i,                              cms: "joomla" },
  // Drupal
  { re: /^\/user\/(login|password)/i,                        cms: "drupal" },
  { re: /^\/node\/add/i,                                     cms: "drupal" },
  // phpMyAdmin
  { re: /^\/(phpmyadmin|pma|pmd|mysql|adminer)/i,            cms: "phpmyadmin" },
  // Magento
  { re: /^\/(magento|admin\/dashboard|index\.php\/admin)/i,  cms: "magento" },
  // Tomcat / manager
  { re: /^\/manager\/(html|status|text)/i,                   cms: "tomcat" },
  { re: /^\/host-manager\//i,                                cms: "tomcat" },
  // Jenkins
  { re: /^\/(jenkins|script|computer)/i,                     cms: "jenkins" },
  // Spring Boot Actuator
  { re: /^\/actuator/i,                                      cms: "spring-actuator" },
  // ColdFusion
  { re: /^\/CFIDE\//i,                                       cms: "coldfusion" },
  // Confluence
  { re: /^\/(confluence|setup\/setupadministrator)/i,        cms: "confluence" },
  // Solr
  { re: /^\/solr\//i,                                        cms: "solr" },
  // Webmin
  { re: /^\/webmin/i,                                        cms: "webmin" },
  // CGI
  { re: /^\/cgi-bin\//i,                                     cms: "cgi" },
  // Generic env / git / config leakage
  { re: /^\/\.env(\.|$)/i,                                   cms: "env-leak" },
  { re: /^\/\.git\//i,                                       cms: "git-leak" },
  { re: /^\/\.aws\//i,                                       cms: "aws-leak" },
  { re: /^\/\.svn\//i,                                       cms: "svn-leak" },
  { re: /^\/\.ssh\//i,                                       cms: "ssh-leak" },
  // Server status / info
  { re: /^\/server-(status|info)$/i,                         cms: "apache-info" },
  // .well-known abuse (security.txt enum, change-password discovery)
  { re: /^\/\.well-known\/(traefik|pki-validation)/i,        cms: "config-leak" },
];

// CVE-targeted request signatures. These are exploit *attempts*, not
// reconnaissance — match means an attacker is actively trying to land
// an RCE / SSRF / authentication bypass payload.
const CVE_SIGNATURES = [
  // Log4Shell — JNDI lookup in any header or path-encoded segment
  { re: /\$\{jndi:(ldap|rmi|dns):/i,                         cve: "CVE-2021-44228", name: "log4shell" },
  // Spring4Shell — class.module.classLoader probing
  { re: /class\.module\.classLoader/i,                       cve: "CVE-2022-22965", name: "spring4shell" },
  // ProxyShell (Exchange)
  { re: /\/autodiscover\/autodiscover\.json.*PowerShell/i,   cve: "CVE-2021-34473", name: "proxyshell" },
  // Confluence OGNL (CVE-2022-26134) and related
  { re: /\$\{[^}]*Runtime[^}]*exec/i,                        cve: "CVE-2022-26134", name: "confluence-ognl" },
  // GoAhead / TP-Link RCE
  { re: /\/goform\/(formSysCmd|setSysAdm)/i,                 cve: "GoAhead-RCE",    name: "goahead-rce" },
  // ThinkPHP RCE
  { re: /\?s=\/Index\/\\?think\\?app\/invokefunction/i,      cve: "ThinkPHP-RCE",   name: "thinkphp-rce" },
  // Citrix Bleed / NetScaler
  { re: /\/oauth\/idp\/\.well-known\/openid-configuration/i, cve: "CVE-2023-4966",  name: "citrixbleed" },
  // F5 BIG-IP iControl REST
  { re: /\/mgmt\/tm\/util\/bash/i,                           cve: "CVE-2022-1388",  name: "f5-icontrol" },
  // Apache Path Traversal / RCE (CVE-2021-41773 / 42013)
  { re: /\.\.[/\\]\.\.[/\\](etc|bin|var)/i,                  cve: "CVE-2021-41773", name: "apache-path-traversal" },
  // Generic SQL injection probes
  { re: /(union\s+select|sleep\(\d+\)|benchmark\(\d+,)/i,    cve: "SQLi-probe",     name: "sqli-probe" },
  // Shellshock (still tested by old scanners)
  { re: /\(\)\s*\{\s*:;\s*\}/,                               cve: "CVE-2014-6271",  name: "shellshock" },
  // PHP-CGI Argument Injection (CVE-2024-4577)
  { re: /\?-d\+allow_url_include/i,                          cve: "CVE-2024-4577",  name: "php-cgi-rce" },
];

/**
 * Identify the tool / CMS / CVE behind a single request.
 * Pure — no DB, no fetch, deterministic.
 */
export function identifyScanner({ userAgent = "", path = "" } = {}) {
  const ua = String(userAgent || "").toLowerCase();
  const p  = String(path || "");

  let tool = null;
  let family = null;
  let confidence = "low";

  // 1) UA signatures — strongest signal when present.
  for (const sig of UA_SIGNATURES) {
    if (ua.includes(sig.match)) {
      tool = sig.tool;
      family = sig.family;
      confidence = sig.family === "library" ? "low" : "high";
      break;
    }
  }

  // 2) Path → CMS / product targeted.
  let cms = null;
  for (const sig of PATH_SIGNATURES) {
    if (sig.re.test(p)) { cms = sig.cms; break; }
  }
  // Bind UA-declared CMS (e.g. wpscan) when the path didn't already say.
  if (!cms) {
    const uaSig = UA_SIGNATURES.find((s) => ua.includes(s.match));
    if (uaSig?.cms) cms = uaSig.cms;
  }

  // 3) CVE / exploit attempt — checked across path AND any decoded UA.
  // Many payloads ride in the URL; some land in the UA header itself.
  let cve = null;
  let cveName = null;
  const haystack = `${p} ${ua}`;
  for (const sig of CVE_SIGNATURES) {
    if (sig.re.test(haystack)) { cve = sig.cve; cveName = sig.name; break; }
  }
  if (cve) {
    family = "exploit";
    confidence = "high";
  }

  // 4) If we matched a CMS path but no tool, label as "generic-scanner"
  // so analytics still get a usable bucket instead of dropping the row.
  if (!tool && cms) {
    tool = "generic-scanner";
    family = family || "scanner";
    confidence = "medium";
  }

  return { tool, family, cms, cve, cveName, confidence };
}

/**
 * Bulk variant — accept an array of {userAgent, path} and return a
 * frequency map suitable for chart rendering. Uses the canonical tool
 * ID as the bucket key; null tool entries roll into "unknown".
 */
export function aggregateScanners(rows) {
  const byTool = new Map();
  const byCms  = new Map();
  const byCve  = new Map();
  for (const r of rows) {
    const id = identifyScanner(r);
    const tk = id.tool || "unknown";
    byTool.set(tk, (byTool.get(tk) || 0) + 1);
    if (id.cms) byCms.set(id.cms, (byCms.get(id.cms) || 0) + 1);
    if (id.cve) byCve.set(id.cve, (byCve.get(id.cve) || 0) + 1);
  }
  return {
    tools: [...byTool.entries()].map(([id, hits]) => ({ id, hits })).sort((a, b) => b.hits - a.hits),
    cms:   [...byCms.entries()].map(([id, hits]) => ({ id, hits })).sort((a, b) => b.hits - a.hits),
    cve:   [...byCve.entries()].map(([id, hits]) => ({ id, hits })).sort((a, b) => b.hits - a.hits),
  };
}
