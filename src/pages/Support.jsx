import { useState } from "react";
import {
  LifeBuoy, AlertTriangle, Zap, AlertCircle, Loader2, Send, CheckCircle2, HelpCircle,
} from "lucide-react";
import { useSEO } from "../lib/seo";
import LeadCaptureCTA from "../components/LeadCaptureCTA";
import { useTurnstile, TURNSTILE_SITE_KEY } from "../lib/useTurnstile";
import { tapHaptic, selectionHaptic, successHaptic, errorHaptic } from "../lib/haptics";

const PRIORITIES = [
  { value: "low",      label: "Low - general question",                Icon: HelpCircle },
  { value: "normal",   label: "Normal - single user impacted",         Icon: LifeBuoy },
  { value: "high",     label: "High - multiple users impacted",        Icon: Zap },
  { value: "critical", label: "Critical - business down or security",  Icon: AlertTriangle },
];

const CATEGORIES = [
  "Workstation or laptop issue",
  "Network or internet",
  "Email (Microsoft 365 / Google Workspace)",
  "Phone or VoIP",
  "Printer or scanner",
  "Server or file share",
  "Backup or restore",
  "Security or suspected incident",
  "New user or onboarding",
  "Software install or update",
  "Other",
];

const ERROR_MESSAGES = {
  name_required: "Please enter your name.",
  email_invalid: "That email address looks off - double-check it?",
  subject_required: "A short subject helps us triage faster.",
  description_required: "Please describe the issue you're seeing.",
  bot_detected: "We couldn't verify your browser. Please refresh the page and try again.",
  rate_limited: "Too many submissions in a short window. Please wait a few minutes and try again.",
  send_failed: "We couldn't file the ticket right now. Please try again in a moment.",
  network_error: "Network hiccup. Check your connection and try again.",
  invalid_body: "Something went wrong with that request. Please try again.",
  invalid_json: "Something went wrong with that request. Please try again.",
  captcha_required: "Please complete the security check before submitting.",
};

const initialForm = {
  name: "",
  company: "",
  email: "",
  phone: "",
  priority: "normal",
  category: CATEGORIES[0],
  subject: "",
  description: "",
  _hp: "",
};

