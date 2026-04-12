// middleware.js — Vercel Routing Middleware (framework-agnostic)
//
// Runs at the edge BEFORE any function or static file is served.
// Visitors from CN, RU, KP never see the real site. They get a
// convincing honeypot login page, and every request detail is logged
// to the threat_actors table for intelligence.

import { neon } from "@neondatabase/serverless";

const HOSTILE_COUNTRIES = new Set(["CN", "RU", "KP"]);

// Paths that no legitimate visitor would ever hit. Anyone requesting these is
// running a scanner — instant block + honeypot + threat log.
const SCANNER_TRAPS = new Set([
  "/wp-login.php", "/wp-admin", "/wp-admin/",
  "/administrator", "/admin", "/admin/",
  "/.env", "/.env.local", "/.env.production",
  "/.git/config", "/.git/HEAD",
  "/phpmyadmin", "/phpmyadmin/",
  "/xmlrpc.php",
  "/config.php", "/wp-config.php",
  "/cgi-bin/", "/shell", "/cmd",
  "/.aws/credentials",
  "/actuator", "/actuator/health",
  "/api/v1/debug", "/debug",
  "/server-status", "/server-info",
]);

// Prefix traps — catch /wp-content/*, /wp-includes/*, etc.
const SCANNER_PREFIXES = [
  "/wp-content/", "/wp-includes/",
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
  const sql = getSql();

  // Layer 1: IP blocklist — already-known bad actors get nothing.
  if (await isBlocked(sql, ip)) return BLOCKED_RESPONSE;

  // Layer 2: Scanner traps — anyone probing wp-login, .env, phpmyadmin, etc.
  // is a scanner. Instant block, log as threat, serve honeypot to waste time.
  if (isScannerPath(url.pathname)) {
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
