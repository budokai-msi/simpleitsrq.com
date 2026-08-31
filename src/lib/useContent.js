// src/lib/useContent.js
//
// Content-override hook. Pages call `t(page, key, fallback)` to render
// editable text; the admin can override any string via the Content Editor
// tab without touching code. When no override exists, `t` returns the
// hardcoded fallback, so pages render identically until the admin edits
// something.
//
// Overrides are fetched once from /api/portal?action=content-manifest — a
// single round-trip that returns both the content overrides AND the design
// tokens (the same versioned manifest the editor commits to GitHub). The
// manifest is cached at module level so every page shares a single fetch.
// Fetch failures fall back to an empty map — the page never breaks.
//
// The admin editor can read the full manifest through getManifest().

import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "./authContext.js";
import EditableText from "../components/EditableText";

// Module-level cache shared across all pages. `null` means "not loaded yet".
let cache = null;
// In-flight promise so concurrent mounts share one request.
let inflight = null;

async function loadManifest() {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/portal?action=content-manifest", {
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "content-manifest failed");
      }
      cache = data;
      return cache;
    } catch {
      // Never break the page — fall back to hardcoded text.
      cache = { content: {} };
      return cache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function buildOverridesMap(manifest) {
  const map = {};
  const content = manifest?.content || {};
  for (const refKey of Object.keys(content)) {
    const dot = refKey.lastIndexOf(".");
    if (dot <= 0 || dot >= refKey.length - 1) continue;
    const page = refKey.slice(0, dot);
    const key = refKey.slice(dot + 1);
    if (!map[page]) map[page] = {};
    map[page][key] = content[refKey];
  }
  return map;
}

export function useContent() {
  const { user } = useAuth();
  // Only the sole owner admin becomes an "editor". For everyone else
  // isAdminEditor is false and `t()` returns the plain string, exactly as
  // before — visitors see zero change.
  const isAdminEditor = Boolean(user?.isAdmin);

  const [overrides, setOverrides] = useState(cache ? buildOverridesMap(cache) : {});

  const refresh = useCallback(async () => {
    const manifest = await loadManifest();
    setOverrides(buildOverridesMap(manifest));
  }, []);

  useEffect(() => {
    let alive = true;
    loadManifest().then((manifest) => {
      if (alive) setOverrides(buildOverridesMap(manifest));
    });
    return () => {
      alive = false;
    };
  }, []);

  const t = useCallback(
    (page, key, fallback) => {
      const current = overrides?.[page]?.[key] ?? fallback;
      // Non-admin users always get the plain string.
      if (!isAdminEditor) return current;
      // Strings that contain a {placeholder} template are assembled at the
      // call site (e.g. `t("industry","eyebrow","{industry} · {city}")` is
      // chained with .replace(...)). Returning a React element there breaks
      // rendering ("...replace is not a function"), so render these as plain
      // text — they're dynamic and not cleanly inline-editable anyway.
      if (/\{[^}]+\}/.test(String(current))) return current;
      return React.createElement(EditableText, {
        page,
        // React reserves `key` and won't forward it to props, so we ALSO
        // carry the string key through the non-reserved `refKey` prop.
        // `key` is still set for correct reconciliation across re-renders.
        key,
        refKey: key,
        fallback,
        value: current,
        onSave: (p, k, v) => setManifestOverride(p, k, v),
      });
    },
    [overrides, isAdminEditor],
  );

  // String-only variant of `t()` for use inside HTML attributes (placeholder,
  // aria-label, title, alt, etc.) where a React element would be invalid.
  // Returns the override or fallback, never a component.
  const ts = useCallback(
    (page, key, fallback) => overrides?.[page]?.[key] ?? fallback,
    [overrides],
  );

  return { t, ts, overrides, refresh };
}

// Update the module-level override cache so other components on the page
// that read the same key pick up a freshly saved inline edit on their next
// render. Best-effort; never throws.
export function setManifestOverride(page, key, value) {
  try {
    if (cache && cache.content && typeof cache.content === "object") {
      cache.content[`${page}.${key}`] = String(value ?? "");
    }
  } catch {
    // ignore — cache is best-effort
  }
}

// Returns the full manifest (content + design tokens + updated_at) for the
// admin editor to display. Never throws — falls back to an empty manifest.
export async function getManifest() {
  const manifest = await loadManifest().catch(() => ({ content: {} }));
  return manifest && typeof manifest === "object" ? manifest : { content: {} };
}
