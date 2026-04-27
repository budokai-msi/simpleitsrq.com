// src/lib/consent.js
//
// Single source of truth for the visitor's cookie-consent choice.
// Persists as JSON in localStorage under `sirq_consent_v1`. Emits a window
// event when the choice changes so other modules (analytics, tracker) can
// react without prop drilling.

const KEY = "sirq_consent_v1";
export const CONSENT_EVENT = "sirq:consent-change";

// A "version" bump lets us re-prompt users if the policy changes.
const VERSION = 1;

export function readConsent() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeConsent(categories) {
  if (typeof window === "undefined") return;
  const payload = {
    version: VERSION,
    ts: new Date().toISOString(),
    categories: {
      essential: true,                        // always on; required for sign-in/session
      analytics: !!categories.analytics,
      marketing: !!categories.marketing,
    },
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // ignore — quota / private mode
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: payload }));
  return payload;
}

export function hasAnalyticsConsent() {
  const c = readConsent();
  return !!(c && c.categories && c.categories.analytics);
}

export function hasMarketingConsent() {
  const c = readConsent();
  return !!(c && c.categories && c.categories.marketing);
}
