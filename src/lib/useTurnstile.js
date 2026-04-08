import { useCallback, useEffect, useRef } from "react";

export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/**
 * Loads the Turnstile script once and renders a widget into the returned
 * container ref. The completed token is delivered to `onToken`. When
 * `VITE_TURNSTILE_SITE_KEY` is not set (e.g. local dev without a .env.local),
 * the hook becomes a no-op so the form still works.
 *
 * Returns:
 *   containerRef — attach to a <div> inside your form
 *   reset()      — call after success or failure to get a fresh token
 */
export function useTurnstile(onToken) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const onTokenRef = useRef(onToken);

  useEffect(() => { onTokenRef.current = onToken; }, [onToken]);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !containerRef.current) return;

    let cancelled = false;

    const loadScript = () =>
      new Promise((resolve, reject) => {
        if (window.turnstile) return resolve();
        const existing = document.querySelector(`script[data-turnstile="1"]`);
        if (existing) {
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", reject, { once: true });
          return;
        }
        const s = document.createElement("script");
        s.src = TURNSTILE_SCRIPT_SRC;
        s.async = true;
        s.defer = true;
        s.dataset.turnstile = "1";
        s.onload = () => resolve();
        s.onerror = reject;
        document.head.appendChild(s);
      });

    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token) => onTokenRef.current?.(token),
          "error-callback": () => onTokenRef.current?.(null),
          "expired-callback": () => onTokenRef.current?.(null),
          theme: "auto",
          size: "normal",
          action: "contact",
        });
      })
      .catch((err) => {
        console.warn("[turnstile] script failed to load", err);
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch { /* noop */ }
        widgetIdRef.current = null;
      }
    };
  }, []);

  const reset = useCallback(() => {
    if (widgetIdRef.current && window.turnstile) {
      try { window.turnstile.reset(widgetIdRef.current); } catch { /* noop */ }
    }
  }, []);

  return { containerRef, reset };
}
