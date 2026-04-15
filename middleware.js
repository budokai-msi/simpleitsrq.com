// middleware.js — Vercel Routing Middleware (framework-agnostic)
//
// Runs at the edge BEFORE any function or static file is served.
// Visitors from CN, RU, KP never see the real site. They get a
// convincing honeypot login page, and every request detail is logged
// to the threat_actors table for intelligence.

import { neon } from "@neondatabase/serverless";
import { getHoneypotPage } from "./api/_lib/honeypot.js";

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
  "/.htaccess", "/web.config",
  "/wp-content/", "/wp-includes/",
  "/api/jsonws", "/invoker/JMXInvokerServlet",
  "/solr/", "/jenkins/", "/manager/html",
]);

// Prefix traps — catch /wp-content/*, /wp-includes/*, etc.
const SCANNER_PREFIXES = [
  "/wp-content/", "/wp-includes/",
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
  // is a scanner. Instant block, log as threat, serve the multi-page honeypot
  // so they get the full experience (login → dashboard → admin → profile).
  if (isScannerPath(url.pathname)) {
    const p = logThreat(request, geo, "scanner");
    request.waitUntil?.(p) ?? p.catch(() => {});
    const honeypotPage = url.searchParams.get("p") || "login";
    return new Response(getHoneypotPage(honeypotPage), { status: 200, headers: HONEYPOT_HEADERS });
  }

  // Layer 3: Hostile geo — CN/RU/KP get the honeypot on all page navigations.
  if (HOSTILE_COUNTRIES.has(geo.country)) {
    const p = logThreat(request, geo, "hostile_geo");
    request.waitUntil?.(p) ?? p.catch(() => {});
    if (url.pathname.startsWith("/api/")) return API_503();
    // Serve the appropriate honeypot page based on path
    const honeypotPage = url.searchParams.get("p") || "login";
    return new Response(getHoneypotPage(honeypotPage), { status: 200, headers: HONEYPOT_HEADERS });
  }

  // All clear — proceed to the real site.
  return;
}
