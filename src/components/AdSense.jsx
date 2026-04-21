import { useEffect, useRef, useState } from "react";
import { readConsent, CONSENT_EVENT } from "../lib/consent.js";

const CLIENT_ID = import.meta.env.VITE_ADSENSE_CLIENT || "";
let scriptLoaded = false;

function hasMarketingConsent() {
  return !!readConsent()?.categories?.marketing;
}

function loadScript() {
  if (scriptLoaded || !CLIENT_ID) return;
  if (!hasMarketingConsent()) return;
  scriptLoaded = true;
  const s = document.createElement("script");
  s.async = true;
  s.crossOrigin = "anonymous";
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT_ID}`;
  document.head.appendChild(s);
}

function useMarketingConsent() {
  const [ok, setOk] = useState(() =>
    typeof window === "undefined" ? false : hasMarketingConsent(),
  );
  useEffect(() => {
    const onChange = () => setOk(hasMarketingConsent());
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, []);
  return ok;
}

export default function AdUnit({ slot, format = "auto", responsive = true, className = "" }) {
  const pushed = useRef(false);
  const consented = useMarketingConsent();

  useEffect(() => {
    if (!CLIENT_ID || !consented) return;
    loadScript();
    if (!pushed.current) {
      pushed.current = true;
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch { /* ad blocker or not loaded yet */ }
    }
  }, [consented]);

  if (!CLIENT_ID || !consented) return null;

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
  const consented = useMarketingConsent();
  useEffect(() => {
    if (!CLIENT_ID || !consented) return;
    loadScript();
  }, [consented]);
  return null;
}
