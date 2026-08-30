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

import { useCallback, useEffect, useState } from "react";

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
    (page, key, fallback) => overrides?.[page]?.[key] ?? fallback,
    [overrides],
  );

  return { t, overrides, refresh };
}

// Returns the full manifest (content + design tokens + updated_at) for the
// admin editor to display. Never throws — falls back to an empty manifest.
export async function getManifest() {
  const manifest = await loadManifest().catch(() => ({ content: {} }));
  return manifest && typeof manifest === "object" ? manifest : { content: {} };
}
