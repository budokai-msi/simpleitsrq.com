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

const noContent = () => new Response(null, { status: 204 });

const ALLOWED_TYPE = /^[a-z0-9_-]{1,32}$/i;

export async function POST(request) {
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const ua = request.headers.get("user-agent") || null;
  const country = request.headers.get("x-vercel-ip-country") || null;

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
    const password = String(d.password ?? body.password ?? "").slice(0, 200);
    try {
      await sql`
        INSERT INTO security_events (kind, severity, ip, user_agent, path, detail)
        VALUES (
          'honeypot.credential', 'critical', ${ip}, ${ua}, ${page || '/api/hp'},
          ${JSON.stringify({
            country,
            page,
            email,
            password: password || null,
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
