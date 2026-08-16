// /api/leadgen-integrations — intentionally small outbound integration surface.
// CSV export is client-side. Server-side integrations are HubSpot and a generic
// webhook, which covers automation platforms without one-off adapters.

import dns from "node:dns/promises";
import net from "node:net";
import { json } from "./_lib/http.js";
import { sql } from "./_lib/db.js";
import { getSession } from "./_lib/session.js";
import { clientIp, rateLimit } from "./_lib/security.js";
import { encryptSecret, decryptSecret } from "./_lib/crypto.js";

const ALLOWED_PLANS = new Set(["growth", "pro", "lifetime", "exclusive"]);
const VALID_KINDS = new Set(["hubspot", "webhook"]);
const MAX_PUSH_LEADS = 100;

function safeError(error) {
  return String(error?.message || error || "Integration failed")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [redacted]")
    .replace(/([?&](?:api[_-]?key|token|secret|access_token)=)[^&\s]+/gi, "$1[redacted]")
    .slice(0, 220);
}

function isPrivateAddress(address) {
  if (!address) return true;
  if (net.isIPv4(address)) {
    const p = address.split(".").map(Number);
    return p[0] === 0 || p[0] === 10 || p[0] === 127 || (p[0] === 169 && p[1] === 254)
      || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168)
      || p[0] >= 224;
  }
  if (net.isIPv6(address)) {
    const lower = address.toLowerCase();
    return lower === "::1" || lower === "::" || lower.startsWith("fc") || lower.startsWith("fd") || /^fe[89ab]/.test(lower);
  }
  return true;
}

async function assertPublicWebhook(input) {
  let url;
  try { url = new URL(String(input || "")); }
  catch { throw new Error("Webhook URL is invalid."); }
  if (!/^https?:$/.test(url.protocol)) throw new Error("Webhook must use HTTP or HTTPS.");
  const host = url.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) throw new Error("Webhook host is not public.");
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("Webhook host is not public.");
    return url;
  }
  const records = await dns.lookup(host, { all: true, verbatim: true });
  if (!records.length || records.some((record) => isPrivateAddress(record.address))) throw new Error("Webhook host is not public.");
  return url;
}

async function requireSession(request) {
  const session = await getSession(request);
  if (!session) return { error: json(401, { ok: false, error: "unauthorized" }) };
  const { plan, isAdmin } = session.user;
  if (!isAdmin && !ALLOWED_PLANS.has(plan)) {
    return {
      error: json(403, {
        ok: false,
        error: "plan_required",
        message: "Integrations are available on Growth, Pro, and Lifetime plans.",
        upgrade_url: "/leadgen#pricing",
      }),
    };
  }
  return { user: session.user };
}

