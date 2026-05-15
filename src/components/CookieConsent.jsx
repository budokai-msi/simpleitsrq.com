// src/components/CookieConsent.jsx
//
// CCPA + GDPR friendly cookie/consent banner. Renders nothing until we know
// the user hasn't already made a choice (checked synchronously from
// localStorage on mount). Offers:
//
//   • Accept all        → essential + analytics + marketing
//   • Reject non-essential → essential only (implements "Do Not Sell / Share"
//                              under the CCPA/CPRA)
//   • Privacy link      → /privacy for full policy
//
// Essential cookies (the session cookie) are always on because the site
// cannot function without them; that's the CCPA carve-out.

import { useEffect, useState } from "react";
import { Link } from "../lib/Link";
import { readConsent, writeConsent } from "../lib/consent.js";

// Custom event the footer "Manage cookie preferences" link dispatches
// to force the banner back into view, regardless of whether the user
// has already consented or rejected. Lets visitors change their mind
// without clearing localStorage manually.
export const REOPEN_CONSENT_EVENT = "sirq:reopen-consent";

export default function CookieConsent() {
  // Initialize lazily so we read localStorage exactly once at mount without
  // triggering a cascading re-render.
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    return readConsent() == null;
  });

  // Listen for the reopen event so the footer link works even after
  // the visitor has already accepted or rejected.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onReopen = () => setVisible(true);
    window.addEventListener(REOPEN_CONSENT_EVENT, onReopen);
    return () => window.removeEventListener(REOPEN_CONSENT_EVENT, onReopen);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (visible) {
      document.body.dataset.cookieConsent = "open";
    } else {
      delete document.body.dataset.cookieConsent;
    }
    return () => {
      delete document.body.dataset.cookieConsent;
    };
  }, [visible]);

  if (!visible) return null;

  const acceptAll = () => {
    writeConsent({ analytics: true, marketing: true });
    setVisible(false);
  };
  const rejectNonEssential = () => {
    writeConsent({ analytics: false, marketing: false });
    setVisible(false);
  };

  return (
    <div
      className="cookie-consent"
      role="dialog"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-body"
    >
      <div className="cookie-consent__body" id="cookie-consent-body">
        <strong id="cookie-consent-title">Cookie settings</strong>
        Essential cookies keep forms working. Analytics and marketing stay off
        unless accepted. <Link to="/privacy">Privacy Policy</Link>. CA may{" "}
        <button
          type="button"
          className="cookie-consent__link-btn"
          onClick={rejectNonEssential}
        >
          opt out
        </button>
        .
      </div>
      <div className="cookie-consent__actions">
        <button
          type="button"
          className="cookie-consent__btn"
          onClick={rejectNonEssential}
        >
          Reject
        </button>
        <button
          type="button"
          className="cookie-consent__btn cookie-consent__btn--primary"
          onClick={acceptAll}
        >
          Accept
        </button>
      </div>
    </div>
  );
}
