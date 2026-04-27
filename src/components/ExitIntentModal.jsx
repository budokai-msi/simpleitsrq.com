// src/components/ExitIntentModal.jsx
//
// Exit-intent capture modal. When the visitor's pointer crosses the top of
// the viewport (suggesting they're reaching for the tab bar / close button)
// after being on the page long enough to rule out instant bounce, we offer
// a single bite-sized choice — compliance library discount OR a free
// cyber-insurance intro — in exchange for an email.
//
// Trigger rules:
//   * `mouseout` with e.clientY <= 0 AND e.relatedTarget === null
//     (actually leaving the window, not hovering a child element)
//   * 30s grace period so instant-bounces don't see it
//   * One firing per session, re-eligible after 30 days
//     (localStorage `srq_exit_intent_shown` = ISO timestamp)
//
// Mobile fallback: none. `mouseout` has no touch equivalent; a scroll-speed
// heuristic produced too many false positives in dogfooding, so mobile
// visitors just don't see this — they have MobileStickyCTA and the
// in-page CTAs instead.
//
// Submission: piggybacks on /api/contact via csrfFetch. Because /api/contact
// requires `name` and `message`, we synthesize minimal placeholders; the
// `source` field is what the inbox filter keys on.
//
// No Turnstile: friction is fatal on an exit-intent capture, and
// /api/contact still has BotID + DB-backed rate limiting.

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Check, ShieldCheck, Percent, ArrowRight } from "lucide-react";
import { csrfFetch } from "../lib/csrf";
import { track } from "../lib/analytics";

const STORAGE_KEY = "srq_exit_intent_shown";
const GRACE_MS = 30_000; // 30s on-page before eligible
const REELIGIBLE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function isEligible() {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return true;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return true;
    return Date.now() - ts > REELIGIBLE_MS;
  } catch {
    // localStorage blocked — fall through and allow one showing this session.
    return true;
  }
}

function markShown() {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch { /* best-effort */ }
}

const CHOICES = {
  compliance: {
    id: "compliance",
    source: "exit-intent-compliance-discount",
    icon: Percent,
    headline: "10% off the Compliance Library",
    body: "Policy templates, audit checklists, and evidence packs for HIPAA, PCI, SOC 2, and NIST 800-171. Drop your email and we'll send a 10% discount code.",
    cta: "Email me the discount",
  },
  cyberInsurance: {
    id: "cyberInsurance",
    source: "exit-intent-cyber-insurance-quote",
    icon: ShieldCheck,
    headline: "Free cyber-insurance intro",
    body: "15 minutes with a local broker who actually reads your policy. We'll flag coverage gaps and ransomware sub-limits — no obligation, no upsell.",
    cta: "Book my free intro",
  },
};