async function pushWebhook(config, leads) {
  const target = await assertPublicWebhook(config?.url);
  const headers = { "Content-Type": "application/json", "User-Agent": "simpleitsrq-leadgen/2.0" };
  if (config?.secret) headers["X-Webhook-Secret"] = String(config.secret);
  const response = await fetch(target, {
    method: "POST",
    headers,
    redirect: "manual",
    body: JSON.stringify({ leads, sent_at: new Date().toISOString() }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Webhook returned ${response.status}`);
  return { sent: leads.length };
}

async function pushHubspot(config, leads) {
  const accessToken = String(config?.access_token || "").trim();
  if (!accessToken) throw new Error("HubSpot access token required.");
  const results = await Promise.allSettled(
    leads.map((lead) =>
      fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          properties: {
            email: lead.email || "",
            company: lead.name || "",
            phone: lead.phone || "",
            address: lead.address || "",
            city: lead.city || "",
            state: lead.state || "",
            zip: lead.zip || "",
            website: lead.website || "",
            industry: lead.industry_group || lead.industry || "",
            leadsource: "Simple IT SRQ Leadgen",
          },
        }),
        signal: AbortSignal.timeout(10000),
      }).then(async (response) => {
        if (response.ok) return response.json().catch(() => ({}));
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || `HubSpot ${response.status}`);
      })
    )
  );
  return {
    sent: results.filter((result) => result.status === "fulfilled").length,
    failed: results.filter((result) => result.status === "rejected").length,
  };
}

export async function dispatchPush(integration, leads) {
  if (integration.kind === "hubspot") return pushHubspot(integration.config, leads);
  if (integration.kind === "webhook") return pushWebhook(integration.config, leads);
  throw new Error("Unsupported integration.");
}

async function handleGet(user) {
  const rows = await sql`
    SELECT id, kind, label, enabled, last_used_at, last_error, created_at
    FROM user_integrations
    WHERE user_id=${user.id} AND kind IN ('hubspot','webhook')
    ORDER BY created_at DESC
  `;
  return json(200, { ok: true, integrations: rows, supported_kinds: ["hubspot", "webhook"] });
}

async function handleUpsert(user, body) {
  const kind = String(body?.kind || "").toLowerCase();
  if (!VALID_KINDS.has(kind)) {
    return json(400, { ok: false, error: "invalid_kind", message: "Supported integrations are HubSpot and webhook." });
  }
  const label = String(body?.label || (kind === "hubspot" ? "HubSpot" : "Webhook")).trim().slice(0, 80);
  const config = body?.config && typeof body.config === "object" ? body.config : {};
  if (kind === "hubspot" && !String(config.access_token || "").trim()) {
    return json(400, { ok: false, error: "missing_access_token", message: "HubSpot access token required." });
  }
  if (kind === "webhook") {
    try { await assertPublicWebhook(config.url); }
    catch (error) { return json(400, { ok: false, error: "invalid_webhook", message: safeError(error) }); }
  }

  const storedConfig = encryptSecret(config);
  const [row] = await sql`
    INSERT INTO user_integrations (user_id, kind, label, config)
    VALUES (${user.id}, ${kind}, ${label}, ${JSON.stringify(storedConfig)})
    ON CONFLICT (user_id, kind, label)
    DO UPDATE SET config=EXCLUDED.config, enabled=true, updated_at=now(), last_error=NULL
    RETURNING id, kind, label, enabled, created_at
  `;
  return json(200, { ok: true, integration: row });
}

async function ownedIntegration(user, id) {
  const [row] = await sql`
    SELECT id, kind, label, enabled, config
    FROM user_integrations
    WHERE user_id=${user.id} AND id=${id} AND kind IN ('hubspot','webhook')
    LIMIT 1
  `;
  if (!row) return null;
  return { ...row, config: decryptSecret(row.config) };
}

async function runIntegration(user, body, testing = false) {
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return json(400, { ok: false, error: "invalid_id" });
  const integration = await ownedIntegration(user, id);
  if (!integration || !integration.enabled) return json(404, { ok: false, error: "integration_not_found" });

  const leads = testing
    ? [{ name: "Leadgen connection test", email: "test@example.invalid", website: "https://simpleitsrq.com" }]
    : (Array.isArray(body?.leads) ? body.leads.slice(0, MAX_PUSH_LEADS) : []);
  if (!testing && !leads.length) return json(400, { ok: false, error: "no_leads" });

  try {
    const result = await dispatchPush(integration, leads);
    await sql`UPDATE user_integrations SET last_used_at=now(), last_error=NULL, updated_at=now() WHERE id=${integration.id} AND user_id=${user.id}`;
    return json(200, { ok: true, result });
  } catch (error) {
    const message = safeError(error);
    await sql`UPDATE user_integrations SET last_error=${message}, updated_at=now() WHERE id=${integration.id} AND user_id=${user.id}`;
    return json(502, { ok: false, error: "integration_failed", message });
  }
}

async function removeIntegration(user, request) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return json(400, { ok: false, error: "invalid_id" });
  const rows = await sql`
    DELETE FROM user_integrations
    WHERE id=${id} AND user_id=${user.id}
    RETURNING id
  `;
  return rows.length ? json(200, { ok: true }) : json(404, { ok: false, error: "integration_not_found" });
}

export async function GET(request) {
  const { user, error } = await requireSession(request);
  if (error) return error;
  return handleGet(user);
}

export async function POST(request) {
  const { user, error } = await requireSession(request);
  if (error) return error;
  const ip = clientIp(request);
  const rl = await rateLimit({ ip, bucket: "leadgen_integrations", windowSeconds: 60, max: 30 });
  if (!rl.ok) return json(429, { ok: false, error: "rate_limited" });

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const action = new URL(request.url).searchParams.get("action");
  if (action === "push") return runIntegration(user, body, false);
  if (action === "test") return runIntegration(user, body, true);
  return handleUpsert(user, body);
}

export async function DELETE(request) {
  const { user, error } = await requireSession(request);
  if (error) return error;
  const ip = clientIp(request);
  const rl = await rateLimit({ ip, bucket: "leadgen_integrations", windowSeconds: 60, max: 30 });
  if (!rl.ok) return json(429, { ok: false, error: "rate_limited" });
  return removeIntegration(user, request);
}

export default async function handler(req, res) {
  const method = String(req.method || "GET").toUpperCase();
  const qs = new URLSearchParams(req.query || {}).toString();
  const request = new Request(`https://simpleitsrq.com/api/leadgen-integrations${qs ? `?${qs}` : ""}`, {
    method,
    headers: {
      "content-type": req.headers?.["content-type"] || "application/json",
      cookie: req.headers?.cookie || "",
      "cf-connecting-ip": req.headers?.["cf-connecting-ip"] || "",
      "x-real-ip": req.headers?.["x-real-ip"] || "",
      "x-forwarded-for": req.headers?.["x-forwarded-for"] || "",
      "user-agent": req.headers?.["user-agent"] || "",
    },
    body: method === "POST"
      ? (typeof req.body === "string" ? req.body : JSON.stringify(req.body || {}))
      : undefined,
  });

  const response = method === "GET"
    ? await GET(request)
    : method === "POST"
      ? await POST(request)
      : method === "DELETE"
        ? await DELETE(request)
        : json(405, { ok: false, error: "method_not_allowed" });

  const payload = await response.text();
  res.status(response.status);
  for (const [key, value] of response.headers.entries()) res.setHeader(key, value);
  res.send(payload);
}
