// Route chunk prefetching.
//
// Every non-home route is React.lazy()-loaded in App.jsx, so the first
// navigation to a route pays for its dynamic import. This module warms the
// exact same chunk on link hover/focus, so by the time the visitor clicks
// the module is already in cache and the route renders instantly.
//
// The import() specifiers here MUST match the ones in App.jsx — Vite
// resolves identical specifiers to the same chunk, so warming "../pages/Book"
// here is the same chunk lazy(() => import("./pages/Book")) consumes.
//
// We deliberately keep this list in sync with App.jsx by hand rather than
// refactoring every route into a shared registry; the duplication is small
// and the prefetch map only needs the routes that are actually hovered
// (nav, footer, in-content links).

import { cityList } from "../data/cities";

// Exact pathname -> chunk loader.
const EXACT = {
  "/blog": () => import("../pages/BlogIndex"),
  "/industries": () => import("../pages/IndustriesHub"),
  "/service-area": () => import("../pages/ServiceArea"),
  "/partners": () => import("../pages/Partners"),
  "/book": () => import("../pages/Book"),
  "/support": () => import("../pages/Support"),
  "/tools": () => import("../pages/Tools"),
  "/services": () => import("../pages/Services"),
  "/stack": () => import("../pages/Stack"),
  "/tools-we-use": () => import("../pages/Stack"),
  "/advertise": () => import("../pages/Advertise"),
  "/sponsor": () => import("../pages/Advertise"),
  "/compare": () => import("../pages/CompareIndex"),
  "/why": () => import("../pages/WhyIndex"),
  "/leadgen": () => import("../pages/Leadgen"),
  "/glossary": () => import("../pages/Glossary"),
  "/exposure-scan": () => import("../pages/ExposureScan"),
  "/password-check": () => import("../pages/PasswordCheck"),
  "/portal": () => import("../pages/ClientPortalPublic"),
  "/privacy": () => import("../pages/Legal"),
  "/terms": () => import("../pages/Legal"),
  "/accessibility": () => import("../pages/Legal"),
};

// Prefix pathname -> chunk loader, for dynamic detail routes.
const PREFIX = [
  ["/blog/", () => import("../pages/BlogPost")],
  ["/compare/", () => import("../pages/CompareDetail")],
  ["/why/", () => import("../pages/WhyVs")],
  ["/glossary/", () => import("../pages/GlossaryEntry")],
];

const CITY_SLUGS = new Set(cityList.map((c) => c.slug));

// Resolve a pathname to the loader for the chunk it will render.
function resolveLoader(path) {
  const clean = path.split("?")[0].split("#")[0];
  if (EXACT[clean]) return EXACT[clean];
  for (const [pfx, loader] of PREFIX) {
    if (clean.startsWith(pfx)) return loader;
  }
  // Single-segment slugs: city landing (/sarasota) vs industry landing
  // (/medical-it-sarasota). Anything not a known city falls through to the
  // industry resolver route in App.jsx.
  const seg = clean.replace(/^\/+|\/+$/g, "");
  if (seg && !seg.includes("/")) {
    return CITY_SLUGS.has(seg)
      ? () => import("../pages/LocalLanding")
      : () => import("../pages/IndustryLanding");
  }
  return null;
}

// Each loader runs at most once — the dynamic import caches the module,
// but tracking the loader avoids re-invoking import() and re-checking the
// connection on every hover.
const warmed = new WeakSet();

// Respect data-saver and very slow connections — don't speculatively
// download chunks the visitor may never use when bandwidth is precious.
function shouldPrefetch() {
  try {
    const c = navigator.connection;
    if (!c) return true;
    if (c.saveData) return false;
    if (c.effectiveType && /(^|\b)(slow-2g|2g)$/.test(c.effectiveType)) return false;
  } catch {
    // navigator.connection unsupported — assume OK.
  }
  return true;
}

export function prefetchRoute(path) {
  if (typeof path !== "string" || !path.startsWith("/")) return;
  if (!shouldPrefetch()) return;
  const loader = resolveLoader(path);
  if (!loader || warmed.has(loader)) return;
  warmed.add(loader);
  // Fire and forget. A failed prefetch is harmless — the real lazy()
  // import on click will surface any genuine load error.
  try {
    loader();
  } catch {
    // ignore — synchronous throw from a bad specifier shouldn't break hover
  }
}
