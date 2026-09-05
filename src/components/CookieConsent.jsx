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
      className="fixed left-4 right-4 bottom-4 z-[60] max-w-[720px] mx-auto bg-base-100 text-base-content border border-base-300 rounded-xl p-4 sm:p-5 grid sm:grid-cols-[1fr_auto] gap-4 items-center shadow-lg"
      role="dialog"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-body"
    >
      <div className="text-sm leading-relaxed" id="cookie-consent-body">
        <strong id="cookie-consent-title" className="block text-sm mb-1">Cookie settings</strong>
        Essential cookies keep forms working. Analytics and marketing stay off
        unless accepted. <Link to="/privacy">Privacy Policy</Link>. CA may{" "}
        <button
          type="button"
          className="underline underline-offset-2 cursor-pointer"
          onClick={rejectNonEssential}
        >
          opt out
        </button>
        .
      </div>
      <div className="flex gap-2 items-center flex-wrap justify-end">
        <button
          type="button"
          className="btn btn-sm"
          onClick={rejectNonEssential}
        >
          Reject
        </button>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={acceptAll}
        >
          Accept
        </button>
      </div>
    </div>
  );
}
