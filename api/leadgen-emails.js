// /api/leadgen-emails — on-demand email extraction for a single domain.
// Premium feature (plan: growth|pro|lifetime or admin).
//
// POST { domain: "example.com" }
//   → { ok, host, emails: [{email, source, confidence, context_snippet}], pagesFetched }
//
// Bulk mode (pro/lifetime only):
// POST { domains: ["a.com","b.com"] }   (max 10)

import { json } from "./_lib/http.js";
import { getSession } from "./_lib/session.js";
import { crawlEmails } from "./_lib/leadgen-emailcrawler.js";
import { clientIp, rateLimit } from "./_lib/security.js";

const ALLOWED_PLANS = new Set(["growth", "pro", "lifetime"]);
const BULK_PLANS = new Set(["pro", "lifetime"]);
const BULK_MAX = 10;

function normalizeDomain(input) {
  let s = String(input || "").trim().toLowerCase();
  if (!s) return null;
  if (!s.startsWith("http://") && !s.startsWith("https://")) s = "https://" + s;
  try {
    return new URL(s).origin;
  } catch {
    return null;
  }
}

async function requirePremiumSession(request) {
  const session = await getSession(request);
  if (!session) return { error: json(401, { ok: false, error: "unauthorized" }) };
  const { plan, isAdmin } = session.user;
  if (!isAdmin && !ALLOWED_PLANS.has(plan)) {
    return {
      error: json(403, {
        ok: false,
        error: "plan_required",
        message: "Email extraction is available on Growth, Pro, and Lifetime plans.",
        upgrade_url: "/leadgen#pricing",
      }),
    };
  }
  return { session, user: session.user };
}

export async function POST(request) {
  const { user, error } = await requirePremiumSession(request);
  if (error) return error;

  const ip = clientIp(request);
  const rl = await rateLimit({ ip, bucket: "leadgen_email_crawl", windowSeconds: 60, max: 20 });
  if (!rl.ok) {
    return json(429, { ok: false, error: "rate_limited", message: "Too many extraction requests. Wait a minute." });
  }

  let body;
  try { body = await request.json(); } catch { body = {}; }

  // Bulk mode
  if (Array.isArray(body.domains)) {
    if (!user.isAdmin && !BULK_PLANS.has(user.plan)) {
      return json(403, { ok: false, error: "plan_required", message: "Bulk extraction requires Pro or Lifetime plan." });
    }
    const domains = body.domains.slice(0, BULK_MAX).map(normalizeDomain).filter(Boolean);
    if (!domains.length) return json(400, { ok: false, error: "invalid_domains" });
    const results = await Promise.allSettled(domains.map((d) => crawlEmails(d)));
    return json(200, {
      ok: true,
      results: results.map((r, i) =>
        r.status === "fulfilled"
          ? { domain: domains[i], ...r.value }
          : { domain: domains[i], ok: false, error: "crawl_failed", emails: [] }
      ),
    });
  }

  // Single domain mode
  const origin = normalizeDomain(body.domain || body.url || "");
  if (!origin) {
    return json(400, { ok: false, error: "invalid_domain", message: "Provide a valid domain or URL." });
  }

  try {
    const result = await crawlEmails(origin);
    return json(200, { ok: true, ...result });
  } catch (err) {
    return json(502, { ok: false, error: "crawl_failed", message: String(err?.message || "Crawl failed.") });
  }
}

export async function GET() {
  return json(200, {
    ok: true,
    description: "POST { domain } or { domains: [] } to extract emails from a website.",
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
      "x-real-ip": req.headers?.["x-real-ip"] || "",
      "x-forwarded-for": req.headers?.["x-forwarded-for"] || "",
    },
    body: method === "POST" ? (typeof req.body === "string" ? req.body : JSON.stringify(req.body || {})) : undefined,
  });
  const response = method === "GET" ? await GET() : method === "POST" ? await POST(buildRequest()) : null;
  if (!response) { res.status(405).json({ ok: false, error: "method_not_allowed" }); return; }
  const payload = await response.text();
  res.status(response.status);
  for (const [k, v] of response.headers.entries()) res.setHeader(k, v);
  res.send(payload);
}
