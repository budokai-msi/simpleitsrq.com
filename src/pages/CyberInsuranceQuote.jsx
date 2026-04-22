import { useState, useCallback } from "react";
import {
  ShieldCheck, Check, Clock, Users, ArrowRight,
  AlertTriangle, TrendingUp, FileCheck, Loader2, Send,
} from "lucide-react";
import { useSEO, SITE_URL } from "../lib/seo";
import { csrfFetch } from "../lib/csrf";
import { useTurnstile, TURNSTILE_SITE_KEY } from "../lib/useTurnstile";
import { trackAffiliateClick } from "../lib/trackClick";
import { track } from "../lib/analytics";

// Partner config at module scope — lets Vite tree-shake either branch based
// on whether the env var is set at build time.
const PARTNER_URL = import.meta.env.VITE_CYBER_INSURANCE_PARTNER_URL || "";
const PARTNER_NAME =
  import.meta.env.VITE_CYBER_INSURANCE_PARTNER_NAME || "our insurance partner";
const HAS_PARTNER = Boolean(PARTNER_URL);

const INDUSTRIES = [
  "Medical / dental practice",
  "Law firm",
  "Accounting / financial advisory",
  "Real estate / property management",
  "Retail / e-commerce",
  "Professional services",
  "Construction / trades",
  "Nonprofit",
  "Other",
];

const RENEWAL_WINDOWS = [
  "Within 30 days",
  "30-90 days",
  "90-180 days",
  "No current policy",
  "Not sure",
];

const EMPLOYEE_BANDS = ["1-5", "6-10", "11-25", "26-50", "51-100", "100+"];

const FAQ = [
  {
    q: "Do I have to buy a policy to get a quote?",
    a: "No. The quote is free and non-binding. Most brokers run a 10-15 minute questionnaire and come back with two or three options. You're free to compare against your current carrier before deciding.",
  },
  {
    q: "What does Simple IT SRQ get out of this?",
    a: HAS_PARTNER
      ? `When a policy binds through ${PARTNER_NAME}, they pay us a standard broker referral fee. You pay the same either way — the fee is baked into the broker's revenue model, not added to your premium. We only refer to brokers we'd use for our own clients.`
      : "Right now, nothing — we're connecting you directly with a broker we trust. Once our formal referral agreement is signed, we'll earn a standard fee per bound policy. You pay the same either way.",
  },
  {
    q: "What information will the broker ask for?",
    a: "Standard 2026 questionnaire items: MFA coverage, backup tested in the last 12 months, whether you store HIPAA / PCI / PII data, annual revenue, and employee count. If you own our HIPAA Starter Kit, WISP Template, or Evidence Binder, you already have the written answers ready to paste.",
  },
  {
    q: "How long until I have a policy?",
    a: "Most small-business policies bind in 3-10 business days from initial quote. Complex accounts (healthcare with PHI, law firms with trust accounts) take 2-3 weeks. The broker will give you an accurate timeline based on your questionnaire responses.",
  },
  {
    q: "What if I already have a policy?",
    a: "Get the quote anyway — you'll use it as leverage at renewal even if you don't switch. We see clients save 15-30% on renewal just by having a competing quote in hand.",
  },
];

