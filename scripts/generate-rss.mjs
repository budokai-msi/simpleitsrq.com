// Generates public/rss.xml from posts.js
// Run with: node scripts/generate-rss.mjs

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { posts } from "../src/data/posts.js";

const SITE = "https://simpleitsrq.com";
const TITLE = "Simple IT SRQ Blog";
const DESCRIPTION =
  "Plain-English takes on security, AI, cloud, and compliance for Sarasota and Bradenton businesses.";

function esc(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const sorted = [...posts].sort((a, b) => b.date.localeCompare(a.date));

const items = sorted
  .map((p) => {
    const pub = new Date(p.date).toUTCString();
    return `    <item>
      <title>${esc(p.title)}</title>
      <link>${SITE}/blog/${p.slug}</link>
      <guid isPermaLink="true">${SITE}/blog/${p.slug}</guid>
      <pubDate>${pub}</pubDate>
      <author>hello@simpleitsrq.com (${esc(p.author)})</author>
      <category>${esc(p.category)}</category>
      <description>${esc(p.excerpt || p.metaDescription || "")}</description>
    </item>`;
  })
  .join("\n");

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${TITLE}</title>
    <link>${SITE}/blog</link>
    <atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml" />
    <description>${DESCRIPTION}</description>
    <language>en-us</language>
    <lastBuildDate>${new Date(sorted[0]?.date || Date.now()).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;

const __dirname = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(__dirname, "..", "public", "rss.xml"), xml, "utf8");
console.log(`rss.xml written: ${sorted.length} items`);
