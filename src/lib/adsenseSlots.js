// AdSense ad-unit slot IDs, looked up once per build from the env. Each
// is the 10-digit numeric Slot ID from the AdSense dashboard ("Ads →
// By ad unit → Slot ID" line in the embed snippet — NOT the ca-pub-*
// publisher ID). When a slot is empty the matching AdUnit renders
// nothing (see src/components/AdSense.jsx: fail closed). Lives in /lib
// rather than next to AdUnit so the component file stays
// component-only for fast-refresh.
//
// ─────────────────────────────────────────────────────────────────────
// ENABLING ADSENSE (owner checklist — do NOT flip until Google approves)
// ─────────────────────────────────────────────────────────────────────
// AdSense is intentionally OFF by default. The publisher ID and the
// adsbygoogle.js <script> already ship in index.html, but the per-slot
// IDs below are empty and the render gate (VITE_ADSENSE_ENABLED) is off,
// so no <ins> tags are emitted and no ad requests are made.
//
// To go live, set ALL of these in the production environment (Vercel →
// Project → Settings → Environment Variables, or .env.production):
//
//   1. VITE_ADSENSE_ENABLED=true
//        Master switch. When false (default), BlogMonetizationSlot shows
//        the house banner instead of an ad, and no ad renders anywhere.
//   2. VITE_ADSENSE_SLOT_IN_ARTICLE=<10-digit slot id>
//        Used on blog posts (top/bottom), glossary, glossary entries,
//        exposure-scan, and the legal pages.
//   3. VITE_ADSENSE_SLOT_IN_FEED=<10-digit slot id>
//        Used on the blog index grid (one in-feed unit every 6 cards).
//
// Optional:
//   4. VITE_ADSENSE_CLIENT=ca-pub-7420716928607113
//        Defaults to the production publisher ID. Only set this to point
//        a staging/dev build at a different AdSense account.
//
// Consent gating: ads only render after the visitor grants marketing
// consent via the cookie banner (src/components/AdSense.jsx reads
// src/lib/consent.js). If consent is denied or never given, AdUnit
// returns null — no ad request, no CLS, no console error. This is
// independent of AdSense's own Consent Mode v2 in public/ga-init.js.
// ─────────────────────────────────────────────────────────────────────
export const ADSENSE_SLOTS = {
  inArticle: import.meta.env.VITE_ADSENSE_SLOT_IN_ARTICLE || "",
  inFeed:    import.meta.env.VITE_ADSENSE_SLOT_IN_FEED    || "",
};
