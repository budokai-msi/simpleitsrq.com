// Fires a fire-and-forget affiliate-click beacon to /api/track AND a
// GA4 select_content event (content_type=affiliate) via analytics.js.
// Two sinks, same click — /api/track gives us raw DB-backed reporting
// with referring-post attribution; GA gives conversion-funnel views
// alongside other behavior.
//
// Uses navigator.sendBeacon when available (survives page navigation) and
// falls back to fetch with keepalive. Never awaits — the link navigation
// must not be delayed by the tracker.

import { track } from "./analytics.js";

const ANON_KEY = "srq_anon";

function getAnonId() {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(ANON_KEY) : null;
  } catch { return null; }
}

export function trackAffiliateClick({ slug, destination, label, network }) {
  if (typeof window === "undefined" || !destination) return;

  // Mirror the beacon into GA4 so the event lands in both our DB and
  // Google's conversion reporting. Fails open if GA isn't loaded yet.
  track.affiliateClick({ slug, destination, label, network });

  const body = JSON.stringify({
    kind: "affiliate_click",
    slug: slug || null,
    destination,
    label: label || null,
    network: network || null,
    anonId: getAnonId(),
    referrerPath: window.location?.pathname || null,
  });

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon("/api/track", blob)) return;
    }
  } catch { /* fall through to fetch */ }

  try {
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {});
  } catch { /* best effort */ }
}
