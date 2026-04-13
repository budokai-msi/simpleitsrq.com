// middleware.js — Vercel Routing Middleware (framework-agnostic)
//
// Runs at the edge BEFORE any function or static file is served.
// Visitors from CN, RU, KP never see the real site. They get a
// convincing honeypot login page, and every request detail is logged
// to the threat_actors table for intelligence.

import { neon } from "@neondatabase/serverless";

const HOSTILE_COUNTRIES = new Set(["CN", "RU", "KP"]);

// ── Layer 0: Hardcoded IP blocklist ────────────────────────────────────
// These IPs are blocked at the edge with ZERO database latency. They were
// identified from coordinated attacks against .env, .git, xmlrpc.php,
// wp-login.php, and plugin exploitation vectors.
const HARDCODED_BLOCKLIST = new Map([
  ["52.47.126.220",   "FR — coordinated .env/.git probing"],
  ["208.115.211.186", "FR — .git directory probing"],
  ["66.187.6.102",    "US — .env file targeting"],
  ["20.199.112.200",  "FR — hellopress plugin exploitation"],
  ["177.235.105.185", "BR — xmlrpc.php POST attacks"],
  ["104.28.164.43",   "IN — wp-login brute-force scanning"],
  ["146.70.102.182",  "AE — wp-login brute-force scanning"],
]);

// Paths that no legitimate visitor would ever hit. Anyone requesting these is
// running a scanner — instant block + honeypot + threat log.
const SCANNER_TRAPS = new Set([
  "/wp-login.php", "/wp-admin", "/wp-admin/",
  "/administrator", "/admin", "/admin/",
  "/.env", "/.env.local", "/.env.production",
  "/.env.development", "/.env.staging", "/.env.backup",
  "/.env.bak", "/.env.old", "/.env.save", "/.env.example",
  "/.git/config", "/.git/HEAD", "/.git/index",
  "/.git/logs/HEAD", "/.git/refs/heads/main",
  "/phpmyadmin", "/phpmyadmin/",
  "/xmlrpc.php",
  "/config.php", "/wp-config.php", "/wp-config.php.bak",
  "/cgi-bin/", "/shell", "/cmd",
  "/.aws/credentials",
  "/actuator", "/actuator/health",
  "/api/v1/debug", "/debug",
  "/server-status", "/server-info",
  "/.htaccess", "/.htpasswd",
  "/backup.sql", "/dump.sql", "/db.sql",
  "/.DS_Store",
  "/web.config",
]);

// Prefix traps — catch /wp-content/*, /wp-includes/*, .git/*, etc.
const SCANNER_PREFIXES = [
  "/wp-content/", "/wp-includes/",
  "/.git/",       // block ALL .git sub-paths
  "/.env.",       // catch any .env.* variant not in the exact set above
  "/.svn/", "/.hg/",  // other VCS directories
  "/.well-known/security.txt", // legit, but we don't have one — a scanner guess
];

function isScannerPath(pathname) {
  const lower = pathname.toLowerCase();
  if (SCANNER_TRAPS.has(lower)) return true;
  for (const prefix of SCANNER_PREFIXES) {
    if (lower.startsWith(prefix)) return true;
  }
  return false;
}

// ── In-memory edge rate limiter ────────────────────────────────────────
// Tracks request counts per IP in a sliding window. This is per-isolate
// (not globally shared), but still catches burst attacks before the DB
// blocklist kicks in. Entries auto-expire via a periodic sweep.
const RATE_WINDOW_MS = 60_000; // 1 minute
const RATE_MAX_SCANNER = 3;    // 3 scanner hits in 1 min → instant 403
const RATE_MAX_GLOBAL  = 120;  // 120 req/min per IP across all paths
const rateCounts = new Map();  // ip → { scanner: count, global: count, ts: number }

