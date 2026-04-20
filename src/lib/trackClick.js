// Fires a fire-and-forget affiliate-click beacon to /api/track.
//
// Uses navigator.sendBeacon when available (survives page navigation) and
// falls back to fetch with keepalive. Never awaits — the link navigation
// must not be delayed by the tracker.

const ANON_KEY = "srq_anon";

function getAnonId() {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(ANON_KEY) : null;
  } catch { return null; }
}

export function trackAffiliateClick({ slug, destination, label, network }) {
  if (typeof window === "undefined" || !destination) return;

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
