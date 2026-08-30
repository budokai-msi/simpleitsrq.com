// src/lib/useDesignTokens.js
//
// Design-token override hook. Lets the sole admin edit the site's design
// tokens (CSS custom properties from src/index.css) at runtime. Overrides
// live in the `design_token_overrides` table and are injected here as
// inline CSS variables on <html> so they cascade site-wide.
//
// `apply()` injects each override via document.documentElement.style
// .setProperty(token, value), respecting the token's `theme` field:
//   - 'both'  -> always applied
//   - 'light' -> applied only when data-theme === "light"
//   - 'dark'  -> applied only when data-theme === "dark"
// It re-applies on theme change so the toggle never breaks.
//
// Overrides are fetched once from /api/portal?action=design-token-list and
// cached at module level so every page shares a single fetch. Fetch
// failures fall back to an empty list — the site renders with its default
// tokens and never breaks.

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "./theme";

// Module-level cache shared across all pages. `null` means "not loaded yet".
let cache = null;
// In-flight promise so concurrent mounts share one request.
let inflight = null;

async function fetchTokens() {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/portal?action=design-token-list", {
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "design-token-list failed");
      }
      cache = data.tokens || [];
      return cache;
    } catch {
      // Never break the page — fall back to default tokens.
      cache = [];
      return cache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function currentTheme() {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme || "light";
}

function tokenApplies(token, theme) {
  if (token.theme === "both") return true;
  return token.theme === theme;
}

export function useDesignTokens() {
  const { theme } = useTheme();
  const [tokens, setTokens] = useState(cache || []);
  const loadedRef = useRef(false);

  const apply = useCallback((list) => {
    if (typeof document === "undefined") return;
    const overrides = list || tokens;
    const activeTheme = currentTheme();
    for (const t of overrides) {
      if (!t || !t.token) continue;
      if (!tokenApplies(t, activeTheme)) continue;
      try {
        document.documentElement.style.setProperty(t.token, t.value);
      } catch {
        // Ignore invalid values — the site keeps its default token.
      }
    }
  }, [tokens]);

  const refresh = useCallback(async () => {
    const list = await fetchTokens();
    setTokens(list);
    apply(list);
  }, [apply]);

  // Fetch once on mount and apply.
  useEffect(() => {
    let alive = true;
    fetchTokens().then((list) => {
      if (!alive) return;
      setTokens(list);
      apply(list);
      loadedRef.current = true;
    });
    return () => {
      alive = false;
    };
  }, [apply]);

  // Re-apply whenever the theme changes so theme-scoped overrides stay
  // correct and the light/dark toggle is never broken.
  useEffect(() => {
    if (!loadedRef.current) return;
    apply();
  }, [theme, apply]);

  return { apply, tokens, refresh };
}