function rateCheck(ip, isScanner) {
  const now = Date.now();
  let entry = rateCounts.get(ip);
  if (!entry || now - entry.ts > RATE_WINDOW_MS) {
    entry = { scanner: 0, global: 0, ts: now };
    rateCounts.set(ip, entry);
  }
  entry.global++;
  if (isScanner) entry.scanner++;
  return entry.scanner > RATE_MAX_SCANNER || entry.global > RATE_MAX_GLOBAL;
}

// Sweep stale entries every 5 minutes to prevent memory growth.
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW_MS * 2;
  for (const [ip, entry] of rateCounts) {
    if (entry.ts < cutoff) rateCounts.delete(ip);
  }
}, 300_000);

// Skip static assets — only intercept page navigations and API calls.
const SKIP_EXTENSIONS = /\.(js|css|ico|png|jpg|jpeg|svg|woff2?|ttf|eot|map|xml|txt|json|webp|avif)$/i;

export const config = {
  matcher: ["/((?!_vercel|_next).*)"],
};

function getIp(request) {
  return (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
}

function getGeo(request) {
  const h = request.headers;
  return {
    country:  (h.get("x-vercel-ip-country") || "").toUpperCase(),
    region:   h.get("x-vercel-ip-country-region") || null,
    city:     h.get("x-vercel-ip-city") ? decodeURIComponent(h.get("x-vercel-ip-city")) : null,
    latitude: h.get("x-vercel-ip-latitude") || null,
    longitude: h.get("x-vercel-ip-longitude") || null,
    timezone: h.get("x-vercel-ip-timezone") || null,
  };
}

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return neon(url);
}

async function isBlocked(sql, ip) {
  if (!sql || !ip || ip === "unknown") return false;
  try {
    const rows = await sql`SELECT 1 FROM ip_blocklist WHERE ip = ${ip} LIMIT 1`;
    return rows.length > 0;
  } catch { return false; }
}

async function autoBlockIp(sql, ip, reason) {
  if (!sql || !ip || ip === "unknown") return;
  try {
    const existing = await sql`SELECT 1 FROM ip_blocklist WHERE ip = ${ip}`;
    if (existing.length === 0) {
      await sql`INSERT INTO ip_blocklist (ip, reason) VALUES (${ip}, ${reason})`;
    }
  } catch { /* best effort */ }
}

