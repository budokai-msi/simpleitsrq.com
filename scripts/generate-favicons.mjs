// scripts/generate-favicons.mjs
//
// Renders the master public/favicon.svg into every PNG size browsers
// and mobile platforms expect. Idempotent — run once after editing the
// master SVG, commit the resulting PNGs.
//
// Outputs:
//   public/favicon-16x16.png       — old Chrome/Firefox tab icon fallback
//   public/favicon-32x32.png       — IE / Edge legacy fallback + macOS dock
//   public/favicon-192x192.png     — Android home screen
//   public/apple-touch-icon.png    — iOS home screen (180x180)
//   public/icon-512.png            — PWA install / large preview
//   public/logo.png                — schema.org Organization image (also 512x512)
//
// Usage:
//   node scripts/generate-favicons.mjs

import sharp from "sharp";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PUBLIC_DIR = join(ROOT, "public");
const SOURCE = join(PUBLIC_DIR, "favicon.svg");

const TARGETS = [
  { size: 16,  name: "favicon-16x16.png" },
  { size: 32,  name: "favicon-32x32.png" },
  { size: 180, name: "apple-touch-icon.png" },
  { size: 192, name: "favicon-192x192.png" },
  { size: 512, name: "icon-512.png" },
  { size: 512, name: "logo.png" }, // also serves as the schema.org org image
];

async function main() {
  const svg = readFileSync(SOURCE);
  for (const { size, name } of TARGETS) {
    const out = join(PUBLIC_DIR, name);
    await sharp(svg, { density: 384 }) // high density so the rasterized SVG stays crisp at large sizes
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9, palette: false })
      .toFile(out);
    console.log(`  ✓ ${name.padEnd(28)} ${size}×${size}`);
  }
  console.log(`\nRendered ${TARGETS.length} favicons from ${SOURCE.replace(ROOT + "/", "")}`);
}

main().catch((err) => {
  console.error("[generate-favicons] failed:", err);
  process.exit(1);
});
