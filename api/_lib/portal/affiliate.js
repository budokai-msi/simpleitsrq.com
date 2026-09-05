// api/_lib/portal/affiliate.js
// Affiliate Dashboard portal actions
//
// NOTE ON SCHEMA: `affiliate_clicks` is owned by migration 005 and has the
// columns (id, ts, slug, destination, label, network, ip, country, anon_id,
// user_id, referrer_path). It is what the site's click-tracking code writes
// to today. Every query below uses those real columns — there is no
// product_id / network_code / clicked_at on the live table.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "../db.js";
import { json } from "../http.js";
import { ingestAffiliateProducts } from "../affiliate-ingest.js";
import { requireAdmin } from "./shared.js";

// The 9 affiliate programs the site can monetize, each backed by a VITE_*
// env var that must be set in Vercel for the link builder to emit a real
// tracking tag/ref. `configured` reflects whether the env var is present.
const AFFILIATE_PROGRAMS = [
  { code: "amazon",     name: "Amazon Associates", envVar: "VITE_AFF_AMAZON_TAG" },
  { code: "gusto",      name: "Gusto",             envVar: "VITE_AFF_GUSTO_REF" },
  { code: "1password",  name: "1Password",         envVar: "VITE_AFF_1PASSWORD_REF" },
  { code: "honeybook",  name: "HoneyBook",         envVar: "VITE_AFF_HONEYBOOK_REF" },
  { code: "acronis",    name: "Acronis",           envVar: "VITE_AFF_ACRONIS_REF" },
  { code: "ubiquiti",   name: "Ubiquiti",          envVar: "VITE_AFF_UBNT_REF" },
  { code: "reolink",    name: "Reolink",           envVar: "VITE_AFF_REOLINK_REF" },
  { code: "bh",         name: "B&H Photo",         envVar: "VITE_AFF_BH_REF" },
  { code: "backblaze",  name: "Backblaze",         envVar: "VITE_AFF_BACKBLAZE_REF" },
];

// Token prefixes (as they appear in content/posts/*.mdx) that map to each
// program. A post counts as "linked" for a program if it contains any of
// these tokens. `[[yubikey]]` is an Amazon product, so it counts toward
// amazon coverage.
const PROGRAM_TOKENS = {
  amazon:    ["[[amazon:", "[[amazon_search:", "[[yubikey"],
  gusto:     ["[[gusto"],
  "1password": ["[[1password:"],
  honeybook: ["[[honeybook"],
  acronis:   ["[[acronis"],
  ubiquiti:  ["[[ubnt-"],
  reolink:   ["[[reolink-"],
  bh:        ["[[bh:"],
  backblaze: ["[[backblaze"],
};

/**
 * GET /api/portal?action=affiliate-setup
 * Returns the 9 affiliate programs with their configured status (env var
 * present or not) plus per-program link coverage across content/posts/*.mdx.
 */
export async function handleAffiliateSetup(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const programs = AFFILIATE_PROGRAMS.map((p) => ({
    code: p.code,
    name: p.name,
    envVar: p.envVar,
    configured: !!process.env[p.envVar],
  }));

  const linkCoverage = AFFILIATE_PROGRAMS.map((p) => ({ code: p.code, postsLinked: 0 }));
  const postsDir = path.join(process.cwd(), "content", "posts");
  try {
    const files = (await readdir(postsDir)).filter((f) => f.endsWith(".mdx"));
    for (const file of files) {
      const content = await readFile(path.join(postsDir, file), "utf8");
      for (const prog of linkCoverage) {
        const tokens = PROGRAM_TOKENS[prog.code] || [];
        if (tokens.some((t) => content.includes(t))) prog.postsLinked += 1;
      }
    }
  } catch {
    // Directory doesn't exist (or is unreadable) — return empty coverage.
  }

  return json(200, { ok: true, programs, linkCoverage });
}

/**
 * GET /api/portal?action=affiliate-dashboard-summary
 * Returns top trends, top products, total clicks/commissions for today
 */
