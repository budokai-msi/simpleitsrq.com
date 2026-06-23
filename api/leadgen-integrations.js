// /api/leadgen-integrations — manage and trigger outbound integrations for
// premium lead gen customers (Growth / Pro / Lifetime).
//
// GET  /api/leadgen-integrations                   → list user's integrations
// POST /api/leadgen-integrations                   { kind, label, config }  → upsert
// DELETE /api/leadgen-integrations?id=N            → remove
// POST /api/leadgen-integrations?action=push       { id, leads[] }          → push leads
// POST /api/leadgen-integrations?action=test       { id }                   → test payload
//
// Supported kinds: webhook | mailchimp | hubspot | activecampaign | zapier | gohighlevel

import { json } from "./_lib/http.js";
import { sql } from "./_lib/db.js";
import { getSession } from "./_lib/session.js";
import { clientIp, rateLimit } from "./_lib/security.js";
import { encryptSecret, decryptSecret } from "./_lib/crypto.js";

const ALLOWED_PLANS = new Set(["growth", "pro", "lifetime"]);
const VALID_KINDS = new Set(["webhook", "mailchimp", "hubspot", "activecampaign", "zapier", "gohighlevel"]);

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
  return { session, user: session.user };
}

// ── Push helpers ──────────────────────────────────────────────────────────────

async function pushWebhook(config, leads) {
  const { url, secret } = config;
  if (!url) throw new Error("Webhook URL not configured.");
  const headers = { "Content-Type": "application/json", "User-Agent": "simpleitsrq-leadgen/1.0" };
  if (secret) headers["X-Webhook-Secret"] = String(secret);
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ leads, sent_at: new Date().toISOString() }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Webhook returned ${res.status}`);
  return { sent: leads.length };
}

async function pushMailchimp(config, leads) {
  const { api_key, list_id, server_prefix } = config;
  if (!api_key || !list_id) throw new Error("Mailchimp API key and list ID required.");
  const prefix = server_prefix || api_key.split("-").pop() || "us1";
  const members = leads.filter((l) => l.email);
  if (!members.length) return { sent: 0, skipped: leads.length };
  // Batch import via /lists/{list_id} bulk endpoint
  const batchBody = {
    members: members.map((l) => ({
      email_address: l.email,
      status: "subscribed",
      merge_fields: {
        COMPANY: l.name || "",
        PHONE: l.phone || "",
        ADDRESS: [l.address, l.city, l.state].filter(Boolean).join(", "),
        INDUSTRY: l.industry_group || l.industry || "",
      },
    })),
    update_existing: true,
  };
  const res = await fetch(`https://${prefix}.api.mailchimp.com/3.0/lists/${list_id}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${btoa(`anystring:${api_key}`)}`,
    },
    body: JSON.stringify(batchBody),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Mailchimp error ${res.status}`);
  }
  const data = await res.json().catch(() => ({}));
  return { sent: data.new_members?.length ?? members.length, skipped: leads.length - members.length, errors: data.errors?.length ?? 0 };
}

async function pushHubspot(config, leads) {
  const { access_token } = config;
  if (!access_token) throw new Error("HubSpot access token required.");
  const results = await Promise.allSettled(
    leads.map((l) =>
      fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${access_token}` },
        body: JSON.stringify({
          properties: {
            email: l.email || "",
            company: l.name || "",
            phone: l.phone || "",
            address: l.address || "",
            city: l.city || "",
            state: l.state || "",
            zip: l.zip || "",
            website: l.website || "",
            industry: l.industry_group || l.industry || "",
            leadsource: "Leadgen Scanner",
          },
        }),
        signal: AbortSignal.timeout(10000),
      }).then((r) => r.ok ? r.json() : r.json().then((e) => { throw new Error(e.message || `HubSpot ${r.status}`); }))
    )
  );
  return { sent: results.filter((r) => r.status === "fulfilled").length, failed: results.filter((r) => r.status === "rejected").length };
}

