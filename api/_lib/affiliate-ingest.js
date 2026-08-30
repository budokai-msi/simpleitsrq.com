// api/_lib/affiliate-ingest.js
//
// Affiliate product ingestion. Populates `affiliate_products` from network
// sources. Two paths:
//
//   1. eBay Browse API (OAuth2) — used when EBAY_APP_ID / EBAY_CERT_ID are set.
//      Fetches products for a set of IT/MSP-relevant keywords and upserts them.
//   2. Seed catalog fallback — a curated IT/MSP product catalog (keyless) so
//      the dashboard has real, useful data even before any network API key is
//      configured. This is the "product data feed ingested into your own
//      database" path from the spec.
//
// Exports `ingestAffiliateProducts()` for the cron endpoint and the local
// script. Never throws on a single network failure — it logs and continues.

import { sql } from "./db.js";

// Curated IT/MSP product catalog (keyless seed). Each entry maps to a network
// code that already exists in `affiliate_networks` (seeded by migration 022).
const SEED_PRODUCTS = [
  // --- Amazon (hardware / accessories) ---
  { network: "amazon", externalId: "amz-ssd-1tb", title: "1TB NVMe SSD Upgrade Kit", brand: "Samsung", category: "Storage", priceCents: 8999, currency: "USD", imageUrl: "", productUrl: "https://www.amazon.com/s?k=1tb+nvme+ssd", commissionRate: 4.5, commissionType: "percent", epc: 120, conversionRate: 0.08, gravity: 45 },
  { network: "amazon", externalId: "amz-rt-ac86u", title: "Wi-Fi 6 Router (AX5400)", brand: "ASUS", category: "Networking", priceCents: 19999, currency: "USD", imageUrl: "", productUrl: "https://www.amazon.com/s?k=wifi+6+router", commissionRate: 4.5, commissionType: "percent", epc: 95, conversionRate: 0.06, gravity: 38 },
  { network: "amazon", externalId: "amz-ubiquiti-u6", title: "UniFi U6 Pro Access Point", brand: "Ubiquiti", category: "Networking", priceCents: 14900, currency: "USD", imageUrl: "", productUrl: "https://www.amazon.com/s?k=unifi+u6+pro", commissionRate: 4.5, commissionType: "percent", epc: 88, conversionRate: 0.05, gravity: 30 },
  { network: "amazon", externalId: "amz-backup-hdd", title: "4TB External Backup Drive", brand: "Seagate", category: "Storage", priceCents: 10999, currency: "USD", imageUrl: "", productUrl: "https://www.amazon.com/s?k=4tb+external+hard+drive", commissionRate: 4.5, commissionType: "percent", epc: 75, conversionRate: 0.07, gravity: 42 },

  // --- eBay (refurbished / networking gear) ---
  { network: "ebay", externalId: "ebay-rack-server", title: "Refurbished Rack Server (Dell R740)", brand: "Dell", category: "Servers", priceCents: 89900, currency: "USD", imageUrl: "", productUrl: "https://www.ebay.com/sch/i.html?_nkw=dell+r740+server", commissionRate: 3.0, commissionType: "percent", epc: 210, conversionRate: 0.04, gravity: 22 },
  { network: "ebay", externalId: "ebay-switch-48", title: "48-Port Managed PoE Switch", brand: "Cisco", category: "Networking", priceCents: 34900, currency: "USD", imageUrl: "", productUrl: "https://www.ebay.com/sch/i.html?_nkw=cisco+48+port+poe+switch", commissionRate: 3.0, commissionType: "percent", epc: 150, conversionRate: 0.05, gravity: 18 },
  { network: "ebay", externalId: "ebay-laptop-i7", title: "Refurbished Business Laptop (i7)", brand: "Lenovo", category: "Laptops", priceCents: 54900, currency: "USD", imageUrl: "", productUrl: "https://www.ebay.com/sch/i.html?_nkw=lenovo+thinkpad+i7", commissionRate: 3.0, commissionType: "percent", epc: 130, conversionRate: 0.06, gravity: 35 },

  // --- AliExpress (cabling / accessories) ---
  { network: "aliexpress", externalId: "ali-cat6-1000ft", title: "Cat6 Ethernet Cable 1000ft", brand: "Generic", category: "Cabling", priceCents: 4599, currency: "USD", imageUrl: "", productUrl: "https://www.aliexpress.com/w/wholesale-cat6-cable.html", commissionRate: 8.0, commissionType: "percent", epc: 60, conversionRate: 0.09, gravity: 50 },
  { network: "aliexpress", externalId: "ali-rack-12u", title: "12U Wall-Mount Server Rack", brand: "Generic", category: "Racks", priceCents: 7999, currency: "USD", imageUrl: "", productUrl: "https://www.aliexpress.com/w/wholesale-12u-server-rack.html", commissionRate: 8.0, commissionType: "percent", epc: 55, conversionRate: 0.07, gravity: 28 },

  // --- ShareASale (SaaS / software) ---
  { network: "shareasale", externalId: "sas-backup-soft", title: "Cloud Backup for Business (1yr)", brand: "Backblaze", category: "Software", priceCents: 7000, currency: "USD", imageUrl: "", productUrl: "https://www.backblaze.com/cloud-backup.html", commissionRate: 20.0, commissionType: "percent", epc: 180, conversionRate: 0.10, gravity: 40 },
  { network: "shareasale", externalId: "sas-password-mgr", title: "Password Manager (Business)", brand: "1Password", category: "Software", priceCents: 7999, currency: "USD", imageUrl: "", productUrl: "https://1password.com/business", commissionRate: 30.0, commissionType: "percent", epc: 220, conversionRate: 0.12, gravity: 55 },

  // --- CJ Affiliate (office / productivity) ---
  { network: "cj", externalId: "cj-ms365", title: "Microsoft 365 Business Standard (1yr)", brand: "Microsoft", category: "Software", priceCents: 15000, currency: "USD", imageUrl: "", productUrl: "https://www.microsoft.com/microsoft-365/business", commissionRate: 5.0, commissionType: "percent", epc: 90, conversionRate: 0.05, gravity: 60 },
  { network: "cj", externalId: "cj-zoom-pro", title: "Zoom Workplace Pro (1yr)", brand: "Zoom", category: "Software", priceCents: 17999, currency: "USD", imageUrl: "", productUrl: "https://zoom.us/pricing", commissionRate: 15.0, commissionType: "percent", epc: 140, conversionRate: 0.08, gravity: 33 },

  // --- Awin (IT services / hardware) ---
  { network: "awin", externalId: "awin-ubnt-cam", title: "UniFi Protect Camera (G4)", brand: "Ubiquiti", category: "Security", priceCents: 19900, currency: "USD", imageUrl: "", productUrl: "https://store.ui.com/us/en/category/cameras", commissionRate: 6.0, commissionType: "percent", epc: 110, conversionRate: 0.06, gravity: 25 },
  { network: "awin", externalId: "awin-reolink-nvr", title: "Reolink NVR + 4 Camera Kit", brand: "Reolink", category: "Security", priceCents: 29900, currency: "USD", imageUrl: "", productUrl: "https://reolink.com/nvr-kits/", commissionRate: 8.0, commissionType: "percent", epc: 160, conversionRate: 0.07, gravity: 20 },

  // --- Rakuten (office supplies / hardware) ---
  { network: "rakuten", externalId: "rak-4k-monitor", title: "27\" 4K Business Monitor", brand: "Dell", category: "Displays", priceCents: 32900, currency: "USD", imageUrl: "", productUrl: "https://www.dell.com/en-us/shop/monitors", commissionRate: 4.0, commissionType: "percent", epc: 70, conversionRate: 0.05, gravity: 15 },
  { network: "rakuten", externalId: "rak-doc-station", title: "USB-C Docking Station", brand: "Dell", category: "Accessories", priceCents: 18900, currency: "USD", imageUrl: "", productUrl: "https://www.dell.com/en-us/shop/docking-stations", commissionRate: 4.0, commissionType: "percent", epc: 65, conversionRate: 0.06, gravity: 12 },

  // --- Impact (SaaS / security) ---
  { network: "impact", externalId: "imp-endpoint", title: "Endpoint Protection (per seat/yr)", brand: "Acronis", category: "Security", priceCents: 6000, currency: "USD", imageUrl: "", productUrl: "https://www.acronis.com/cyber-protection/", commissionRate: 25.0, commissionType: "percent", epc: 200, conversionRate: 0.11, gravity: 48 },
  { network: "impact", externalId: "imp-voip", title: "Business VoIP Phone System", brand: "RingCentral", category: "Communications", priceCents: 24000, currency: "USD", imageUrl: "", productUrl: "https://www.ringcentral.com/", commissionRate: 20.0, commissionType: "percent", epc: 190, conversionRate: 0.09, gravity: 30 },
];