async function logThreat(request, geo, threatClass) {
  try {
    const sql = getSql();
    if (!sql) return;
    const h = request.headers;
    const ip = getIp(request);
    const ua = h.get("user-agent") || null;
    const acceptLang = h.get("accept-language") || null;

    const raw = [ip, ua, acceptLang, geo.timezone].map((v) => String(v ?? "")).join("|");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
    const deviceHash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");

    const headersObj = {};
    for (const [k, v] of h.entries()) {
      if (k.startsWith("x-vercel-") || k === "cookie") continue;
      headersObj[k] = v;
    }

    await sql`
      INSERT INTO threat_actors (
        ip, country, region, city, latitude, longitude,
        user_agent, accept_lang, device_hash,
        path, referrer, method, host, origin,
        headers_json, threat_class
      ) VALUES (
        ${ip}, ${geo.country}, ${geo.region}, ${geo.city}, ${geo.latitude}, ${geo.longitude},
        ${ua}, ${acceptLang}, ${deviceHash},
        ${new URL(request.url).pathname}, ${h.get("referer") || null},
        ${request.method}, ${h.get("host") || null}, ${h.get("origin") || null},
        ${JSON.stringify(headersObj)}::jsonb, ${threatClass}
      )
    `;

    // Scanner traps auto-block on first hit — no 5-strike rule.
    if (threatClass === "scanner") {
      await autoBlockIp(sql, ip, `auto: scanner trap ${new URL(request.url).pathname}`);
    }

    // Enrich the IP inline so the admin dashboard shows intel immediately.
    // Also report scanners to AbuseIPDB so other defenders benefit.
    try {
      const abuseKey = process.env.ABUSEIPDB_API_KEY;
      // ipinfo enrichment (no key needed for free tier)
      const infoRes = await fetch(`https://ipinfo.io/${ip}/json`, { signal: AbortSignal.timeout(3000) });
      if (infoRes.ok) {
        const info = await infoRes.json();
        const orgLower = (info.org || "").toLowerCase();
        const isDc = /amazon|aws|google cloud|microsoft azure|digitalocean|linode|ovh|hetzner|vultr|m247/.test(orgLower);
        await sql`
          INSERT INTO ip_intel (ip, asn, org, isp, country, city, is_datacenter)
          VALUES (${ip}, ${info.asn?.asn || null}, ${info.org || null}, ${info.company?.name || info.org || null},
                  ${info.country || null}, ${info.city || null}, ${isDc})
          ON CONFLICT (ip) DO UPDATE
            SET org = EXCLUDED.org, isp = EXCLUDED.isp, country = EXCLUDED.country,
                city = EXCLUDED.city, is_datacenter = EXCLUDED.is_datacenter,
                enriched_at = now(), expires_at = now() + interval '7 days'
        `;
      }
      // AbuseIPDB check + auto-report for scanners
      if (abuseKey) {
        const checkRes = await fetch(
          `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`,
          { headers: { Key: abuseKey, Accept: "application/json" }, signal: AbortSignal.timeout(3000) },
        );
        if (checkRes.ok) {
          const d = (await checkRes.json()).data || {};
          await sql`
            UPDATE ip_intel
            SET abuse_score = ${d.abuseConfidenceScore ?? null},
                abuse_reports = ${d.totalReports ?? null},
                abuse_last_seen = ${d.lastReportedAt || null},
                is_tor = ${!!d.isTor}
            WHERE ip = ${ip}
          `;
        }
        // Counter-report scanners back to AbuseIPDB
        if (threatClass === "scanner") {
          await fetch("https://api.abuseipdb.com/api/v2/report", {
            method: "POST",
            headers: { Key: abuseKey, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              ip,
              categories: "21,15",
              comment: `Automated scanner probing ${new URL(request.url).pathname} on simpleitsrq.com. Auto-blocked by honeypot trap.`,
            }),
            signal: AbortSignal.timeout(3000),
          });
        }
      }
    } catch { /* enrichment is best-effort */ }
  } catch (err) {
    console.error("[middleware] threat log failed", err);
  }
}

