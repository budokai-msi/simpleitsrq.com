// scripts/generate-og-card.mjs
//
// Renders a 1200x630 Open Graph card using the B&W horizontal logo.
// The construction sheet's horizontal logo is a perfect OG card layout
// (mark + wordmark + tagline on a clean background).
//
// Output: public/og-bw-logo.png

import sharp from "sharp";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PUBLIC_DIR = join(ROOT, "public");
const BRAND_DIR = join(PUBLIC_DIR, "brand-assets");

const W = 1200;
const H = 630;
const BG_TOP = "#F7F8FA";   // light surface
const BG_BOT = "#EFF2F6";
const INK = "#0F172A";      // near-black for ink color
const ACCENT = "#0F6CBD";   // brand accent dot

// Pull the inner <path> out of the master logo-mark.svg so we can
// re-render it inside our wrapper SVG.
const logoMark = readFileSync(join(BRAND_DIR, "logo-mark.svg"), "utf-8");
const pathMatch = logoMark.match(/<path[^>]*\bd="([^"]+)"/);
if (!pathMatch) throw new Error("Could not find <path d=...> in logo-mark.svg");
const pathD = pathMatch[1];

const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${BG_TOP}"/>
      <stop offset="100%" stop-color="${BG_BOT}"/>
    </linearGradient>
    <radialGradient id="dot" cx="0.35" cy="0.35" r="0.7">
      <stop offset="0%" stop-color="#FFE9A8"/>
      <stop offset="55%" stop-color="#FFD66B"/>
      <stop offset="100%" stop-color="#E0A92E"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <!-- Status dot at top-right -->
  <circle cx="${W - 80}" cy="80" r="14" fill="${ACCENT}" fill-opacity="0.18"/>
  <circle cx="${W - 80}" cy="80" r="10" fill="url(#dot)"/>

  <!-- Composite mark (scaled-up vectorized logo-mark) — left half -->
  <g transform="translate(140, 165) scale(3.2)" fill="${INK}" fill-rule="evenodd">
    <path d="${pathD}"/>
  </g>

  <!-- Wordmark + tagline — right half -->
  <g transform="translate(480, 130)" fill="${INK}">
    <text x="0" y="120" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" font-size="112" font-weight="800" letter-spacing="-2">Simple IT</text>
    <text x="0" y="232" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" font-size="112" font-weight="800" letter-spacing="-2">SRQ</text>
    <text x="0" y="310" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" font-size="26" font-weight="600" letter-spacing="3" fill="#475569">MANAGED IT  ·  CYBERSECURITY  ·  CLOUD</text>
  </g>
</svg>
`;

const out = join(PUBLIC_DIR, "og-bw-logo.png");
await sharp(Buffer.from(SVG))
  .png({ compressionLevel: 9 })
  .toFile(out);

const meta = await sharp(out).metadata();
console.log(`  og-bw-logo.png (${W}x${H}) — ${(await import("node:fs")).statSync(out).size} bytes`);

