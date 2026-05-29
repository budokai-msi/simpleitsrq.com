// src/lib/behaviorBeacon.js
//
// Phase 1 of the on-site recommender data pipeline. Captures per-session
// implicit-feedback signals (dwell, scroll, section views, clicks) and
// posts them to /api/track with kind=engagement, where they land in the
// engagement_events table for our own ML to train on.
//
// This is INTENTIONALLY separate from src/lib/engagement.js (which fires
// GA4 events). Two sinks, two purposes:
//
//   engagement.js      → trackEvent() → GA4 → Looker dashboards
//   behaviorBeacon.js  → /api/track  → engagement_events → recommender
//
// Splitting them keeps GA-consent gating, sampling, and event names
// independent from the schema we want to evolve for our own model.
//
// Privacy:
//   - Events always carry sessionId (a UUID, not PII) and path.
//   - anonId is only attached if the visitor has accepted analytics
//     consent — same gate VisitorTracker uses for its anon cookie.
//   - No keystroke logging, no mouse-trail capture, no fingerprinting
//     beyond what the standard browser APIs already expose.

const ENDPOINT = "/api/track";
const SESSION_COOKIE = "sirq_sess";
const ANON_COOKIE    = "sirq_anon";
const LEGACY_ANON_LS = "srq_anon";

// Tunables. At ~100 events/page these still fit in a single batch flush.
const FLUSH_INTERVAL_MS = 5000;
const FLUSH_BATCH_THRESHOLD = 20;
const SCROLL_MILESTONES = [25, 50, 75, 100];
const DWELL_TICK_MS = 15000;
// Cap dwell at 30 minutes per pageview so a forgotten tab cannot poison
// per-item dwell aggregates.
const MAX_DWELL_MS = 30 * 60 * 1000;

// ----------------------------- session helpers -----------------------------

function readCookie(name) {
  if (typeof document === "undefined") return null;
  try {
    const m = document.cookie.split("; ").find((c) => c.startsWith(name + "="));
    return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
  } catch { return null; }
}

function getSessionId() { return readCookie(SESSION_COOKIE); }
function getAnonId() {
  const fromCookie = readCookie(ANON_COOKIE);
  if (fromCookie) return fromCookie;
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(LEGACY_ANON_LS) : null;
  } catch { return null; }
}

// Slug derivation: /blog/foo-bar → "foo-bar". Returns null for non-post
// pages so the recommender can ignore them at training time.
function slugFromPath(path) {
  if (!path) return null;
  const m = /^\/blog\/([a-z0-9-]+)/i.exec(path);
  return m ? m[1].toLowerCase() : null;
}

// --------------------------------- buffer ----------------------------------

let buffer = [];
let flushTimer = null;

function send(payload) {
  // Always returns synchronously — never await on the navigation path.
  try {
    const body = JSON.stringify(payload);
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(ENDPOINT, blob)) return;
    }
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {});
  } catch { /* never let telemetry crash the page */ }
}

function flush() {
  if (buffer.length === 0) return;
  const events = buffer;
  buffer = [];
  send({
    kind: "engagement",
    sessionId: getSessionId(),
    anonId: getAnonId(),
    events,
  });
}

function scheduleFlush() {
  if (flushTimer != null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, FLUSH_INTERVAL_MS);
}

function pushEvent(kind, extra = {}) {
  const path = typeof window !== "undefined" ? window.location.pathname + window.location.search : null;
  buffer.push({
    kind,
    path,
    slug: slugFromPath(path),
    ...extra,
  });
  if (buffer.length >= FLUSH_BATCH_THRESHOLD) {
    flush();
  } else {
    scheduleFlush();
  }
}

// ---------------------------- per-page state -------------------------------
//
// Reset on every route change. Tracks the "currently visible" pageview so
// pageview_exit can summarize dwell + max scroll without scanning history.

let currentPath = null;
let pageEnterAt = 0;
let activeMs = 0;
let lastTickAt = 0;
let isPageVisible = true;
let maxScrollPct = 0;
let firedScrollMilestones = new Set();
let dwellTickTimer = null;
let sectionObserver = null;

function nowVisible() {
  if (typeof document === "undefined") return true;
  return document.visibilityState !== "hidden" && (document.hasFocus ? document.hasFocus() : true);
}

