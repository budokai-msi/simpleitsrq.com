// Microsoft Clarity — heatmaps + session recordings.
//
// Why Clarity (not just GA4): GA4 tells us *what* happens (which CTA was
// clicked, which page bounced). Clarity tells us *why* — where thumbs
// hesitated, which form field caused abandonment, where users rage-tap.
// On a small-business services site, the gap between "form viewed" and
// "form submitted" is mostly UX friction, and you can't fix it without
// seeing it.
//
// Privacy posture (matches Microsoft's Consent Mode v2 contract):
//   • Clarity Consent Mode is enabled in the project Settings → Setup
//     panel so cookies are NOT set until consentv2 is called.
//   • Script never loads until the visitor grants analytics consent —
//     stricter than Microsoft's own "load + cookieless mode" default.
//     Hard-blocks the network call for non-consenters instead of
//     trusting Clarity to anonymize.
//   • Once script loads, we call clarity('consentv2', { ad_Storage,
//     analytics_Storage }) with our two-bucket consent state mapped:
//        analytics → analytics_Storage
//        marketing → ad_Storage
//     This is the modern API per
//     https://learn.microsoft.com/clarity/setup-and-installation/clarity-consent-api-v2
//   • If consent is later withdrawn, we call clarity('consent', false)
//     which deletes the Clarity cookies and stops session capture per
//     the Microsoft "Erase cookies" snippet.
//
// VITE_CLARITY_PROJECT_ID is the 10-char project key from
// clarity.microsoft.com → Settings → Setup. Empty / unset = no-op.

import { useEffect } from "react";
import { CONSENT_EVENT, hasAnalyticsConsent, readConsent } from "./consent.js";

const CLARITY_ID = import.meta.env.VITE_CLARITY_PROJECT_ID || "";

let injected = false;
let lastConsentSignal = null; // tracks the last { a, ad } we sent — so we don't re-emit unchanged

function clarityCall(...args) {
  try {
    if (typeof window !== "undefined" && typeof window.clarity === "function") {
      window.clarity(...args);
    }
  } catch {
    // Swallow — analytics must never break render.
  }
}

// Map our two-bucket consent state (analytics + marketing) into the
// Clarity Consent v2 shape. Microsoft uses TitleCase ad_Storage /
// analytics_Storage with "granted" / "denied" string values.
function consentSignalFromState() {
  const c = readConsent();
  const analytics = !!(c && c.categories && c.categories.analytics);
  const marketing = !!(c && c.categories && c.categories.marketing);
  return {
    ad_Storage:        marketing ? "granted" : "denied",
    analytics_Storage: analytics ? "granted" : "denied",
  };
}

function syncClarityConsent() {
  const signal = consentSignalFromState();
  const fingerprint = `${signal.ad_Storage}|${signal.analytics_Storage}`;
  if (fingerprint === lastConsentSignal) return;
  lastConsentSignal = fingerprint;
  // consentv2 is the modern API; degrades gracefully in older Clarity
  // builds (they fall back to the v1 shape internally).
  clarityCall("consentv2", signal);
}

function injectClarity() {
  if (injected) return;
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (!CLARITY_ID) return;
  injected = true;

  // Standard Clarity bootstrap (per their docs), inlined so we can guard
  // every step with try/catch and avoid the eval-style loader.
  (function (c, l, a, r, i) {
    c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
    const t = l.createElement(r);
    t.async = 1;
    t.src = "https://www.clarity.ms/tag/" + i;
    const y = l.getElementsByTagName(r)[0];
    y.parentNode.insertBefore(t, y);
  })(window, document, "clarity", "script", CLARITY_ID);

  // Send the initial consentv2 signal as soon as the loader queue
  // exists. Clarity buffers calls until the real script attaches.
  syncClarityConsent();
}

/** React hook — load Clarity once analytics consent is granted, and
 *  push the modern consentv2 signal on every consent state change.
 *  Mount once at the app root. */
export function useClarity() {
  useEffect(() => {
    if (!CLARITY_ID) return; // No project ID = feature disabled.

    const apply = () => {
      if (hasAnalyticsConsent()) {
        injectClarity();
        // If injection already ran in a previous tick, still push the
        // updated signal in case the visitor toggled marketing on/off.
        syncClarityConsent();
      } else if (injected) {
        // Visitor revoked consent mid-session — push denied flags and
        // erase Clarity's cookies per the docs' Erase Cookies snippet.
        // syncClarityConsent() pushes denied first; then false clears
        // any persisted IDs.
        syncClarityConsent();
        clarityCall("consent", false);
      }
    };

    apply();
    window.addEventListener(CONSENT_EVENT, apply);
    return () => window.removeEventListener(CONSENT_EVENT, apply);
  }, []);
}

/** Tag the current Clarity session with a custom event name (shows up
 *  in the "Smart Events" filter). Use sparingly — Clarity charges by
 *  event volume on the paid tier. */
export function clarityEvent(name) {
  if (!name || typeof name !== "string") return;
  clarityCall("event", name);
}

/** Attach key/value metadata to the current visitor (e.g. logged-in
 *  user role, plan tier). Survives across the Clarity session. */
export function claritySet(key, value) {
  if (!key) return;
  clarityCall("set", key, value);
}
