// Microsoft Clarity — heatmaps + session recordings.
//
// Why Clarity (not just GA4): GA4 tells us *what* happens (which CTA was
// clicked, which page bounced). Clarity tells us *why* — where thumbs
// hesitated, which form field caused abandonment, where users rage-tap.
// On a small-business services site, the gap between "form viewed" and
// "form submitted" is mostly UX friction, and you can't fix it without
// seeing it.
//
// Privacy posture:
//   • Script never loads until the visitor grants analytics consent
//     (same gate as GA4). This is stricter than Clarity's own consent
//     banner — we hard-block the network call rather than relying on
//     Clarity to anonymize.
//   • Clarity's masking defaults are aggressive: input values, password
//     fields, and elements with [data-clarity-mask] are redacted before
//     being sent. We additionally call clarity('consent') so Clarity
//     treats the session as fully consented (no extra prompt).
//   • If consent is later withdrawn, we call clarity('stop') so the
//     remaining session is not uploaded.
//
// VITE_CLARITY_PROJECT_ID is the 10-char project key from
// clarity.microsoft.com → Settings → Setup. Empty / unset = no-op.

import { useEffect } from "react";
import { CONSENT_EVENT, hasAnalyticsConsent } from "./consent.js";

const CLARITY_ID = import.meta.env.VITE_CLARITY_PROJECT_ID || "";

let injected = false;

function clarityCall(...args) {
  try {
    if (typeof window !== "undefined" && typeof window.clarity === "function") {
      window.clarity(...args);
    }
  } catch {
    // Swallow — analytics must never break render.
  }
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

  // Tell Clarity the visitor has consented — suppresses Clarity's own
  // banner and unlocks full session capture (vs. cookieless mode).
  clarityCall("consent");
}

/** React hook — load Clarity once analytics consent is granted, and
 *  stop it if consent is later withdrawn. Mount once at the app root. */
export function useClarity() {
  useEffect(() => {
    if (!CLARITY_ID) return; // No project ID = feature disabled.

    const apply = () => {
      if (hasAnalyticsConsent()) {
        injectClarity();
      } else if (injected) {
        // Visitor revoked consent mid-session — stop the recorder.
        clarityCall("stop");
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
