import { useState } from "react";
import { Check, ArrowRight } from "lucide-react";
import { csrfFetch } from "../lib/csrf";
import { track } from "../lib/analytics";
import { adChannelLabel } from "../lib/utm";

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
        body: JSON.stringify({ ...form, source: [source, adChannelLabel()].filter(Boolean).join("+") }),
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
    <aside className="card card-border bg-base-100 my-10" aria-labelledby="lead-cta-title">
      <div className="card-body md:flex-row md:items-start md:gap-7">
        <div className="flex-1">
          <span className="eyebrow">Free · No obligation</span>
          <h3 id="lead-cta-title" className="text-xl font-semibold my-1.5">{title}</h3>
          <p className="text-sm text-base-content/70 leading-relaxed mb-3">{subtitle}</p>
          <ul className="flex flex-col gap-1.5 text-sm text-base-content/70">
            <li className="flex items-center gap-2"><Check size={14} className="text-success" /> Local Sarasota/Bradenton IT engineer</li>
            <li className="flex items-center gap-2"><Check size={14} className="text-success" /> No contract required</li>
            <li className="flex items-center gap-2"><Check size={14} className="text-success" /> Clear next-step recommendations</li>
          </ul>
        </div>
        <form className="flex flex-col gap-2.5 md:w-80" onSubmit={submit} noValidate>
          {sent ? (
            <div className="flex items-center gap-2 text-success font-medium">
              <Check size={24} className="text-success" />
              <strong>Thanks — your request is in. We’ll follow up by email.</strong>
            </div>
          ) : (
            <>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-base-content">
                First name
                <input
                  className="input input-bordered w-full"
                  placeholder="e.g. Sarah"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-base-content">
                Work email
                <input
                  className="input input-bordered w-full"
                  type="email"
                  placeholder="you@company.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </label>
              {error && <p className="text-sm text-error">{error}</p>}
              <button type="submit" className="btn btn-primary">
                Request My Free Assessment <ArrowRight size={14} />
              </button>
            </>
          )}
        </form>
      </div>
    </aside>
  );
}