export default function CyberInsuranceQuote() {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [industry, setIndustry] = useState(INDUSTRIES[0]);
  const [employees, setEmployees] = useState(EMPLOYEE_BANDS[1]);
  const [renewal, setRenewal] = useState(RENEWAL_WINDOWS[1]);
  const [details, setDetails] = useState("");

  const [status, setStatus] = useState("idle"); // idle | sending | ok | error
  const [error, setError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");

  const { containerRef: turnstileRef, reset: resetTurnstile } = useTurnstile(setTurnstileToken);

  useSEO({
    title: "Free Florida Cyber-Insurance Quote | Simple IT SRQ",
    description:
      "Get a free cyber-insurance quote for your Florida small business. We'll connect you with a broker who quotes Sarasota, Bradenton, and Venice businesses every day. No obligation.",
    canonical: `${SITE_URL}/cyber-insurance-quote`,
    image: `${SITE_URL}/og-image.png`,
    breadcrumbs: [
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Cyber-insurance quote", url: `${SITE_URL}/cyber-insurance-quote` },
    ],
  });

  const handlePartnerClick = () => {
    trackAffiliateClick({
      slug: "cyber-insurance-quote",
      destination: PARTNER_URL,
      label: "quote-page-hero-cta",
      network: PARTNER_NAME,
    });
  };

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError("");

    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }

    setStatus("sending");

    // Piggyback on the existing /api/contact endpoint — it already handles
    // CSRF, Turnstile, rate limit, BotID, and Resend delivery to
    // hello@simpleitsrq.com. Pre-format the quote-request structure into
    // the message body so the inbox is readable at a glance.
    const message = [
      "CYBER-INSURANCE QUOTE REQUEST",
      "",
      `Company: ${company.trim() || "(not provided)"}`,
      `Industry: ${industry}`,
      `Employees: ${employees}`,
      `Renewal window: ${renewal}`,
      `Phone: ${phone.trim() || "(none)"}`,
      "",
      "Details / current carrier / specific concerns:",
      details.trim() || "(none)",
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
          source: "cyber-insurance-quote",
          turnstileToken,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Send failed. Try again or email hello@simpleitsrq.com directly.");
      }
      // Fire a GA4 generate_lead with estimated referral value ($800 is the
      // conservative midpoint of typical cyber-insurance broker payouts).
      track.lead("cyber-insurance-quote", 800, { industry, employees, renewal });
      setStatus("ok");
    } catch (err) {
      setStatus("error");
      setError(err.message || "Something went wrong. Please try again.");
      resetTurnstile?.();
    }
  }, [name, email, company, phone, industry, employees, renewal, details, turnstileToken, resetTurnstile]);

  // === Partner-configured path: hero is a quote-widget outbound link. ===
  // === Fallback path: the full form below sends a lead to our inbox. ===

  return (
    <main id="main" className="cyber-ins-quote">
      {/* Hero */}
      <section className="section">
        <div className="container" style={{ maxWidth: 900 }}>
          <div className="section-head" style={{ textAlign: "center" }}>
            <span className="eyebrow">
              <ShieldCheck size={14} style={{ display: "inline", marginRight: 6 }} />
              Cyber-insurance quote
            </span>
            <h1 className="display">
              Your 2026 cyber-insurance renewal starts here.
            </h1>
            <p className="lede">
              Connect with a broker who quotes Florida small businesses every
              day. Takes five minutes. No obligation, no cost to compare.
            </p>
          </div>

          {/* Trust strip */}
          <ul
            style={{
              display: "flex", flexWrap: "wrap", gap: "1rem 2rem",
              justifyContent: "center", margin: "0 0 2rem", padding: 0,
              listStyle: "none",
            }}
          >
            {[
              { Icon: Clock, text: "5-minute questionnaire" },
              { Icon: Users, text: "Florida-based brokers" },
              { Icon: TrendingUp, text: "Leverage at renewal, not just switching" },
              { Icon: Check, text: "No obligation to buy" },
            ].map((item) => (
              <li
                key={item.text}
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <item.Icon size={16} color="#0F6CBD" /> {item.text}
              </li>
            ))}
          </ul>

          {/* Partner-live: show their widget or outbound CTA */}
          {HAS_PARTNER && (
            <div className="form-shell" style={{ textAlign: "center", padding: "2rem" }}>
              <p style={{ marginBottom: "1.25rem", color: "var(--syn-text-muted, #6b7280)" }}>
                Click below to start your 5-minute quote with{" "}
                <strong>{PARTNER_NAME}</strong>, our Florida broker partner.
              </p>
              <a
                href={PARTNER_URL}
                target="_blank"
                rel="sponsored noopener noreferrer"
                className="btn btn-primary btn-lg"
                onClick={handlePartnerClick}
              >
                Start my quote <ArrowRight size={18} />
              </a>
              <p
                style={{
                  fontSize: "0.82rem",
                  color: "var(--syn-text-muted, #6b7280)",
                  marginTop: "1rem",
                  fontStyle: "italic",
                }}
              >
                Referral disclosure: Simple IT SRQ earns a standard broker
                fee when a policy binds through {PARTNER_NAME}. You pay the
                same either way.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Fallback form (also shown below the partner CTA so visitors who
          want a human can always reach us). */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container" style={{ maxWidth: 720 }}>
          <div className="form-shell">
            <h2 className="title-2" style={{ marginTop: 0 }}>
              {HAS_PARTNER ? "Or send us the details and we'll make the intro" : "Tell us about your business"}
            </h2>
            <p className="section-sub" style={{ marginBottom: "1.5rem" }}>
              {HAS_PARTNER
                ? "Prefer a person handling the intro? Fill this out and a Simple IT SRQ engineer will email the broker and CC you within one business hour."
                : "Fill this out and a Simple IT SRQ engineer will email you back within one business hour with broker intros, ballpark pricing expectations, and the exact documents you should have ready for the questionnaire."}
            </p>

            {status === "ok" ? (
              <div
                style={{
                  padding: "1.5rem",
                  borderRadius: 10,
                  background: "rgba(16, 124, 16, 0.08)",
                  border: "1px solid rgba(16, 124, 16, 0.3)",
                  color: "#107C10",
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                }}
              >
                <Check size={22} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <strong style={{ display: "block", marginBottom: 4 }}>
                    Got it — we'll be in touch within one business hour.
                  </strong>
                  <span style={{ fontSize: "0.92rem" }}>
                    Check your inbox (and spam folder) for a reply from
                    hello@simpleitsrq.com. If you don't see one by end of day,
                    email us directly — something got eaten by a spam filter.
                  </span>
                </div>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                style={{ display: "grid", gap: "1rem" }}
                noValidate
              >
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
                    <span className="field-label">Phone</span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      maxLength={50}
                      autoComplete="tel"
                    />
                  </label>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
                  <label className="field">
                    <span className="field-label">Industry</span>
                    <select value={industry} onChange={(e) => setIndustry(e.target.value)}>
                      {INDUSTRIES.map((i) => (<option key={i}>{i}</option>))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Employees</span>
                    <select value={employees} onChange={(e) => setEmployees(e.target.value)}>
                      {EMPLOYEE_BANDS.map((b) => (<option key={b}>{b}</option>))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Renewal window</span>
                    <select value={renewal} onChange={(e) => setRenewal(e.target.value)}>
                      {RENEWAL_WINDOWS.map((r) => (<option key={r}>{r}</option>))}
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span className="field-label">
                    Anything the broker should know? (current carrier, premium,
                    specific concerns)
                  </span>
                  <textarea
                    rows={4}
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    maxLength={5000}
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
                    <>
                      <Loader2 size={18} className="spin" /> Sending…
                    </>
                  ) : (
                    <>
                      <Send size={16} /> Request my quote
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Value context */}
      <section className="section" style={{ background: "var(--syn-surface-hi, transparent)" }}>
        <div className="container" style={{ maxWidth: 900 }}>
          <h2 className="title-2">Why rates jumped in 2026</h2>
          <p className="section-sub">
            Three things changed this year. Knowing them is the difference
            between a 25% premium hike and a flat renewal.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "1.5rem",
              marginTop: "1.5rem",
            }}
          >
            <article>
              <h3 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "1.05rem" }}>
                <FileCheck size={20} color="#0F6CBD" /> MFA questions got stricter
              </h3>
              <p style={{ color: "var(--syn-text-muted, #6b7280)", fontSize: "0.95rem" }}>
                SMS codes no longer count as MFA on most 2026 forms. Authenticator
                apps, hardware keys, and platform passkeys do. "SMS MFA" answers
                can trigger a policy decline.
              </p>
            </article>
            <article>
              <h3 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "1.05rem" }}>
                <ShieldCheck size={20} color="#0F6CBD" /> AI governance is now on the form
              </h3>
              <p style={{ color: "var(--syn-text-muted, #6b7280)", fontSize: "0.95rem" }}>
                Every major carrier added an AI-use section. Offices with no
                written AI policy see a median 14% premium bump.
              </p>
            </article>
            <article>
              <h3 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "1.05rem" }}>
                <TrendingUp size={20} color="#0F6CBD" /> Claims are up, so pricing is up
              </h3>
              <p style={{ color: "var(--syn-text-muted, #6b7280)", fontSize: "0.95rem" }}>
                Ransomware and business-email-compromise claims hit record highs
                in 2025. Carriers priced 2026 accordingly. Shopping the renewal
                recovers most of the delta.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section">
        <div className="container" style={{ maxWidth: 800 }}>
          <h2 className="title-2">Common questions</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1.25rem" }}>
            {FAQ.map((f) => (
              <details
                key={f.q}
                style={{
                  border: "1px solid var(--syn-border, #e5e7eb)",
                  borderRadius: 10,
                  padding: "14px 18px",
                }}
              >
                <summary style={{ fontWeight: 600, cursor: "pointer", listStyle: "none" }}>
                  {f.q}
                </summary>
                <p style={{ marginTop: 10, color: "var(--syn-text-muted, #6b7280)", lineHeight: 1.55 }}>
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
