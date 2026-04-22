// Google Analytics 4 — consent-aware wrapper + SPA pageview hook.
//
// public/ga-init.js loads gtag at page boot with Consent Mode v2 defaults
// set to DENIED. This module:
//   • Flips gtag's consent state when the visitor opts in via CookieConsent
//     (and reverses it when they withdraw consent).
//   • Emits SPA page_view events on route changes via useAnalyticsPageviews().
//   • Provides trackEvent() for conversion / engagement reporting.
//
// The measurement ID is sourced from VITE_GA_MEASUREMENT_ID; if unset the
// ga-init.js fallback (G-YBMM01FMVW) is used. Dev / preview builds can
// override via .env.local to point at a test property.
//
// Nothing in this module should ever throw — GA must fail open, never
// break the site.

import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { readConsent, CONSENT_EVENT, hasAnalyticsConsent } from "./consent.js";

const GA_ID =
  import.meta.env.VITE_GA_MEASUREMENT_ID || "G-YBMM01FMVW";

// Make the ID available to ga-init.js on its next load (build cache,
// return visits). Does nothing on first paint since ga-init.js runs
// before the bundle — hence the fallback inside ga-init.js.
if (typeof window !== "undefined") {
  window.__GA_ID__ = GA_ID;
}

function gtagSafe(...args) {
  try {
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag(...args);
    }
  } catch {
    // Swallow — analytics must never break render.
  }
}

// Translate our two-bucket consent model (analytics + marketing) into the
// six-flag Consent Mode v2 state gtag expects.
function consentToGoogle(categories) {
  const analytics = categories && categories.analytics ? "granted" : "denied";
  const marketing = categories && categories.marketing ? "granted" : "denied";
  return {
    analytics_storage:   analytics,
    ad_storage:          marketing,
    ad_user_data:        marketing,
    ad_personalization:  marketing,
    functionality_storage: "granted",
    security_storage:      "granted",
  };
}

/** Push the current consent state to gtag. Called on app mount and
 *  whenever the visitor changes their choice via the banner. */
export function syncConsent() {
  const c = readConsent();
  if (!c) return; // Banner hasn't been answered yet — leave defaults (denied).
  gtagSafe("consent", "update", consentToGoogle(c.categories));
}

/** Emit a GA4 page_view. Called by useAnalyticsPageviews() on every
 *  react-router navigation; don't call directly in app code. */
export function trackPageview(path, title) {
  if (!hasAnalyticsConsent()) return;
  gtagSafe("event", "page_view", {
    page_path: path,
    page_title: title || (typeof document !== "undefined" ? document.title : undefined),
    page_location: typeof window !== "undefined" ? window.location.href : undefined,
  });
}

/**
 * Fire a custom event. Pass standard GA4 event names where possible
 * (generate_lead, sign_up, purchase, begin_checkout, contact, share,
 * search, select_content, login, etc.) so GA's reporting UI groups them
 * automatically. Non-standard names are accepted and will appear as
 * custom events.
 *
 * Conventions:
 *   - `value`        — numeric, USD; used for revenue reporting
 *   - `currency`     — defaults to USD; only set when value is
 *   - `items`        — array of ecommerce items for purchase / cart events
 *   - any other keys — become event params you can slice on in GA4
 *
 * Events fire regardless of analytics consent only if Consent Mode v2
 * has granted ad_* flags (i.e. marketing consent). For pure analytics
 * we require analytics consent; this matches GDPR legitimate-interest
 * boundaries we're already running.
 */
export function trackEvent(eventName, params = {}) {
  if (!eventName || typeof eventName !== "string") return;
  if (!hasAnalyticsConsent()) return;
  const payload = { ...params };
  if (typeof payload.value === "number" && !payload.currency) {
    payload.currency = "USD";
  }
  gtagSafe("event", eventName, payload);
}

/** Convenience wrappers matching the common events fired on this site. */
export const track = {
  // Visitor filled a lead form (quote request, audit intro, sponsor
  // inquiry, newsletter signup, etc.). Pass `value` when there's an
  // expected revenue tied to the lead.
  lead(source, value, extra = {}) {
    trackEvent("generate_lead", {
      source,
      ...(typeof value === "number" ? { value } : {}),
      ...extra,
    });
  },
  // Visitor clicked an affiliate link. Mirrors the /api/track beacon so
  // both sides (our DB + GA) see the same conversion.
  affiliateClick({ slug, destination, label, network }) {
    trackEvent("select_content", {
      content_type: "affiliate",
      content_id: label || destination,
      item_id: destination,
      affiliate_network: network,
      source_slug: slug,
    });
  },
  // Visitor clicked a store product buy link. Fires GA4 begin_checkout
  // so the funnel report shows the drop-off from view → click.
  beginCheckout({ slug, title, price }) {
    trackEvent("begin_checkout", {
      currency: "USD",
      value: typeof price === "number" ? price : undefined,
      items: [{
        item_id: slug,
        item_name: title,
        price: typeof price === "number" ? price : undefined,
        quantity: 1,
      }],
    });
  },
  // Visitor submitted a Book-a-Call scheduling request.
  schedule() {
    trackEvent("schedule");
  },
};

/** React hook — fires a page_view on every route change. Mount once,
 *  near the root of the app. */
export function useAnalyticsPageviews() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    const path = pathname + (search || "");
    // Wait a tick so document.title reflects the new route's <title>
    // (useSEO updates document.title in its effect, which runs after
    // this hook's useEffect if we fire synchronously).
    const id = setTimeout(() => trackPageview(path), 0);
    return () => clearTimeout(id);
  }, [pathname, search]);
}

/** Mount-time effect — sync existing consent to gtag + listen for
 *  banner updates. Mount once at the app root. */
export function useAnalyticsConsent() {
  useEffect(() => {
    syncConsent();
    const onChange = () => syncConsent();
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, []);
}
