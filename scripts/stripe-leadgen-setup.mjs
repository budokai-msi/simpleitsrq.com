#!/usr/bin/env node
/**
 * Creates Stripe Products + Prices + Coupon + Promotion Code + Payment Links
 * for the /leadgen surface. Uses the Stripe REST API directly (no CLI).
 *
 * Run:
 *   STRIPE_API_KEY=sk_test_xxx node scripts/stripe-leadgen-setup.mjs
 *   STRIPE_API_KEY=sk_live_xxx node scripts/stripe-leadgen-setup.mjs --live
 *
 * Outputs:
 *   scripts/stripe-leadgen-output.test.json  (default)
 *   scripts/stripe-leadgen-output.live.json  (--live)
 */

const LIVE = process.argv.includes("--live");
const API_KEY = process.env.STRIPE_API_KEY;

if (!API_KEY) {
  console.error("Error: STRIPE_API_KEY environment variable is required.");
  process.exit(1);
}

const BASE = "https://api.stripe.com/v1";

async function stripe(path, params = {}) {
  const body = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${API_KEY}:`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await res.json();
  if (!res.ok) {
    console.error(`Stripe API error (${path}):`, data);
    throw new Error(data.error?.message || `HTTP ${res.status}`);
  }
  return data;
}

/* ── Products ── */
console.log("=== Creating Products ===");

const starter = await stripe("products", {
  name: "Leadgen Starter",
  description:
    "SWFL B2B lead generation - Starter tier (up to 250 verified contacts/mo, shared outreach pool)",
  "metadata[tier]": "starter",
  "metadata[surface]": "leadgen",
});
console.log("Starter product:", starter.id);

const growth = await stripe("products", {
  name: "Leadgen Growth",
  description:
    "SWFL B2B lead generation - Growth tier (up to 1500 verified contacts/mo, dedicated outreach + reply triage)",
  "metadata[tier]": "growth",
  "metadata[surface]": "leadgen",
});
console.log("Growth product: ", growth.id);

/* ── Prices ── */
console.log("\n=== Creating Prices ===");

// Starter monthly $19
const starterMonthly = await stripe("prices", {
  product: starter.id,
  unit_amount: "1900",
  currency: "usd",
  "recurring[interval]": "month",
  nickname: "Starter Monthly",
  "metadata[tier]": "starter",
  "metadata[cadence]": "monthly",
});

// Starter annual $15/mo billed yearly = $180
const starterAnnual = await stripe("prices", {
  product: starter.id,
  unit_amount: "18000",
  currency: "usd",
  "recurring[interval]": "year",
  nickname: "Starter Annual",
  "metadata[tier]": "starter",
  "metadata[cadence]": "annual",
});

// Growth monthly $99
const growthMonthly = await stripe("prices", {
  product: growth.id,
  unit_amount: "9900",
  currency: "usd",
  "recurring[interval]": "month",
  nickname: "Growth Monthly",
  "metadata[tier]": "growth",
  "metadata[cadence]": "monthly",
});

// Growth annual $79/mo billed yearly = $948
const growthAnnual = await stripe("prices", {
  product: growth.id,
  unit_amount: "94800",
  currency: "usd",
  "recurring[interval]": "year",
  nickname: "Growth Annual",
  "metadata[tier]": "growth",
  "metadata[cadence]": "annual",
});

console.log("Starter monthly:", starterMonthly.id);
console.log("Starter annual: ", starterAnnual.id);
console.log("Growth  monthly:", growthMonthly.id);
console.log("Growth  annual: ", growthAnnual.id);

/* ── Coupon + Promo Code ── */
console.log("\n=== Creating Coupon + Promotion Code (LAUNCH20) ===");

const coupon = await stripe("coupons", {
  percent_off: "20",
  duration: "repeating",
  duration_in_months: "3",
  name: "Leadgen Launch 20",
  "metadata[surface]": "leadgen",
});
console.log("Coupon:", coupon.id);

const promo = await stripe("promotion_codes", {
  coupon: coupon.id,
  code: "LAUNCH20",
  "metadata[surface]": "leadgen",
});
console.log("Promotion code:", promo.code, `(${promo.id})`);

/* ── Payment Links ── */
console.log("\n=== Creating Payment Links ===");

async function createLink(priceId, tier, cadence) {
  return stripe("payment_links", {
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    allow_promotion_codes: "true",
    billing_address_collection: "auto",
    "after_completion[type]": "redirect",
    "after_completion[redirect][url]": `https://simpleitsrq.com/leadgen?checkout=success&tier=${tier}&cadence=${cadence}`,
    "metadata[tier]": tier,
    "metadata[cadence]": cadence,
    "metadata[surface]": "leadgen",
  });
}

const linkStarterMonthly = await createLink(starterMonthly.id, "starter", "monthly");
const linkStarterAnnual = await createLink(starterAnnual.id, "starter", "annual");
const linkGrowthMonthly = await createLink(growthMonthly.id, "growth", "monthly");
const linkGrowthAnnual = await createLink(growthAnnual.id, "growth", "annual");

/* ── Output ── */
const summary = {
  mode: LIVE ? "live" : "test",
  products: { starter: starter.id, growth: growth.id },
  prices: {
    starter_monthly: starterMonthly.id,
    starter_annual: starterAnnual.id,
    growth_monthly: growthMonthly.id,
    growth_annual: growthAnnual.id,
  },
  coupon: coupon.id,
  promotion_code: { id: promo.id, code: promo.code },
  payment_links: {
    starter_monthly: linkStarterMonthly.url,
    starter_annual: linkStarterAnnual.url,
    growth_monthly: linkGrowthMonthly.url,
    growth_annual: linkGrowthAnnual.url,
  },
};

const outFile = LIVE
  ? "scripts/stripe-leadgen-output.live.json"
  : "scripts/stripe-leadgen-output.test.json";

await import("node:fs/promises").then((fs) =>
  fs.writeFile(outFile, JSON.stringify(summary, null, 4))
);

console.log("\n=== DONE ===");
console.log(JSON.stringify(summary, null, 4));
console.log(`\nSaved to ${outFile}`);
