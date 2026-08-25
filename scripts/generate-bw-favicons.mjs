// scripts/generate-bw-favicons.mjs
//
// Renders the new B&W brand-assets (extracted from the construction sheet)
// into the standard favicon/PNG sizes browsers and mobile platforms expect.
// Mirrors the shape of scripts/generate-favicons.mjs so the asset pipeline
// stays symmetric.
//
// Each source SVG (in public/brand-assets/) becomes one PNG size ladder:
//   16x16, 32x32, 180x180, 192x192, 512x512
//
// The "favicon-*" sources are square by design — they're actual icon
// variants. The "logo-mark" source is wider (90x102 viewBox) and is meant
// for header/footer/OG use, so it gets the full ladder too but will
// letterbox inside the square PNG.
//
// Usage:
//   node scripts/generate-bw-favicons.mjs

import sharp from "sharp";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PUBLIC_DIR = join(ROOT, "public");
const BRAND_DIR = join(PUBLIC_DIR, "brand-assets");

if (!existsSync(BRAND_DIR)) {
  console.error(`Brand-assets directory not found: ${BRAND_DIR}`);
  process.exit(1);
}

const SIZES = [16, 32, 180, 192, 512];

const SOURCES = [
  { svg: "logo-mark.svg",          prefix: "logo-mark-bw",      label: "Composite mark (filled)" },
  { svg: "logo-mark-outline.svg",  prefix: "logo-mark-outline-bw", label: "Composite mark (outline)" },
  { svg: "logo-horizontal.svg",    prefix: "logo-horizontal-bw", label: "Horizontal logo" },
  { svg: "favicon-bold.svg",       prefix: "favicon-bold-bw",   label: "Bold Favicon (SI shield)" },
  { svg: "favicon-letter.svg",     prefix: "favicon-letter-bw", label: "Favicon (SR Q square)" },
  { svg: "favicon-circle.svg",     prefix: "favicon-circle-bw", label: "Favicon Circle" },
  { svg: "favicon-raster.svg",     prefix: "favicon-raster-bw", label: "Optimized Raster" },
  { svg: "mark-s-wifi.svg",        prefix: "mark-s-wifi-bw",    label: "S + WiFi construction" },
  { svg: "mark-cloud-composed.svg",prefix: "mark-cloud-composed-bw", label: "Cloud + composed mark" },
];

for (const { svg: name, prefix, label } of SOURCES) {
  const src = join(BRAND_DIR, name);
  if (!existsSync(src)) {
    console.warn(`  [skip] ${label} — ${src} not found`);
    continue;
  }
  const svg = readFileSync(src);
  console.log(`\n${label}:`);
  for (const size of SIZES) {
    const out = join(PUBLIC_DIR, `${prefix}-${size}x${size}.png`);
    await sharp(svg, { density: 600 })
      .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(out);
    console.log(`  ${prefix}-${size}x${size}.png`);
  }
}

console.log("\nAll B&W brand-assets PNGs generated.");