function pumpDwell() {
  // Convert wall-clock time since last pump into active dwell only when
  // the page was visible the whole time. Pause/resume happens in the
  // visibilitychange handler which calls pumpDwell before flipping the flag.
  if (!isPageVisible) return;
  const t = Date.now();
  if (lastTickAt > 0) {
    activeMs = Math.min(MAX_DWELL_MS, activeMs + (t - lastTickAt));
  }
  lastTickAt = t;
}

function startDwellTicker() {
  stopDwellTicker();
  dwellTickTimer = setInterval(() => {
    pumpDwell();
    pushEvent("dwell_tick", { valueNum: activeMs });
  }, DWELL_TICK_MS);
}

function stopDwellTicker() {
  if (dwellTickTimer != null) {
    clearInterval(dwellTickTimer);
    dwellTickTimer = null;
  }
}

function computeScrollPct() {
  if (typeof document === "undefined") return 0;
  const doc = document.documentElement;
  const body = document.body;
  const scrollTop = window.scrollY || doc.scrollTop || body.scrollTop || 0;
  const scrollHeight = Math.max(doc.scrollHeight, body.scrollHeight, doc.offsetHeight, body.offsetHeight);
  const viewport = window.innerHeight || doc.clientHeight || 0;
  const scrollable = scrollHeight - viewport;
  if (scrollable <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((scrollTop / scrollable) * 100)));
}

function onScroll() {
  const pct = computeScrollPct();
  if (pct > maxScrollPct) maxScrollPct = pct;
  for (const m of SCROLL_MILESTONES) {
    if (pct >= m && !firedScrollMilestones.has(m)) {
      firedScrollMilestones.add(m);
      pushEvent("scroll_milestone", { valueNum: m });
    }
  }
}

function onVisibilityChange() {
  pumpDwell();
  isPageVisible = nowVisible();
  // Reset the tick anchor so the inactive interval is not double-counted.
  lastTickAt = isPageVisible ? Date.now() : 0;
}

function emitPageviewExit(reason) {
  if (!currentPath) return;
  pumpDwell();
  pushEvent("pageview_exit", {
    valueNum: activeMs,
    valueText: reason || "unload",
    meta: { maxScrollPct, totalMs: Date.now() - pageEnterAt },
  });
}

function setupSectionObserver() {
  if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
  if (sectionObserver) sectionObserver.disconnect();
  sectionObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      const anchor = el.id || el.getAttribute("data-section") || (el.textContent || "").trim().slice(0, 80);
      if (!anchor) continue;
      pushEvent("section_view", { valueText: anchor });
      sectionObserver.unobserve(el); // fire once per section per pageview
    }
  }, { threshold: 0.4 });

  // Defer one frame so the new route's DOM is mounted before we query for headings.
  requestAnimationFrame(() => {
    document.querySelectorAll("article h2, article h3, [data-section]").forEach((el) => {
      sectionObserver.observe(el);
    });
  });
}

// ------------------------------ public API ---------------------------------

// Called by VisitorTracker on every route change. Closes out the previous
// pageview's exit beacon, then primes the per-page state for the new path.
export function startPageview(path) {
  if (typeof window === "undefined") return;
  if (typeof navigator !== "undefined" && navigator.doNotTrack === "1") return;

  if (currentPath && currentPath !== path) {
    emitPageviewExit("route_change");
  }

  currentPath = path;
  pageEnterAt = Date.now();
  activeMs = 0;
  lastTickAt = isPageVisible ? Date.now() : 0;
  maxScrollPct = computeScrollPct();
  firedScrollMilestones = new Set();

  pushEvent("pageview_enter", {
    valueNum: 0,
    meta: {
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
      viewport: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : null,
    },
  });

  setupSectionObserver();
  startDwellTicker();
  // Kick a scroll computation in case the user lands deep-linked.
  onScroll();
}

export function trackSiteSearch(query, meta = {}) {
  if (typeof window === "undefined") return;
  if (typeof navigator !== "undefined" && navigator.doNotTrack === "1") return;
  const q = String(query || "").trim().slice(0, 200);
  if (q.length < 2) return;
  pushEvent("search", {
    valueText: q,
    valueNum: Number.isFinite(Number(meta.resultCount)) ? Number(meta.resultCount) : null,
    meta: {
      source: String(meta.source || "site").slice(0, 40),
      resultCount: Number.isFinite(Number(meta.resultCount)) ? Number(meta.resultCount) : null,
      category: meta.category ? String(meta.category).slice(0, 80) : null,
    },
  });
  flush();
}

