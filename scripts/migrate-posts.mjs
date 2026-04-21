// One-off migration: src/data/posts.js  →  content/posts/<slug>.mdx
//
// Reads the legacy posts array, and for every slug that does NOT already
// exist as an .mdx file under content/posts/, writes one.
//
// Conversions applied to the body:
//   - `[[amazon_search:query|label]]` shortcode  →  `<Affiliate token="..." />`
//   - `[[some_other_program:query|label]]` shortcode  →  `<Affiliate token="..." />`
//     (the Affiliate component already accepts the same token format)
// Anything else is left as-is — the legacy posts.js bodies are already
// Markdown (no raw JSX, no raw HTML tags, no `${}` template interpolation
// verified by grep).
//
// Run: `node scripts/migrate-posts.mjs`
// Idempotent: existing MDX files are skipped.

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { posts as legacyPosts } from "../src/data/posts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(__dirname, "..", "content", "posts");

if (!existsSync(CONTENT_DIR)) mkdirSync(CONTENT_DIR, { recursive: true });

const existing = new Set(
  readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, "")),
);

// ---------- YAML frontmatter helpers --------------------------------------

// YAML single-line scalar: pick the safest quoting for a string value.
// Using double quotes across the board matches the style of the existing
// hand-authored MDX files (content/posts/5-mfa-methods-*.mdx).
function yamlString(value) {
  if (value === undefined || value === null) return '""';
  const s = String(value);
  // Escape backslashes first, then double quotes.
  const escaped = s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function yamlBlock(fields) {
  const lines = ["---"];
  for (const [key, value] of fields) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${yamlString(item)}`);
        }
      }
    } else {
      lines.push(`${key}: ${yamlString(value)}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

// ---------- Body transform ------------------------------------------------

// Shortcode inventory (confirmed via grep of src/data/posts.js):
//   [[amazon_search:query|label]]   — Amazon search affiliate link
//   [[amazon:ASIN|label]]           — Amazon product affiliate link
//   [[gusto]]                       — Gusto referral
//   [[acronis]]                     — Acronis partner
//   (and any other bare key listed in src/data/affiliates.js)
//
// All of them are accepted by the <Affiliate token="..."/> component
// unchanged (the token string is passed straight into resolveAffiliate).
// So the transform is just "strip the [[ ]] brackets and wrap in JSX".
//
// Match any `[[ ... ]]` block. Audited the full set of `[[` occurrences
// in src/data/posts.js and every single one is an affiliate token —
// there's no `[[wiki-style]]` prose anywhere in the corpus — so this
// is safe. Using a broad match avoids breakage from special characters
// inside labels (e.g. "20+ sheet …", hyphens, slashes, etc.).
const SHORTCODE_RE = /\[\[([^\]]+?)\]\]/g;

function transformBody(body) {
  let out = body;

  // Rewrite shortcodes.
  out = out.replace(SHORTCODE_RE, (_, token) => {
    // Escape any double quote inside the token so the JSX attribute
    // stays syntactically valid. (None expected in the current data,
    // but cheap insurance.)
    const safe = token.replace(/"/g, '\\"');
    return `<Affiliate token="${safe}" />`;
  });

  return out;
}

// ---------- Main ---------------------------------------------------------

let written = 0;
let skipped = 0;
const skippedSlugs = [];
const reportedAnomalies = [];

for (const post of legacyPosts) {
  if (!post?.slug) {
    reportedAnomalies.push(`(no slug on entry with title: ${post?.title ?? "???"})`);
    continue;
  }
  if (existing.has(post.slug)) {
    skipped += 1;
    skippedSlugs.push(post.slug);
    continue;
  }

  // Defensive: if we ever see content that smells like raw React
  // (createElement / JSX that's not an Affiliate shortcode / interpolation)
  // we skip so the operator can handle it manually.
  const rawContent = post.content ?? "";
  if (/createElement\s*\(/.test(rawContent)) {
    reportedAnomalies.push(`${post.slug}: contains createElement() — skipped`);
    continue;
  }

  const body = transformBody(rawContent);

  const fm = yamlBlock([
    ["slug", post.slug],
    ["title", post.title],
    ["metaDescription", post.metaDescription],
    ["date", post.date],
    ["author", post.author],
    ["category", post.category],
    ["tags", Array.isArray(post.tags) ? post.tags : []],
    ["excerpt", post.excerpt],
    ["heroAlt", post.heroAlt],
    ["image", post.image],
  ]);

  const mdx = `${fm}\n\n${body.trimStart()}\n`;
  const outPath = join(CONTENT_DIR, `${post.slug}.mdx`);
  writeFileSync(outPath, mdx, "utf8");
  written += 1;
}

// Report.
console.log(`[migrate-posts] wrote ${written} new MDX file(s)`);
console.log(`[migrate-posts] skipped ${skipped} existing slug(s)`);
if (skippedSlugs.length) {
  for (const slug of skippedSlugs) console.log(`  - ${slug}`);
}
if (reportedAnomalies.length) {
  console.log(`[migrate-posts] anomalies:`);
  for (const line of reportedAnomalies) console.log(`  ! ${line}`);
}