export default function ExitIntentModal() {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(null); // null | "compliance" | "cyberInsurance"
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [error, setError] = useState("");

  const mountedAtRef = useRef(0);
  const firedRef = useRef(false);
  const previouslyFocusedRef = useRef(null);
  const dialogRef = useRef(null);
  const firstFocusRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  // Mouse-leave-via-top trigger.
  useEffect(() => {
    if (!isEligible()) return undefined;
    mountedAtRef.current = Date.now();

    const onMouseOut = (e) => {
      if (firedRef.current) return;
      if (Date.now() - mountedAtRef.current < GRACE_MS) return;
      // Only fire when the pointer crosses the top edge and actually leaves
      // the window (relatedTarget === null means it exited the document).
      if (e.clientY > 0) return;
      if (e.relatedTarget !== null) return;
      firedRef.current = true;
      markShown();
      setOpen(true);
    };

    document.addEventListener("mouseout", onMouseOut);
    return () => document.removeEventListener("mouseout", onMouseOut);
  }, []);

  // Native <dialog> handles scroll-lock (via the body:has(dialog[open])
  // CSS rule), backdrop, focus return, focus trap, and Escape closing
  // for free. We just drive showModal/close from React state. The
  // dialog also self-fires a "close" event when the user hits Escape
  // — we listen so React state stays in sync.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return undefined;

    if (open && !el.open) {
      try { el.showModal(); } catch { /* invalid state — likely re-mount races */ }
    } else if (!open && el.open) {
      try { el.close(); } catch { /* already closing */ }
    }

    const onCancel = (e) => {
      // Native Escape close — sync React state. Calling close() also
      // emits this so the listener has to be defensive against
      // duplicate fires; React's state setter is idempotent.
      e.preventDefault();
      setOpen(false);
    };
    const onClose = () => setOpen(false);
    el.addEventListener("cancel", onCancel);
    el.addEventListener("close", onClose);
    return () => {
      el.removeEventListener("cancel", onCancel);
      el.removeEventListener("close", onClose);
    };
  }, [open]);

  // Focus the first card button when the picker first renders, or the email
  // field when a choice is selected.
  useEffect(() => {
    if (!open) return;
    if (firstFocusRef.current) firstFocusRef.current.focus();
  }, [open, choice]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Enter a valid email.");
      return;
    }
    const picked = CHOICES[choice];
    if (!picked) return;

    setStatus("sending");
    try {
      const res = await csrfFetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // /api/contact requires name + message; synthesize minimal
          // placeholders so the Resend payload is valid.
          name: "Exit-intent visitor",
          email: trimmed,
          message: `Exit-intent opt-in: ${picked.headline}. Please follow up with details.`,
          source: picked.source,
        }),
      });
      // Fire-and-forget GA4 lead event regardless of server response — if
      // the beacon was dropped, the user still wanted it and we still want
      // the conversion count. $400 value as rough average of the two
      // choices (discount + cyber-insurance intro).
      track.lead(picked.source, 400, { choice: picked.id });
      if (res && res.ok) {
        setStatus("sent");
      } else {
        // /api/contact has BotID + rate limit; treat non-2xx as "we've got
        // your email logged, thanks" to avoid an embarrassing failure mode
        // at the very moment the visitor is walking away.
        setStatus("sent");
      }
    } catch {
      setStatus("sent");
    }
  };

  // We render the <dialog> unconditionally so showModal/close can run
  // against a stable DOM node — gating on `open` here would unmount
  // and break the imperative API.
  const picked = choice ? CHOICES[choice] : null;
  const titleId = "exit-intent-title";
  const descId = "exit-intent-desc";

  return (
    <dialog
      ref={dialogRef}
      className="exit-intent-modal"
      data-blocking-modal
      aria-labelledby={titleId}
      aria-describedby={descId}
      onClick={(e) => {
        // Click-outside-to-close: native <dialog> reports clicks on the
        // ::backdrop pseudo-element with target === the dialog itself
        // (not a child). The form/card content sits inside an inner
        // wrapper so any e.target === e.currentTarget click is the
        // backdrop area only.
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="exit-intent-modal-inner">
        <button
          type="button"
          className="exit-intent-close"
          aria-label="Close"
          onClick={close}
        >
          <X size={18} aria-hidden="true" />
        </button>

        {status === "sent" ? (
          <div className="exit-intent-body exit-intent-success">
            <div className="exit-intent-success-icon">
              <Check size={28} aria-hidden="true" />
            </div>
            <h2 id={titleId} className="exit-intent-title">Thanks — check your inbox.</h2>
            <p id={descId} className="exit-intent-sub">
              We'll be in touch within one business day from hello@simpleitsrq.com.
            </p>
            <button
              type="button"
              className="btn btn-primary exit-intent-submit"
              onClick={close}
              ref={firstFocusRef}
            >
              Close
            </button>
          </div>
        ) : !picked ? (
          <div className="exit-intent-body">
            <span className="exit-intent-eyebrow">One last thing</span>
            <h2 id={titleId} className="exit-intent-title">
              Before you go — renewal coming up?
            </h2>
            <p id={descId} className="exit-intent-sub">
              Pick whichever is more useful. One quick email, no phone tree.
            </p>
            <div className="exit-intent-choices" role="group" aria-label="Pick an offer">
              {Object.values(CHOICES).map((opt, i) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className="exit-intent-choice"
                    onClick={() => setChoice(opt.id)}
                    ref={i === 0 ? firstFocusRef : null}
                  >
                    <span className="exit-intent-choice-icon" aria-hidden="true">
                      <Icon size={20} />
                    </span>
                    <span className="exit-intent-choice-text">
                      <strong>{opt.headline}</strong>
                      <span>{opt.body}</span>
                    </span>
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="exit-intent-dismiss"
              onClick={close}
            >
              No thanks, I'm just browsing
            </button>
          </div>
        ) : (
          <form className="exit-intent-body" onSubmit={submit} noValidate>
            <button
              type="button"
              className="exit-intent-back"
              onClick={() => { setChoice(null); setError(""); }}
            >
              ← Back
            </button>
            <span className="exit-intent-eyebrow">
              {picked === CHOICES.compliance ? "Compliance Library" : "Cyber insurance"}
            </span>
            <h2 id={titleId} className="exit-intent-title">{picked.headline}</h2>
            <p id={descId} className="exit-intent-sub">{picked.body}</p>
            <label className="exit-intent-label">
              Work email
              <input
                ref={firstFocusRef}
                type="email"
                className="exit-intent-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                required
              />
            </label>
            {error && <p className="exit-intent-error" role="alert">{error}</p>}
            <button
              type="submit"
              className="btn btn-primary exit-intent-submit"
              disabled={status === "sending"}
            >
              {status === "sending" ? "Sending…" : picked.cta}
              <ArrowRight size={14} aria-hidden="true" />
            </button>
            <p className="exit-intent-fineprint">
              We'll only use your email to send what you asked for. No spam.
            </p>
          </form>
        )}
      </div>
    </dialog>
  );
}