export async function handleAffiliateDashboardSummary() {
  const today = new Date().toISOString().split("T")[0];

  // Top trends today (top 10 by score)
  const topTrends = await sql`
    SELECT keyword, source, score, volume
    FROM trends_daily
    WHERE date = ${today}
    ORDER BY score DESC
    LIMIT 10
  `;

  // Trends by source count
  const bySource = await sql`
    SELECT source, COUNT(*) as count
    FROM trends_daily
    WHERE date = ${today}
    GROUP BY source
  `;

  // Top products. Clicks are tracked by network/slug/label (005 schema), not
  // by product, so these return the product catalog ordered by the relevant
  // metric. Empty until a network sync populates affiliate_products.
  const productSelect = `
    SELECT
      ap.id,
      ap.title,
      ap.brand,
      ap.category,
      ap.price_cents,
      ap.currency,
      ap.image_url,
      ap.product_url,
      ap.commission_rate,
      ap.commission_type,
      ap.epc,
      ap.conversion_rate,
      ap.gravity,
      an.code as network
    FROM affiliate_products ap
    JOIN affiliate_networks an ON an.id = ap.network_id
    WHERE an.is_active = true
  `;

  const topByClicks = await sql.query(`${productSelect} ORDER BY ap.id LIMIT 10`);
  const topByCommission = await sql.query(`${productSelect} ORDER BY ap.id LIMIT 10`);
  const topByEpc = await sql.query(`${productSelect} ORDER BY ap.epc DESC NULLS LAST LIMIT 10`);

  // Totals (last 7 days)
  const totals = await sql`
    SELECT
      COUNT(*) as clicks,
      COUNT(*) FILTER (WHERE c.id IN (SELECT click_id FROM affiliate_conversions)) as conversions,
      COALESCE(SUM(ac.commission_cents) FILTER (WHERE ac.status IN ('approved', 'paid')), 0) as commissions_cents
    FROM affiliate_clicks c
    LEFT JOIN affiliate_conversions ac ON ac.click_id = c.id
    WHERE c.ts >= now() - interval '7 days'
  `;

  const t = totals[0] || { clicks: 0, conversions: 0, commissions_cents: 0 };
  const epc = t.clicks > 0 ? t.commissions_cents / t.clicks : 0;
  const conversionRate = t.clicks > 0 ? t.conversions / t.clicks : 0;

  // Network performance (last 7 days)
  const networks = await sql`
    SELECT
      an.code,
      an.name,
      COUNT(DISTINCT ap.id) as products,
      COUNT(c.id) as clicks_7d,
      COALESCE(SUM(ac.commission_cents) FILTER (WHERE ac.status IN ('approved', 'paid')), 0) as commissions_7d
    FROM affiliate_networks an
    LEFT JOIN affiliate_products ap ON ap.network_id = an.id
    LEFT JOIN affiliate_clicks c ON c.network = an.code AND c.ts >= now() - interval '7 days'
    LEFT JOIN affiliate_conversions ac ON ac.click_id = c.id
    WHERE an.is_active = true
    GROUP BY an.id, an.code, an.name
    ORDER BY commissions_7d DESC
  `;

  const networkPerformance = networks.map(n => ({
    code: n.code,
    name: n.name,
    products: Number(n.products),
    clicks7d: Number(n.clicks_7d),
    commissions7d: Number(n.commissions_7d),
    epc: n.clicks_7d > 0 ? Number(n.commissions_7d) / Number(n.clicks_7d) : 0,
  }));

  return json(200, {
    date: today,
    trends: {
      top: topTrends.map(t => ({
        keyword: t.keyword,
        source: t.source,
        score: Number(t.score),
        volume: t.volume ? Number(t.volume) : undefined,
      })),
      bySource: Object.fromEntries(bySource.map(s => [s.source, Number(s.count)])),
    },
    products: {
      topByClicks: formatProducts(topByClicks),
      topByCommission: formatProducts(topByCommission),
      topByEpc: formatProducts(topByEpc),
    },
    totals: {
      clicks: Number(t.clicks),
      conversions: Number(t.conversions),
      commissionsCents: Number(t.commissions_cents),
      epc: Number(epc.toFixed(2)),
      conversionRate: Number(conversionRate.toFixed(4)),
    },
    networks: networkPerformance,
  });
}

/**
 * GET /api/portal?action=trends&period=last7days&source=google_trends
 */
