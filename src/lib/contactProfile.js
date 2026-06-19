// Contact autofill for returning visitors.
//
// Stores the visitor's OWN contact details — the ones they type into a
// form — in their browser so the next form pre-fills. This is the same
// idea as native browser autofill, but it works reliably across our
// multi-field React-controlled forms (name / email / phone / company),
// which native autofill handles inconsistently.
//
// Privacy: this is first-party, local-only, and strictly functional. The
// data lives in the visitor's own localStorage and never leaves the device
// beyond the form submission the visitor already chose to make. It is not
// analytics or marketing data, so it does not gate on the cookie-consent
// banner — but a visitor can wipe it via clearContactProfile() (wired to
// the form's "not you?" control) or by clearing site data.

const KEY = "sirq_contact";
const FIELDS = ["name", "email", "phone", "company"];

export function loadContactProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const out = {};
    for (const f of FIELDS) {
      if (typeof parsed[f] === "string") out[f] = parsed[f];
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

export function saveContactProfile(profile) {
  try {
    const prev = loadContactProfile() || {};
    const next = { ...prev };
    for (const f of FIELDS) {
      const v = profile?.[f];
      if (typeof v === "string" && v.trim()) next[f] = v.trim();
    }
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // localStorage disabled (private mode, sandboxed iframe) — autofill
    // just won't persist. Never throw into a form submit path.
  }
}

export function clearContactProfile() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
