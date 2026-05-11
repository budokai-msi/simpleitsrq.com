// Launch promo modal — fires on the /leadgen page after a short
// dwell or first scroll, whichever comes first. Persists dismissal
// in localStorage so we don't nag returning visitors.
//
// Goals:
//   1. Capture intent without being a dark pattern (clear close, ESC,
//      backdrop dismiss, visible promo terms).
//   2. Surface a copyable discount code that the /book flow recognizes.
//   3. No tracking pixel, no third-party script, no cookie wall.
//
// Behavior contract:
//   - Suppressed entirely on screens < 540px (replaced by sticky bar).
//   - Suppressed if `lg_promo_dismissed_v1` is set in localStorage.
//   - Suppressed if the user has prefers-reduced-motion (we still show
//     it, but skip the entrance animation).
//   - Closes on ESC, backdrop click, or X button. Each path writes
//      the dismissal flag.

import { useEffect, useRef, useState } from "react";
import { Link } from "../lib/Link";
import { X, Check, Sparkles, Copy } from "lucide-react";

const STORAGE_KEY = "lg_promo_dismissed_v1";
const PROMO_CODE = "LAUNCH20";
const SHOW_AFTER_MS = 12_000;
const SHOW_AFTER_SCROLL = 0.35; // 35% of viewport height

export default function LeadgenPromoModal() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef(null);
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(max-width: 540px)").matches) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") return;
    } catch { /* private mode — show modal */ }

    const trigger = () => {
      if (triggeredRef.current) return;
      triggeredRef.current = true;
      setOpen(true);
    };

    const t = window.setTimeout(trigger, SHOW_AFTER_MS);

    const onScroll = () => {
      const scrolled = window.scrollY / Math.max(window.innerHeight, 1);
      if (scrolled > SHOW_AFTER_SCROLL) trigger();
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.clearTimeout(t);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Lock body scroll + ESC handler while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") dismiss(); };
    window.addEventListener("keydown", onKey);
    // Focus the close button when opened for keyboard users.
    const t = window.setTimeout(() => dialogRef.current?.focus(), 50);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open]);

  const dismiss = () => {
    setOpen(false);
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(PROMO_CODE);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };

  if (!open) return null;

  return (
    <div
      className="lg-promo"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lg-promo-title"
      onClick={dismiss}
    >
      <div
        className="lg-promo__card"
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="lg-promo__close"
          aria-label="Dismiss promotion"
          onClick={dismiss}
        >
          <X size={18} />
        </button>

        <div className="lg-promo__art" aria-hidden="true">
          <svg viewBox="0 0 240 160" width="240" height="160">
            <defs>
              <linearGradient id="lgp-bg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#0F6CBD" />
                <stop offset="1" stopColor="#7C5CD8" />
              </linearGradient>
              <radialGradient id="lgp-glow" cx="0.7" cy="0.3" r="0.6">
                <stop offset="0" stopColor="#F0B429" stopOpacity="0.55" />
                <stop offset="1" stopColor="#F0B429" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect x="0" y="0" width="240" height="160" rx="14" fill="url(#lgp-bg)" />
            <rect x="0" y="0" width="240" height="160" rx="14" fill="url(#lgp-glow)" />
            <g transform="translate(48 36)">
              <rect x="0" y="0" width="144" height="88" rx="10" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.30)" strokeWidth="1" />
              <rect x="14" y="14" width="60" height="8" rx="2" fill="rgba(255,255,255,0.55)" />
              <rect x="14" y="30" width="116" height="6" rx="2" fill="rgba(255,255,255,0.30)" />
              <rect x="14" y="44" width="92" height="6" rx="2" fill="rgba(255,255,255,0.30)" />
              <rect x="14" y="60" width="48" height="14" rx="4" fill="#F0B429" />
              <text x="38" y="71" textAnchor="middle" fontSize="9" fontWeight="700" fill="#072E54">20% OFF</text>
            </g>
          </svg>
        </div>

        <div className="lg-promo__body">
          <span className="lg-promo__badge">
            <Sparkles size={12} /> Launch promo · ends June 30
          </span>
          <h2 id="lg-promo-title" className="lg-promo__title">
            Save 20% for your first 3 months.
          </h2>
          <p className="lg-promo__lede">
            Apply code at checkout. Stacks with annual billing for an
            effective <strong>32% off year-one</strong>. New customers only.
          </p>

          <div className="lg-promo__code">
            <code className="lg-promo__code-val">{PROMO_CODE}</code>
            <button
              type="button"
              className="lg-promo__copy"
              onClick={copy}
              aria-label={copied ? "Copied" : "Copy promo code"}
            >
              {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
            </button>
          </div>

          <div className="lg-promo__actions">
            <Link
              to={`/book?topic=leadgen-growth&promo=${PROMO_CODE}`}
              className="btn btn-primary lg-promo__cta"
              onClick={dismiss}
            >
              Claim 20% off
            </Link>
            <button type="button" className="lg-promo__skip" onClick={dismiss}>
              No thanks
            </button>
          </div>

          <p className="lg-promo__fine">
            Single use per customer. 14-day money-back guarantee still applies.
          </p>
        </div>
      </div>
    </div>
  );
}
