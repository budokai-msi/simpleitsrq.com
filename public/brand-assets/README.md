# Brand Assets (B&W)

This directory holds the **black-and-white brand mark set** extracted from
the Simple IT SRQ logo construction sheet, vectorized and rasterized for
re-use across web, print, social, and docs contexts.

## Where to use each asset

| Asset | Use case | Notes |
| --- | --- | --- |
| `logo-horizontal.svg` / `.png` | Email signatures, slides, blog post hero images, anywhere you need the full logo with wordmark + tagline | Already has padding baked in. Use as-is at any size. |
| `logo-mark.svg` / `.png` | Header / footer logos, social profile images, watermarks — anywhere you want just the S+WiFi+Cloud symbol | 90×102 viewBox (slightly wider than tall). |
| `logo-mark-outline.svg` / `.png` | Stamps, overlays, light backgrounds — outline variant for places where the filled mark would overpower | Same dimensions as `logo-mark`. |
| `favicon-bold.svg` (SI shield) | Solid dark backgrounds, app launchers that need a recognizable shield silhouette | 71×87 viewBox, square-ish. |
| `favicon-letter.svg` (SR Q square) | Compact contexts, app icons | Square-ish 70×87. |
| `favicon-circle.svg` (cloud+WiFi square) | Default favicon alternative | Square 72×87. |
| `favicon-raster.svg` (optimized raster) | Hi-DPI favicon / PWA install icon | Square 71×87. |
| `mark-s-wifi.svg` (path components) | Brand-system diagrams, construction documentation | 63×149 viewBox — wide. |
| `mark-cloud-composed.svg` (cloud + composed) | Brand-system diagrams, construction documentation | 114×127 viewBox. |

## PNG size ladders

For every SVG above, `scripts/generate-bw-favicons.mjs` produces a PNG
size ladder at **16, 32, 180, 192, and 512 px**. The naming convention is:

```
<asset>-bw-<W>x<H>.png
```

Examples:

- `logo-mark-bw-512x512.png` — square 512 PNG of the composite mark (letterboxed inside the square, transparent background)
- `favicon-bold-bw-32x32.png` — 32×32 favicon-ready PNG of the SI shield

Run `node scripts/generate-bw-favicons.mjs` to regenerate after editing
any SVG in this directory.

## What's intentionally NOT replaced

- `public/favicon.svg` (the blue tile mark) — **still in use** for browser tab icons, iOS home screen, etc. The B&W set is supplementary, not a swap.
- `public/logo.png` (the blue tile, 512×512) — still used as the schema.org Organization image and the default OG image.
- The `Logo` component in `src/App.jsx` — still renders the stylized "S" letterform for the navbar/footer.

To replace any of those with a B&W variant, do it deliberately (and
probably with a small A/B test). Don't just swap them — the current
production assets are working.

## Where this DOES fit today

- **OG / social share images** — the construction sheet's horizontal logo is exactly what you want at 1200×630 for Open Graph. Use `logo-horizontal.svg` (or render `logo-horizontal-bw-512x512.png` larger) for shareable OG cards.
- **Email signatures** — drop `logo-horizontal-bw-512x512.png` inline.
- **Blog post hero fallback** — when a post has no custom cover, `logo-mark-bw-512x512.png` on a soft brand background reads better than the current generic placeholder.
- **Print decks** — vectorized SVGs print crisp at any DPI.
