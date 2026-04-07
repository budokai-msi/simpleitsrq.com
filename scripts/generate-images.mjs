// Generates brand PNG assets from inline SVG via sharp.
// Run: node scripts/generate-images.mjs
//
// Outputs:
//   public/og-image.png   1200×630   Open Graph / Twitter card
//   public/logo.png        512×512   Schema.org structured-data logo
//   public/apple-touch-icon.png 180×180  iOS home screen icon

import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, "..", "public");
mkdirSync(publicDir, { recursive: true });

const BRAND = "#0F6CBD";
const BRAND_DARK = "#0C3B5E";
const BRAND_LIGHT = "#2B88D8";

// ---------- Open Graph image (1200×630) ----------
const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"  stop-color="${BRAND}"/>
      <stop offset="100%" stop-color="${BRAND_DARK}"/>
    </linearGradient>
    <radialGradient id="glow" cx="80%" cy="20%" r="60%">
      <stop offset="0%"  stop-color="${BRAND_LIGHT}" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="${BRAND_LIGHT}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="dots" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
      <circle cx="1.5" cy="1.5" r="1.5" fill="rgba(255,255,255,0.08)"/>
    </pattern>
    <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="10"/>
      <feOffset dx="0" dy="6" result="offsetblur"/>
      <feComponentTransfer>
        <feFuncA type="linear" slope="0.45"/>
      </feComponentTransfer>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="card-shadow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="20"/>
      <feOffset dx="0" dy="10"/>
      <feComponentTransfer>
        <feFuncA type="linear" slope="0.55"/>
      </feComponentTransfer>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- background layers -->
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#dots)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>

  <!-- logo card -->
  <g filter="url(#card-shadow)">
    <rect x="80" y="225" width="180" height="180" rx="32" fill="#FFFFFF"/>
    <text x="170" y="345" text-anchor="middle"
          font-family="Arial, Helvetica, sans-serif"
          font-size="120" font-weight="800" fill="${BRAND}">S</text>
  </g>

  <!-- wordmark + tagline -->
  <g filter="url(#shadow)" font-family="Arial, Helvetica, sans-serif" fill="#FFFFFF">
    <text x="300" y="290" font-size="74" font-weight="800" letter-spacing="-2">Simple IT SRQ</text>
    <text x="300" y="350" font-size="32" font-weight="500" opacity="0.92">Managed IT, Cybersecurity &amp; Cloud</text>
    <text x="300" y="395" font-size="28" font-weight="400" opacity="0.78">Sarasota · Bradenton · The SRQ region</text>
  </g>

  <!-- bottom strip -->
  <rect x="0" y="590" width="1200" height="40" fill="rgba(0,0,0,0.25)"/>
  <text x="80" y="617" font-family="Arial, Helvetica, sans-serif"
        font-size="20" font-weight="600" fill="rgba(255,255,255,0.95)">simpleitsrq.com</text>
  <text x="1120" y="617" text-anchor="end" font-family="Arial, Helvetica, sans-serif"
        font-size="18" font-weight="500" fill="rgba(255,255,255,0.75)">HIPAA Documented · 24/7 Local Team</text>
</svg>`;

// ---------- Logo (512×512) ----------
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="lbg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"  stop-color="${BRAND}"/>
      <stop offset="100%" stop-color="${BRAND_DARK}"/>
    </linearGradient>
    <filter id="lshadow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="6"/>
      <feOffset dx="0" dy="4"/>
      <feComponentTransfer>
        <feFuncA type="linear" slope="0.4"/>
      </feComponentTransfer>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#lbg)"/>
  <g filter="url(#lshadow)">
    <text x="256" y="360" text-anchor="middle"
          font-family="Arial, Helvetica, sans-serif"
          font-size="320" font-weight="800" fill="#FFFFFF">S</text>
  </g>
</svg>`;

// ---------- Apple touch icon (180×180) ----------
const appleSvg = logoSvg.replace('width="512" height="512"', 'width="180" height="180"');

// ---------- Render ----------
async function render(svg, outName, w, h) {
  const buf = Buffer.from(svg);
  const out = resolve(publicDir, outName);
  await sharp(buf)
    .resize(w, h)
    .png({ compressionLevel: 9, palette: false })
    .toFile(out);
  console.log(`✓ ${outName}  (${w}×${h})`);
}

await render(ogSvg, "og-image.png", 1200, 630);
await render(logoSvg, "logo.png", 512, 512);
await render(appleSvg, "apple-touch-icon.png", 180, 180);

console.log("\nDone. Three brand assets written to public/.");
