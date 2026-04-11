// POST /api/hp — Honeypot beacon receiver.
//
// Captures extra intel sent by the honeypot page's client-side JS:
//   type:"probe" — passive device signals (WebGL renderer, canvas hash, plugins)
//   type:"cred"  — attempted login credentials (email the attacker typed)
//
// Everything goes into security_events with kind "honeypot.*".

import { sql } from "./_lib/db.js";

const noContent = () => new Response(null, { status: 204 });

export async function POST(request) {
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const ua = request.headers.get("user-agent") || null;
  const country = request.headers.get("x-vercel-ip-country") || null;

  let body = {};
  try { body = await request.json(); } catch { return noContent(); }

  const type = String(body.type || "unknown").slice(0, 16);

  if (type === "probe") {
    try {
      await sql`
        INSERT INTO security_events (kind, severity, ip, user_agent, path, detail)
        VALUES (
          'honeypot.probe', 'warn', ${ip}, ${ua}, '/api/hp',
          ${JSON.stringify({
            country,
            screen: body.d?.s,
            colorDepth: body.d?.cd,
            tz: body.d?.tz,
            lang: body.d?.l,
            langs: body.d?.ls,
            platform: body.d?.p,
            cores: body.d?.c,
            mem: body.d?.m,
            touch: body.d?.t,
            dpr: body.d?.r,
            connection: body.d?.cn,
            webglRenderer: body.d?.wgl,
            plugins: body.d?.pl,
            canvasHash: body.d?.cv,
          })}::jsonb
        )
      `;
    } catch { /* best effort */ }
  }

  if (type === "cred") {
    try {
      await sql`
        INSERT INTO security_events (kind, severity, ip, user_agent, path, detail)
        VALUES (
          'honeypot.credential', 'critical', ${ip}, ${ua}, '/api/hp',
          ${JSON.stringify({
            country,
            email: String(body.email || "").slice(0, 320),
            ts: body.ts,
          })}::jsonb
        )
      `;
    } catch { /* best effort */ }
  }

  return noContent();
}
