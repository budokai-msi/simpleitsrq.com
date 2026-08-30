// GET /api/cron/affiliate
//
// Daily affiliate product ingestion. Triggered by Vercel Cron (see vercel.json
// crons). Populates `affiliate_products` from the seed catalog and, when eBay
// keys are configured, the eBay Browse API.
//
// Secured by CRON_SECRET — Vercel injects the Authorization header on
// cron-triggered requests; manual calls require the same bearer token.

import { timingSafeEqual } from "node:crypto";
import { ingestAffiliateProducts } from "../_lib/affiliate-ingest.js";

function verifyCron(request) {
  if (request.headers.get("x-vercel-cron") === "1") return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  if (auth.length !== expected.length) return false;
  const a = Buffer.from(auth);
  const b = Buffer.from(expected);
  return timingSafeEqual(a, b);
}

export async function GET(request) {
  if (!verifyCron(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const summary = await ingestAffiliateProducts();
    return new Response(JSON.stringify({ ok: true, summary }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[cron/affiliate] failed", err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err).slice(0, 300) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