export default function Support() {
  useSEO({
    title: "Submit a Support Ticket | Simple IT SRQ",
    description:
      "Existing Simple IT SRQ clients can file a support ticket online. Priority-based triage, same-day response during business hours, emergency line for critical incidents.",
    canonical: "https://simpleitsrq.com/support",
    image: "https://simpleitsrq.com/og-image.png",
    breadcrumbs: [
      { name: "Home", url: "https://simpleitsrq.com/" },
      { name: "Support", url: "https://simpleitsrq.com/support" },
    ],
  });

  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");

  const { containerRef: turnstileRef, reset: resetTurnstile } =
    useTurnstile(setTurnstileToken);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const reset = () => {
    setForm(initialForm);
    setStatus("idle");
    setErrorMsg("");
    setTicketId("");
    setTurnstileToken("");
    resetTurnstile();
    selectionHaptic();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (status === "submitting") return;

    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      errorHaptic();
      setStatus("error");
      setErrorMsg(ERROR_MESSAGES.captcha_required);
      return;
    }

    selectionHaptic();
    setStatus("submitting");
    setErrorMsg("");

    try {
      const r = await fetch("/api/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, turnstileToken }),
      });
      const data = await r.json().catch(() => ({}));

      if (r.ok && data.ok) {
        successHaptic();
        setTicketId(data.ticketId || "");
        setStatus("success");
        return;
      }

      errorHaptic();
      setStatus("error");
      setErrorMsg(ERROR_MESSAGES[data?.error] || "Something went wrong. Please try again in a moment.");
      setTurnstileToken("");
      resetTurnstile();
    } catch {
      errorHaptic();
      setStatus("error");
      setErrorMsg(ERROR_MESSAGES.network_error);
      setTurnstileToken("");
      resetTurnstile();
    }
  };

  const submitting = status === "submitting";

  return (
    <main id="main">
      <section className="section" aria-labelledby="support-title">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Support</span>
            <h1 id="support-title" className="title-1">File a support ticket</h1>
            <p className="section-sub">
              Existing clients can file a ticket here. For critical incidents during business hours, call <a href="tel:+14072421456">(407) 242-1456</a>. We triage by priority and respond same-day.
            </p>
          </div>

          <div className="form-shell" style={{ maxWidth: "760px", margin: "0 auto" }}>
            <form
              className={`form${status === "success" ? " is-success" : ""}`}
              onSubmit={handleSubmit}
              aria-label="Support ticket form"
              noValidate
            >
              <div className="row-2">
                <label>
                  <span>Your name</span>
                  <input
                    type="text" name="name" value={form.name} onChange={update("name")}
                    required aria-required="true" autoComplete="name"
                    disabled={submitting}
                  />
                </label>
                <label>
                  <span>Company</span>
                  <input
                    type="text" name="company" value={form.company} onChange={update("company")}
                    autoComplete="organization" disabled={submitting}
                  />
                </label>
              </div>
              <div className="row-2">
                <label>
                  <span>Email</span>
                  <input
                    type="email" name="email" value={form.email} onChange={update("email")}
                    required aria-required="true" autoComplete="email"
                    inputMode="email" disabled={submitting}
                  />
                </label>
                <label>
                  <span>Phone</span>
                  <input
                    type="tel" name="phone" value={form.phone} onChange={update("phone")}
                    autoComplete="tel" inputMode="tel" disabled={submitting}
                  />
                </label>
              </div>
              <div className="row-2">
                <label>
                  <span>Priority</span>
                  <select
                    name="priority" value={form.priority} onChange={update("priority")}
                    disabled={submitting}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Category</span>
                  <select
                    name="category" value={form.category} onChange={update("category")}
                    disabled={submitting}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                <span>Subject</span>
                <input
                  type="text" name="subject" value={form.subject} onChange={update("subject")}
                  required aria-required="true" maxLength={200}
                  placeholder="Short summary - e.g. Outlook can't send since this morning"
                  disabled={submitting}
                />
              </label>
              <label>
                <span>What's happening?</span>
                <textarea
                  name="description" rows="7" value={form.description} onChange={update("description")}
                  placeholder="Describe the issue. When did it start? Who is affected? Any error messages? Steps you've already tried?"
                  disabled={submitting}
                />
              </label>

              {/* Honeypot */}
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: "-10000px",
                  top: "auto",
                  width: "1px",
                  height: "1px",
                  overflow: "hidden",
                  pointerEvents: "none",
                }}
              >
                <input
                  type="text"
                  name="website"
                  tabIndex="-1"
                  autoComplete="off"
                  value={form._hp}
                  onChange={update("_hp")}
                />
              </div>

              {TURNSTILE_SITE_KEY && (
                <div
                  ref={turnstileRef}
                  className="turnstile-widget"
                  style={{ margin: "8px 0" }}
                />
              )}

              <button
                type="submit"
                className="btn btn-primary btn-lg btn-submit"
                disabled={submitting}
                onPointerDown={tapHaptic}
              >
                {submitting ? (
                  <><Loader2 size={18} className="spin" /> Filing ticket...</>
                ) : (
                  <><Send size={16} /> Submit ticket</>
                )}
              </button>

              <p className="form-note">
                For critical incidents during business hours, please also call (407) 242-1456.
              </p>

              {status === "error" && (
                <div className="form-banner form-banner-error" role="alert">
                  <AlertCircle size={18} />
                  <span>{errorMsg}</span>
                </div>
              )}
            </form>

            {status === "success" && (
              <div className="form-success-overlay" role="status" aria-live="polite">
                <div className="form-success-card">
                  <div className="success-check">
                    <CheckCircle2 size={56} />
                  </div>
                  <h3>Ticket filed</h3>
                  {ticketId && (
                    <p style={{ fontSize: "1rem" }}>
                      Your ticket ID is <strong>{ticketId}</strong>. Keep it for reference.
                    </p>
                  )}
                  <p>
                    A Simple IT SRQ engineer will reach out during business hours. For critical incidents, call <a href="tel:+14072421456">(407) 242-1456</a>.
                  </p>
                  <button type="button" className="btn btn-secondary" onClick={reset}>
                    File another ticket
                  </button>
                </div>
              </div>
            )}
          </div>
          <div style={{ maxWidth: 800, margin: "48px auto 0" }}>
            <LeadCaptureCTA
              title="Not a client yet? Get a free 15-min IT assessment"
              subtitle="A local Sarasota/Bradenton engineer will spot-check your Microsoft 365, backups, and security posture. No sales pitch — you leave with a written punch list either way."
            />
          </div>
        </div>
      </section>
    </main>
  );
}
