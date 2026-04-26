// Generates public/sitemap.xml from MDX posts + legacy posts.js + cities.
// Run with: node scripts/generate-sitemap.mjs

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadAllPosts } from "./_posts-source.mjs";
import { cityList, cities } from "../src/data/cities.js";
import { products } from "../src/data/products.js";
import { COMPARISONS } from "../src/data/comparisons.js";
import { GLOSSARY } from "../src/data/glossary.js";
import { industryCityPairs } from "../src/data/industries.js";

const posts = loadAllPosts();

const SITE = "https://simpleitsrq.com";
// Default <lastmod> for URLs that don't carry their own date.
// Using the latest post date keeps the sitemap deterministic across builds
// (avoids a noisy git diff every prebuild run) and still signals freshness
// to search engines when new content actually ships.
const LATEST_POST_DATE = [...posts]
  .map((p) => p.date)
  .sort()
  .at(-1) || new Date().toISOString().slice(0, 10);
const TODAY = LATEST_POST_DATE;

const staticUrls = [
  { loc: "/", priority: "1.0", changefreq: "weekly" },
  { loc: "/blog", priority: "0.9", changefreq: "daily" },
  { loc: "/store", priority: "0.9", changefreq: "weekly" },
  { loc: "/services", priority: "0.95", changefreq: "weekly" },
  { loc: "/wisp-starter", priority: "0.9", changefreq: "monthly" },
  { loc: "/pricing", priority: "0.95", changefreq: "monthly" },
  { loc: "/security-academy", priority: "0.9", changefreq: "monthly" },
  { loc: "/cyber-insurance-quote", priority: "0.9", changefreq: "monthly" },
  { loc: "/stack", priority: "0.9", changefreq: "monthly" },
  { loc: "/compliance-audit-referral", priority: "0.9", changefreq: "monthly" },
  { loc: "/password-check", priority: "0.9", changefreq: "monthly" },
  { loc: "/book", priority: "0.8", changefreq: "monthly" },
  { loc: "/service-area", priority: "0.85", changefreq: "monthly" },
  { loc: "/partners", priority: "0.8", changefreq: "monthly" },
  { loc: "/compare", priority: "0.8", changefreq: "monthly" },
  { loc: "/glossary", priority: "0.85", changefreq: "monthly" },
  { loc: "/industries", priority: "0.85", changefreq: "monthly" },
  { loc: "/exposure-scan", priority: "0.9", changefreq: "monthly" },
  // /live-threats deliberately omitted — admin-only page; the route
  // emits noindex + non-admin visitors get redirected to /exposure-scan.
  { loc: "/advertise", priority: "0.7", changefreq: "monthly" },
  { loc: "/support", priority: "0.6", changefreq: "monthly" },
  { loc: "/privacy", priority: "0.3", changefreq: "yearly" },
  { loc: "/terms", priority: "0.3", changefreq: "yearly" },
  { loc: "/accessibility", priority: "0.3", changefreq: "yearly" },
];

const cityUrls = cityList.map((c) => ({
  loc: `/${c.slug}`,
  priority: "0.9",
  changefreq: "monthly",
}));

const postUrls = posts.map((p) => ({
  loc: `/blog/${p.slug}`,
  priority: "0.7",
  changefreq: "monthly",
  lastmod: p.date,
}));

const productUrls = products.map((p) => ({
  loc: `/store/${p.slug}`,
  priority: "0.8",
  changefreq: "weekly",
}));

const compareUrls = COMPARISONS.map((c) => ({
  loc: `/compare/${c.slug}`,
  priority: "0.75",
  changefreq: "monthly",
  lastmod: c.date,
}));

const glossaryUrls = GLOSSARY.map((g) => ({
  loc: `/glossary/${g.slug}`,
  priority: "0.7",
  changefreq: "monthly",
}));

// Industry × city long-tail pages — 18+ URLs covering medical/law/financial-
// advisor/marine/construction/vacation-rental verticals across the cities
// where each one has a matching pattern in cities.localPatterns.
const industryUrls = [...industryCityPairs(cities)].map((p) => ({
  loc: p.url,
  priority: "0.85",
  changefreq: "monthly",
}));

const all = [...staticUrls, ...cityUrls, ...postUrls, ...productUrls, ...compareUrls, ...glossaryUrls, ...industryUrls];

const body = all
  .map((u) => {
    const lastmod = u.lastmod || TODAY;
    return `  <url>
    <loc>${SITE}${u.loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`;
  })
  .join("\n");

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;

const __dirname = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(__dirname, "..", "public", "sitemap.xml"), xml, "utf8");
console.log(`sitemap.xml written: ${all.length} URLs`);