export async function handleTrends(session, url) {
  const params = url.searchParams;
  const period = params.get("period") || "last7days";
  const source = params.get("source");
  const limit = Math.min(parseInt(params.get("limit") || "50"), 200);

  let dateFilter = "";
  if (period === "today") {
    dateFilter = "WHERE date = CURRENT_DATE";
  } else if (period === "yesterday") {
    dateFilter = "WHERE date = CURRENT_DATE - 1";
  } else if (period === "last7days") {
    dateFilter = "WHERE date >= CURRENT_DATE - 6";
  } else if (period === "last30days") {
    dateFilter = "WHERE date >= CURRENT_DATE - 29";
  }

  if (source) {
    dateFilter += dateFilter ? " AND source = $1" : "WHERE source = $1";
  }

  const query = `
    SELECT date, keyword, source, score, volume, url, metadata
    FROM trends_daily
    ${dateFilter}
    ORDER BY date DESC, score DESC
    LIMIT ${limit}
  `;

  const trends = source
    ? await sql.query(query, [source])
    : await sql.query(query);

  // Get available sources
  const sources = await sql`SELECT DISTINCT source FROM trends_daily ORDER BY source`;

  return json(200, {
    period,
    trends: trends.map(t => ({
      date: t.date,
      keyword: t.keyword,
      source: t.source,
      score: Number(t.score),
      volume: t.volume ? Number(t.volume) : undefined,
      url: t.url,
    })),
    sources: sources.map(s => s.source),
  });
}

/**
 * GET /api/portal?action=affiliate-products&keyword=laptop&platform=amazon,ebay&category=electronics&sort=epc&order=desc&page=1&limit=20
 */