async function pushActiveCampaign(config, leads) {
  const { api_url, api_key } = config;
  if (!api_url || !api_key) throw new Error("ActiveCampaign URL and API key required.");
  const results = await Promise.allSettled(
    leads.filter((l) => l.email).map((l) =>
      fetch(`${api_url.replace(/\/$/, "")}/api/3/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Api-Token": api_key },
        body: JSON.stringify({
          contact: {
            email: l.email,
            firstName: (l.name || "").split(" ")[0],
            lastName: (l.name || "").split(" ").slice(1).join(" "),
            phone: l.phone || "",
            fieldValues: [{ field: "COMPANY", value: l.name || "" }],
          },
        }),
        signal: AbortSignal.timeout(10000),
      }).then((r) => r.ok ? r.json() : r.json().then((e) => { throw new Error(e.message || `AC ${r.status}`); }))
    )
  );
  return { sent: results.filter((r) => r.status === "fulfilled").length };
}

async function pushGoHighLevel(config, leads) {
  const { api_key, location_id } = config;
  if (!api_key) throw new Error("GoHighLevel API key required.");
  const results = await Promise.allSettled(
    leads.filter((l) => l.email || l.phone).map((l) =>
      fetch("https://rest.gohighlevel.com/v1/contacts/", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${api_key}` },
        body: JSON.stringify({
          email: l.email || undefined,
          phone: l.phone || undefined,
          firstName: (l.name || "").split(" ")[0],
          lastName: (l.name || "").split(" ").slice(1).join(" ") || undefined,
          companyName: l.name || undefined,
          address1: l.address || undefined,
          city: l.city || undefined,
          state: l.state || undefined,
          postalCode: l.zip || undefined,
          website: l.website || undefined,
          source: "Leadgen Scanner",
          ...(location_id ? { locationId: location_id } : {}),
        }),
        signal: AbortSignal.timeout(10000),
      }).then((r) => r.ok ? r.json() : r.json().then((e) => { throw new Error(e.message || `GHL ${r.status}`); }))
    )
  );
  return { sent: results.filter((r) => r.status === "fulfilled").length };
}

async function dispatchPush(integration, leads) {
  switch (integration.kind) {
    case "webhook":        return pushWebhook(integration.config, leads);
    case "mailchimp":      return pushMailchimp(integration.config, leads);
    case "hubspot":        return pushHubspot(integration.config, leads);
    case "activecampaign": return pushActiveCampaign(integration.config, leads);
    case "zapier":         return pushWebhook({ url: integration.config.webhook_url || integration.config.url }, leads);
    case "gohighlevel":    return pushGoHighLevel(integration.config, leads);
    default: throw new Error(`Unknown integration kind: ${integration.kind}`);
  }
}

// ── Route handlers ─────────────────────────────────────────────────────────────

async function handleGet(user) {
  const rows = await sql`
    SELECT id, kind, label, enabled, last_used_at, last_error, created_at
    FROM user_integrations
    WHERE user_id = ${user.id}
    ORDER BY created_at DESC
  `;
  return json(200, { ok: true, integrations: rows });
}

async function handleUpsert(user, body) {
  const { kind, label = "", config = {} } = body;
  if (!VALID_KINDS.has(kind)) {
    return json(400, { ok: false, error: "invalid_kind", message: `kind must be one of: ${[...VALID_KINDS].join(", ")}` });
  }
  const sanitizedLabel = String(label).trim().slice(0, 80);
  const sanitizedConfig = (typeof config === "object" && config !== null) ? config : {};
  // Credentials (API keys, webhook secrets) are encrypted at the application
  // layer before they ever touch the database — the column holds ciphertext,
  // not the raw key. See api/_lib/crypto.js.
  const storedConfig = encryptSecret(sanitizedConfig);

  const [row] = await sql`
    INSERT INTO user_integrations (user_id, kind, label, config)
    VALUES (${user.id}, ${kind}, ${sanitizedLabel}, ${JSON.stringify(storedConfig)})
    ON CONFLICT (user_id, kind, label)
    DO UPDATE SET config = EXCLUDED.config, enabled = true, updated_at = now()
    RETURNING id, kind, label, enabled, created_at
  `;
  return json(200, { ok: true, integration: row });
}