const HONEYPOT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>IT Solutions Portal - Login</title>
<meta name="robots" content="noindex,nofollow">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f5f5;color:#333;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center}
.c{background:#fff;border-radius:12px;box-shadow:0 2px 16px rgba(0,0,0,.08);padding:40px;width:100%;max-width:400px;margin:20px}
.lg{font-size:22px;font-weight:700;color:#1a73e8;text-align:center;margin-bottom:24px}
h1{font-size:18px;text-align:center;margin-bottom:8px}
.s{font-size:14px;color:#666;text-align:center;margin-bottom:24px}
label{display:block;font-size:13px;font-weight:600;margin-bottom:4px;color:#555}
input{width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;margin-bottom:16px}
input:focus{outline:none;border-color:#1a73e8;box-shadow:0 0 0 3px rgba(26,115,232,.12)}
button{width:100%;padding:12px;background:#1a73e8;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer}
button:hover{background:#1557b0}
.f{font-size:11px;color:#999;text-align:center;margin-top:16px}
.ld{display:none;text-align:center;padding:20px}.ld.sh{display:block}.fm.hd{display:none}
</style>
</head>
<body>
<div class="c">
<div class="lg">IT Solutions Portal</div>
<h1>Sign in to your account</h1>
<p class="s">Enter your credentials to access the dashboard</p>
<form id="f" class="fm" onsubmit="return z(event)">
<label for="e">Email address</label>
<input id="e" name="email" type="email" placeholder="you@company.com" required autocomplete="username">
<label for="p">Password</label>
<input id="p" name="password" type="password" placeholder="Enter password" required autocomplete="current-password">
<button type="submit">Sign in</button>
</form>
<div id="ld" class="ld"><p style="color:#1a73e8;font-weight:600">Authenticating...</p><p style="font-size:13px;color:#999;margin-top:8px">Please wait.</p></div>
<p class="f">&copy; 2026 IT Solutions Portal</p>
</div>
<script>
(function(){try{var d={s:screen.width+'x'+screen.height,cd:screen.colorDepth,tz:Intl.DateTimeFormat().resolvedOptions().timeZone,l:navigator.language,ls:navigator.languages?navigator.languages.join(','):'',p:navigator.platform,c:navigator.hardwareConcurrency,m:navigator.deviceMemory,t:navigator.maxTouchPoints,r:devicePixelRatio,cn:navigator.connection?navigator.connection.effectiveType:null,wgl:(function(){try{var c=document.createElement('canvas'),g=c.getContext('webgl');return g?g.getParameter(g.RENDERER):null}catch(e){return null}})(),pl:navigator.plugins?Array.from(navigator.plugins).map(function(p){return p.name}).slice(0,10):[],cv:(function(){try{var c=document.createElement('canvas'),x=c.getContext('2d');x.fillText('test',10,10);return c.toDataURL().slice(-20)}catch(e){return null}})()};navigator.sendBeacon('/api/hp',JSON.stringify({type:'probe',d:d}))}catch(e){}})();
function z(e){e.preventDefault();try{navigator.sendBeacon('/api/hp',JSON.stringify({type:'cred',email:document.getElementById('e').value,ts:Date.now()}))}catch(x){}document.getElementById('f').className='fm hd';document.getElementById('ld').className='ld sh';setTimeout(function(){document.getElementById('ld').innerHTML='<p style="color:#c00;font-weight:600">Authentication failed</p><p style="font-size:13px;color:#999;margin-top:8px">Invalid credentials. Contact your administrator.</p>'},3000);return false}
</script>
</body>
</html>`;

const BLOCKED_RESPONSE = new Response(null, { status: 403, headers: { "Cache-Control": "no-store" } });
const HONEYPOT_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
};
const API_503 = () => new Response(
  JSON.stringify({ error: "service_unavailable" }),
  { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
);

export default async function middleware(request) {
  const url = new URL(request.url);

  // Skip static assets.
  if (SKIP_EXTENSIONS.test(url.pathname)) return;

  const ip = getIp(request);
  const geo = getGeo(request);

  // Layer 0: Hardcoded IP blocklist — zero-latency edge block, no DB round trip.
  if (HARDCODED_BLOCKLIST.has(ip)) return BLOCKED_RESPONSE;

  const isScanner = isScannerPath(url.pathname);

  // Layer 0.5: In-memory rate limiter — catches burst attacks before the DB
  // blocklist kicks in. Scanner paths have a very low threshold (3/min).
  if (rateCheck(ip, isScanner)) return BLOCKED_RESPONSE;

  const sql = getSql();

  // Layer 1: DB-backed IP blocklist — dynamically-added bad actors.
  if (await isBlocked(sql, ip)) return BLOCKED_RESPONSE;

  // Layer 2: Scanner traps — anyone probing wp-login, .env, phpmyadmin, etc.
  // is a scanner. Instant block, log as threat, serve honeypot to waste time.
  if (isScanner) {
    const p = logThreat(request, geo, "scanner");
    request.waitUntil?.(p) ?? p.catch(() => {});
    return new Response(HONEYPOT_HTML, { status: 200, headers: HONEYPOT_HEADERS });
  }

  // Layer 3: Hostile geo — CN/RU/KP get the honeypot on all page navigations.
  if (HOSTILE_COUNTRIES.has(geo.country)) {
    const p = logThreat(request, geo, "hostile_geo");
    request.waitUntil?.(p) ?? p.catch(() => {});
    if (url.pathname.startsWith("/api/")) return API_503();
    return new Response(HONEYPOT_HTML, { status: 200, headers: HONEYPOT_HEADERS });
  }

  // All clear — proceed to the real site.
  return;
}
