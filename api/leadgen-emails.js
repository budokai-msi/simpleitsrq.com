// /api/leadgen-emails — on-demand contact discovery from public business websites.
// Premium feature. Kept intentionally narrow so the feature stays useful and
// maintainable: email addresses, contact-form presence, and public social links.

import { json } from "./_lib/http.js";
import { getSession } from "./_lib/session.js";
import { crawlEmails } from "./_lib/leadgen-emailcrawler.js";
import { clientIp, rateLimit } from "./_lib/security.js";

const ALLOWED_PLANS = new Set(["growth", "pro", "lifetime"]);
const BULK_PLANS = new Set(["pro", "lifetime"]);
const BULK_MAX = 10;

function isPrivateLiteral(host) {
  const h = String(host || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h === "::1") return true;
  if (/^(fc|fd|fe8|fe9|fea|feb)[0-9a-f]*:/i.test(h)) return true;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(h)) return false;
  const p = h.split(".").map(Number);
  return p[0] === 0 || p[0] === 10 || p[0] === 127 || (p[0] === 169 && p[1] === 254)
    || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168);
}

function normalizeDomain(input) {
  let value = String(input || "").trim().toLowerCase();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const parsed = new URL(value);
    if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname.includes(".") || isPrivateLiteral(parsed.hostname)) return null;
    return parsed.origin;
  } catch { return null; }
}

async function requirePremiumSession(request) {
  const session = await getSession(request);
  if (!session) return { error: json(401, { ok: false, error: "unauthorized" }) };
  const { plan, isAdmin } = session.user;
  if (!isAdmin && !ALLOWED_PLANS.has(plan)) {
    return { error: json(403, { ok: false, error: "plan_required", message: "Contact enrichment is available on Growth, Pro, and Lifetime plans.", upgrade_url: "/leadgen#pricing" }) };
  }
  return { session, user: session.user };
}

async function enrichOne(origin) {
  const result = await crawlEmails(origin);
  return {
    ...result,
    websiteSignals: result.websiteSignals ? {
      ...result.websiteSignals,
      pages_fetched: result.pagesFetched || result.websiteSignals.pages_fetched || 0,
      robots_allowed: result.robotsAllowed !== false,
    } : null,
  };
}

export async function POST(request) {
  const { user, error } = await requirePremiumSession(request);
  if (error) return error;
  const ip = clientIp(request);
  const rl = await rateLimit({ ip, bucket: "leadgen_email_crawl", windowSeconds: 60, max: 20 });
  if (!rl.ok) return json(429, { ok: false, error: "rate_limited", message: "Too many contact checks. Wait a minute." });

  let body;
  try { body = await request.json(); } catch { body = {}; }

  if (Array.isArray(body.domains)) {
    if (!user.isAdmin && !BULK_PLANS.has(user.plan)) {
      return json(403, { ok: false, error: "plan_required", message: "Bulk contact enrichment requires Pro or Lifetime." });
    }
    const domains = body.domains.slice(0, BULK_MAX).map(normalizeDomain).filter(Boolean);
    if (!domains.length) return json(400, { ok: false, error: "invalid_domains" });
    const results = await Promise.allSettled(domains.map((domain) => enrichOne(domain)));
    return json(200, {
      ok: true,
      results: results.map((result, index) => result.status === "fulfilled"
        ? { domain: domains[index], ...result.value }
        : { domain: domains[index], ok: false, error: "contact_check_failed", emails: [], websiteSignals: null }),
    });
  }

  const origin = normalizeDomain(body.domain || body.url || "");
  if (!origin) return json(400, { ok: false, error: "invalid_domain", message: "Provide a valid public business website." });
  try {
    const result = await enrichOne(origin);
    return json(200, { ok: true, ...result });
  } catch (err) {
    return json(502, { ok: false, error: "contact_check_failed", message: String(err?.message || "Contact check failed.") });
  }
}

export async function GET() {
  return json(200, {
    ok: true,
    description: "POST { domain } or { domains: [] } to find public business contact details.",
    signals: ["emails", "contact form", "LinkedIn", "Facebook", "Instagram"],
    plans: ["growth", "pro", "lifetime"],
  });
}

export default async function handler(req, res) {
  const method = (req.method || "GET").toUpperCase();
  const buildRequest = () => new Request("https://simpleitsrq.com/api/leadgen-emails", {
    method: req.method,
    headers: {
      "content-type": req.headers?.["content-type"] || "application/json",
      "cookie": req.headers?.cookie || "",
      "cf-connecting-ip": req.headers?.["cf-connecting-ip"] || "",
      "x-real-ip": req.headers?.["x-real-ip"] || "",
      "x-forwarded-for": req.headers?.["x-forwarded-for"] || "",
    },
    body: method === "POST" ? (typeof req.body === "string" ? req.body : JSON.stringify(req.body || {})) : undefined,
  });
  const response = method === "GET" ? await GET() : method === "POST" ? await POST(buildRequest()) : null;
  if (!response) { res.status(405).json({ ok: false, error: "method_not_allowed" }); return; }
  const payload = await response.text();
  res.status(response.status);
  for (const [key, value] of response.headers.entries()) res.setHeader(key, value);
  res.send(payload);
}
