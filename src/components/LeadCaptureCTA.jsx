import { useState } from "react";
import { Check, ArrowRight } from "lucide-react";
import { csrfFetch } from "../lib/csrf";

export default function LeadCaptureCTA({
  title = "Get a Free 15-Min IT Assessment",
  subtitle = "A local Sarasota/Bradenton engineer will review your Microsoft 365, security posture, and backups — no sales pitch.",
  endpoint = "/api/contact",
}) {
  const [form, setForm] = useState({ name: "", email: "" });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.name || !form.email) {
      setError("Please fill in both fields.");
      return;
    }
    try {
      await csrfFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, source: "blog-cta" }),
      }).catch(() => {});
      setSent(true);
    } catch {
      setSent(true);
    }
  };

  return (
    <aside className="lead-cta" aria-labelledby="lead-cta-title">
      <div className="lead-cta-body">
        <span className="eyebrow">Free consultation</span>
        <h3 id="lead-cta-title" className="lead-cta-title">{title}</h3>
        <p className="lead-cta-sub">{subtitle}</p>
        <ul className="lead-cta-checks">
          <li><Check size={14} color="#107C10" /> Local Sarasota/Bradenton engineer</li>
          <li><Check size={14} color="#107C10" /> No contract required</li>
          <li><Check size={14} color="#107C10" /> Written findings + recommendations</li>
        </ul>
      </div>
      <form className="lead-cta-form" onSubmit={submit} noValidate>
        {sent ? (
          <div className="lead-cta-success">
            <Check size={24} color="#107C10" />
            <strong>Thanks — we'll reach out shortly.</strong>
          </div>
        ) : (
          <>
            <label className="lead-cta-label">
              Name
              <input
                className="lead-cta-input"
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
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </label>
            {error && <p className="lead-cta-error">{error}</p>}
            <button type="submit" className="btn btn-primary">
              Request my audit <ArrowRight size={14} />
            </button>
          </>
        )}
      </form>
    </aside>
  );
}
