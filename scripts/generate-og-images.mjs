// scripts/generate-og-images.mjs
//
// Generates a branded 1200×630 Open Graph card per blog post:
//   public/og-blog-<slug>.png
//
// The URL shape is fixed by BlogPost.jsx, which emits
//   <meta property="og:image" content="https://simpleitsrq.com/og-blog-<slug>.png">
// so one PNG per post slug is the contract.
//
// Rendering path: build an SVG string (brand background, logo mark top-left,
// wrapped title, category · date line, wordmark bottom-right) and feed it to
// sharp → librsvg → PNG. sharp can't render text natively, but librsvg
// handles Arial/Helvetica + Latin/em-dash fine.
//
// Usage:
//   node scripts/generate-og-images.mjs           # cache-aware (skips unchanged posts)
//   node scripts/generate-og-images.mjs --force   # rebuild every card
//
// Wired into `prebuild` in package.json so new posts get a card on every
// `vercel build` without a manual step.

import sharp from "sharp";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllPosts } from "./_posts-source.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PUBLIC_DIR = join(ROOT, "public");
const POSTS_META_PATH = join(ROOT, "src", "data", "posts-meta.json");
// Sidecar manifest keyed by slug → input-hash of what the SVG derives from.
// Lets us skip regeneration when title/category/date are unchanged, even
// though posts-meta.json's mtime bumps on every prebuild.
const CACHE_PATH = join(PUBLIC_DIR, ".og-blog-cache.json");
// Bump when the SVG template changes to force a full rebuild on next run.
const TEMPLATE_VERSION = 1;

// Brand tokens — keep in sync with :root --syn-bg / --syn-brand in index.html.
const BG = "#0B0D10";
const BG_ACCENT = "#121822";
const BRAND = "#0F6CBD";
const BRAND_LIGHT = "#2B88D8";
const TEXT = "#FFFFFF";
const TEXT_MUTED = "#9AA4B2";

const WIDTH = 1200;
const HEIGHT = 630;
const FORCE = process.argv.includes("--force");

mkdirSync(PUBLIC_DIR, { recursive: true });

// ---------- title sanitising ----------

// Strip emoji + symbol code points librsvg's default font lookup can't render.
// We keep BMP letters, digits, punctuation, and en/em dashes.
function stripUnrenderable(str) {
  // Remove anything in the supplementary planes (U+10000+), which is where
  // most emoji live. Also drop variation selectors and ZWJ sequences.
  return Array.from(str)
    .filter((ch) => {
      const cp = ch.codePointAt(0);
      if (cp >= 0x10000) return false; // supplementary (emoji etc.)
      if (cp >= 0xfe00 && cp <= 0xfe0f) return false; // variation selectors
      if (cp === 0x200d) return false; // ZWJ
      return true;
    })
    .join("");
}

function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Greedy wrap on whole words. Falls back to hard-splitting a single long token.
// `maxChars` is an approximation — Arial-ish at 56px puts ~28–36 real chars per
// line at our 1080px text column; we aim for ~34 so the longest word still fits.
function wrapTitle(title, maxChars = 34, maxLines = 3) {
  const words = title.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (current.length + 1 + word.length <= maxChars) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);

  if (lines.length > maxLines) lines.length = maxLines;

  // If the original title overflows, ellipsise the last line.
  const rebuilt = lines.join(" ").replace(/\s+/g, " ").trim();
  const original = title.replace(/\s+/g, " ").trim();
  if (rebuilt.length < original.length) {
    let last = lines[lines.length - 1];
    // Trim until the ellipsis fits within the char budget.
    while (last.length > maxChars - 1 && last.includes(" ")) {
      last = last.slice(0, last.lastIndexOf(" "));
    }
    lines[lines.length - 1] = last.replace(/[\s,;:–—-]+$/u, "") + "…";
  }
  return lines;
}