async function handleDelete(user, id) {
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) return json(400, { ok: false, error: "invalid_id" });
  await sql`DELETE FROM user_integrations WHERE id = ${numericId} AND user_id = ${user.id}`;
  return json(200, { ok: true });
}

async function handlePush(user, body) {
  const { id, leads = [] } = body;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) return json(400, { ok: false, error: "invalid_id" });
  if (!Array.isArray(leads) || !leads.length) {
    return json(400, { ok: false, error: "no_leads", message: "Include at least one lead in the leads array." });
  }
  const [integration] = await sql`
    SELECT id, kind, config, enabled FROM user_integrations
    WHERE id = ${numericId} AND user_id = ${user.id}
  `;
  if (!integration) return json(404, { ok: false, error: "not_found" });
  if (!integration.enabled) return json(409, { ok: false, error: "disabled" });

  try {
    const config = decryptSecret(integration.config);
    const result = await dispatchPush({ ...integration, config }, leads);
    await sql`UPDATE user_integrations SET last_used_at = now(), last_error = null WHERE id = ${numericId}`;
    return json(200, { ok: true, ...result });
  } catch (err) {
    const errMsg = String(err?.message || "Push failed");
    await sql`UPDATE user_integrations SET last_error = ${errMsg}, updated_at = now() WHERE id = ${numericId}`;
    return json(502, { ok: false, error: "push_failed", message: errMsg });
  }
}

async function handleTest(user, body) {
  return handlePush(user, {
    id: body.id,
    leads: [{
      name: "Test Business (Leadgen)",
      email: "test@example.com",
      phone: "555-000-0000",
      website: "https://example.com",
      address: "123 Main St",
      city: "Sarasota",
      state: "FL",
      zip: "34236",
      industry_group: "Professional Services",
      sub_industry: "Consulting",
    }],
  });
}

// ── Main handlers ─────────────────────────────────────────────────────────────

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

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "";

  let body;
  try { body = await request.json(); } catch { body = {}; }

  if (action === "push") return handlePush(user, body);
  if (action === "test") return handleTest(user, body);
  return handleUpsert(user, body);
}

export async function DELETE(request) {
  const { user, error } = await requireSession(request);
  if (error) return error;
  const url = new URL(request.url);
  return handleDelete(user, url.searchParams.get("id") || "");
}

export default async function handler(req, res) {
  const method = (req.method || "GET").toUpperCase();
  const qs = new URLSearchParams(req.query || {}).toString();
  const buildReq = () => new Request(`https://simpleitsrq.com/api/leadgen-integrations${qs ? `?${qs}` : ""}`, {
    method: req.method,
    headers: {
      "content-type": req.headers?.["content-type"] || "application/json",
      "cookie": req.headers?.cookie || "",
      "x-real-ip": req.headers?.["x-real-ip"] || "",
      "x-forwarded-for": req.headers?.["x-forwarded-for"] || "",
    },
    body: ["POST", "PATCH", "PUT"].includes(method)
      ? (typeof req.body === "string" ? req.body : JSON.stringify(req.body || {}))
      : undefined,
  });
  let response;
  if (method === "GET") response = await GET(buildReq());
  else if (method === "POST") response = await POST(buildReq());
  else if (method === "DELETE") response = await DELETE(buildReq());
  else { res.status(405).json({ ok: false, error: "method_not_allowed" }); return; }
  const payload = await response.text();
  res.status(response.status);
  for (const [k, v] of response.headers.entries()) res.setHeader(k, v);
  res.send(payload);
}
