// Lightweight haptic helper.
//
// Uses the Vibration API where supported (Android Chrome, Samsung Internet,
// Firefox Android, etc.). Silently no-ops on iOS Safari, which does not
// expose vibration to web pages — visual press feedback covers iOS instead.
//
// Patterns are short by design: long buzzes feel cheap and annoy users.

const canVibrate = () =>
  typeof navigator !== "undefined" &&
  typeof navigator.vibrate === "function";

export function haptic(pattern) {
  if (!canVibrate()) return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

// Semantic presets — pick these instead of raw patterns at call sites.
export const HAPTICS = {
  tap: 8,                       // light press, e.g. button down
  selection: 12,                // committed action, e.g. submit click
  success: [14, 40, 14],        // double tap
  warning: [20, 50, 20, 50, 20],// triple buzz
  error: [40, 60, 40],          // strong double thump
};

export const tapHaptic = () => haptic(HAPTICS.tap);
export const selectionHaptic = () => haptic(HAPTICS.selection);
export const successHaptic = () => haptic(HAPTICS.success);
export const errorHaptic = () => haptic(HAPTICS.error);
