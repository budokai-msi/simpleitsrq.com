// scripts/generate-og.mjs
//
// Generates public/og-image.png (1200x630) from an SVG template using sharp.
// Run: node scripts/generate-og.mjs

import sharp from "sharp";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = resolve(__dirname, "../public/og-image.png");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0A4A82"/>
      <stop offset="1" stop-color="#0F6CBD"/>
    </linearGradient>
    <linearGradient id="glow" x1="600" y1="0" x2="600" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.06"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.12"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>

  <!-- Grid dots -->
  <g fill="#ffffff" opacity="0.06">
    ${Array.from({ length: 12 }, (_, x) =>
      Array.from({ length: 7 }, (_, y) =>
        `<circle cx="${100 + x * 100}" cy="${90 + y * 80}" r="1.5"/>`
      ).join("")
    ).join("")}
  </g>

  <!-- Logo square -->
  <rect x="530" y="140" width="68" height="68" rx="14" fill="#ffffff" opacity="0.15"/>
  <text x="564" y="190" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="38" fill="#ffffff">S</text>

  <!-- Company name -->
  <text x="600" y="268" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="48" fill="#ffffff">Simple IT SRQ</text>

  <!-- Tagline -->
  <text x="600" y="320" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="400" font-size="24" fill="#ffffff" opacity="0.85">Managed IT, Cybersecurity &amp; Cloud</text>

  <!-- Service area -->
  <text x="600" y="360" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="400" font-size="18" fill="#ffffff" opacity="0.6">Sarasota  ·  Bradenton  ·  Venice</text>

  <!-- Bottom bar -->
  <rect x="0" y="570" width="1200" height="60" fill="#000000" opacity="0.2"/>
  <text x="60" y="606" font-family="Arial, Helvetica, sans-serif" font-weight="400" font-size="14" fill="#ffffff" opacity="0.7">simpleitsrq.com</text>
  <text x="1140" y="606" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-weight="400" font-size="14" fill="#ffffff" opacity="0.7">HIPAA Documented  ·  24/7 Local Team</text>
</svg>`;

await sharp(Buffer.from(svg)).png({ quality: 90 }).toFile(out);
console.log(`✓ Generated ${out}`);
