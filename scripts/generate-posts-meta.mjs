// Generates src/data/posts-meta.json — a slim preview of src/data/posts.js
// with only the fields Home.jsx and BlogIndex.jsx need (slug, title, date,
// category, author, tags, excerpt).
//
// Why: posts.js is ~320 KB because every post carries its full markdown
// `content`. Home imports it just to render 6 recent-post previews, which
// ships the entire blog archive in the entry bundle. Routing Home +
// BlogIndex through the slim JSON means only BlogPost (lazy-loaded) pays
// the full-content cost.
//
// Regenerated as part of `prebuild`, same pattern as sitemap.xml/rss.xml.
// Committed so `vite` dev-mode finds it without running prebuild first.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { posts } from "../src/data/posts.js";

const PREVIEW_FIELDS = ["slug", "title", "date", "category", "author", "tags", "excerpt"];

const meta = posts.map((p) => {
  const out = {};
  for (const k of PREVIEW_FIELDS) out[k] = p[k];
  return out;
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "..", "src", "data", "posts-meta.json");
writeFileSync(outPath, JSON.stringify(meta, null, 2) + "\n", "utf8");
console.log(`posts-meta.json written: ${meta.length} posts`);
