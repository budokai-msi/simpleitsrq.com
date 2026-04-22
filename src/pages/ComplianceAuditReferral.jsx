import { useState, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  FileCheck, Check, Clock, Users, ArrowRight, AlertTriangle,
  Loader2, Send, Shield, Heart, CreditCard, Briefcase,
} from "lucide-react";
import { useSEO, SITE_URL } from "../lib/seo";
import { csrfFetch } from "../lib/csrf";
import { useTurnstile, TURNSTILE_SITE_KEY } from "../lib/useTurnstile";
import { trackAffiliateClick } from "../lib/trackClick";

// Generic + per-type partner URLs read at module scope so Vite tree-shakes
// whichever branch isn't configured at build time.
const PARTNER_URL_GENERIC = import.meta.env.VITE_AUDIT_PARTNER_URL || "";
const PARTNER_URLS = {
  "SOC 2":            import.meta.env.VITE_AUDIT_PARTNER_SOC2_URL  || "",
  "HIPAA":            import.meta.env.VITE_AUDIT_PARTNER_HIPAA_URL || "",
  "PCI DSS":          import.meta.env.VITE_AUDIT_PARTNER_PCI_URL   || "",
  "FTC Safeguards":   import.meta.env.VITE_AUDIT_PARTNER_FTC_URL   || "",
};
const PARTNER_NAME =
  import.meta.env.VITE_AUDIT_PARTNER_NAME || "our audit partner";

function partnerUrlFor(audit) {
  return PARTNER_URLS[audit] || PARTNER_URL_GENERIC;
}

const AUDIT_TYPES = [
  {
    id: "SOC 2",
    title: "SOC 2 Type II",
    Icon: Shield,
    description:
      "The report every SaaS customer and cyber-insurance form now asks for. Takes 6-12 months on first run; 3-6 on renewal.",
    whoNeeds: "SaaS companies, tech-enabled services, any business whose customers ask for a SOC 2 report.",
  },
  {
    id: "HIPAA",
    title: "HIPAA Risk Assessment",
    Icon: Heart,
    description:
      "Required annually for every practice touching PHI. The written assessment is what OCR asks for in the first 30 seconds of an audit.",
    whoNeeds: "Medical, dental, physical therapy, chiropractic, specialty practices. Also business associates (billing, IT MSPs themselves).",
  },
  {
    id: "PCI DSS",
    title: "PCI DSS",
    Icon: CreditCard,
    description:
      "Required for any business that stores, processes, or transmits cardholder data. Most small offices qualify for the SAQ-A self-assessment; bigger operations need an audited ROC.",
    whoNeeds: "Retailers, e-commerce, healthcare practices accepting cards, any business with a terminal.",
  },
  {
    id: "FTC Safeguards",
    title: "FTC Safeguards Rule",
    Icon: Briefcase,
    description:
      "Mandatory since 2023 for financial institutions as defined by the FTC — which includes a lot more businesses than people realize (tax preparers, mortgage brokers, wealth managers, auto dealers).",
    whoNeeds: "CPAs, tax preparers, mortgage brokers, wealth managers, auto dealers, many financial advisors.",
  },
];

const ENGAGEMENT_WINDOWS = [
  "Within 30 days",
  "30-90 days",
  "90-180 days",
  "No specific deadline",
  "Not sure",
];

const EMPLOYEE_BANDS = ["1-5", "6-10", "11-25", "26-50", "51-100", "100+"];

