import { useState } from "react";
import { Mail, Check, Loader2 } from "lucide-react";
import { csrfFetch } from "../lib/csrf";
import { trackEvent } from "../lib/analytics";
import { loadContactProfile, saveContactProfile } from "../lib/contactProfile";

export default function Newsletter() {
  const [email, setEmail] = useState(() => loadContactProfile()?.email || "");
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
      trackEvent("sign_up", { method: "newsletter", source: "newsletter" });
      // Remember the email for cross-form autofill (first-party, local-only).
      saveContactProfile({ email });
      setState("done");
    } catch (e2) {
      setErr(e2.message || "signup_failed");
      setState("error");
    }
  };

  return (
    <aside className="card card-border bg-base-100 my-8" aria-labelledby="newsletter-title">
      <div className="card-body md:flex-row md:items-start md:gap-5">
        <div className="grid place-items-center w-12 h-12 rounded-lg bg-base-200 text-base-content shrink-0"><Mail size={24} /></div>
        <div className="flex-1">
          <h3 id="newsletter-title" className="text-xl font-semibold mb-1.5">The Simple IT Brief</h3>
          <p className="text-sm text-base-content/70 leading-relaxed mb-3.5">
            One email a month. Plain-English security, AI, and cloud news for Sarasota and Bradenton business owners. No spam, unsubscribe with one click.
          </p>
          {state === "done" ? (
            <p className="flex items-center gap-2 text-success font-medium">
              <Check size={16} className="text-success" /> Check your inbox - we sent a confirmation link. Click it and you&apos;re on the list.
            </p>
          ) : (
            <form className="flex gap-3 mt-4" onSubmit={submit} noValidate>
              <input
                type="email"
                className="input input-bordered flex-1"
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
                <p className="text-sm text-error" role="alert">Signup failed ({err}). Try again or email hello@simpleitsrq.com.</p>
              )}
            </form>
          )}
        </div>
      </div>
    </aside>
  );
}