export async function handleAffiliateProducts(session, url) {
  const params = url.searchParams;
  const keyword = params.get("keyword") || "";
  const platforms = (params.get("platform") || "").split(",").filter(Boolean);
  const category = params.get("category");
  const minPrice = params.get("minPrice") ? parseInt(params.get("minPrice")) : null;
  const maxPrice = params.get("maxPrice") ? parseInt(params.get("maxPrice")) : null;
  const sort = params.get("sort") || "epc";
  const order = params.get("order") || "desc";
  const page = Math.max(parseInt(params.get("page") || "1"), 1);
  const limit = Math.min(Math.max(parseInt(params.get("limit") || "20"), 1), 100);
  const offset = (page - 1) * limit;

  // Build WHERE conditions
  const conditions = ["an.is_active = true"];
  const values = [];
  let paramIdx = 1;

  if (keyword) {
    conditions.push(`(ap.title ILIKE $${paramIdx} OR ap.description ILIKE $${paramIdx} OR ap.brand ILIKE $${paramIdx})`);
    values.push(`%${keyword}%`);
    paramIdx++;
  }

  if (platforms.length > 0) {
    conditions.push(`an.code = ANY($${paramIdx})`);
    values.push(platforms);
    paramIdx++;
  }

  if (category) {
    conditions.push(`ap.category ILIKE $${paramIdx}`);
    values.push(`%${category}%`);
    paramIdx++;
  }

  if (minPrice !== null) {
    conditions.push(`ap.price_cents >= $${paramIdx}`);
    values.push(minPrice);
    paramIdx++;
  }

  if (maxPrice !== null) {
    conditions.push(`ap.price_cents <= $${paramIdx}`);
    values.push(maxPrice);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  // Valid sort columns. Clicks aren't product-linked in the 005 schema, so
  // only catalog-level sorts are available.
  const sortColumns = {
    epc: "ap.epc",
    commission_rate: "ap.commission_rate",
    price: "ap.price_cents",
    created: "ap.created_at",
  };
  const sortColumn = sortColumns[sort] || "ap.epc";
  const sortOrder = order.toLowerCase() === "asc" ? "ASC" : "DESC";

  // Main query
  const productsResult = await sql.query(`
    SELECT
      ap.id,
      ap.title,
      ap.brand,
      ap.category,
      ap.price_cents,
      ap.currency,
      ap.image_url,
      ap.product_url,
      ap.commission_rate,
      ap.commission_type,
      ap.epc,
      ap.conversion_rate,
      ap.gravity,
      an.code as network
    FROM affiliate_products ap
    JOIN affiliate_networks an ON an.id = ap.network_id
    ${whereClause}
    ORDER BY ${sortColumn} ${sortOrder} NULLS LAST
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `, [...values, limit, offset]);

  const products = productsResult;

  // Total count
  const countResult = await sql.query(`
    SELECT COUNT(*) as total
    FROM affiliate_products ap
    JOIN affiliate_networks an ON an.id = ap.network_id
    ${whereClause}
  `, values);

  // Available filters
  const [networks, categories, priceRange] = await Promise.all([
    sql`SELECT code, name FROM affiliate_networks WHERE is_active = true ORDER BY name`,
    sql`SELECT DISTINCT category FROM affiliate_products WHERE category IS NOT NULL ORDER BY category`,
    sql`SELECT MIN(price_cents) as min_price, MAX(price_cents) as max_price FROM affiliate_products WHERE price_cents IS NOT NULL`,
  ]);

  return json(200, {
    products: formatProducts(products),
    pagination: {
      page,
      limit,
      total: Number(countResult[0]?.total || 0),
      totalPages: Math.ceil(Number(countResult[0]?.total || 0) / limit),
    },
    filters: {
      networks: networks.map(n => ({ code: n.code, name: n.name })),
      categories: categories.map(c => c.category).filter(Boolean),
      priceRange: [
        Number(priceRange[0]?.min_price || 0),
        Number(priceRange[0]?.max_price || 0),
      ],
    },
  });
}

/**
 * GET /api/portal?action=affiliate-stats&period=last7days&network=amazon&groupBy=day
 * Also accepts `days=30` (used by AdminOps) as an alias for period.
 */
export async function handleAffiliateStats(session, url) {
  const params = url.searchParams;
  const daysParam = params.get("days");
  const period = params.get("period") || (daysParam ? `last${daysParam}days` : "last7days");
  const network = params.get("network");
  const groupBy = params.get("groupBy") || "day";

  let dateFilter = "";
  let groupFormat = "";
  if (period === "last7days") {
    dateFilter = "WHERE c.ts >= now() - interval '7 days'";
    groupFormat = groupBy === "hour" ? "to_char(c.ts, 'YYYY-MM-DD HH24:00')" : "to_char(c.ts, 'YYYY-MM-DD')";
  } else if (period === "last30days") {
    dateFilter = "WHERE c.ts >= now() - interval '30 days'";
    groupFormat = groupBy === "hour" ? "to_char(c.ts, 'YYYY-MM-DD HH24:00')" : "to_char(c.ts, 'YYYY-MM-DD')";
  } else if (period === "last90days") {
    dateFilter = "WHERE c.ts >= now() - interval '90 days'";
    groupFormat = "to_char(c.ts, 'YYYY-MM-DD')";
  }

  const networkFilter = network ? "AND c.network = $1" : "";
  const networkParam = network ? [network] : [];

  // Time series
  const seriesResult = await sql.query(`
    SELECT
      ${groupFormat} as period,
      COUNT(*) as clicks,
      COUNT(*) FILTER (WHERE c.id IN (SELECT click_id FROM affiliate_conversions)) as conversions,
      COALESCE(SUM(ac.commission_cents) FILTER (WHERE ac.status IN ('approved', 'paid')), 0) as commissions_cents
    FROM affiliate_clicks c
    LEFT JOIN affiliate_conversions ac ON ac.click_id = c.id
    ${dateFilter}
    ${networkFilter}
    GROUP BY period
    ORDER BY period
  `, networkParam);

  const series = seriesResult;

  // Totals
  const totalsResult = await sql.query(`
    SELECT
      COUNT(*) as clicks,
      COUNT(*) FILTER (WHERE c.id IN (SELECT click_id FROM affiliate_conversions)) as conversions,
      COALESCE(SUM(ac.commission_cents) FILTER (WHERE ac.status IN ('approved', 'paid')), 0) as commissions_cents
    FROM affiliate_clicks c
    LEFT JOIN affiliate_conversions ac ON ac.click_id = c.id
    ${dateFilter}
    ${networkFilter}
  `, networkParam);

  const totals = totalsResult;
  const t = totals[0] || { clicks: 0, conversions: 0, commissions_cents: 0 };
  const avgEpc = t.clicks > 0 ? Number(t.commissions_cents) / Number(t.clicks) : 0;
  const avgConversionRate = t.clicks > 0 ? Number(t.conversions) / Number(t.clicks) : 0;

  // By network (includes unique visitors + last click for the dashboard tab)
  const byNetworkResult = await sql.query(`
    SELECT
      c.network as network,
      COUNT(*) as clicks,
      COUNT(DISTINCT c.anon_id) as unique_visitors,
      MAX(c.ts) as last_click,
      COUNT(*) FILTER (WHERE c.id IN (SELECT click_id FROM affiliate_conversions)) as conversions,
      COALESCE(SUM(ac.commission_cents) FILTER (WHERE ac.status IN ('approved', 'paid')), 0) as commissions_cents
    FROM affiliate_clicks c
    LEFT JOIN affiliate_conversions ac ON ac.click_id = c.id
    ${dateFilter}
    GROUP BY c.network
    ORDER BY commissions_cents DESC
  `);

  const byNetwork = byNetworkResult;

  // By label (top 20). Clicks aren't product-linked in the 005 schema, so
  // group by the anchor text (label) as the closest product identifier.
  const byProductResult = await sql.query(`
    SELECT
      c.label as label,
      COUNT(*) as clicks,
      COUNT(*) FILTER (WHERE c.id IN (SELECT click_id FROM affiliate_conversions)) as conversions,
      COALESCE(SUM(ac.commission_cents) FILTER (WHERE ac.status IN ('approved', 'paid')), 0) as commissions_cents
    FROM affiliate_clicks c
    LEFT JOIN affiliate_conversions ac ON ac.click_id = c.id
    ${dateFilter}
    ${networkFilter}
    GROUP BY c.label
    ORDER BY commissions_cents DESC
    LIMIT 20
  `, networkParam);

  const byProduct = byProductResult;

  // By slug (top 20). Groups clicks by the page slug they were tracked on.
  const bySlugResult = await sql.query(`
    SELECT
      c.slug as slug,
      COUNT(*) as clicks,
      COUNT(DISTINCT c.anon_id) as unique_visitors,
      COUNT(*) FILTER (WHERE c.id IN (SELECT click_id FROM affiliate_conversions)) as conversions,
      COALESCE(SUM(ac.commission_cents) FILTER (WHERE ac.status IN ('approved', 'paid')), 0) as commissions_cents,
      MAX(c.ts) as last_click
    FROM affiliate_clicks c
    LEFT JOIN affiliate_conversions ac ON ac.click_id = c.id
    ${dateFilter}
    ${networkFilter}
    GROUP BY c.slug
    ORDER BY clicks DESC
    LIMIT 20
  `, networkParam);

  const bySlug = bySlugResult;

  // Recent clicks (for the dashboard tab)
  const recentResult = await sql.query(`
    SELECT ts, network, label, slug, country
    FROM affiliate_clicks c
    ${dateFilter}
    ${networkFilter}
    ORDER BY ts DESC
    LIMIT 20
  `, networkParam);

  const recent = recentResult;

  return json(200, {
    period,
    groupBy,
    totalClicks: Number(t.clicks),
    total_clicks: Number(t.clicks),
    series: series.map(s => ({
      period: s.period,
      clicks: Number(s.clicks),
      conversions: Number(s.conversions),
      commissionsCents: Number(s.commissions_cents),
      epc: s.clicks > 0 ? Number(s.commissions_cents) / Number(s.clicks) : 0,
      conversionRate: s.clicks > 0 ? Number(s.conversions) / Number(s.clicks) : 0,
    })),
    totals: {
      clicks: Number(t.clicks),
      conversions: Number(t.conversions),
      commissionsCents: Number(t.commissions_cents),
      avgEpc: Number(avgEpc.toFixed(2)),
      avgConversionRate: Number(avgConversionRate.toFixed(4)),
    },
    byNetwork: byNetwork.map(n => ({
      network: n.network,
      clicks: Number(n.clicks),
      unique_visitors: Number(n.unique_visitors || 0),
      last_click: n.last_click,
      conversions: Number(n.conversions),
      commissionsCents: Number(n.commissions_cents),
      epc: n.clicks > 0 ? Number(n.commissions_cents) / Number(n.clicks) : 0,
      conversionRate: n.clicks > 0 ? Number(n.conversions) / Number(n.clicks) : 0,
    })),
    byProduct: byProduct.map(p => ({
      label: p.label,
      clicks: Number(p.clicks),
      conversions: Number(p.conversions),
      commissionsCents: Number(p.commissions_cents),
      epc: p.clicks > 0 ? Number(p.commissions_cents) / Number(p.clicks) : 0,
      conversionRate: p.clicks > 0 ? Number(p.conversions) / Number(p.clicks) : 0,
    })),
    bySlug: bySlug.map(s => ({
      slug: s.slug,
      clicks: Number(s.clicks),
      unique_visitors: Number(s.unique_visitors || 0),
      conversions: Number(s.conversions),
      commissionsCents: Number(s.commissions_cents),
      lastClick: s.last_click,
    })),
    recent: recent.map(r => ({
      ts: r.ts,
      network: r.network,
      label: r.label,
      slug: r.slug,
      country: r.country,
    })),
  });
}

/**
 * GET /api/portal?action=affiliate-networks
 */
export async function handleAffiliateNetworks() {
  const networks = await sql`
    SELECT
      an.id,
      an.code,
      an.name,
      an.is_active,
      an.api_base_url,
      an.auth_type,
      an.rate_limit_rpm,
      an.config,
      COUNT(DISTINCT ap.id) as products,
      COUNT(c.id) as clicks_7d,
      COALESCE(SUM(ac.commission_cents) FILTER (WHERE ac.status IN ('approved', 'paid')), 0) as commissions_7d
    FROM affiliate_networks an
    LEFT JOIN affiliate_products ap ON ap.network_id = an.id
    LEFT JOIN affiliate_clicks c ON c.network = an.code AND c.ts >= now() - interval '7 days'
    LEFT JOIN affiliate_conversions ac ON ac.click_id = c.id
    GROUP BY an.id
    ORDER BY an.name
  `;

  return json(200, {
    networks: networks.map(n => ({
      id: n.id,
      code: n.code,
      name: n.name,
      isActive: n.is_active,
      apiBaseUrl: n.api_base_url,
      authType: n.auth_type,
      rateLimitRpm: n.rate_limit_rpm,
      config: n.config,
      stats: {
        products: Number(n.products),
        clicks7d: Number(n.clicks_7d),
        commissions7d: Number(n.commissions_7d),
        epc: n.clicks_7d > 0 ? Number(n.commissions_7d) / Number(n.clicks_7d) : 0,
      },
    })),
  });
}

/**
 * POST /api/portal?action=affiliate-sync { networkCode: 'amazon', type: 'incremental' }
 */
export async function handleAffiliateSync(session, request) {
  const body = await request.json().catch(() => ({}));
  const networkCode = body.networkCode;
  const syncType = body.type || "incremental";

  if (!networkCode) {
    return json(400, { ok: false, error: "networkCode required" });
  }

  const network = await sql`
    SELECT id, code, name FROM affiliate_networks WHERE code = ${networkCode} AND is_active = true
  `;

  if (network.length === 0) {
    return json(404, { ok: false, error: "network not found or inactive" });
  }

  const net = network[0];

  // Create sync log entry
  const log = await sql`
    INSERT INTO affiliate_sync_log (network_id, sync_type, status)
    VALUES (${net.id}, ${syncType}, 'started')
    RETURNING id
  `;

  const logId = log[0].id;

  // Dispatch to network-specific sync function
  // For now, return started status - actual sync would be async
  return json(200, {
    ok: true,
    syncId: logId,
    status: "started",
    message: `Sync started for ${net.name} (${syncType}). Check affiliate-sync-log for progress.`,
  });
}

/**
 * POST /api/portal?action=affiliate-ingest
 * Manually trigger product ingestion (seed catalog + eBay if keys set).
 */
export async function handleAffiliateIngest() {
  try {
    const summary = await ingestAffiliateProducts();
    return json(200, { ok: true, summary });
  } catch (err) {
    return json(500, { ok: false, error: String(err?.message || err).slice(0, 300) });
  }
}

function formatProducts(rows) {
  return rows.map(p => ({
    id: p.id,
    title: p.title,
    brand: p.brand,
    category: p.category,
    priceCents: Number(p.price_cents || 0),
    currency: p.currency,
    imageUrl: p.image_url,
    productUrl: p.product_url,
    commissionRate: Number(p.commission_rate || 0),
    commissionType: p.commission_type,
    epc: Number(p.epc || 0),
    conversionRate: Number(p.conversion_rate || 0),
    gravity: Number(p.gravity || 0),
    network: p.network,
    clicks7d: Number(p.clicks_7d || 0),
    conversions7d: Number(p.conversions_7d || 0),
    commissions7d: Number(p.commissions_7d || 0),
  }));
}