const FAQ = [
  {
    q: "Do I have to use the firm you refer me to?",
    a: "No. The intro is free and non-binding. Most firms will run a free scoping call (30-60 minutes) to size the engagement, give you a fixed fee, and propose a timeline. You're free to compare against other firms before signing.",
  },
  {
    q: "What does Simple IT SRQ get out of this?",
    a: PARTNER_URL_GENERIC
      ? `When an engagement starts through ${PARTNER_NAME}, they pay us a standard referral fee (usually 5-10% of the audit fee). You pay the same either way — the fee comes out of the firm's revenue, not added to your bill. We only refer to firms we'd use for our own audits.`
      : "Right now, nothing — we're connecting you directly with audit firms we trust. Once our formal referral agreement is signed, we'll earn a standard fee per engagement. You pay the same either way.",
  },
  {
    q: "What information will the firm ask for?",
    a: "A scoping call covers: what audit type, scope of systems/locations, employee count, what you already have documented (WISP, risk assessment, policies), timeline pressure, and budget range. If you own our WISP Template, HIPAA Starter Kit, or Evidence Binder, you already have most of what they'll ask for.",
  },
  {
    q: "How much does a small-business audit cost?",
    a: "SOC 2 Type II: $15,000-$40,000 for 10-50 person offices. HIPAA risk assessment: $2,500-$10,000. PCI DSS SAQ-A: often $500-$2,000 for small merchants; ROC is more. FTC Safeguards: $3,000-$8,000 for a first run. These are rough — your actual quote depends on scope and complexity.",
  },
  {
    q: "Can I prep for the audit myself?",
    a: "Partially, yes. Our templates get you about 60-70% of the way to audit-ready documentation: the HIPAA Starter Kit ($79) covers the Risk Assessment and Safeguards documentation, the WISP Template ($149) covers the security program document, and the Evidence Binder ($39) is the packaging. The audit firm still has to conduct the audit and issue the report — but with those three documents in hand, the engagement is shorter, cheaper, and less stressful.",
  },
];

