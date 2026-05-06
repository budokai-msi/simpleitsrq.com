// scripts/generate-og.mjs
//
// Generates public/og-image.png (1200x630) from an SVG template using sharp.
// Run: node scripts/generate-og.mjs
//
// Refreshed May 2026 to match the rigid three-bar S logo + new accent
// palette (brand blue + amber dot + violet/teal mesh glow).

import sharp from "sharp";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = resolve(__dirname, "../public/og-image.png");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0"   stop-color="#0F6CBD"/>
      <stop offset="0.55" stop-color="#0A4A82"/>
      <stop offset="1"   stop-color="#072E54"/>
    </linearGradient>
    <radialGradient id="violetGlow" cx="0.18" cy="0.15" r="0.45">
      <stop offset="0" stop-color="#7C5CD8" stop-opacity="0.45"/>
      <stop offset="1" stop-color="#7C5CD8" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="tealGlow" cx="0.92" cy="0.85" r="0.4">
      <stop offset="0" stop-color="#0E9C95" stop-opacity="0.40"/>
      <stop offset="1" stop-color="#0E9C95" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="vignette" x1="600" y1="0" x2="600" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0"   stop-color="#ffffff" stop-opacity="0.05"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="1"   stop-color="#000000" stop-opacity="0.18"/>
    </linearGradient>
    <linearGradient id="logo-bg" x1="0" y1="0" x2="160" y2="160" gradientUnits="userSpaceOnUse">
      <stop offset="0"   stop-color="#0F6CBD"/>
      <stop offset="0.55" stop-color="#0A4A82"/>
      <stop offset="1"   stop-color="#072E54"/>
    </linearGradient>
    <linearGradient id="logo-s" x1="0" y1="0" x2="0" y2="160" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#F4E8DC"/>
      <stop offset="1" stop-color="#E8EEF6"/>
    </linearGradient>
    <radialGradient id="logo-dot" cx="0.5" cy="0.4" r="0.7">
      <stop offset="0"   stop-color="#FFE9A8"/>
      <stop offset="0.5" stop-color="#F0B429"/>
      <stop offset="1"   stop-color="#B5840F"/>
    </radialGradient>
    <pattern id="grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#ffffff" stroke-opacity="0.04" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#violetGlow)"/>
  <rect width="1200" height="630" fill="url(#tealGlow)"/>
  <rect width="1200" height="630" fill="url(#grid)"/>
  <rect width="1200" height="630" fill="url(#vignette)"/>

  <g transform="translate(80 100)">
    <rect width="160" height="160" rx="28" fill="url(#logo-bg)"/>
    <rect width="160" height="160" rx="28" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="1.5"/>
    <path d="M 30 40 L 110 40 L 110 60 L 50 60 L 50 70 L 110 70 L 110 120 L 30 120 L 30 100 L 90 100 L 90 90 L 30 90 Z" fill="url(#logo-s)"/>
    <path d="M 30 42.5 L 110 42.5" stroke="#ffffff" stroke-opacity="0.30" stroke-width="2"/>
    <path d="M 50 72.5 L 110 72.5" stroke="#ffffff" stroke-opacity="0.30" stroke-width="2"/>
    <path d="M 30 102.5 L 90 102.5" stroke="#ffffff" stroke-opacity="0.30" stroke-width="2"/>
    <circle cx="135" cy="22" r="11" fill="#F0B429" fill-opacity="0.18"/>
    <circle cx="135" cy="22" r="6" fill="url(#logo-dot)"/>
  </g>

  <text x="270" y="170" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" font-weight="800" font-size="56" fill="#ffffff" letter-spacing="-1">Simple IT SRQ</text>
  <text x="270" y="208" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" font-weight="500" font-size="22" fill="#F4E8DC" opacity="0.85">Managed IT · Cybersecurity · Cloud · Compliance</text>

  <text x="80" y="340" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" font-weight="800" font-size="62" fill="#ffffff" letter-spacing="-1.5">Enterprise IT operations,</text>
  <text x="80" y="408" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" font-weight="800" font-size="62" fill="#F0B429" letter-spacing="-1.5">delivered locally.</text>

  <text x="80" y="462" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" font-weight="400" font-size="22" fill="#ffffff" opacity="0.78">Service desk · identity · security · network · cloud · continuity</text>

  <g font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" font-weight="600" font-size="16" fill="#ffffff">
    <g transform="translate(80 500)">
      <rect width="138" height="40" rx="20" fill="#ffffff" fill-opacity="0.10" stroke="#ffffff" stroke-opacity="0.20"/>
      <text x="69" y="26" text-anchor="middle">Sarasota</text>
    </g>
    <g transform="translate(228 500)">
      <rect width="148" height="40" rx="20" fill="#ffffff" fill-opacity="0.10" stroke="#ffffff" stroke-opacity="0.20"/>
      <text x="74" y="26" text-anchor="middle">Bradenton</text>
    </g>
    <g transform="translate(386 500)">
      <rect width="116" height="40" rx="20" fill="#ffffff" fill-opacity="0.10" stroke="#ffffff" stroke-opacity="0.20"/>
      <text x="58" y="26" text-anchor="middle">Venice</text>
    </g>
    <g transform="translate(512 500)">
      <rect width="200" height="40" rx="20" fill="#ffffff" fill-opacity="0.10" stroke="#ffffff" stroke-opacity="0.20"/>
      <text x="100" y="26" text-anchor="middle">Lakewood Ranch</text>
    </g>
    <g transform="translate(722 500)">
      <rect width="128" height="40" rx="20" fill="#ffffff" fill-opacity="0.10" stroke="#ffffff" stroke-opacity="0.20"/>
      <text x="64" y="26" text-anchor="middle">Nokomis</text>
    </g>
  </g>

  <rect x="0" y="582" width="1200" height="48" fill="#000000" opacity="0.28"/>
  <text x="60" y="612" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" font-weight="500" font-size="15" fill="#ffffff" opacity="0.85">simpleitsrq.com</text>
  <text x="1140" y="612" text-anchor="end" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" font-weight="500" font-size="15" fill="#ffffff" opacity="0.85">HIPAA · GLBA · Cyber-insurance evidence packages</text>
</svg>`;

await sharp(Buffer.from(svg)).png({ quality: 95 }).toFile(out);
console.log(`✓ Generated ${out}`);
