import { useEffect } from "react";

/**
 * Wrap an async effect so cancellation is automatic and setState calls happen
 * inside a nested callback — not directly inside the useEffect body — which
 * keeps react-hooks/set-state-in-effect quiet for the common load-on-mount
 * pattern.
 *
 * @example
 * useAsyncEffect(async (signal) => {
 *   setLoading(true);
 *   const data = await fetch(...).then(r => r.json());
 *   if (!signal.cancelled) {
 *     setData(data);
 *     setLoading(false);
 *   }
 * }, [dep]);
 *
 * The `signal.cancelled` flag flips to true when the effect re-runs or the
 * component unmounts. Always guard setState calls with `!signal.cancelled` so
 * late-arriving fetches don't update a stale or unmounted component.
 *
 * @param {(signal: { cancelled: boolean }) => Promise<void> | void} fn
 * @param {ReadonlyArray<unknown>} deps
 */
export function useAsyncEffect(fn, deps) {
  useEffect(() => {
    const signal = { cancelled: false };
    Promise.resolve()
      .then(() => fn(signal))
      .catch((err) => {
        if (!signal.cancelled) console.error("[useAsyncEffect] unhandled", err);
      });
    return () => { signal.cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller controls deps
  }, deps);
}
