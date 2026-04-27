// Lightweight A/B experiment framework. Zero dependencies, no third-
// party SaaS — variant assignment is a deterministic hash of the
// visitor's anon_id (already issued by VisitorTracker.jsx and stored
// in localStorage as `srq_anon`) plus the experiment ID. The same
// visitor always sees the same variant for the same experiment, even
// after a cache clear if the anon_id is preserved.
//
// Conversion tracking: every assignment fires once via the existing
// analytics.track() pipeline, plus an `experiment_conversion` event
// any time you call recordConversion(experimentId, goal). GA4 + the
// /api/track DB sink both pick it up — no separate dashboard plumbing
// needed.
//
// To run an experiment:
//   const variant = useExperiment("home-hero", ["control", "buy-led", "wisp-led"]);
//   ...
//   <button onClick={() => recordConversion("home-hero", "primary-cta")} ...>
//
// Adding traffic-split weights (e.g. 90% control, 5%/5% test) is a future
// extension — the current implementation splits evenly.

import { useEffect, useState } from "react";
import { track } from "./analytics.js";

const STORAGE_KEY = "srq_ab_v1";
const ANON_KEY = "srq_anon";

// Stable string hash → 32-bit unsigned int. Same algorithm React Router
// uses for its keys; collision-resistant enough for variant bucketing.
function hash32(s) {
  let h = 5381 | 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return h >>> 0;
}

function readAnon() {
  if (typeof localStorage === "undefined") return "";
  try { return localStorage.getItem(ANON_KEY) || ""; } catch { return ""; }
}

function readAll() {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function writeAll(state) {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* noop */ }
}

// Server-rendering / SSR safe assignment: returns the first variant
// during the initial render pass when there's no DOM yet, then updates
// to the real assignment after mount. (We don't ship SSR today, but
// this keeps Vite preview and any future SSR flag from breaking.)
function deterministicVariant(experimentId, variants, anonId) {
  if (!variants?.length) return null;
  if (!anonId) {
    // No anon_id yet — fall back to a session-stable random pick so the
    // visitor still sees one variant consistently within the page-view.
    return variants[Math.floor(Math.random() * variants.length)];
  }
  const idx = hash32(`${experimentId}:${anonId}`) % variants.length;
  return variants[idx];
}

export function useExperiment(experimentId, variants) {
  const [variant, setVariant] = useState(() => {
    if (typeof window === "undefined") return variants?.[0] ?? null;
    const all = readAll();
    if (all[experimentId]?.v) return all[experimentId].v;
    return deterministicVariant(experimentId, variants, readAnon());
  });

  useEffect(() => {
    if (!experimentId || !variants?.length) return;
    const all = readAll();
    const existing = all[experimentId]?.v;
    if (existing && variants.includes(existing)) {
      setVariant(existing);
      return;
    }
    const v = deterministicVariant(experimentId, variants, readAnon());
    all[experimentId] = { v, ts: Date.now() };
    writeAll(all);
    setVariant(v);
    track("experiment_assigned", { experiment_id: experimentId, variant: v });
  }, [experimentId, variants]);

  return variant;
}

export function recordConversion(experimentId, goal = "primary") {
  const all = readAll();
  const v = all[experimentId]?.v;
  if (!v) return;
  // Idempotency per (experiment, goal) — only count first conversion to keep
  // CTR comparisons clean. Repeat clicks are still useful but tracked under
  // a separate "experiment_repeat_conversion" event so primary numbers don't
  // get inflated by an enthusiastic clicker.
  const key = `${experimentId}:${goal}`;
  const fired = all.__fired || {};
  if (fired[key]) {
    track("experiment_repeat_conversion", { experiment_id: experimentId, variant: v, goal });
    return;
  }
  fired[key] = Date.now();
  all.__fired = fired;
  writeAll(all);
  track("experiment_conversion", { experiment_id: experimentId, variant: v, goal });
}

// For the admin/portal dashboard — read every assignment + conversion
// the visitor has on file. Useful for debugging variant stickiness.
export function readExperimentState() {
  return readAll();
}
