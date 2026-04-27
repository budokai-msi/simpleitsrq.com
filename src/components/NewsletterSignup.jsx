import { useState } from "react";
import { Mail, Loader2, CheckCircle2, AlertCircle, ArrowRight, FileText } from "lucide-react";
import { Link } from "../lib/Link";
import { csrfFetch } from "../lib/csrf";
import { track } from "../lib/analytics";

// Newsletter signup with double-opt-in. Posts to the existing
// /api/contact { kind: "newsletter_subscribe" } handler — backend
// already wired with Resend + the newsletter_subscribers table.
//
// Default headline pitches the WISP starter as the lead magnet so the
// Florida small-business owner audience converts on commercial intent.
// Per-instance copy can be overridden via props.
export default function NewsletterSignup({
  variant = "card", // "card" | "inline" | "compact"
  headline = "The Simple IT Brief — plus a free starter WISP template",
  subhead = "One email a month. Plain-English security, AI, and cloud news for Sarasota and Bradenton small business owners. Confirm your subscription and grab a starter Written Information Security Program template the same day.",
  source = "wisp-leadmagnet",
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | submitting | sent | already | error
  const [errMsg, setErrMsg] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (status === "submitting") return;
    if (!email || !/.+@.+\..+/.test(email)) {
      setStatus("error");
      setErrMsg("Enter a valid email.");
      return;
    }
    setStatus("submitting");
    setErrMsg("");
    try {
      const res = await csrfFetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "newsletter_subscribe", email, source }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        track("newsletter_signup", { source, alreadyConfirmed: !!data.alreadyConfirmed });
        setStatus(data.alreadyConfirmed ? "already" : "sent");
      } else {
        setStatus("error");
        setErrMsg(data.error === "rate_limited"
          ? "Too many signups in a short window. Try again in a minute."
          : data.error === "email_invalid"
            ? "That email address looks off — try again?"
            : "Couldn't sign you up just now. Try again or email hello@simpleitsrq.com.");
      }
    } catch {
      setStatus("error");
      setErrMsg("Network hiccup. Try again.");
    }
  };

  if (status === "sent") {
    return (
      <aside className={`newsletter newsletter-${variant} newsletter-success`} role="status">
        <div className="newsletter-success-inner">
          <div className="newsletter-success-mark"><CheckCircle2 size={28} /></div>
          <h3>Check your email</h3>
          <p>We sent a confirmation link to <strong>{email}</strong>. Click it and you're on the list.</p>
          <p className="newsletter-success-cta">
            While you're waiting — your free starter WISP template is ready to read:
          </p>
          <Link to="/wisp-starter" className="btn btn-primary">
            Open the WISP starter <ArrowRight size={16} />
          </Link>
        </div>
      </aside>
    );
  }

  if (status === "already") {
    return (
      <aside className={`newsletter newsletter-${variant} newsletter-success`} role="status">
        <div className="newsletter-success-inner">
          <div className="newsletter-success-mark"><CheckCircle2 size={28} /></div>
          <h3>You're already subscribed</h3>
          <p>That email is already confirmed on the list — no need to re-subscribe.</p>
          <Link to="/wisp-starter" className="btn btn-primary">
            Open the WISP starter <ArrowRight size={16} />
          </Link>
        </div>
      </aside>
    );
  }

  return (
    <aside className={`newsletter newsletter-${variant}`} aria-labelledby={`newsletter-title-${source}`}>
      <div className="newsletter-copy">
        <span className="newsletter-eyebrow"><FileText size={14} /> Free starter WISP template</span>
        <h3 id={`newsletter-title-${source}`}>{headline}</h3>
        <p>{subhead}</p>
      </div>
      <form className="newsletter-form" onSubmit={submit} noValidate>
        <label className="newsletter-label" htmlFor={`newsletter-email-${source}`}>
          <span className="visually-hidden">Email address</span>
          <Mail size={16} className="newsletter-icon" aria-hidden="true" />
          <input
            id={`newsletter-email-${source}`}
            type="email"
            placeholder="you@business.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={status === "submitting"}
            autoComplete="email"
            inputMode="email"
            required
          />
        </label>
        <button
          type="submit"
          className="btn btn-primary newsletter-submit"
          disabled={status === "submitting"}
        >
          {status === "submitting"
            ? <><Loader2 size={16} className="spin" /> Subscribing</>
            : <>Get the WISP <ArrowRight size={16} /></>}
        </button>
        {status === "error" && (
          <p className="newsletter-err" role="alert"><AlertCircle size={14} /> {errMsg}</p>
        )}
        <p className="newsletter-fineprint">
          One email a month. Confirm via double opt-in. Unsubscribe in one click.
        </p>
      </form>
    </aside>
  );
}
