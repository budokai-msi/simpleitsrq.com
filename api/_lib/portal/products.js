// api/_lib/portal/products.js
//
// Product Finder — a read-only admin feature that turns the dormant leadgen +
// affiliate data into a revenue plan: "sell THIS product to THESE businesses
// for THIS much potential commission."
//
// It runs three read-only queries in parallel and returns them together:
//   a. segments — the local market grouped by industry (where the demand is)
//   b. products — the sellable affiliate catalog (what we can sell)
//   c. trends   — top demand signals from the trends feed (what's hot)
//
// The "potential commission" math is done client-side in the Product Finder
// tab (best-effort category → industry_group keyword match), so this handler
// stays a pure read-only data source. It never inserts, updates, or sends.

import { sql } from "../db.js";
import { json } from "../http.js";
import { requireAdmin } from "./shared.js";

// GET /api/portal?action=product-finder
export async function handleProductFinder(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const [segments, products, trends] = await Promise.all([
    (async () => {
      // Segment the local market by industry_group. If the taxonomy column is
      // sparse (fewer than 3 populated groups), fall back to the raw `industry`
      // column so the segment view stays useful instead of collapsing to one
      // "Other" bucket.
      const rows = await sql`
        SELECT industry_group, count(*)::int AS businesses
        FROM lead_businesses
        WHERE status = 'active'
        GROUP BY industry_group
        ORDER BY businesses DESC
        LIMIT 12
      `;
      const populated = (rows || []).filter((r) => r.industry_group).length;
      if (populated >= 3) return rows;
      return sql`
        SELECT COALESCE(NULLIF(industry, ''), 'Other') AS industry_group,
               count(*)::int AS businesses
        FROM lead_businesses
        WHERE status = 'active'
        GROUP BY COALESCE(NULLIF(industry, ''), 'Other')
        ORDER BY businesses DESC
        LIMIT 12
      `;
    })(),
    sql`
      SELECT id, title, brand, category, price_cents, commission_rate,
             commission_type, epc, conversion_rate, gravity, product_url
      FROM affiliate_products
      ORDER BY gravity DESC NULLS LAST
      LIMIT 30
    `,
    sql`
      SELECT keyword, score, volume, source
      FROM trends_daily
      ORDER BY date DESC, score DESC
      LIMIT 15
    `,
  ]);

  return json(200, {
    ok: true,
    segments: segments || [],
    products: products || [],
    trends: trends || [],
  });
}
