// Mobile tactile haptic feedback utility using Web Vibration API.
export function triggerHaptic(type = "light") {
  if (typeof window === "undefined" || typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return;
  }
  try {
    if (type === "light") {
      navigator.vibrate(12);
    } else if (type === "medium") {
      navigator.vibrate(24);
    } else if (type === "heavy") {
      navigator.vibrate([30, 20, 30]);
    } else if (type === "success") {
      navigator.vibrate([10, 25, 15]);
    } else if (type === "error") {
      navigator.vibrate([25, 40, 25]);
    }
  } catch {
    // Vibration API may fail if disabled or unprivileged context
  }
}

export function tapHaptic() {
  triggerHaptic("light");
}

export function selectionHaptic() {
  triggerHaptic("medium");
}

export function successHaptic() {
  triggerHaptic("success");
}

export function errorHaptic() {
  triggerHaptic("error");
}

// Global listener attachable to root window
export function initGlobalHaptics() {
  if (typeof window === "undefined") return () => {};

  const handlePointerDown = (e) => {
    const target = e.target && e.target.closest
      ? e.target.closest("button, .btn, a, [role='button'], [role='tab'], .leadgen-quest-card, .leadgen-playbook-chip, select, input[type='button'], input[type='submit']")
      : null;
    if (target && !target.disabled) {
      triggerHaptic("light");
    }
  };

  window.addEventListener("pointerdown", handlePointerDown, { passive: true });
  return () => {
    window.removeEventListener("pointerdown", handlePointerDown);
  };
}
