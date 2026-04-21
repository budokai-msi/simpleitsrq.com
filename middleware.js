// middleware.js — Vercel Routing Middleware (framework-agnostic)
//
// Runs at the edge BEFORE any function or static file is served.
// Visitors from CN, RU, KP never see the real site. They get a
// convincing honeypot login page, and every request detail is logged
// to the threat_actors table for intelligence.

import { neon } from "@neondatabase/serverless";
import { getHoneypotPage } from "./api/_lib/honeypot.js";

const HOSTILE_COUNTRIES = new Set(["CN", "RU", "KP"]);

// Comma-separated IPs in IP_ALLOWLIST env var bypass all checks (blocklist,
// scanner traps, hostile geo). Use for the owner's home IP so a stray
// /wp-admin prefetch doesn't lock them out of their own site.
const IP_ALLOWLIST = new Set(
  (process.env.IP_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

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

// ---------------------------------------------------------------------------
// Per-request CSP nonce — lets us drop `'unsafe-inline'` from `style-src`.
// ---------------------------------------------------------------------------
// Fluent UI v9 (Griffel) injects <style> tags at runtime for every component.
// Historically we allowed that with `style-src 'unsafe-inline'`, which is the
// single biggest hole left in the CSP. This middleware now generates a fresh
// 16-byte base64url nonce per request, stamps it onto every HTML response
// (both the response header and a <meta name="csp-nonce"> tag that the
// client-side Griffel renderer reads), and writes the matching
// `'nonce-<value>'` into the `style-src` directive. No inline style without
// the correct nonce can run.
//
// We keep the rest of the CSP (script-src hash-pinned, everything else the
// same) so this change only closes the style hole.
//
// Non-HTML middleware responses (403 blocks, JSON 503s) still get a strict
// CSP without any 'unsafe-inline' — they render no markup so the policy is
// purely defensive. Honeypot HTML gets its own nonce-stamped CSP so the
// fake login page can style itself the same way.

function generateNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // base64url — safe to put in a header and an HTML attribute without escaping.
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildCsp(nonce) {
  // This mirrors the static CSP previously set in vercel.json EXCEPT for the
  // three style-src* directives: `'unsafe-inline'` is replaced with a
  // per-request `'nonce-<value>'`. style-src-attr still uses 'unsafe-inline'
  // because CSP3 nonces only cover <style> elements, not `style="…"`
  // attributes, and Fluent + some third-party embeds set those at runtime.
  const nonceSrc = nonce ? `'nonce-${nonce}'` : "";
  return [
    "default-src 'self'",
    "script-src 'self' 'sha256-s73Ww6tYLJKgSSJJXa6U6kUJkLc849Yhy8mrH2QxT8I=' https://va.vercel-scripts.com https://challenges.cloudflare.com https://vercel.live https://app.cal.com https://embed.cal.com https://www.googletagmanager.com https://pagead2.googlesyndication.com https://adservice.google.com https://www.googleadservices.com https://tpc.googlesyndication.com",
    `style-src 'self' ${nonceSrc} https://vercel.live https://app.cal.com https://pagead2.googlesyndication.com`,
    `style-src-elem 'self' ${nonceSrc} https://vercel.live https://app.cal.com https://pagead2.googlesyndication.com https://fonts.googleapis.com`,
    "style-src-attr 'unsafe-inline'",
    "font-src 'self' data: https://vercel.live https://assets.vercel.com https://fonts.gstatic.com",
    "img-src 'self' data: https://vercel.live https://vercel.com https://cal.com https://app.cal.com https://www.google-analytics.com https://www.googletagmanager.com https://lh3.googleusercontent.com https://avatars.githubusercontent.com https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://www.google.com https://tpc.googlesyndication.com",
    "connect-src 'self' https://vitals.vercel-insights.com https://va.vercel-scripts.com https://api.vercel.com https://challenges.cloudflare.com https://vercel.live wss://ws-us3.pusher.com https://app.cal.com https://cal.com https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://api.pwnedpasswords.com",
    "frame-src 'self' https://challenges.cloudflare.com https://vercel.live https://app.cal.com https://cal.com https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com https://github.com",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

// When middleware needs to fetch the static index.html to substitute the
// nonce placeholder, we set this header so the nested invocation short-circuits
// instead of recursing forever.
const MIDDLEWARE_BYPASS_HEADER = "x-mw-bypass";
const MIDDLEWARE_BYPASS_VALUE = "nonce-fetch";

export const config = {
  matcher: ["/((?!_vercel|_next).*)"],
};

function getIp(request) {
  // Prefer Vercel's authoritative header (not spoofable) over X-Forwarded-For.
  return request.headers.get("x-real-ip")
    || (request.headers.get("x-forwarded-for") || "").split(",")[0].trim()
    || "unknown";
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

// Admin-IP immunity: never auto-block an IP that recently belonged to a
// signed-in admin. Refreshed on every admin login callback with a 7-day
// TTL. Prevents the pattern where the owner's browser prefetches a
// scanner trap and the owner gets auto-banned from their own portal.
async function isAdminImmune(sql, ip) {
  if (!sql || !ip || ip === "unknown") return false;
  try {
    const rows = await sql`
      SELECT 1 FROM admin_ip_immunity WHERE ip = ${ip} AND expires_at > now() LIMIT 1
    `;
    return rows.length > 0;
  } catch { return false; }
}

async function autoBlockIp(sql, ip, reason) {
  if (!sql || !ip || ip === "unknown") return;
  if (await isAdminImmune(sql, ip)) return;
  try {
    const existing = await sql`SELECT 1 FROM ip_blocklist WHERE ip = ${ip}`;
    if (existing.length === 0) {
      await sql`INSERT INTO ip_blocklist (ip, reason) VALUES (${ip}, ${reason})`;
    }
  } catch { /* best effort */ }
}

// Returns the list of OSINT feeds the IP matches right now — used as
// Layer 1.5 (between blocklist and scanner traps) to auto-block any
// visitor whose address is on Spamhaus DROP / EDROP or Emerging
// Threats compromised-IPs. Passive detection becomes active defense.
async function matchOsint(sql, ip) {
  if (!sql || !ip || ip === "unknown") return [];
  try {
    const rows = await sql`
      SELECT feed_name, cidr, category
      FROM threat_feeds
      WHERE ${ip}::inet <<= cidr
      LIMIT 5
    `;
    return rows;
  } catch { return []; }
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

// Strict CSP for middleware-generated non-HTML responses (blocks, 503s).
// No markup runs in these responses, so we don't need any 'unsafe-inline'.
const STRICT_MW_CSP = "default-src 'none'; frame-ancestors 'self'; base-uri 'self'";

const BLOCKED_RESPONSE = () => new Response(null, {
  status: 403,
  headers: { "Cache-Control": "no-store", "Content-Security-Policy": STRICT_MW_CSP },
});
// Honeypot pages in api/_lib/honeypot.js embed their own <style> blocks and
// inline style="…" attributes. Since the honeypot is fake content served to
// attackers (no real data, no real auth), we keep 'unsafe-inline' here so
// the fake UI renders convincingly. The real-site CSP built above is the
// one that matters for user security.
const HONEYPOT_CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data:",
  "script-src 'none'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");
const HONEYPOT_HEADERS = () => ({
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Content-Security-Policy": HONEYPOT_CSP,
});
const API_503 = () => new Response(
  JSON.stringify({ error: "service_unavailable" }),
  {
    status: 503,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Content-Security-Policy": STRICT_MW_CSP,
    },
  },
);

// Per-edge-instance HTML template cache. index.html changes only on deploy,
// and Vercel edge runtimes persist module scope for the lifetime of a cold
// instance, so we can safely memoize the template text and skip the
// subrequest on every page load after the first. Saves ~50-200ms per
// navigation vs. always fetching.
let cachedHtmlTemplate = null;

async function loadHtmlTemplate(request) {
  if (cachedHtmlTemplate !== null) return cachedHtmlTemplate;
  const originUrl = new URL("/index.html", request.url);
  const upstream = await fetch(originUrl, {
    headers: { [MIDDLEWARE_BYPASS_HEADER]: MIDDLEWARE_BYPASS_VALUE },
  });
  if (!upstream.ok) throw new Error(`index.html fetch returned ${upstream.status}`);
  cachedHtmlTemplate = await upstream.text();
  return cachedHtmlTemplate;
}

// Fetches /index.html from the origin, substitutes the __CSP_NONCE__ meta
// placeholder with the per-request nonce, and returns an HTML Response with
// the matching `Content-Security-Policy` header. Used for every SPA route
// navigation (/, /portal, /blog, /admin, ...) once the visitor has cleared
// all the defensive layers. The `x-mw-bypass: nonce-fetch` header on the
// subrequest keeps this middleware from re-intercepting its own fetch.
async function serveHtmlWithNonce(request) {
  const nonce = generateNonce();
  let html;
  try {
    html = await loadHtmlTemplate(request);
  } catch {
    // Fall back to Vercel's default rewrite path if the subrequest fails —
    // we'd rather ship the page without the tighter CSP than serve a 500.
    return;
  }
  // Replace every occurrence defensively, though the template has only one.
  const patched = html.replaceAll("__CSP_NONCE__", nonce);
  return new Response(patched, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": buildCsp(nonce),
      "x-csp-nonce": nonce,
    },
  });
}

// SPA-route predicate. Mirrors the catch-all rewrite in vercel.json
// (`/((?!api/|_vercel/|assets/|fonts/).*)` → /index.html) but is applied in
// the middleware layer so we can substitute the nonce before the response
// leaves the edge. Returning `false` lets the request pass through to the
// real origin (API routes, static assets, honeypot internals, etc.).
function isSpaRoute(pathname) {
  if (pathname.startsWith("/api/")) return false;
  if (pathname.startsWith("/_vercel/")) return false;
  if (pathname.startsWith("/_next/")) return false;
  if (pathname.startsWith("/assets/")) return false;
  if (pathname.startsWith("/fonts/")) return false;
  if (SKIP_EXTENSIONS.test(pathname)) return false;
  return true;
}

export default async function middleware(request) {
  const url = new URL(request.url);

  // Bypass: our own nonce-fetch subrequest must not re-enter this handler.
  if (request.headers.get(MIDDLEWARE_BYPASS_HEADER) === MIDDLEWARE_BYPASS_VALUE) return;

  // Skip static assets.
  if (SKIP_EXTENSIONS.test(url.pathname)) return;

  const ip = getIp(request);
  const geo = getGeo(request);
  const sql = getSql();

  // Layer 0: allowlist — owner/admin IPs skip every defensive check below.
  //   - static allowlist via IP_ALLOWLIST env var
  //   - dynamic allowlist via admin_ip_immunity (populated on admin login)
  //   They still need a nonce-stamped HTML response so the real site's CSP
  //   matches the <meta> tag the React bootstrap reads.
  if (IP_ALLOWLIST.has(ip)) {
    return isSpaRoute(url.pathname) ? await serveHtmlWithNonce(request) : undefined;
  }
  if (await isAdminImmune(sql, ip)) {
    return isSpaRoute(url.pathname) ? await serveHtmlWithNonce(request) : undefined;
  }

  // Layer 1: IP blocklist — already-known bad actors get nothing.
  if (await isBlocked(sql, ip)) return BLOCKED_RESPONSE();

  // Layer 1.5: OSINT auto-block. If the IP is in Spamhaus DROP/EDROP or
  // Emerging Threats, add to the blocklist and serve 403 immediately.
  // Logged as a threat_actor with class=osint_match so the admin can
  // see which feed triggered the block.
  const osintHits = await matchOsint(sql, ip);
  if (osintHits.length > 0) {
    const feeds = osintHits.map((f) => f.feed_name).join(",");
    const p = Promise.all([
      autoBlockIp(sql, ip, `auto: osint match (${feeds})`),
      logThreat(request, geo, "osint_match"),
    ]);
    request.waitUntil?.(p) ?? p.catch(() => {});
    return BLOCKED_RESPONSE();
  }

  // Layer 2: Scanner traps — anyone probing wp-login, .env, phpmyadmin, etc.
  // is a scanner. Instant block, log as threat, serve the multi-page honeypot
  // so they get the full experience (login → dashboard → admin → profile).
  if (isScannerPath(url.pathname)) {
    const p = logThreat(request, geo, "scanner");
    request.waitUntil?.(p) ?? p.catch(() => {});
    const honeypotPage = url.searchParams.get("p") || "login";
    return new Response(getHoneypotPage(honeypotPage), { status: 200, headers: HONEYPOT_HEADERS() });
  }

  // Layer 3: Hostile geo — CN/RU/KP get the honeypot on all page navigations.
  if (HOSTILE_COUNTRIES.has(geo.country)) {
    const p = logThreat(request, geo, "hostile_geo");
    request.waitUntil?.(p) ?? p.catch(() => {});
    if (url.pathname.startsWith("/api/")) return API_503();
    // Serve the appropriate honeypot page based on path
    const honeypotPage = url.searchParams.get("p") || "login";
    return new Response(getHoneypotPage(honeypotPage), { status: 200, headers: HONEYPOT_HEADERS() });
  }

  // All clear — serve the real site. For SPA page navigations we rewrite to
  // /index.html in-middleware (instead of letting vercel.json's catch-all
  // rewrite do it) so we can stamp the per-request nonce into both the
  // <meta name="csp-nonce"> tag and the `style-src` directive. API and
  // static asset requests pass through untouched.
  if (isSpaRoute(url.pathname)) {
    const response = await serveHtmlWithNonce(request);
    if (response) return response;
  }
  return;
}
