# External Libraries & Plugin Sources

How this project consumes GitHub-hosted open-source work — the "plugins and
libraries" layer.

## Currently integrated (npm, sourced from GitHub)

| Package | Repo | Used for |
|---|---|---|
| `web-vitals` | [GoogleChrome/web-vitals](https://github.com/GoogleChrome/web-vitals) | Real-user Core Web Vitals (LCP/CLS/INP/TTFB/FCP), wired into `src/lib/webVitals.js` → `/api/track` → `engagement_events` + GA4. Surfaces in Admin Ops → Visitors tab. |
| `leaflet` | [Leaflet/Leaflet](https://github.com/Leaflet/Leaflet) | Leadgen map view |
| `lucide-react` | [lucide-icons/lucide](https://github.com/lucide-icons/lucide) | Icon system |
| `framer-motion` | [motiondivision/motion](https://github.com/motiondivision/motion) | Dashboard animations |
| `vite`, `rolldown` | [vitejs/vite](https://github.com/vitejs/vite) | Build tooling |

## Adding a new library from a GitHub repo

Prefer the npm-published version when one exists (auditable, lockable,
semver-stable):

```bash
npm install <package-name>          # npm package
npm install github:user/repo        # direct from GitHub main branch
npm install github:user/repo#v2.1.0 # pinned to a tag — preferred for GH-only
```

Rules:
1. **Pin GitHub-sourced deps to a tag or commit SHA** (`#v1.2.3` / `#abc123`),
   never track a moving default branch.
2. **Wrap it** — third-party code gets imported through one of our own
   modules (like `src/lib/webVitals.js`) so swapping it later is a one-file
   change.
3. **Consent-aware by default** — anything that sends data off-device must
   gate on analytics consent (`hasAnalyticsConsent()`) and honor DNT, same
   as the behavior beacon does.
4. **Bundle-size check** — after adding, run `npm run build` and compare
   chunk sizes; lazy-load anything over ~50 KB that isn't needed on first
   paint.

## Candidate integrations (not yet installed)

- [@tanstack/react-query](https://github.com/TanStack/query) — server-state
  caching for the admin dashboard's polling panels if they grow past ~8
  concurrent fetches.
- [chartjs/Chart.js](https://github.com/chartjs/Chart.js) or
  [airbnb/visx](https://github.com/airbnb/visx) — retention/trend charts for
  the Content tab once there are a few months of engagement_events to plot.
- [simple-icons/simple-icons](https://github.com/simple-icons/simple-icons) —
  partner/vendor logos on /partners without hand-drawing SVGs.
