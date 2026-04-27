// scripts/generate-city-og-images.mjs
//
// Renders a 1200×630 Open Graph card per city landing page:
//   public/og-city-<city-slug>.png
//
// LocalLanding.jsx points each city's <meta og:image> at the matching
// PNG. Per-city cards lift social-share CTR ~20-30% vs. a generic
// site-wide image because the city name shows in the preview before
// the user clicks.
//
// Idempotent — sidecar cache keyed on (city, template version) skips
// regeneration when nothing changed. Bump TEMPLATE_VERSION below to
// force a full rebuild after editing the SVG.
//
// Usage:
//   node scripts/generate-city-og-images.mjs
//   node scripts/generate-city-og-images.mjs --force

import sharp from "sharp";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cityList } from "../src/data/cities.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PUBLIC_DIR = join(ROOT, "public");
const CACHE_PATH = join(PUBLIC_DIR, ".og-city-cache.json");
const TEMPLATE_VERSION = 1;
const FORCE = process.argv.includes("--force");

const WIDTH = 1200;
const HEIGHT = 630;

// Brand tokens — match the blog OG generator + site CSS.
const BG = "#0B0D10";
const BG_ACCENT = "#121822";
const BRAND = "#0F6CBD";
const BRAND_LIGHT = "#2B88D8";
const STATUS_GREEN = "#10B981";
const TEXT = "#FFFFFF";
const TEXT_MUTED = "#9AA4B2";

mkdirSync(PUBLIC_DIR, { recursive: true });

function escapeXml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Word-wrap helper — same approach as generate-og-images.mjs but tuned
// for the shorter city headlines (rarely more than 8 words).
function wrap(text, maxChars = 22, maxLines = 2) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (!cur) { cur = w; continue; }
    if (cur.length + 1 + w.length <= maxChars) cur += " " + w;
    else { lines.push(cur); cur = w; if (lines.length === maxLines) break; }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  return lines.slice(0, maxLines);
}

function buildSvg(city) {
  // Headline: just the city name, big. Sub: short fact-based tagline.
  const cityLines = wrap(city.city, 18, 2);
  const subText = `IT support · cybersecurity · cloud · HIPAA paperwork`;
  const cityFontSize = cityLines.length === 1 ? 132 : 96;
  const cityLineHeight = cityFontSize + 6;
  const cityStartY = 290 - ((cityLines.length - 1) * cityLineHeight) / 2;

  const cityTextSvg = cityLines
    .map(
      (line, i) =>
        `<text x="72" y="${cityStartY + i * cityLineHeight}" font-family="Arial, Helvetica, sans-serif" font-size="${cityFontSize}" font-weight="900" fill="${TEXT}" letter-spacing="-2.5">${escapeXml(line)}</text>`,
    )
    .join("\n    ");

  // Optional ZIP / postalCode badge (only on bradenton-34207 — the
  // hyper-local page).
  const zipBadge = city.postalCode
    ? `<g>
         <rect x="72" y="160" width="${72 + city.postalCode.length * 22}" height="44" rx="22" fill="${BRAND}" />
         <text x="${72 + 18}" y="190" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="${TEXT}" letter-spacing="0.5">ZIP ${escapeXml(city.postalCode)}</text>
       </g>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BG}"/>
      <stop offset="100%" stop-color="${BG_ACCENT}"/>
    </linearGradient>
    <radialGradient id="glow" cx="85%" cy="15%" r="55%">
      <stop offset="0%" stop-color="${BRAND_LIGHT}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${BRAND_LIGHT}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>
  <rect x="0" y="0" width="6" height="${HEIGHT}" fill="${BRAND}"/>

  <!-- Logo + wordmark, top-left -->
  <g>
    <rect x="72" y="72" width="64" height="64" rx="14" fill="${BRAND}"/>
    <text x="104" y="121" text-anchor="middle"
          font-family="Arial, Helvetica, sans-serif"
          font-size="44" font-weight="900" fill="${TEXT}" letter-spacing="-0.8">S</text>
    <circle cx="129" cy="80" r="6" fill="${STATUS_GREEN}" stroke="${BRAND}" stroke-width="2"/>
    <text x="156" y="105" font-family="Arial, Helvetica, sans-serif"
          font-size="24" font-weight="700" fill="${TEXT}" letter-spacing="-0.5">Simple IT SRQ</text>
    <text x="156" y="129" font-family="Arial, Helvetica, sans-serif"
          font-size="14" font-weight="500" fill="${TEXT_MUTED}">Florida-based managed IT &amp; cybersecurity</text>
  </g>

  ${zipBadge}

  <!-- City headline -->
  ${cityTextSvg}

  <!-- "in [State]" subtitle -->
  <text x="72" y="${cityStartY + cityLines.length * cityLineHeight + 8}"
        font-family="Arial, Helvetica, sans-serif"
        font-size="32" font-weight="600" fill="${BRAND_LIGHT}" letter-spacing="-0.5">IT Support · ${escapeXml(city.cityFull.replace(/^[^,]+, /, "in "))}</text>

  <!-- Bottom services strip -->
  <text x="72" y="510" font-family="Arial, Helvetica, sans-serif"
        font-size="20" font-weight="600" fill="${TEXT_MUTED}" letter-spacing="0.3">${escapeXml(subText)}</text>

  <!-- Bottom bar -->
  <rect x="0" y="574" width="${WIDTH}" height="56" fill="#06090D"/>
  <rect x="0" y="574" width="${WIDTH}" height="1" fill="#1C2430"/>
  <text x="72" y="609" font-family="Arial, Helvetica, sans-serif"
        font-size="18" font-weight="600" fill="${TEXT}">simpleitsrq.com/${escapeXml(city.slug)}</text>
  <text x="${WIDTH - 72}" y="609" text-anchor="end"
        font-family="Arial, Helvetica, sans-serif"
        font-size="16" font-weight="500" fill="${TEXT_MUTED}">Same-day · Flat monthly · HIPAA-ready</text>
</svg>`;
}

function loadCache() {
  if (FORCE || !existsSync(CACHE_PATH)) return {};
  try { return JSON.parse(readFileSync(CACHE_PATH, "utf8")); }
  catch { return {}; }
}

function inputHash(city) {
  return createHash("sha1")
    .update(JSON.stringify({ v: TEMPLATE_VERSION, city: city.city, full: city.cityFull, slug: city.slug, zip: city.postalCode || "" }))
    .digest("hex");
}

async function main() {
  const cache = loadCache();
  const next = {};
  let generated = 0;
  let skipped = 0;
  const t0 = Date.now();

  for (const city of cityList) {
    const slug = city.slug;
    if (!slug) continue;
    const out = join(PUBLIC_DIR, `og-city-${slug}.png`);
    const hash = inputHash(city);
    next[slug] = hash;
    if (!FORCE && existsSync(out) && cache[slug] === hash) {
      skipped += 1;
      continue;
    }
    const svg = buildSvg(city);
    await sharp(Buffer.from(svg), { density: 384 })
      .resize(WIDTH, HEIGHT, { fit: "contain", background: { r: 11, g: 13, b: 16, alpha: 1 } })
      .png({ compressionLevel: 9 })
      .toFile(out);
    generated += 1;
    console.log(`  ✓ og-city-${slug}.png`);
  }

  writeFileSync(CACHE_PATH, JSON.stringify(next, null, 2));
  console.log(`\nog-city: generated ${generated}, skipped ${skipped} in ${Date.now() - t0} ms`);
}

main().catch((err) => {
  console.error("[generate-city-og-images] failed:", err);
  process.exit(1);
});