// --- eBay Browse API (OAuth2) ----------------------------------------------

async function getEbayToken() {
  const appId = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;
  if (!appId || !certId) return null;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "https://api.ebay.com/oauth/api_scope",
  });
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${appId}:${certId}`).toString("base64")}`,
    },
    body,
  });
  if (!res.ok) throw new Error(`eBay token HTTP ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

async function fetchEbayProducts(keyword) {
  const token = await getEbayToken();
  if (!token) return [];
  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(keyword)}&limit=10`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
  });
  if (!res.ok) throw new Error(`eBay search HTTP ${res.status}`);
  const data = await res.json();
  return (data.itemSummaries || []).map((it) => ({
    externalId: `ebay-${it.itemId}`,
    title: it.title,
    brand: it.brand || "eBay",
    category: it.categoryPath || "eBay",
    priceCents: Math.round(Number(it.price?.value || 0) * 100),
    currency: it.price?.currency || "USD",
    imageUrl: it.image?.imageUrl || "",
    productUrl: it.itemWebUrl || "",
    commissionRate: 3.0,
    commissionType: "percent",
    epc: 0,
    conversionRate: 0,
    gravity: 0,
  }));
}

// --- Upsert ----------------------------------------------------------------

async function upsertProduct(networkCode, p) {
  const net = await sql`SELECT id FROM affiliate_networks WHERE code = ${networkCode}`;
  if (net.length === 0) return 0;
  const networkId = net[0].id;
  await sql`
    INSERT INTO affiliate_products (
      network_id, external_id, title, description, brand, category,
      price_cents, currency, image_url, product_url,
      commission_rate, commission_type, epc, conversion_rate, gravity
    )
    VALUES (
      ${networkId}, ${p.externalId}, ${p.title}, ${p.description || null}, ${p.brand || null}, ${p.category || null},
      ${p.priceCents}, ${p.currency || "USD"}, ${p.imageUrl || null}, ${p.productUrl},
      ${p.commissionRate}, ${p.commissionType}, ${p.epc || 0}, ${p.conversionRate || 0}, ${p.gravity || 0}
    )
    ON CONFLICT (network_id, external_id) DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      brand = EXCLUDED.brand,
      category = EXCLUDED.category,
      price_cents = EXCLUDED.price_cents,
      currency = EXCLUDED.currency,
      image_url = EXCLUDED.image_url,
      product_url = EXCLUDED.product_url,
      commission_rate = EXCLUDED.commission_rate,
      commission_type = EXCLUDED.commission_type,
      epc = EXCLUDED.epc,
      conversion_rate = EXCLUDED.conversion_rate,
      gravity = EXCLUDED.gravity,
      last_synced_at = now()
  `;
  return 1;
}

// --- Main entry ------------------------------------------------------------

export async function ingestAffiliateProducts() {
  const summary = { seed: 0, ebay: 0, errors: [] };

  // 1. Seed catalog (keyless) — always run so the dashboard has data.
  for (const p of SEED_PRODUCTS) {
    try {
      summary.seed += await upsertProduct(p.network, p);
    } catch (err) {
      summary.errors.push(`seed ${p.network}/${p.externalId}: ${err.message}`);
    }
  }

  // 2. eBay Browse API — only if keys are configured.
  if (process.env.EBAY_APP_ID && process.env.EBAY_CERT_ID) {
    const keywords = ["laptop", "server", "router", "ssd", "monitor"];
    for (const kw of keywords) {
      try {
        const items = await fetchEbayProducts(kw);
        for (const it of items) summary.ebay += await upsertProduct("ebay", it);
      } catch (err) {
        summary.errors.push(`ebay ${kw}: ${err.message}`);
      }
    }
  } else {
    console.log("[affiliate-ingest] eBay keys not set; using seed catalog only.");
  }

  console.log("[affiliate-ingest] Summary:", JSON.stringify(summary));
  return summary;
}
