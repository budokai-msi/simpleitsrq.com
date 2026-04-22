import { useEffect, useRef, useState, useCallback } from "react";
import {
  Calendar, Clock, Video, ShieldCheck, Check, Mail, Loader2,
  AlertTriangle, Send,
} from "lucide-react";
import { useSEO } from "../lib/seo";
import { csrfFetch } from "../lib/csrf";
import { useTurnstile, TURNSTILE_SITE_KEY } from "../lib/useTurnstile";
import { track } from "../lib/analytics";

// Full Cal.com path, e.g. "simpleitsrq/free-consultation". Set via Vercel
// env var VITE_CALCOM_CAL_LINK. When unset the page falls back to the
// same consultation-request form used on /cyber-insurance-quote and
// /compliance-audit-referral — so booking always works even before the
// Cal.com integration is wired.
const CAL_LINK = import.meta.env.VITE_CALCOM_CAL_LINK || "";
const CAL_EMBED_SRC = "https://app.cal.com/embed/embed.js";

const TIME_WINDOWS = [
  "Weekday mornings (8am–12pm)",
  "Weekday afternoons (12pm–5pm)",
  "Weekday evenings (5pm–7pm)",
  "Whenever — flexible",
];

/**
 * Loads Cal.com's embed script once and renders an inline calendar into
 * the container. Uses the vanilla embed API (no npm dep).
 */
function useCalcomInline(calLink) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!calLink || !containerRef.current) return;
    let cancelled = false;

    const loadScript = () =>
      new Promise((resolve, reject) => {
        if (window.Cal) return resolve();
        const existing = document.querySelector(`script[data-calcom="1"]`);
        if (existing) {
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", reject, { once: true });
          return;
        }
        const s = document.createElement("script");
        s.src = CAL_EMBED_SRC;
        s.async = true;
        s.defer = true;
        s.dataset.calcom = "1";
        s.onload = () => resolve();
        s.onerror = reject;
        document.head.appendChild(s);
      });

    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.Cal) return;
        try {
          window.Cal("init", { origin: "https://cal.com" });
          window.Cal("inline", {
            elementOrSelector: containerRef.current,
            calLink,
            layout: "month_view",
          });
          window.Cal("ui", {
            hideEventTypeDetails: false,
            layout: "month_view",
            theme: "auto",
            cssVarsPerTheme: {
              light: { "cal-brand": "#0F6CBD" },
              dark: { "cal-brand": "#4CC2FF" },
            },
          });
          // Fire GA schedule event once the embed is live on the page
          // (matches the conversion we'd fire if the user booked through
          // the fallback form). The actual booking-completion hook lives
          // in Cal.com's webhook config if we want a second signal.
          track.schedule();
        } catch (err) {
          console.warn("[cal.com] inline init failed", err);
        }
      })
      .catch((err) => {
        console.warn("[cal.com] script failed to load", err);
      });

    return () => {
      cancelled = true;
    };
  }, [calLink]);

  return containerRef;
}

function BookingEmbed({ calLink }) {
  const containerRef = useCalcomInline(calLink);
  return (
    <div
      ref={containerRef}
      className="cal-inline"
      style={{ width: "100%", minHeight: "720px", overflow: "hidden" }}
      aria-label="Booking calendar"
    />
  );
}

function ConsultationForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [window_, setWindow] = useState(TIME_WINDOWS[0]);
  const [context, setContext] = useState("");

  const [status, setStatus] = useState("idle"); // idle | sending | ok | error
  const [error, setError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");

  const { containerRef: turnstileRef, reset: resetTurnstile } =
    useTurnstile(setTurnstileToken);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError("");

    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }

    setStatus("sending");

    const message = [
      "FREE CONSULTATION REQUEST",
      "",
      `Company: ${company.trim() || "(not provided)"}`,
      `Preferred time window: ${window_}`,
      `Phone: ${phone.trim() || "(none)"}`,
      "",
      "What they'd like to discuss:",
      context.trim() || "(not specified)",
    ].join("\n");

    try {
      const res = await csrfFetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          company: company.trim(),
          phone: phone.trim(),
          message,
          source: "book-consultation",
          turnstileToken,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Send failed. Try again or email hello@simpleitsrq.com directly.");
      }
      track.lead("book-consultation", 250, { window: window_ });
      setStatus("ok");
    } catch (err) {
      setStatus("error");
      setError(err.message || "Something went wrong. Please try again.");
      resetTurnstile?.();
    }
  }, [name, email, phone, company, window_, context, turnstileToken, resetTurnstile]);

  if (status === "ok") {
    return (
      <div className="form-shell" style={{ textAlign: "center", padding: "2.5rem 1.5rem" }}>
        <Check size={42} color="#107C10" style={{ display: "block", margin: "0 auto 0.75rem" }} />
        <h3 className="title-2" style={{ marginTop: 0 }}>Got it — check your inbox.</h3>
        <p className="section-sub" style={{ maxWidth: "42ch", margin: "0.5rem auto 0" }}>
          We'll reply from hello@simpleitsrq.com within one business hour with
          two or three time slots that match your window. If you don't see it
          (including spam), email us directly.
        </p>
      </div>
    );
  }

  return (
    <div className="form-shell">
      <h3 className="title-2" style={{ marginTop: 0 }}>Request a 30-minute consultation</h3>
      <p className="section-sub" style={{ marginBottom: "1.5rem" }}>
        Fill this out and a Simple IT SRQ engineer will reply within one business
        hour with 2–3 time slots that match your availability. Google Meet, Zoom,
        or Microsoft Teams — whichever your team uses.
      </p>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "1rem" }} noValidate>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <label className="field">
            <span className="field-label">Name *</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
              autoComplete="name"
            />
          </label>
          <label className="field">
            <span className="field-label">Company</span>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              maxLength={200}
              autoComplete="organization"
            />
          </label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <label className="field">
            <span className="field-label">Email *</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={320}
              autoComplete="email"
            />
          </label>
          <label className="field">
            <span className="field-label">Phone (optional)</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={50}
              autoComplete="tel"
            />
          </label>
        </div>
        <label className="field">
          <span className="field-label">Best time to meet</span>
          <select value={window_} onChange={(e) => setWindow(e.target.value)}>
            {TIME_WINDOWS.map((w) => (<option key={w}>{w}</option>))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">What you'd like to discuss (optional)</span>
          <textarea
            rows={4}
            value={context}
            onChange={(e) => setContext(e.target.value)}
            maxLength={5000}
            placeholder="e.g. renewal coming up, HIPAA audit prep, office move, hurricane season planning"
          />
        </label>

        {TURNSTILE_SITE_KEY && (
          <div ref={turnstileRef} style={{ marginTop: 4 }} />
        )}

        {error && (
          <div
            role="alert"
            style={{
              padding: "12px 14px",
              borderRadius: 8,
              background: "rgba(220, 38, 38, 0.08)",
              border: "1px solid rgba(220, 38, 38, 0.3)",
              color: "#dc2626",
              fontSize: "0.9rem",
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
            }}
          >
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            {error}
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary btn-lg"
          disabled={status === "sending"}
          style={{ justifySelf: "start" }}
        >
          {status === "sending" ? (
            <><Loader2 size={18} className="spin" /> Sending…</>
          ) : (
            <><Send size={16} /> Request my consultation</>
          )}
        </button>

        <p style={{ fontSize: "0.85rem", color: "var(--syn-text-muted, #6b7280)", marginTop: 4 }}>
          Prefer email? Write <a href="mailto:hello@simpleitsrq.com?subject=Free%20IT%20Consultation"><Mail size={13} style={{ verticalAlign: "middle" }} /> hello@simpleitsrq.com</a> and we'll reply within an hour.
        </p>
      </form>
    </div>
  );
}

export default function Book() {
  useSEO({
    title: "Book a Free IT Consultation | Simple IT SRQ",
    description:
      "Schedule a free 30-minute IT consultation with a local engineer in Sarasota or Bradenton. Google Meet, Zoom, or Microsoft Teams. Reschedule anytime.",
    canonical: "https://simpleitsrq.com/book",
    image: "https://simpleitsrq.com/og-image.png",
    breadcrumbs: [
      { name: "Home", url: "https://simpleitsrq.com/" },
      { name: "Book", url: "https://simpleitsrq.com/book" },
    ],
  });

  const bullets = [
    { Icon: Clock, text: "30 minutes, no obligation" },
    { Icon: Video, text: "Google Meet, Zoom, or Microsoft Teams" },
    { Icon: ShieldCheck, text: "Covered by an NDA on request" },
    { Icon: Check, text: "Same-day confirmation" },
  ];

  return (
    <main id="main">
      <section className="section" aria-labelledby="book-title">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">
              <Calendar size={14} style={{ display: "inline", marginRight: 6 }} />
              Book a Free Consultation
            </span>
            <h1 id="book-title" className="title-1">Talk to a local engineer</h1>
            <p className="section-sub">
              Pick a time that works for you. We'll meet on Google Meet, Zoom, or
              Microsoft Teams — whichever your team prefers. Calendar invite
              fires automatically on every device: Android, iPhone, Google
              Workspace, or Microsoft 365.
            </p>
          </div>
          <ul
            className="feature-list"
            style={{ display: "flex", flexWrap: "wrap", gap: "1rem 2rem", justifyContent: "center", margin: "0 0 2rem", padding: 0, listStyle: "none" }}
            aria-label="What to expect"
          >
            {bullets.map((item) => (
              <li key={item.text} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <item.Icon size={18} color="#0F6CBD" /> {item.text}
              </li>
            ))}
          </ul>

          {CAL_LINK ? <BookingEmbed calLink={CAL_LINK} /> : <ConsultationForm />}
        </div>
      </section>
    </main>
  );
}
