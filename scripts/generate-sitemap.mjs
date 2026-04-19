// Generates public/sitemap.xml from the posts.js + cities.js data files.
// Run with: node scripts/generate-sitemap.mjs

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { posts } from "../src/data/posts.js";
import { cityList } from "../src/data/cities.js";

const SITE = "https://simpleitsrq.com";
const TODAY = new Date().toISOString().slice(0, 10);

const staticUrls = [
  { loc: "/", priority: "1.0", changefreq: "weekly" },
  { loc: "/blog", priority: "0.9", changefreq: "daily" },
  { loc: "/store", priority: "0.9", changefreq: "weekly" },
  { loc: "/book", priority: "0.8", changefreq: "monthly" },
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

const all = [...staticUrls, ...cityUrls, ...postUrls];

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
