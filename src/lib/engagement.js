// Engagement tracking — scroll depth, time-on-page, viewport metadata.
//
// Why this exists:
//   GA4's default "engagement" metric is just "did the tab stay open >10s",
//   which tells us almost nothing about *which content* is engaging.
//   Scroll-depth + time milestones turn each page into a funnel:
//     view → 50% scroll → 90% scroll → 60s engaged → CTA click
//   That funnel is what surfaces "this blog post drives leads, this one
//   doesn't" instead of just raw pageviews.
//
//   Also captures the visitor's viewport / device class once per session
//   so GA4's segment builder can split conversion rate by device without
//   relying on Google's UA-string guesses.
//
// All events are gated on analytics consent via trackEvent() — which
// short-circuits when consent is denied — so this module is safe to
// mount unconditionally.

import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackEvent } from "./analytics.js";

const SCROLL_MILESTONES = [25, 50, 75, 90];
const TIME_MILESTONES_SEC = [30, 60, 120, 300];

function deviceClass(width) {
  if (width < 480) return "mobile_small";
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  if (width < 1440) return "desktop";
  return "desktop_large";
}

let viewportLogged = false;
function logViewportOnce() {
  if (viewportLogged) return;
  if (typeof window === "undefined") return;
  viewportLogged = true;
  const w = window.innerWidth;
  const h = window.innerHeight;
  trackEvent("viewport_metadata", {
    viewport_width: w,
    viewport_height: h,
    device_class: deviceClass(w),
    pixel_ratio: window.devicePixelRatio || 1,
    // Connection hints are only on Chromium; missing on Safari/Firefox.
    connection_type: navigator.connection?.effectiveType || "unknown",
    saves_data: !!navigator.connection?.saveData,
  });
}

function readScrollPercent() {
  if (typeof document === "undefined") return 0;
  const doc = document.documentElement;
  const body = document.body;
  const scrollTop = window.scrollY || doc.scrollTop || body.scrollTop || 0;
  const scrollHeight = Math.max(
    doc.scrollHeight,
    body.scrollHeight,
    doc.offsetHeight,
    body.offsetHeight
  );
  const viewport = window.innerHeight || doc.clientHeight || 0;
  const scrollable = scrollHeight - viewport;
  if (scrollable <= 0) return 100; // Page fits in viewport.
  return Math.min(100, Math.round((scrollTop / scrollable) * 100));
}

/** React hook — fires scroll-depth + time-on-page milestones per route.
 *  Mount once near the app root (alongside useAnalyticsPageviews). */
export function useEngagementTracking() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;
    logViewportOnce();

    // Per-route milestone trackers — reset on every navigation so each
    // page gets its own scroll funnel.
    const firedScroll = new Set();
    const firedTime = new Set();
    const startedAt = Date.now();

    let rafPending = false;
    const onScroll = () => {
      if (rafPending) return;
      rafPending = true;
      window.requestAnimationFrame(() => {
        rafPending = false;
        const pct = readScrollPercent();
        for (const milestone of SCROLL_MILESTONES) {
          if (pct >= milestone && !firedScroll.has(milestone)) {
            firedScroll.add(milestone);
            trackEvent("scroll_depth", {
              percent: milestone,
              page_path: pathname,
            });
          }
        }
      });
    };

    const timers = TIME_MILESTONES_SEC.map((sec) =>
      window.setTimeout(() => {
        firedTime.add(sec);
        trackEvent("time_on_page", {
          seconds: sec,
          page_path: pathname,
        });
      }, sec * 1000)
    );

    // Final exit beacon — captures the actual dwell time + max scroll
    // depth even if the visitor never hit a milestone. Uses pagehide
    // (more reliable than unload on mobile) and only fires once.
    let exitFired = false;
    const onExit = () => {
      if (exitFired) return;
      exitFired = true;
      const dwellSec = Math.round((Date.now() - startedAt) / 1000);
      const maxScroll = firedScroll.size
        ? Math.max(...firedScroll)
        : readScrollPercent();
      trackEvent("page_exit", {
        page_path: pathname,
        dwell_seconds: dwellSec,
        max_scroll_percent: maxScroll,
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", onExit);

    onScroll(); // Capture the case where the page already fits in viewport.

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onExit);
      timers.forEach((t) => window.clearTimeout(t));
      onExit(); // Route change = effective page exit for SPA reporting.
    };
  }, [pathname]);
}
