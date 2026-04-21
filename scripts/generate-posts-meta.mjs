// Generates src/data/posts-meta.json — a slim preview of every blog post
// with only the fields Home.jsx and BlogIndex.jsx need (slug, title, date,
// category, author, tags, excerpt, metaDescription, heroAlt, image).
//
// Source priority:
//   1. content/posts/*.mdx     — file-backed MDX with YAML frontmatter
//                                (new, edit content without a deploy)
//   2. src/data/posts.js       — legacy in-code posts (still read so the
//                                full archive keeps rendering during the
//                                MDX migration)
//
// If a slug appears in both, the MDX version wins — it's intended to be
// the edited copy. Regenerated as part of `prebuild`; committed so dev-mode
// finds it without running prebuild first.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import matter from "gray-matter";
import { posts as legacyPosts } from "../src/data/posts.js";

const PREVIEW_FIELDS = [
  "slug",
  "title",
  "date",
  "category",
  "author",
  "tags",
  "excerpt",
  "metaDescription",
  "heroAlt",
  "image",
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(__dirname, "..", "content", "posts");
const OUT_PATH = join(__dirname, "..", "src", "data", "posts-meta.json");

function pick(obj) {
  const out = {};
  for (const k of PREVIEW_FIELDS) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

// 1) MDX posts — parse frontmatter only, discard the body.
let mdxEntries = [];
try {
  mdxEntries = readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((file) => {
      const raw = readFileSync(join(CONTENT_DIR, file), "utf8");
      const { data } = matter(raw);
      // Frontmatter is the authoritative source; fall back to the filename
      // if slug was omitted (shouldn't happen, but cheap to guard).
      const slug = data.slug || file.replace(/\.mdx$/, "");
      return pick({ ...data, slug });
    });
} catch (err) {
  if (err.code !== "ENOENT") throw err;
  // content/posts/ not present yet — fine, we'll fall through to legacy only.
}

// 2) Legacy posts — dedupe by slug against MDX winners.
const mdxSlugs = new Set(mdxEntries.map((p) => p.slug));
const legacyEntries = legacyPosts
  .filter((p) => !mdxSlugs.has(p.slug))
  .map(pick);

// 3) Union + sort newest-first. BlogIndex also sorts, but sorting here
//    keeps the JSON diff-friendly and lets Home.jsx trust file order.
const meta = [...mdxEntries, ...legacyEntries].sort((a, b) =>
  (b.date || "").localeCompare(a.date || ""),
);

writeFileSync(OUT_PATH, JSON.stringify(meta, null, 2) + "\n", "utf8");
console.log(
  `posts-meta.json written: ${meta.length} posts (${mdxEntries.length} MDX, ${legacyEntries.length} legacy)`,
);
