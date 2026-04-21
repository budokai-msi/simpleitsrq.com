// api/_lib/sanitize.js
//
// Small helpers for scrubbing user-provided text before it lands in an
// email header, DB column, or outbound HTTP body. Intentionally tiny —
// we don't pull in DOMPurify server-side for a few marketing forms.

// Strip CR/LF and other control characters so an attacker can't inject
// extra email headers by passing "Subject\nBcc: attacker@example.com".
// Also collapse excessive whitespace.
export function stripHeaderControls(s = "") {
  return String(s)
    // eslint-disable-next-line no-control-regex
    .replace(/[\r\n\t\f\v\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Clamp a string to `max` chars and trim. Returns "" if the input is
// nullish.
export function clampString(s, max) {
  if (s == null) return "";
  return String(s).trim().slice(0, Math.max(0, max | 0));
}

// Sanitize a value destined for an email subject line or similar header
// field. Strips header controls and clamps length.
export function sanitizeHeader(s, max = 200) {
  return clampString(stripHeaderControls(s), max);
}

// HTML escape for safe embedding in email/HTML templates.
export function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
