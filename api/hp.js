// POST /api/hp — Honeypot beacon receiver.
//
// Captures extra intel sent by the honeypot page's client-side JS:
//   type:"probe" — passive device signals (WebGL renderer, canvas hash, plugins)
//   type:"cred"  — attempted login credentials (email/password the attacker typed)
//   type:"<custom>" — page interaction events ("login-success", "admin-view", etc.)
//
// Beacon body shape: { type, page?, d?: { ... }, detail?: { ... }, ts? }
// Everything goes into security_events with kind "honeypot.*".

import { sql } from "./_lib/db.js";
import { clientIp, rateLimit } from "./_lib/security.js";

const noContent = () => new Response(null, { status: 204 });

const ALLOWED_TYPE = /^[a-z0-9_-]{1,32}$/i;

// SHA-256 with a secret pepper so captured honeypot passwords are useful for
// correlation without keeping cleartext. Set HP_PW_PEPPER in env for stable
// hashes across deploys; falls back to a process-local random value so
// hashes are never repo-predictable.
const PW_PEPPER = process.env.HP_PW_PEPPER || crypto.randomUUID();
const PW_MAX_LEN = 1024;
async function hashPw(pw) {
  if (!pw) return null;
  try {
    const capped = pw.length > PW_MAX_LEN ? pw.slice(0, PW_MAX_LEN) : pw;
    const data = new TextEncoder().encode(PW_PEPPER + ":" + capped);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

export async function POST(request) {
  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") || null;
  const country = request.headers.get("x-vercel-ip-country") || null;

  // Rate limit: 60 beacons per minute per IP. Legitimate honeypot beacons
  // from a single probing browser are well under this. Burst-mode scanners
  // flooding us with fake creds get 204'd silently above the cap.
  const rl = await rateLimit({ ip, bucket: "hp", windowSeconds: 60, max: 60 });
  if (!rl.ok) return noContent();

  let body = {};
  try { body = await request.json(); } catch { return noContent(); }

  const type = String(body.type || "unknown").slice(0, 32);
  if (!ALLOWED_TYPE.test(type)) return noContent();

  // The page that fired the beacon (login | dashboard | admin | profile)
  const page = body.page ? String(body.page).slice(0, 64) : null;
  const ts = body.ts ?? null;
  const d = body.d || {};
  const customDetail = body.detail || null;

  if (type === "probe") {
    try {
      await sql`
        INSERT INTO security_events (kind, severity, ip, user_agent, path, detail)
        VALUES (
          'honeypot.probe', 'warn', ${ip}, ${ua}, ${page || '/api/hp'},
          ${JSON.stringify({
            country,
            page,
            screen: d.s,
            colorDepth: d.cd,
            tz: d.tz,
            lang: d.l,
            langs: d.ls,
            platform: d.p,
            cores: d.c,
            mem: d.m,
            touch: d.t,
            dpr: d.r,
            connection: d.cn,
            webglRenderer: d.wgl,
            plugins: d.pl,
            canvasHash: d.cv,
          })}::jsonb
        )
      `;
    } catch { /* best effort */ }
    return noContent();
  }

  if (type === "cred") {
    // Beacon shape: { type: 'cred', d: { email, password?, ts, page } }
    // Older clients may send { type: 'cred', email, ts } — accept both.
    const email = String(d.email ?? body.email ?? "").slice(0, 320);
    const rawPw = String(d.password ?? body.password ?? "").slice(0, PW_MAX_LEN);
    // Intentionally never store the cleartext password. Keep a salted SHA-256
    // for correlation + length/first-char fingerprint for behavioral signal.
    const passwordHash = rawPw ? await hashPw(rawPw) : null;
    const passwordShape = rawPw
      ? { length: rawPw.length, firstChar: rawPw.slice(0, 1) }
      : null;
    try {
      await sql`
        INSERT INTO security_events (kind, severity, ip, user_agent, path, detail)
        VALUES (
          'honeypot.credential', 'critical', ${ip}, ${ua}, ${page || '/api/hp'},
          ${JSON.stringify({
            country,
            page,
            email,
            passwordHash,
            passwordShape,
            ts: d.ts ?? ts,
          })}::jsonb
        )
      `;
    } catch { /* best effort */ }
    return noContent();
  }

  // Catch-all for custom interaction beacons (login-success, admin-view, etc.).
  // Stored as honeypot.<type> so the dashboard can group by event class.
  try {
    await sql`
      INSERT INTO security_events (kind, severity, ip, user_agent, path, detail)
      VALUES (
        ${`honeypot.${type}`}, 'info', ${ip}, ${ua}, ${page || '/api/hp'},
        ${JSON.stringify({ country, page, detail: customDetail, ts })}::jsonb
      )
    `;
  } catch { /* best effort */ }

  return noContent();
}

// ───────────────────────────────────────────────────────────────────
// Canary GET handler — vercel.json rewrites classic attacker-recon
// paths (/.env, /wp-admin, /backup.zip, etc.) into this endpoint with
// ?canary=1&orig=<path>. Any hit is unambiguously malicious: these
// URLs are not linked, not in sitemap, and only show up in scanner
// wordlists. We log, auto-block, and return fake-but-plausible
// content so the scanner's "200 OK" heuristic keeps them engaged
// with a dead end while we build the intel file on them.
// ───────────────────────────────────────────────────────────────────
export async function GET(request) {
  const url = new URL(request.url);
  const canary = url.searchParams.get("canary");
  if (canary !== "1") return new Response(null, { status: 404 });

  const orig = url.searchParams.get("orig") || "unknown";
  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") || null;
  const country = request.headers.get("x-vercel-ip-country") || null;
  const referrer = request.headers.get("referer") || null;

  // Rate limit: 30 canary trips per minute per IP. A determined scanner
  // will hit this fast; after the cap we stop logging duplicates but
  // still return fake content.
  const rl = await rateLimit({ ip, bucket: "hp_canary", windowSeconds: 60, max: 30 });

  if (rl.ok) {
    // Log to threat_actors so the CTI dashboard treats this like any
    // other hostile signal, and to security_events as a CRITICAL hit.
    try {
      await sql`
        INSERT INTO threat_actors (ip, country, user_agent, path, method, threat_class)
        VALUES (${ip}, ${country}, ${ua}, ${orig}, 'GET', 'canary_trip')
      `;
    } catch { /* best effort */ }
    try {
      await sql`
        INSERT INTO security_events (kind, severity, ip, user_agent, path, detail)
        VALUES (
          'canary.trip', 'critical', ${ip}, ${ua}, ${orig},
          ${JSON.stringify({ country, referrer, canaryPath: orig })}::jsonb
        )
      `;
    } catch { /* best effort */ }
    // Auto-block: 30-day ban. Canary trips are unambiguous malicious
    // intent — no legit user or crawler ever hits these paths.
    try {
      await sql`
        INSERT INTO ip_blocklist (ip, reason, expires_at)
        VALUES (${ip}, ${`canary: ${orig}`}, now() + interval '30 days')
        ON CONFLICT (ip) DO UPDATE
          SET reason = EXCLUDED.reason,
              expires_at = EXCLUDED.expires_at
      `;
    } catch { /* best effort */ }
  }

  return canaryResponse(orig);
}

// Return fake-but-plausible content per path shape. The goal is not to
// trick a human — it's to keep automated scanners hitting a dead end
// rather than moving on to real attack surface. A 200 with a login form
// shape is more enticing to a scanner than a 404.
function canaryResponse(origPath) {
  const p = origPath.toLowerCase();
  const html200 = (body) => new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" },
  });
  const text200 = (body) => new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" },
  });

  if (p.includes(".env")) {
    return text200(
      "# Environment\nNODE_ENV=production\n# The other values have been redacted by canary middleware.\n"
    );
  }
  if (p.includes("/.git/head")) return text200("ref: refs/heads/main\n");
  if (p.includes("/.git/config")) {
    return text200("[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n");
  }
  if (p.includes("/.git")) return text200("");
  if (p.endsWith(".zip") || p.endsWith(".sql") || p.endsWith(".tar.gz") || p.endsWith(".bak")) {
    return new Response("", { status: 403 });
  }
  if (p.includes("phpmyadmin") || p.includes("adminer")) {
    return html200(`<!DOCTYPE html><html><head><title>phpMyAdmin</title></head><body><h3>Sign in</h3><form method="post"><label>Username<input name="pma_username" autocomplete="off"></label><label>Password<input type="password" name="pma_password"></label><button>Go</button></form></body></html>`);
  }
  if (p.includes("wp-admin") || p.includes("wp-login")) {
    return html200(`<!DOCTYPE html><html><head><title>Log In</title></head><body><form method="post"><label>Username or Email<input name="log" autocomplete="off"></label><label>Password<input type="password" name="pwd"></label><input type="hidden" name="redirect_to" value="/wp-admin/"><button>Log In</button></form></body></html>`);
  }
  if (p.includes("admin") || p.includes(".php") || p.includes("server-status")) {
    return html200(`<!DOCTYPE html><html><head><title>Administrator</title></head><body><form method="post"><label>User<input name="username" autocomplete="off"></label><label>Pass<input type="password" name="password"></label><button>Sign in</button></form></body></html>`);
  }
  if (p.includes(".ds_store")) return new Response("", { status: 403 });
  return new Response("", { status: 404 });
}
