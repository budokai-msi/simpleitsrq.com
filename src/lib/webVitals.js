// Core Web Vitals collection — feeds both GA4 and our own engagement_events
// table so Admin Ops can correlate performance with bounce/engagement.
//
// Library: web-vitals (https://github.com/GoogleChrome/web-vitals), the
// Chrome team's official CWV measurement package.
//
// Consent-aware: metrics only send after analytics consent is granted, and
// they ride the same /api/track engagement pipeline (kind=vitals) so no
// extra third-party requests are made.

import { onLCP, onCLS, onINP, onTTFB, onFCP } from "web-vitals";
import { hasAnalyticsConsent, CONSENT_EVENT } from "./consent.js";

const sent = new Set();

function report(name, metric) {
  try {
    if (!hasAnalyticsConsent()) return;
    if (sent.has(name)) return; // first (or only) emission per metric per page
    sent.add(name);

    const payload = {
      kind: "vitals",
      path: typeof window !== "undefined" ? window.location.pathname : null,
      valueNum: Math.round(metric.value),
      valueText: name,
      meta: {
        rating: metric.rating,             // 'good' | 'needs-improvement' | 'poor'
        delta: Math.round(metric.delta),
        id: metric.id,
        navType: metric.navigationType,    // navigate | reload | back-forward
      },
    };

    // Our own pipeline (survives GA ad-blockers).
    if (typeof navigator !== "undefined" && navigator.doNotTrack !== "1") {
      const body = JSON.stringify({ ...payload, events: [payload] });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/api/track", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
      }
    }

    // Mirror to GA4 for the Web Vitals report.
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("event", name, {
        value: Math.round(metric.value),
        metric_rating: metric.rating,
        non_interaction: true,
      });
    }
  } catch {
    // Never break the page over telemetry.
  }
}

let installed = false;

export function installWebVitals() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  // If consent arrives later (banner interaction), re-allow sending.
  if (!hasAnalyticsConsent()) {
    window.addEventListener(CONSENT_EVENT, () => begin(), { once: true });
    return;
  }
  begin();
}

function begin() {
  try {
    onLCP((m) => report("LCP", m));
    onCLS((m) => report("CLS", m));
    onINP((m) => report("INP", m));
    onTTFB((m) => report("TTFB", m));
    onFCP((m) => report("FCP", m));
  } catch { /* old browsers — skip */ }
}
