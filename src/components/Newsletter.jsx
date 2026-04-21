import { useState } from "react";
import { Mail, Check, Loader2 } from "lucide-react";
import { csrfFetch } from "../lib/csrf";

export default function Newsletter() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | submitting | done | error
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!email || state === "submitting") return;
    setState("submitting");
    setErr("");
    try {
      // Double-opt-in subscribe via /api/contact's newsletter branch.
      // Creates an unconfirmed row in newsletter_subscribers and emails
      // a confirm link; the subscription only becomes active after the
      // user clicks. Reuses the contact-form serverless function so we
      // stay under the Hobby 12-function cap.
      const res = await csrfFetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "newsletter_subscribe",
          email,
          source: "newsletter",
        }),
      });
      if (!res.ok && res.status !== 204) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `http_${res.status}`);
      }
      setState("done");
    } catch (e2) {
      setErr(e2.message || "signup_failed");
      setState("error");
    }
  };

  return (
    <aside className="newsletter" aria-labelledby="newsletter-title">
      <div className="newsletter-icon"><Mail size={24} /></div>
      <div className="newsletter-body">
        <h3 id="newsletter-title" className="newsletter-title">The Simple IT Brief</h3>
        <p className="newsletter-sub">
          One email a month. Plain-English security, AI, and cloud news for Sarasota and Bradenton business owners. No spam, unsubscribe with one click.
        </p>
        {state === "done" ? (
          <p className="newsletter-success"><Check size={16} color="#107C10" /> Check your inbox — we sent a confirmation link. Click it and you're on the list.</p>
        ) : (
          <form className="newsletter-form" onSubmit={submit} noValidate>
            <input
              type="email"
              placeholder="you@yourcompany.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              aria-label="Email address"
              disabled={state === "submitting"}
            />
            <button type="submit" className="btn btn-primary" disabled={state === "submitting"}>
              {state === "submitting" ? <Loader2 size={14} className="spin" /> : "Subscribe"}
            </button>
            {state === "error" && (
              <p className="newsletter-error" role="alert">Signup failed ({err}). Try again or email hello@simpleitsrq.com.</p>
            )}
          </form>
        )}
      </div>
    </aside>
  );
}
