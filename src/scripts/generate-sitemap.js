// Generates public/sitemap.xml and public/rss.xml from src/data/posts.js
// Usage: node src/scripts/generate-sitemap.js
import { posts } from "../data/posts.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, "../../public");
const SITE = "https://simpleitsrq.com";

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

mkdirSync(PUBLIC_DIR, { recursive: true });

const staticUrls = [
  { loc: `${SITE}/`, priority: "1.0", changefreq: "weekly" },
  { loc: `${SITE}/blog`, priority: "0.9", changefreq: "daily" },
  { loc: `${SITE}/privacy`, priority: "0.3", changefreq: "yearly" },
  { loc: `${SITE}/terms`, priority: "0.3", changefreq: "yearly" },
  { loc: `${SITE}/accessibility`, priority: "0.3", changefreq: "yearly" },
];

const sortedPosts = [...posts].sort((a, b) => b.date.localeCompare(a.date));

const sitemapEntries = [
  ...staticUrls.map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  ),
  ...sortedPosts.map(
    (p) => `  <url>
    <loc>${SITE}/blog/${p.slug}</loc>
    <lastmod>${p.date}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`
  ),
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries.join("\n")}
</urlset>
`;

writeFileSync(resolve(PUBLIC_DIR, "sitemap.xml"), sitemap, "utf8");
console.log("Wrote sitemap.xml with", sortedPosts.length + staticUrls.length, "entries");

const rssItems = sortedPosts
  .map(
    (p) => `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${SITE}/blog/${p.slug}</link>
      <guid isPermaLink="true">${SITE}/blog/${p.slug}</guid>
      <pubDate>${new Date(p.date).toUTCString()}</pubDate>
      <category>${escapeXml(p.category)}</category>
      <description>${escapeXml(p.metaDescription)}</description>
    </item>`
  )
  .join("\n");

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Simple IT SRQ Blog</title>
    <link>${SITE}/blog</link>
    <atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml"/>
    <description>Insights for Sarasota and Bradenton businesses on cybersecurity, AI, cloud, and compliance.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${rssItems}
  </channel>
</rss>
`;

writeFileSync(resolve(PUBLIC_DIR, "rss.xml"), rss, "utf8");
console.log("Wrote rss.xml with", sortedPosts.length, "items");