function formatDate(iso) {
  if (!iso) return "";
  // Parse as UTC to avoid off-by-one from the runner's timezone.
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function buildSvg({ title, category, date }) {
  const safeTitle = stripUnrenderable(title);
  const lines = wrapTitle(safeTitle).map(escapeXml);
  const metaLine = escapeXml(
    [category, formatDate(date)].filter(Boolean).join("  ·  "),
  );

  // Layout:
  //   margin 72, title column x=72, title block y=260
  //   line-height 72 for 56px font, so 3 lines fit in 216px
  //   meta line 40px below the last title line
  const titleFontSize = 56;
  const titleLineHeight = 72;
  const titleStartY = 290;
  const titleSvg = lines
    .map(
      (line, i) =>
        `<text x="72" y="${titleStartY + i * titleLineHeight}" font-family="Arial, Helvetica, sans-serif" font-size="${titleFontSize}" font-weight="800" fill="${TEXT}" letter-spacing="-1">${line}</text>`,
    )
    .join("\n    ");
  const metaY = titleStartY + lines.length * titleLineHeight + 24;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"  stop-color="${BG}"/>
      <stop offset="100%" stop-color="${BG_ACCENT}"/>
    </linearGradient>
    <radialGradient id="glow" cx="85%" cy="15%" r="55%">
      <stop offset="0%"  stop-color="${BRAND_LIGHT}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${BRAND_LIGHT}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- background -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>

  <!-- brand accent bar, left edge -->
  <rect x="0" y="0" width="6" height="${HEIGHT}" fill="${BRAND}"/>

  <!-- logo mark + wordmark, top-left -->
  <g>
    <rect x="72" y="72" width="72" height="72" rx="16" fill="${BRAND}"/>
    <text x="108" y="125" text-anchor="middle"
          font-family="Arial, Helvetica, sans-serif"
          font-size="48" font-weight="800" fill="${TEXT}">S</text>
    <text x="164" y="108" font-family="Arial, Helvetica, sans-serif"
          font-size="26" font-weight="700" fill="${TEXT}" letter-spacing="-0.5">Simple IT SRQ</text>
    <text x="164" y="134" font-family="Arial, Helvetica, sans-serif"
          font-size="16" font-weight="500" fill="${TEXT_MUTED}">Managed IT &amp; Cybersecurity</text>
  </g>

  <!-- hairline separator -->
  <rect x="72" y="200" width="1056" height="1" fill="#1C2430"/>

  <!-- title block -->
  ${titleSvg}

  <!-- category · date -->
  <text x="72" y="${metaY}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="600" fill="${BRAND_LIGHT}" letter-spacing="0.5">${metaLine}</text>

  <!-- bottom bar -->
  <rect x="0" y="574" width="${WIDTH}" height="56" fill="#06090D"/>
  <rect x="0" y="574" width="${WIDTH}" height="1" fill="#1C2430"/>
  <text x="72" y="609" font-family="Arial, Helvetica, sans-serif"
        font-size="18" font-weight="600" fill="${TEXT}">simpleitsrq.com</text>
  <text x="${WIDTH - 72}" y="609" text-anchor="end"
        font-family="Arial, Helvetica, sans-serif"
        font-size="16" font-weight="500" fill="${TEXT_MUTED}">Sarasota · Bradenton · Venice</text>
</svg>`;
}

// ---------- cache check ----------

// Hash the exact inputs that feed buildSvg(). Bump TEMPLATE_VERSION when the
// template body changes so stale cards are invalidated on the next run.
function postInputHash(post) {
  const payload = JSON.stringify({
    v: TEMPLATE_VERSION,
    title: post.title || "",
    category: post.category || "",
    date: post.date || "",
  });
  return createHash("sha1").update(payload).digest("hex");
}

function loadCache() {
  if (FORCE || !existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}

// ---------- main ----------

async function main() {
  // Prefer the generated posts-meta.json (cheap, already committed). Fall back
  // to loadAllPosts() if it's missing — covers a clean checkout where
  // generate-posts-meta.mjs hasn't run yet.
  let posts;
  if (existsSync(POSTS_META_PATH)) {
    posts = JSON.parse(readFileSync(POSTS_META_PATH, "utf8"));
  } else {
    posts = loadAllPosts();
  }

  const cache = loadCache();
  const nextCache = {};
  let generated = 0;
  let skipped = 0;
  const t0 = Date.now();

  // Sort for deterministic iteration (alphabetical by slug) — the output is
  // per-file so order doesn't change bytes, but logs stay stable.
  posts.sort((a, b) => a.slug.localeCompare(b.slug));

  for (const post of posts) {
    if (!post.slug) continue;
    const outPath = join(PUBLIC_DIR, `og-blog-${post.slug}.png`);
    const hash = postInputHash(post);
    nextCache[post.slug] = hash;

    // Skip when the output still exists and the input hash matches what we
    // rendered last time. posts-meta.json's mtime is not used here: it
    // changes on every prebuild even when nothing substantive was edited.
    if (!FORCE && existsSync(outPath) && cache[post.slug] === hash) {
      skipped++;
      continue;
    }

    const svg = buildSvg({
      title: post.title || "Simple IT SRQ",
      category: post.category || "",
      date: post.date || "",
    });
    await sharp(Buffer.from(svg))
      .png({ compressionLevel: 9, palette: true })
      .toFile(outPath);
    generated++;
  }

  writeFileSync(CACHE_PATH, JSON.stringify(nextCache, null, 2) + "\n", "utf8");

  const ms = Date.now() - t0;
  console.log(
    `og-blog: generated ${generated}, skipped ${skipped} (${posts.length} posts) in ${ms} ms${FORCE ? " [--force]" : ""}`,
  );
}

main().catch((err) => {
  console.error("generate-og-images.mjs failed:", err);
  process.exit(1);
});
