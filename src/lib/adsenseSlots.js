// AdSense ad-unit slot IDs, looked up once per build from the env. Each
// is the 10-digit numeric Slot ID from the AdSense dashboard ("Ads →
// By ad unit → Slot ID" line in the embed snippet — NOT the ca-pub-*
// publisher ID). When a slot is empty the matching AdUnit renders
// nothing (see src/components/AdSense.jsx: fail closed). Lives in /lib
// rather than next to AdUnit so the component file stays
// component-only for fast-refresh.
export const ADSENSE_SLOTS = {
  inArticle: import.meta.env.VITE_ADSENSE_SLOT_IN_ARTICLE || "",
  inFeed:    import.meta.env.VITE_ADSENSE_SLOT_IN_FEED    || "",
};
