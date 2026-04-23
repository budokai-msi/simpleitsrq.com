import { useEffect, useRef } from "react";

// Defaults to the production AdSense publisher ID so ads render even
// without setting the env var (mirrors the ga-init.js hardcoded-
// fallback pattern). Set VITE_ADSENSE_CLIENT in .env.local to point
// staging/dev at a different account.
const CLIENT_ID =
  import.meta.env.VITE_ADSENSE_CLIENT || "ca-pub-7420716928607113";
let scriptLoaded = false;

function loadScript() {
  if (scriptLoaded || !CLIENT_ID) return;
  scriptLoaded = true;
  const s = document.createElement("script");
  s.async = true;
  s.crossOrigin = "anonymous";
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT_ID}`;
  document.head.appendChild(s);
}

export default function AdUnit({ slot, format = "auto", responsive = true, className = "" }) {
  const pushed = useRef(false);

  useEffect(() => {
    if (!CLIENT_ID) return;
    loadScript();
    if (!pushed.current) {
      pushed.current = true;
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch { /* ad blocker or not loaded yet */ }
    }
  }, []);

  if (!CLIENT_ID) return null;

  return (
    <div className={`ad-container ${className}`}>
      <ins
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

export function AutoAds() {
  useEffect(() => {
    if (!CLIENT_ID) return;
    loadScript();
  }, []);
  return null;
}
