// src/lib/useContent.js
//
// Content-override hook. Pages call `t(page, key, fallback)` to render
// editable text; the admin can override any string via the Content Editor
// tab without touching code. When no override exists, `t` returns the
// hardcoded fallback, so pages render identically until the admin edits
// something.
//
// Overrides are fetched once from /api/portal?action=content-list and
// cached at module level so every page shares a single fetch. Fetch
// failures fall back to an empty map — the page never breaks.

import { useCallback, useEffect, useState } from "react";

// Module-level cache shared across all pages. `null` means "not loaded yet".
let cache = null;
// In-flight promise so concurrent mounts share one request.
let inflight = null;

async function fetchOverrides() {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/portal?action=content-list", {
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "content-list failed");
      }
      const map = {};
      for (const o of data.overrides || []) {
        if (!o || !o.page || !o.key) continue;
        if (!map[o.page]) map[o.page] = {};
        map[o.page][o.key] = o.value;
      }
      cache = map;
      return map;
    } catch {
      // Never break the page — fall back to hardcoded text.
      cache = {};
      return cache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useContent() {
  const [overrides, setOverrides] = useState(cache || {});

  const refresh = useCallback(async () => {
    const map = await fetchOverrides();
    setOverrides(map);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchOverrides().then((map) => {
      if (alive) setOverrides(map);
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
