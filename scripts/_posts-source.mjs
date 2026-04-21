// Shared post-loading helper for the prebuild scripts.
//
// Reads content/posts/*.mdx frontmatter via gray-matter, unions with the
// legacy src/data/posts.js entries (MDX wins on slug collision), and
// returns a flat list of {slug, title, date, category, author, tags,
// excerpt, metaDescription} — the only fields generate-sitemap.mjs and
// generate-rss.mjs care about.
//
// Keeping this in one place means adding an MDX post automatically
// updates sitemap.xml, rss.xml, and posts-meta.json at prebuild time.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import matter from "gray-matter";
import { posts as legacyPosts } from "../src/data/posts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(__dirname, "..", "content", "posts");

export function loadAllPosts() {
  let mdx = [];
  try {
    mdx = readdirSync(CONTENT_DIR)
      .filter((f) => f.endsWith(".mdx"))
      .map((file) => {
        const raw = readFileSync(join(CONTENT_DIR, file), "utf8");
        const { data } = matter(raw);
        return { ...data, slug: data.slug || file.replace(/\.mdx$/, "") };
      });
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  const mdxSlugs = new Set(mdx.map((p) => p.slug));
  const legacy = legacyPosts.filter((p) => !mdxSlugs.has(p.slug));
  return [...mdx, ...legacy].sort((a, b) =>
    (b.date || "").localeCompare(a.date || ""),
  );
}
