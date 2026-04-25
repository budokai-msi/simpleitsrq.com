// scripts/generate-industry-og-images.mjs
//
// Renders Open Graph cards for the industry × city landing pages plus
// the /industries hub. Same brand template as generate-city-og-images
// — just swaps the headline for the industry vertical and adds a small
// "in {City}" sub.
//
// Outputs:
//   public/og-industry-{industry-slug}-{city-key}.png  (one per valid combo)
//   public/og-industries.png                           (single hub card)
//
// Cache-aware via .og-industry-cache.json. Bump TEMPLATE_VERSION below
// to force a full rebuild after editing the SVG.
//
// Usage:
//   node scripts/generate-industry-og-images.mjs
//   node scripts/generate-industry-og-images.mjs --force

import sharp from "sharp";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cities } from "../src/data/cities.js";
import { industries, industryCityPairs } from "../src/data/industries.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PUBLIC_DIR = join(ROOT, "public");
const CACHE_PATH = join(PUBLIC_DIR, ".og-industry-cache.json");
const TEMPLATE_VERSION = 1;
const FORCE = process.argv.includes("--force");

const WIDTH = 1200;
const HEIGHT = 630;

// Brand tokens — kept identical to the city OG generator so all cards
// in a Slack/iMessage thread feel like the same brand.
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

// Word-wrap helper — same as city OG generator, tuned for industry
// names which can run longer (Vacation Rental Management, Financial
// Advisory Firms).
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

// One-line industry-specific badge that pulls from the structured copy
// — first emphasis bullet, trimmed. Acts as the "what's in it for me"
// promise on the social preview.
function badgeForIndustry(industry) {
  const first = (industry.emphasis || [])[0] || "";
  // Trim long emphasis bullets to ~52 chars so they fit on one line.
  if (first.length <= 52) return first;
  const cut = first.slice(0, 52);
  return cut.slice(0, cut.lastIndexOf(" ")) + "…";
}

// ---------- TEMPLATES -----------------------------------------------

function brandHeaderSvg() {
  return `<g>
    <rect x="72" y="72" width="64" height="64" rx="14" fill="${BRAND}"/>
    <text x="104" y="121" text-anchor="middle"
          font-family="Arial, Helvetica, sans-serif"
          font-size="44" font-weight="900" fill="${TEXT}" letter-spacing="-0.8">S</text>
    <circle cx="129" cy="80" r="6" fill="${STATUS_GREEN}" stroke="${BRAND}" stroke-width="2"/>
    <text x="156" y="105" font-family="Arial, Helvetica, sans-serif"
          font-size="24" font-weight="700" fill="${TEXT}" letter-spacing="-0.5">Simple IT SRQ</text>
    <text x="156" y="129" font-family="Arial, Helvetica, sans-serif"
          font-size="14" font-weight="500" fill="${TEXT_MUTED}">Florida-based managed IT &amp; cybersecurity</text>
  </g>`;
}

function bgSvg() {
  return `<defs>
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
  <rect x="0" y="0" width="6" height="${HEIGHT}" fill="${BRAND}"/>`;
}

function bottomBarSvg(footerLeft, footerRight) {
  return `<rect x="0" y="574" width="${WIDTH}" height="56" fill="#06090D"/>
  <rect x="0" y="574" width="${WIDTH}" height="1" fill="#1C2430"/>
  <text x="72" y="609" font-family="Arial, Helvetica, sans-serif"
        font-size="18" font-weight="600" fill="${TEXT}">${escapeXml(footerLeft)}</text>
  <text x="${WIDTH - 72}" y="609" text-anchor="end"
        font-family="Arial, Helvetica, sans-serif"
        font-size="16" font-weight="500" fill="${TEXT_MUTED}">${escapeXml(footerRight)}</text>`;
}