export default function ComplianceAuditReferral() {
  const [searchParams] = useSearchParams();
  const initialAudit = useMemo(() => {
    const a = searchParams.get("audit");
    return AUDIT_TYPES.some((t) => t.id === a) ? a : AUDIT_TYPES[0].id;
  }, [searchParams]);

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [audit, setAudit] = useState(initialAudit);
  const [employees, setEmployees] = useState(EMPLOYEE_BANDS[1]);
  const [engagement, setEngagement] = useState(ENGAGEMENT_WINDOWS[1]);
  const [details, setDetails] = useState("");

  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");

  const { containerRef: turnstileRef, reset: resetTurnstile } = useTurnstile(setTurnstileToken);

  const partnerForSelection = partnerUrlFor(audit);
  const hasPartnerForSelection = Boolean(partnerForSelection);

  useSEO({
    title: "Florida Compliance Audit Referrals — SOC 2, HIPAA, PCI, FTC | Simple IT SRQ",
    description:
      "Get introduced to a Florida compliance-audit firm for your SOC 2, HIPAA risk assessment, PCI DSS, or FTC Safeguards engagement. Free scoping calls, fixed-fee quotes, no obligation.",
    canonical: `${SITE_URL}/compliance-audit-referral`,
    image: `${SITE_URL}/og-image.png`,
    breadcrumbs: [
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Compliance audit referral", url: `${SITE_URL}/compliance-audit-referral` },
    ],
  });

  const handlePartnerClick = () => {
    trackAffiliateClick({
      slug: "compliance-audit-referral",
      destination: partnerForSelection,
      label: `compliance-audit-${audit.toLowerCase()}`,
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

    const message = [
      "COMPLIANCE-AUDIT REFERRAL REQUEST",
      "",
      `Audit type: ${audit}`,
      `Company: ${company.trim() || "(not provided)"}`,
      `Employees: ${employees}`,
      `Timeline: ${engagement}`,
      `Phone: ${phone.trim() || "(none)"}`,
      "",
      "Details / current state / specific questions:",
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
          source: `compliance-audit-${audit.toLowerCase().replace(/\s+/g, "-")}`,
          turnstileToken,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Send failed. Try again or email hello@simpleitsrq.com directly.");
      }
      setStatus("ok");
    } catch (err) {
      setStatus("error");
      setError(err.message || "Something went wrong. Please try again.");
      resetTurnstile?.();
    }
  }, [name, email, company, phone, audit, employees, engagement, details, turnstileToken, resetTurnstile]);

  const selectedAuditMeta = AUDIT_TYPES.find((t) => t.id === audit);

  return (
    <main id="main" className="compliance-audit-page">
      {/* Hero */}
      <section className="section">
        <div className="container" style={{ maxWidth: 900 }}>
          <div className="section-head" style={{ textAlign: "center" }}>
            <span className="eyebrow">
              <FileCheck size={14} style={{ display: "inline", marginRight: 6 }} />
              Compliance audit referral
            </span>
            <h1 className="display">
              Free intro to a Florida compliance-audit firm.
            </h1>
            <p className="lede">
              SOC 2, HIPAA, PCI DSS, or FTC Safeguards — we'll connect you with
              a firm that audits Florida small businesses every week. Fixed-fee
              scoping, no obligation, no cost to compare.
            </p>
          </div>

          <ul
            style={{
              display: "flex", flexWrap: "wrap", gap: "1rem 2rem",
              justifyContent: "center", margin: "0 0 2rem", padding: 0,
              listStyle: "none",
            }}
          >
            {[
              { Icon: Clock, text: "60-minute free scoping call" },
              { Icon: Users, text: "Florida-licensed audit firms" },
              { Icon: Check, text: "Fixed-fee quote (not hourly)" },
              { Icon: FileCheck, text: "Works with our templates for faster audits" },
            ].map((item) => (
              <li
                key={item.text}
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <item.Icon size={16} color="#0F6CBD" /> {item.text}
              </li>
            ))}
          </ul>

          {hasPartnerForSelection && (
            <div className="form-shell" style={{ textAlign: "center", padding: "2rem" }}>
              <p style={{ marginBottom: "1.25rem", color: "var(--syn-text-muted, #6b7280)" }}>
                Click below to start your scoping call with <strong>{PARTNER_NAME}</strong> for a{" "}
                <strong>{audit}</strong> engagement.
              </p>
              <a
                href={partnerForSelection}
                target="_blank"
                rel="sponsored noopener noreferrer"
                className="btn btn-primary btn-lg"
                onClick={handlePartnerClick}
              >
                Start my {audit} scoping call <ArrowRight size={18} />
              </a>
              <p
                style={{
                  fontSize: "0.82rem",
                  color: "var(--syn-text-muted, #6b7280)",
                  marginTop: "1rem",
                  fontStyle: "italic",
                }}
              >
                Referral disclosure: Simple IT SRQ earns a standard fee
                when an engagement starts through {PARTNER_NAME}. You pay
                the same either way.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Audit-type selector + context */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container" style={{ maxWidth: 900 }}>
          <h2 className="title-2">Which audit?</h2>
          <p className="section-sub" style={{ marginBottom: "1.5rem" }}>
            Pick the one you need and we'll route the intro to a firm that
            specializes in it. Not sure? Leave it on the default and we'll
            help you figure it out on the first call.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "1rem",
              marginBottom: "2rem",
            }}
          >
            {AUDIT_TYPES.map((t) => {
              const active = t.id === audit;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setAudit(t.id)}
                  className={active ? "audit-type-card audit-type-card--active" : "audit-type-card"}
                  aria-pressed={active}
                  aria-label={`Select ${t.title}`}
                >
                  <div className="audit-type-card__icon">
                    <t.Icon size={22} />
                  </div>
                  <h3 className="audit-type-card__title">{t.title}</h3>
                  <p className="audit-type-card__desc">{t.description}</p>
                  <p className="audit-type-card__who">
                    <strong>Who needs it:</strong> {t.whoNeeds}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Form */}
          <div className="form-shell">
            <h2 className="title-2" style={{ marginTop: 0 }}>
              {hasPartnerForSelection
                ? "Or send us the details and we'll make the intro"
                : `Tell us about your ${selectedAuditMeta?.title || "audit"} scope`}
            </h2>
            <p className="section-sub" style={{ marginBottom: "1.5rem" }}>
              {hasPartnerForSelection
                ? "Prefer a person handling the intro? Fill this out and a Simple IT SRQ engineer will email the audit firm and CC you within one business hour."
                : "Fill this out and a Simple IT SRQ engineer will email you back within one business hour with firm intros, ballpark pricing, and the exact documents to have ready for the scoping call."}
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
                    hello@simpleitsrq.com. If you don't see one by end of
                    day, email us directly — something got eaten by a
                    spam filter.
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
                    <span className="field-label">Audit type</span>
                    <select value={audit} onChange={(e) => setAudit(e.target.value)}>
                      {AUDIT_TYPES.map((t) => (<option key={t.id} value={t.id}>{t.title}</option>))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Employees</span>
                    <select value={employees} onChange={(e) => setEmployees(e.target.value)}>
                      {EMPLOYEE_BANDS.map((b) => (<option key={b}>{b}</option>))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Timeline</span>
                    <select value={engagement} onChange={(e) => setEngagement(e.target.value)}>
                      {ENGAGEMENT_WINDOWS.map((r) => (<option key={r}>{r}</option>))}
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span className="field-label">
                    Anything the firm should know? (current state, specific
                    concerns, deadline drivers)
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
                      <Send size={16} /> Request my {audit} intro
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section" style={{ background: "var(--syn-surface-hi, transparent)" }}>
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
