// scripts/generate-og-images.mjs
//
// Generates branded 1200×630 Open Graph cards:
//   public/og-blog-<slug>.png      — one per blog post
//   public/og-product-<slug>.png   — one per /store product
//
// The URL shapes are fixed by their respective consumers:
//   BlogPost.jsx     →  og-blog-<slug>.png
//   ProductDetail.jsx → og-product-<slug>.png  (also embedded in Product JSON-LD)
//
// Rendering path: build an SVG string (brand background, logo mark top-left,
// wrapped title, category · date line, wordmark bottom-right) and feed it to
// sharp → librsvg → PNG. sharp can't render text natively, but librsvg
// handles Arial/Helvetica + Latin/em-dash fine.
//
// Usage:
//   node scripts/generate-og-images.mjs           # cache-aware (skips unchanged)
//   node scripts/generate-og-images.mjs --force   # rebuild every card
//
// Wired into `prebuild` in package.json so new posts/products get a card on
// every `vercel build` without a manual step.

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
import { products } from "../src/data/products.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PUBLIC_DIR = join(ROOT, "public");
const POSTS_META_PATH = join(ROOT, "src", "data", "posts-meta.json");
// Sidecar manifest keyed by `${kind}:${slug}` → input-hash. Single file
// covers both blog posts and store products so a future "kind" can join
// without a new cache file.
const CACHE_PATH = join(PUBLIC_DIR, ".og-card-cache.json");
// Legacy blog-only cache path. We migrate it once on first run after this
// file's introduction so the first build doesn't regen 59 unchanged blog
// cards. Safe to delete once the deploy that ships this has run twice.
const LEGACY_BLOG_CACHE_PATH = join(PUBLIC_DIR, ".og-blog-cache.json");
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
function inputHash(fields) {
  const payload = JSON.stringify({
    v: TEMPLATE_VERSION,
    title: fields.title || "",
    category: fields.category || "",
    date: fields.date || "",
  });
  return createHash("sha1").update(payload).digest("hex");
}

function loadCache() {
  if (FORCE) return {};
  if (existsSync(CACHE_PATH)) {
    try {
      return JSON.parse(readFileSync(CACHE_PATH, "utf8"));
    } catch {
      return {};
    }
  }
  // First run after rename: import the legacy blog-only cache so we don't
  // needlessly regenerate every blog card on the deploy that introduces
  // product cards.
  if (existsSync(LEGACY_BLOG_CACHE_PATH)) {
    try {
      const legacy = JSON.parse(readFileSync(LEGACY_BLOG_CACHE_PATH, "utf8"));
      const migrated = {};
      for (const [slug, hash] of Object.entries(legacy)) {
        migrated[`blog:${slug}`] = hash;
      }
      return migrated;
    } catch {
      return {};
    }
  }
  return {};
}

// ---------- main ----------

// Render one card if (and only if) inputs changed since the last build. Mutates
// `nextCache` and the running counters so the caller can log a single summary.
async function renderCard({ kind, slug, fields, outPath, cache, nextCache, counters }) {
  const cacheKey = `${kind}:${slug}`;
  const hash = inputHash(fields);
  nextCache[cacheKey] = hash;
  if (!FORCE && existsSync(outPath) && cache[cacheKey] === hash) {
    counters.skipped++;
    return;
  }
  const svg = buildSvg(fields);
  await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, palette: true })
    .toFile(outPath);
  counters.generated++;
}

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
  const blogCounters = { generated: 0, skipped: 0 };
  const productCounters = { generated: 0, skipped: 0 };
  const t0 = Date.now();

  // Sort for deterministic iteration (alphabetical by slug) — the output is
  // per-file so order doesn't change bytes, but logs stay stable.
  posts.sort((a, b) => a.slug.localeCompare(b.slug));

  for (const post of posts) {
    if (!post.slug) continue;
    await renderCard({
      kind: "blog",
      slug: post.slug,
      fields: {
        title: post.title || "Simple IT SRQ",
        category: post.category || "",
        date: post.date || "",
      },
      outPath: join(PUBLIC_DIR, `og-blog-${post.slug}.png`),
      cache,
      nextCache,
      counters: blogCounters,
    });
  }

  // Products. Category line shows "Store · $price[suffix]" so the card reads
  // like a price tag at a glance — beats a blank "Simple IT SRQ" eyebrow on
  // social previews.
  const sortedProducts = [...products].sort((a, b) => a.slug.localeCompare(b.slug));
  for (const product of sortedProducts) {
    if (!product.slug) continue;
    const priceLabel =
      typeof product.price === "number"
        ? `$${product.price}${product.priceSuffix || ""}`
        : "";
    await renderCard({
      kind: "product",
      slug: product.slug,
      fields: {
        title: product.title || "Simple IT SRQ Store",
        category: ["Simple IT SRQ Store", priceLabel].filter(Boolean).join("  ·  "),
        date: "",
      },
      outPath: join(PUBLIC_DIR, `og-product-${product.slug}.png`),
      cache,
      nextCache,
      counters: productCounters,
    });
  }

  writeFileSync(CACHE_PATH, JSON.stringify(nextCache, null, 2) + "\n", "utf8");

  const ms = Date.now() - t0;
  console.log(
    `og: blog ${blogCounters.generated}/${posts.length} new, ${blogCounters.skipped} cached · ` +
      `product ${productCounters.generated}/${sortedProducts.length} new, ${productCounters.skipped} cached · ` +
      `${ms} ms${FORCE ? " [--force]" : ""}`,
  );
}

main().catch((err) => {
  console.error("generate-og-images.mjs failed:", err);
  process.exit(1);
});
