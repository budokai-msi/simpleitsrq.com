// src/lib/utm.js
//
// B2B Campaign & Lead Attribution Utility
// Automatically parses, persists, and enriches traffic source & UTM parameters
// (utm_source, utm_medium, utm_campaign, utm_term, utm_content, gclid, fbclid)
// across client browsing sessions for accurate admin lead attribution.

const UTM_KEY = "sirq_utm_attribution";

export function captureUtmParams() {
  if (typeof window === "undefined" || !window.location) return;

  try {
    const params = new URLSearchParams(window.location.search);
    const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"];
    const found = {};
    let hasUtm = false;

    keys.forEach((k) => {
      const val = params.get(k);
      if (val) {
        found[k] = val.trim().slice(0, 150);
        hasUtm = true;
      }
    });

    // Capture referrer domain if not internal
    if (document.referrer) {
      try {
        const refUrl = new URL(document.referrer);
        if (refUrl.hostname && refUrl.hostname !== window.location.hostname) {
          found.referrer_domain = refUrl.hostname;
        }
      } catch {
        // ignore invalid referrer
      }
    }

    if (hasUtm || found.referrer_domain) {
      const payload = {
        ...found,
        captured_at: new Date().toISOString(),
        first_landing: window.location.pathname,
      };
      sessionStorage.setItem(UTM_KEY, JSON.stringify(payload));
      localStorage.setItem(UTM_KEY, JSON.stringify(payload));
    }
  } catch {
    // Fail-safe if storage restricted
  }
}

export function getUtmParams() {
  if (typeof window === "undefined") return {};
  try {
    const rawSession = sessionStorage.getItem(UTM_KEY);
    if (rawSession) return JSON.parse(rawSession);
    const rawLocal = localStorage.getItem(UTM_KEY);
    if (rawLocal) return JSON.parse(rawLocal);
  } catch {
    // ignore
  }
  return {};
}
