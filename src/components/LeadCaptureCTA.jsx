import { useState } from "react";
import { Check, ArrowRight } from "lucide-react";
import { csrfFetch } from "../lib/csrf";
import { track } from "../lib/analytics";

export default function LeadCaptureCTA({
  title = "Review Your IT Setup in 15 Minutes",
  subtitle = "Talk through Microsoft 365, security, backups, or the IT issue you are trying to solve with a local Sarasota/Bradenton engineer. No obligation.",
  endpoint = "/api/contact",
  source = "blog-cta",
}) {
  const [form, setForm] = useState({ name: "", email: "" });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.name || !form.email) {
      setError("Add your name and work email to continue.");
      return;
    }
    try {
      const r = await csrfFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, source }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) {
        setError("That did not go through. Try again, or email hello@simpleitsrq.com directly.");
        return;
      }
      track.lead(source, 250);
      setSent(true);
    } catch {
      setError("The connection dropped. Try again in a moment.");
    }
  };

  return (
    <aside className="lead-cta" aria-labelledby="lead-cta-title">
      <div className="lead-cta-body">
        <span className="eyebrow">Free · No obligation</span>
        <h3 id="lead-cta-title" className="lead-cta-title">{title}</h3>
        <p className="lead-cta-sub">{subtitle}</p>
        <ul className="lead-cta-checks">
          <li><Check size={14} color="#107C10" /> Local Sarasota/Bradenton IT engineer</li>
          <li><Check size={14} color="#107C10" /> No contract required</li>
          <li><Check size={14} color="#107C10" /> Clear next-step recommendations</li>
        </ul>
      </div>
      <form className="lead-cta-form" onSubmit={submit} noValidate>
        {sent ? (
          <div className="lead-cta-success">
            <Check size={24} color="#107C10" />
            <strong>Thanks — your request is in. We’ll follow up by email.</strong>
          </div>
        ) : (
          <>
            <label className="lead-cta-label">
              First name
              <input
                className="lead-cta-input"
                placeholder="e.g. Sarah"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>
            <label className="lead-cta-label">
              Work email
              <input
                className="lead-cta-input"
                type="email"
                placeholder="you@company.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </label>
            {error && <p className="lead-cta-error">{error}</p>}
            <button type="submit" className="btn btn-primary">
              Request My Free Assessment <ArrowRight size={14} />
            </button>
          </>
        )}
      </form>
    </aside>
  );
}
