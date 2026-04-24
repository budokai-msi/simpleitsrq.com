import { useEffect, useRef } from "react";

// Defaults to the production AdSense publisher ID so ads render even
// without setting the env var (mirrors the ga-init.js fallback pattern).
// Set VITE_ADSENSE_CLIENT in .env.local to point staging/dev at a
// different account.
const CLIENT_ID =
  import.meta.env.VITE_ADSENSE_CLIENT || "ca-pub-7420716928607113";

// The adsbygoogle.js script is loaded from <head> in index.html so
// AdSense's site-review crawler sees it on first paint (faster
// approval, more reliable verification). Consent is centrally handled
// via Consent Mode v2 (set in public/ga-init.js) — AdSense respects
// the ad_storage / ad_user_data / ad_personalization flags and serves
// non-personalized ads when those are denied. We don't need to gate
// the <ins> slot here on consent: Google handles "show personalized
// vs non-personalized" internally based on the Consent Mode state.

// Per-page-load health beacon state — we send one summary per page
// load instead of one per slot, so a 5-AdUnit page doesn't create 5
// network calls. Shared module-level state keyed by a sampled load.
const HEALTH = {
  loadId: null,
  slots: [],
  timer: null,
};

function resetHealth() {
  HEALTH.loadId = Math.random().toString(36).slice(2, 10);
  HEALTH.slots = [];
  HEALTH.timer = null;
}

// Debounced flush — wait 4s after the last slot resolves so we
// capture every AdUnit on the page in a single beacon.
function scheduleFlush() {
  if (HEALTH.timer) clearTimeout(HEALTH.timer);
  HEALTH.timer = setTimeout(flush, 4000);
}

function flush() {
  if (!HEALTH.slots.length) return;
  // script loaded = window.adsbygoogle is a real array (the adsbygoogle.js
  // file turns the shim we created into a live array with push hooks).
  const scriptLoaded =
    typeof window !== "undefined" &&
    Array.isArray(window.adsbygoogle) &&
    typeof window.adsbygoogle.push === "function" &&
    // The real script replaces the shim with a proxy that has loaded=true
    (window.adsbygoogle.loaded === true ||
      // Fallback: if we pushed entries and they were consumed, the length
      // tends to drop — but that's noisy. Be conservative: only count
      // scriptLoaded=true if the loaded flag is present OR we saw any
      // data-ad-status reported by Google.
      HEALTH.slots.some((s) => s.status === "filled" || s.status === "unfilled"));

  const payload = {
    kind: "adsense_health",
    loadId: HEALTH.loadId,
    path: typeof location !== "undefined" ? location.pathname + location.search : "/",
    scriptLoaded,
    slotCount: HEALTH.slots.length,
    filled: HEALTH.slots.filter((s) => s.status === "filled").length,
    unfilled: HEALTH.slots.filter((s) => s.status === "unfilled").length,
    blocked: HEALTH.slots.filter((s) => s.status === "blocked").length,
    timeout: HEALTH.slots.filter((s) => s.status === "timeout").length,
    ts: new Date().toISOString(),
  };

  // Reset *before* the network call so a slow beacon doesn't merge with
  // the next page's slots on a fast SPA navigation.
  resetHealth();

  try {
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    if (navigator.sendBeacon && navigator.sendBeacon("/api/track", blob)) return;
  } catch { /* fall through to fetch */ }
  fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => { /* telemetry must never throw */ });
}

// Watch a single <ins> element for Google's `data-ad-status` attribute.
// Google sets it to "filled" when an ad served and "unfilled" when it
// didn't (approval pending, no-fill, or policy block). If it never gets
// set within the timeout window we record "timeout"; if adsbygoogle
// never became an array at all we record "blocked".
function observeSlot(el) {
  if (!el || typeof MutationObserver === "undefined") return;
  if (!HEALTH.loadId) resetHealth();

  const slotEntry = { status: "pending", ts: Date.now() };
  HEALTH.slots.push(slotEntry);

  // Early exit: if adsbygoogle isn't a live array after 3s the script
  // was blocked (ad blocker, DNS block, network error).
  const scriptCheck = setTimeout(() => {
    if (slotEntry.status !== "pending") return;
    const loaded =
      typeof window !== "undefined" &&
      Array.isArray(window.adsbygoogle) &&
      window.adsbygoogle.loaded === true;
    if (!loaded) {
      slotEntry.status = "blocked";
      scheduleFlush();
    }
  }, 3000);

  const finalize = (status) => {
    if (slotEntry.status !== "pending") return;
    slotEntry.status = status;
    clearTimeout(scriptCheck);
    clearTimeout(timeoutCheck);
    obs.disconnect();
    scheduleFlush();
  };

  const obs = new MutationObserver(() => {
    const status = el.getAttribute("data-ad-status");
    if (status === "filled")   return finalize("filled");
    if (status === "unfilled") return finalize("unfilled");
  });
  obs.observe(el, { attributes: true, attributeFilter: ["data-ad-status"] });

  // If Google never writes data-ad-status within 8s it's effectively
  // a no-op — could be approval pending, quota, or policy hold.
  const timeoutCheck = setTimeout(() => finalize("timeout"), 8000);
}

export default function AdUnit({ slot, format = "auto", responsive = true, className = "" }) {
  const pushed = useRef(false);
  const insRef = useRef(null);

  useEffect(() => {
    if (!CLIENT_ID || pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch { /* ad blocker, script not yet loaded, or fast-nav cleanup */ }
    // Start watching this slot for fill/unfill outcomes.
    if (insRef.current) observeSlot(insRef.current);
  }, []);

  if (!CLIENT_ID) return null;

  return (
    <div className={`ad-container ${className}`}>
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={CLIENT_ID}
        data-ad-slot={slot || ""}
        data-ad-format={format}
        data-full-width-responsive={responsive ? "true" : "false"}
      />
    </div>
  );
}

// AutoAds is a no-op now that the script loads from index.html and
// AdSense's auto-placement runs server-side. Kept exported so the
// existing import in src/App.jsx doesn't break — remove the import +
// this stub on the next pass through App.jsx if you want.
export function AutoAds() {
  return null;
}
