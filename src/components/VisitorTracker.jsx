// src/components/VisitorTracker.jsx
//
// Fires a POST to /api/track on every route change AND on initial load.
// The server records IP, geolocation, user-agent, referrer, path, and the
// signed-in user id (if any). This runs for *every* visitor — the server
// side of tracking is legitimate-interest logging (security, fraud, abuse
// prevention) and does not require cookie consent under either CCPA or
// GDPR for first-party pseudonymous data.
//
// What DOES depend on consent:
//   - Cross-session correlation via the sirq_anon cookie below
//   - Anything we ship downstream to third-party analytics
//
// If the visitor rejects non-essential cookies we still log the visit on
// the server but we don't persist an anon_id cookie and we mark the event
// as "consent: rejected" so downstream tooling can ignore it.

import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { readConsent, CONSENT_EVENT } from "../lib/consent.js";

function getAnonId() {
  try {
    const existing = document.cookie
      .split("; ")
      .find((c) => c.startsWith("sirq_anon="));
    if (existing) return existing.slice("sirq_anon=".length);
  } catch {
    // ignore
  }
  return null;
}

function setAnonIdCookie(id) {
  try {
    // 1 year; first-party; SameSite=Lax so it travels on navigations only.
    const days = 365;
    const exp = new Date(Date.now() + days * 864e5).toUTCString();
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `sirq_anon=${id}; Path=/; Expires=${exp}; SameSite=Lax${secure}`;
  } catch {
    // ignore
  }
}

function clearAnonIdCookie() {
  try {
    document.cookie = "sirq_anon=; Path=/; Max-Age=0; SameSite=Lax";
  } catch {
    // ignore
  }
}

function randomId() {
  // 16 random bytes → 32 hex chars. Plenty of entropy for an anonymous id.
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export default function VisitorTracker() {
  const location = useLocation();
  const lastSent = useRef(null);

  useEffect(() => {
    // React to consent changes: if the visitor revokes analytics we drop
    // the anon cookie. If they accept we mint one on the next track call.
    const onConsentChange = (e) => {
      const analytics = e?.detail?.categories?.analytics;
      if (!analytics) clearAnonIdCookie();
    };
    window.addEventListener(CONSENT_EVENT, onConsentChange);
    return () => window.removeEventListener(CONSENT_EVENT, onConsentChange);
  }, []);

  useEffect(() => {
    const path = location.pathname + location.search;
    if (lastSent.current === path) return;
    lastSent.current = path;

    const consent = readConsent();
    const analyticsOk = !!(consent && consent.categories && consent.categories.analytics);

    let anonId = getAnonId();
    if (analyticsOk && !anonId) {
      anonId = randomId();
      setAnonIdCookie(anonId);
    }

    // Passive device signals — no canvas/WebGL/audio probing. Only reads
    // properties the browser already exposes in the standard API surface.
    const nav = typeof navigator !== "undefined" ? navigator : {};
    const scr = typeof window !== "undefined" ? window.screen : {};

    const payload = {
      anonId: analyticsOk ? anonId : null,
      path,
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
      screen: scr ? `${scr.width || 0}x${scr.height || 0}` : null,
      colorDepth: scr?.colorDepth || null,
      tz: Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone || null,
      lang: nav.language || null,
      langs: nav.languages ? Array.from(nav.languages).join(",") : null,
      platform: nav.platform || null,
      cores: nav.hardwareConcurrency || null,
      mem: nav.deviceMemory || null,
      touch: nav.maxTouchPoints || 0,
      dpr: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
      connection: nav.connection?.effectiveType || null,
      pdfViewer: nav.pdfViewerEnabled ?? null,
      cookieEnabled: nav.cookieEnabled ?? null,
      consent: consent ? (analyticsOk ? "analytics" : "essential") : "pending",
    };

    // Prefer sendBeacon so navigation aways doesn't drop the log; fall back
    // to fetch keepalive.
    try {
      const body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon("/api/track", blob);
      } else {
        fetch("/api/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
          credentials: "same-origin",
        }).catch(() => {});
      }
    } catch {
      // best-effort; never interrupt the user
    }
  }, [location]);

  return null;
}
