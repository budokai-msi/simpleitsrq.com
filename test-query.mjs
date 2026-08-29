// test-query.mjs — scratch verification for the Affiliate Dashboard.
// Run with: node --env-file=.env.local test-query.mjs
// Exercises every portal affiliate handler against the live Neon schema and
// prints the affiliate-stats response shape the AdminOps tab consumes.

import {
  handleAffiliateDashboardSummary,
  handleTrends,
  handleAffiliateProducts,
  handleAffiliateStats,
  handleAffiliateNetworks,
  handleAffiliateSync,
} from "./api/_lib/portal/affiliate.js";

const session = { user: { id: 0, is_admin: true }, __isAdmin: true };

function url(qs = "") {
  return new URL(`https://simpleitsrq.com/api/portal?action=x${qs}`);
}

async function run(name, fn) {
  try {
    const res = await fn();
    const body = await res.json();
    const ok = res.status === 200;
    console.log(`${ok ? "OK " : "ERR"} ${name} -> status ${res.status}`);
    if (!ok) console.log("   body:", JSON.stringify(body).slice(0, 300));
    return ok;
  } catch (e) {
    console.log(`ERR ${name} -> threw: ${e.message}`);
    return false;
  }
}

const results = [];
results.push(await run("dashboard-summary", () => handleAffiliateDashboardSummary(session, url())));
results.push(await run("trends", () => handleTrends(session, url("&period=last7days"))));
results.push(await run("affiliate-products", () => handleAffiliateProducts(session, url("&sort=epc"))));
results.push(await run("affiliate-products (keyword)", () => handleAffiliateProducts(session, url("&keyword=laptop&sort=epc"))));
results.push(await run("affiliate-stats", () => handleAffiliateStats(session, url("&days=30"))));
results.push(await run("affiliate-stats (network)", () => handleAffiliateStats(session, url("&days=30&network=Amazon"))));
results.push(await run("affiliate-networks", () => handleAffiliateNetworks(session)));

// Missing networkCode should 400 (validation), not 500.
{
  const res = await handleAffiliateSync(session, { json: async () => ({}) });
  const body = await res.json();
  const ok = res.status === 400 && body.error === "networkCode required";
  console.log(`${ok ? "OK " : "ERR"} affiliate-sync (missing code) -> status ${res.status} (expected 400)`);
  results.push(ok);
}

// Inspect the affiliate-stats shape the AdminOps AffiliateTab reads.
const statsRes = await handleAffiliateStats(session, url("&days=30"));
const stats = await statsRes.json();
console.log("affiliate-stats keys:", Object.keys(stats).join(", "));
console.log("totalClicks:", stats.totalClicks, "| total_clicks:", stats.total_clicks);
console.log("byNetwork[0]:", JSON.stringify(stats.byNetwork?.[0]));
console.log("recent[0]:", JSON.stringify(stats.recent?.[0]));

const allOk = results.every(Boolean);
console.log(allOk ? "ALL HANDLERS OK" : "SOME HANDLERS FAILED");
process.exit(allOk ? 0 : 1);
