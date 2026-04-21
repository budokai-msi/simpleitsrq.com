// Sentry runtime error tracking (client-side).
//
// This module is intentionally the ONLY place that imports @sentry/react,
// so it can be lazy-loaded via a dynamic import() to keep the critical
// path bundle lean.
//
// If VITE_SENTRY_DSN is unset at runtime, every export here is a no-op —
// local development and preview builds without a DSN must stay silent.

import * as Sentry from "@sentry/react";

// Keys whose values should be scrubbed from error payloads before they
// leave the browser. Matched case-insensitively against object keys.
const SENSITIVE_KEY_RE = /pass(word)?|token|secret|key/i;
const REDACTED = "[redacted]";

// Strip query string + fragment from a URL without throwing on relatives.
function stripUrlParams(rawUrl) {
  if (typeof rawUrl !== "string" || rawUrl === "") return rawUrl;
  // Fast path: no '?' and no '#' means nothing to strip.
  const qIdx = rawUrl.indexOf("?");
  const hIdx = rawUrl.indexOf("#");
  if (qIdx === -1 && hIdx === -1) return rawUrl;
  try {
    // Use a base so relative URLs parse. We only read pathname/origin.
    const parsed = new URL(rawUrl, "http://_local_");
    if (parsed.origin === "http://_local_") {
      // rawUrl was relative — return just the pathname.
      return parsed.pathname;
    }
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    // Best effort — cut at the first ? or #.
    const cut = Math.min(
      qIdx === -1 ? Infinity : qIdx,
      hIdx === -1 ? Infinity : hIdx,
    );
    return rawUrl.slice(0, cut);
  }
}

// Walk an object once and redact values on sensitive keys. Returns a
// shallow-cloned object; never mutates the caller's data. Non-objects
// pass through untouched.
function redactSensitive(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redactSensitive);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEY_RE.test(k)) {
      out[k] = REDACTED;
    } else if (v && typeof v === "object") {
      out[k] = redactSensitive(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function beforeSend(event) {
  try {
    if (event?.request?.url) {
      event.request.url = stripUrlParams(event.request.url);
    }
    if (event?.request?.data) {
      event.request.data = redactSensitive(event.request.data);
    }
    if (event?.extra) {
      event.extra = redactSensitive(event.extra);
    }
    if (Array.isArray(event?.breadcrumbs)) {
      event.breadcrumbs = event.breadcrumbs.map((b) => {
        if (!b) return b;
        const next = { ...b };
        if (next.data && typeof next.data === "object") {
          // Breadcrumbs from fetch/xhr/navigation put the URL on data.url or data.to/from.
          if (typeof next.data.url === "string") {
            next.data = { ...next.data, url: stripUrlParams(next.data.url) };
          }
          if (typeof next.data.to === "string") {
            next.data = { ...next.data, to: stripUrlParams(next.data.to) };
          }
          if (typeof next.data.from === "string") {
            next.data = { ...next.data, from: stripUrlParams(next.data.from) };
          }
        }
        return next;
      });
    }
  } catch {
    // Never let a scrubber bug block the event — fall through.
  }
  return event;
}

let initialized = false;

export function initSentry() {
  if (initialized) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  // Missing DSN must be a complete no-op — no warning, no throw.
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment:
      import.meta.env.MODE ||
      (import.meta.env.PROD ? "production" : "development"),
    tracesSampleRate: 0.1,
    // Replays only on error — zero cost during happy-path sessions.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.5,
    beforeSend,
    ignoreErrors: [
      // Benign browser noise.
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications.",
      "Non-Error promise rejection captured",
      // AdBlock / privacy extensions frequently null out globals we touch.
      /adblock/i,
      /adsbygoogle/i,
      "Blocked by content blocker",
    ],
  });
  initialized = true;
}

// Thin wrapper so callers don't have to import @sentry/react directly.
// Safe to call before initSentry — Sentry's own API is a no-op when the
// client hasn't been initialized.
export function captureException(err, context) {
  if (!initialized) return;
  Sentry.captureException(err, context);
}