// Custom engagement event helper for product-specific funnels.
// This keeps those events in our own engagement_events table so
// Admin Ops can report on them without depending on GA exports.
export function trackBehaviorEvent(kind, payload = {}) {
  if (typeof window === "undefined") return;
  if (typeof navigator !== "undefined" && navigator.doNotTrack === "1") return;
  const safeKind = String(kind || "").trim().slice(0, 32);
  if (!safeKind) return;
  pushEvent(safeKind, {
    valueNum: Number.isFinite(Number(payload.valueNum)) ? Number(payload.valueNum) : null,
    valueText: payload.valueText != null ? String(payload.valueText).slice(0, 500) : null,
    meta: payload.meta && typeof payload.meta === "object" ? payload.meta : null,
  });
  flush();
}

// Click delegation on document. Fires once per click on internal anchors,
// outbound links, buttons, and any element with [data-track]. Lightweight
// enough to attach unconditionally — no per-element listeners.
function onDocumentClick(e) {
  const a = e.target?.closest?.("a, [data-track], button");
  if (!a) return;
  const isAnchor = a.tagName === "A";
  const href = isAnchor ? a.getAttribute("href") : null;
  const trackLabel = a.getAttribute("data-track");

  if (!isAnchor && !trackLabel) return;

  let outbound = false;
  let dest = href || null;
  try {
    if (href && /^https?:/i.test(href)) {
      const u = new URL(href, window.location.href);
      outbound = u.host !== window.location.host;
    }
  } catch { /* ignore */ }

  pushEvent("click", {
    valueText: dest || trackLabel || (a.textContent || "").trim().slice(0, 80),
    meta: { outbound, label: trackLabel || null, tag: a.tagName.toLowerCase() },
  });
}

function fieldIntentFor(el) {
  if (!el) return null;
  const tag = el.tagName?.toLowerCase?.() || "";
  const type = (el.getAttribute("type") || tag).toLowerCase();
  if (["password", "email", "tel", "hidden"].includes(type)) return null;
  const name = el.getAttribute("name") || el.id || el.getAttribute("aria-label") || el.getAttribute("placeholder") || tag;
  const form = el.closest("form");
  return {
    field: String(name || "field").slice(0, 80),
    form: String(form?.getAttribute("name") || form?.id || form?.getAttribute("aria-label") || "inline").slice(0, 80),
    inputType: type,
    length: typeof el.value === "string" ? Math.min(el.value.length, 10000) : null,
  };
}

let lastInputIntentAt = 0;
const lastInputByField = new Map();

function onDocumentFocusIn(e) {
  const el = e.target?.closest?.("input, textarea, select");
  const intent = fieldIntentFor(el);
  if (!intent) return;
  pushEvent("form_focus", {
    valueText: intent.field,
    meta: intent,
  });
}

function onDocumentInput(e) {
  const el = e.target?.closest?.("input, textarea, select");
  const intent = fieldIntentFor(el);
  if (!intent) return;

  const now = Date.now();
  const key = `${currentPath || ""}:${intent.form}:${intent.field}`;
  const prev = lastInputByField.get(key) || 0;
  if (now - prev < 2500 || now - lastInputIntentAt < 600) return;
  lastInputByField.set(key, now);
  lastInputIntentAt = now;

  pushEvent("input_intent", {
    valueText: intent.field,
    valueNum: intent.length,
    meta: intent,
  });
}

// One-time setup. Idempotent — calling twice is a no-op.
let installed = false;
export function installBehaviorBeacon() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  // Honor DNT — same gate VisitorTracker already enforces.
  if (typeof navigator !== "undefined" && navigator.doNotTrack === "1") return;

  isPageVisible = nowVisible();
  lastTickAt = isPageVisible ? Date.now() : 0;

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange, { passive: true });
  window.addEventListener("focus", onVisibilityChange, { passive: true });
  window.addEventListener("blur", onVisibilityChange, { passive: true });
  document.addEventListener("click", onDocumentClick, { passive: true, capture: true });
  document.addEventListener("focusin", onDocumentFocusIn, { passive: true, capture: true });
  document.addEventListener("input", onDocumentInput, { passive: true, capture: true });

  // Final flush on page hide. pageview_exit + sendBeacon survives navigation
  // away, tab close, and most mobile-Safari edge cases that "unload" misses.
  const finalize = () => {
    emitPageviewExit("pagehide");
    flush();
  };
  window.addEventListener("pagehide", finalize);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      // Don't emit a full exit here (the page might come back from bfcache);
      // just flush whatever's buffered so we don't lose it.
      flush();
    }
  });
}
