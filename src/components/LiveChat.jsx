import { useEffect, useState } from "react";
import { hasMarketingConsent } from "../lib/consent.js";

// Tawk.to live chat widget — free tier, lazy-loaded only AFTER:
//   1. The visitor has granted marketing consent in the cookie banner
//   2. requestIdleCallback has fired (post-LCP, doesn't fight for the
//      main thread during initial paint)
//
// Activation is two-gated so a fresh visitor sees no third-party request
// until they've explicitly opted in. Visitors who decline marketing
// cookies never load Tawk at all — the contact form remains the
// fallback.
//
// To enable: set VITE_TAWK_PROPERTY_ID and VITE_TAWK_WIDGET_ID in
// Vercel env. Find them in your Tawk dashboard at
// https://dashboard.tawk.to → Administration → Channels → Chat Widget →
// Direct Chat Link. The URL ends in /<property>/<widget>.

const PROPERTY_ID = import.meta.env.VITE_TAWK_PROPERTY_ID || "";
const WIDGET_ID = import.meta.env.VITE_TAWK_WIDGET_ID || "default";

function loadTawk() {
  if (typeof window === "undefined") return;
  if (window.Tawk_API || document.querySelector('script[data-tawk-loaded]')) return;
  if (!PROPERTY_ID) return;

  window.Tawk_API = window.Tawk_API || {};
  window.Tawk_LoadStart = new Date();

  const s = document.createElement("script");
  s.async = true;
  s.src = `https://embed.tawk.to/${PROPERTY_ID}/${WIDGET_ID}`;
  s.charset = "UTF-8";
  s.setAttribute("crossorigin", "*");
  s.setAttribute("data-tawk-loaded", "true");
  document.body.appendChild(s);
}

function unloadTawk() {
  if (typeof window === "undefined") return;
  // Tawk doesn't expose a clean teardown — but we can hide the widget
  // when consent is revoked mid-session. The script tag persists so
  // re-granting consent flips the widget visible without reload.
  try {
    window.Tawk_API?.hideWidget?.();
  } catch { /* noop */ }
}

export default function LiveChat() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!PROPERTY_ID) return;

    const sync = () => setActive(hasMarketingConsent());
    sync();

    window.addEventListener("sirq:consent-change", sync);
    return () => window.removeEventListener("sirq:consent-change", sync);
  }, []);

  useEffect(() => {
    if (!PROPERTY_ID) return;

    if (active) {
      // Defer until idle so we don't fight TTI / LCP on slow connections.
      const idle =
        typeof window !== "undefined" && "requestIdleCallback" in window
          ? window.requestIdleCallback
          : (cb) => setTimeout(cb, 1500);
      const handle = idle(loadTawk, { timeout: 4000 });
      return () => {
        if (typeof window !== "undefined" && "cancelIdleCallback" in window && typeof handle === "number") {
          window.cancelIdleCallback(handle);
        }
      };
    } else {
      unloadTawk();
    }
  }, [active]);

  return null;
}
