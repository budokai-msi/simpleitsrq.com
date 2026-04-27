import { useEffect, useRef } from "react";

// Defaults to the production AdSense publisher ID so ads render even
// without setting the env var (mirrors the ga-init.js fallback pattern).
// Set VITE_ADSENSE_CLIENT in .env.local to point staging/dev at a
// different account.
const CLIENT_ID =
  import.meta.env.VITE_ADSENSE_CLIENT || "ca-pub-7420716928607113";

// Per-placement slot IDs live in src/lib/adsenseSlots.js so this file
// stays component-only (fast-refresh requires it). Each call site
// passes its slot via the `slot` prop; without one, AdUnit fails closed
// — that's the fix for the silent-no-ad bug where empty data-ad-slot=""
// tags rendered but AdSense couldn't fill them.

// The adsbygoogle.js script is loaded from <head> in index.html so
// AdSense's site-review crawler sees it on first paint (faster
// approval, more reliable verification). Consent is centrally handled
// via Consent Mode v2 (set in public/ga-init.js) — AdSense respects
// the ad_storage / ad_user_data / ad_personalization flags and serves
// non-personalized ads when those are denied. We don't need to gate
// the <ins> slot here on consent: Google handles "show personalized
// vs non-personalized" internally based on the Consent Mode state.

export default function AdUnit({ slot, format = "auto", responsive = true, className = "" }) {
  const pushed = useRef(false);
  const effectiveSlot = slot || "";

  useEffect(() => {
    if (!CLIENT_ID || !effectiveSlot || pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch { /* ad blocker, script not yet loaded, or fast-nav cleanup */ }
  }, [effectiveSlot]);

  // Fail closed: without a client ID or a slot ID, render nothing rather
  // than emit a malformed <ins> that AdSense will silently refuse to fill
  // and Lighthouse will flag as a layout-shift culprit.
  if (!CLIENT_ID || !effectiveSlot) return null;

  return (
    <div className={`ad-container ${className}`}>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={CLIENT_ID}
        data-ad-slot={effectiveSlot}
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