function buildIndustryCitySvg(industry, city, url) {
  // Headline: industry display name + "IT" suffix (matches our URL slug).
  const headline = `${industry.displayName.replace(/Practices|Firms|Services|& Waterfront Businesses|Management/g, "").trim()} IT`;
  const lines = wrap(headline, 18, 2);
  const fontSize = lines.length === 1 ? 116 : 84;
  const lineHeight = fontSize + 6;
  const startY = 290 - ((lines.length - 1) * lineHeight) / 2;

  const headlineSvg = lines
    .map(
      (line, i) =>
        `<text x="72" y="${startY + i * lineHeight}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="900" fill="${TEXT}" letter-spacing="-2.5">${escapeXml(line)}</text>`,
    )
    .join("\n    ");

  const cityLabelY = startY + lines.length * lineHeight + 8;
  const badge = badgeForIndustry(industry);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  ${bgSvg()}
  ${brandHeaderSvg()}

  <!-- Industry pill at top-right — anchors the vertical visually -->
  <g>
    <rect x="${WIDTH - 72 - 220}" y="84" width="220" height="40" rx="20" fill="rgba(15, 108, 189, 0.18)" stroke="${BRAND_LIGHT}" stroke-width="1"/>
    <text x="${WIDTH - 72 - 110}" y="111" text-anchor="middle"
          font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700"
          fill="${BRAND_LIGHT}" letter-spacing="0.4">${escapeXml(industry.displayName.toUpperCase())}</text>
  </g>

  ${headlineSvg}

  <!-- "in {City}, FL" subtitle -->
  <text x="72" y="${cityLabelY}"
        font-family="Arial, Helvetica, sans-serif"
        font-size="32" font-weight="600" fill="${BRAND_LIGHT}" letter-spacing="-0.5">in ${escapeXml(city.cityFull)}</text>

  <!-- Industry-specific promise bullet -->
  <text x="72" y="510" font-family="Arial, Helvetica, sans-serif"
        font-size="20" font-weight="600" fill="${TEXT_MUTED}" letter-spacing="0.2">${escapeXml(badge)}</text>

  ${bottomBarSvg(`simpleitsrq.com${url}`, "Same-day · Flat monthly · HIPAA-ready")}
</svg>`;
}

function buildHubSvg() {
  const verticals = Object.values(industries).map((i) => i.displayName);
  // Render up to 6 verticals as wrapping pills; clamp to ~3 lines worth.
  const pillRows = (() => {
    const rowMax = 56; // chars per row of pill labels — tuned for our font
    const rows = [];
    let cur = [];
    let curLen = 0;
    for (const v of verticals) {
      const len = v.length + 4; // padding
      if (curLen + len > rowMax && cur.length) {
        rows.push(cur);
        cur = [v]; curLen = len;
      } else {
        cur.push(v); curLen += len;
      }
    }
    if (cur.length) rows.push(cur);
    return rows.slice(0, 3);
  })();

  let pillSvg = "";
  let pillY = 410;
  for (const row of pillRows) {
    let x = 72;
    for (const label of row) {
      const w = label.length * 11 + 30;
      pillSvg += `<g>
        <rect x="${x}" y="${pillY}" width="${w}" height="40" rx="20"
              fill="rgba(15, 108, 189, 0.18)" stroke="${BRAND_LIGHT}" stroke-width="1"/>
        <text x="${x + w / 2}" y="${pillY + 27}" text-anchor="middle"
              font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="600"
              fill="${TEXT}" letter-spacing="0.2">${escapeXml(label)}</text>
      </g>`;
      x += w + 10;
    }
    pillY += 50;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  ${bgSvg()}
  ${brandHeaderSvg()}

  <!-- Hub headline -->
  <text x="72" y="270" font-family="Arial, Helvetica, sans-serif"
        font-size="78" font-weight="900" fill="${TEXT}" letter-spacing="-2">IT Support by Industry</text>
  <text x="72" y="340" font-family="Arial, Helvetica, sans-serif"
        font-size="34" font-weight="600" fill="${BRAND_LIGHT}" letter-spacing="-0.5">Across the Florida Gulf Coast</text>

  <!-- Vertical pills -->
  ${pillSvg}

  ${bottomBarSvg("simpleitsrq.com/industries", "6 verticals · 14 city-specific landing pages")}
</svg>`;
}

// ---------- CACHE ---------------------------------------------------

function loadCache() {
  if (FORCE || !existsSync(CACHE_PATH)) return {};
  try { return JSON.parse(readFileSync(CACHE_PATH, "utf8")); }
  catch { return {}; }
}

function inputHashIndustryCity(industry, city) {
  return createHash("sha1")
    .update(JSON.stringify({
      v: TEMPLATE_VERSION,
      ind: industry.slug, name: industry.displayName, badge: badgeForIndustry(industry),
      city: city.city, full: city.cityFull, slug: city.slug,
    }))
    .digest("hex");
}
function inputHashHub() {
  return createHash("sha1")
    .update(JSON.stringify({
      v: TEMPLATE_VERSION,
      verticals: Object.values(industries).map((i) => i.displayName),
    }))
    .digest("hex");
}

// ---------- MAIN ----------------------------------------------------

async function main() {
  const cache = loadCache();
  const next = {};
  let generated = 0;
  let skipped = 0;
  const t0 = Date.now();

  // Industry × city cards
  for (const pair of industryCityPairs(cities)) {
    const { industry, city, cityKey } = pair;
    const filename = `og-industry-${industry.slug}-${cityKey}.png`;
    const out = join(PUBLIC_DIR, filename);
    const hash = inputHashIndustryCity(industry, city);
    next[filename] = hash;
    if (!FORCE && existsSync(out) && cache[filename] === hash) {
      skipped += 1;
      continue;
    }
    const svg = buildIndustryCitySvg(industry, city, pair.url);
    await sharp(Buffer.from(svg), { density: 384 })
      .resize(WIDTH, HEIGHT, { fit: "contain", background: { r: 11, g: 13, b: 16, alpha: 1 } })
      .png({ compressionLevel: 9 })
      .toFile(out);
    generated += 1;
    console.log(`  ✓ ${filename}`);
  }

  // Hub card
  const hubFilename = "og-industries.png";
  const hubOut = join(PUBLIC_DIR, hubFilename);
  const hubHash = inputHashHub();
  next[hubFilename] = hubHash;
  if (FORCE || !existsSync(hubOut) || cache[hubFilename] !== hubHash) {
    const hubSvg = buildHubSvg();
    await sharp(Buffer.from(hubSvg), { density: 384 })
      .resize(WIDTH, HEIGHT, { fit: "contain", background: { r: 11, g: 13, b: 16, alpha: 1 } })
      .png({ compressionLevel: 9 })
      .toFile(hubOut);
    generated += 1;
    console.log(`  ✓ ${hubFilename}`);
  } else {
    skipped += 1;
  }

  writeFileSync(CACHE_PATH, JSON.stringify(next, null, 2));
  console.log(`\nog-industry: generated ${generated}, skipped ${skipped} in ${Date.now() - t0} ms`);
}

main().catch((err) => {
  console.error("[generate-industry-og-images] failed:", err);
  process.exit(1);
});
