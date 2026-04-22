import { useState, useCallback } from "react";
import {
  Megaphone, Check, Mail, FileText, Layers, MapPin, Users,
  TrendingUp, AlertTriangle, Loader2, Send, Ban,
} from "lucide-react";
import { useSEO, SITE_URL } from "../lib/seo";
import { csrfFetch } from "../lib/csrf";
import { useTurnstile, TURNSTILE_SITE_KEY } from "../lib/useTurnstile";

// Pricing tiers kept at module scope so Vite can tree-shake the
// constant reference and the form <select> stays in sync with the
// pricing cards without hand-duplicating the label strings.
const TIERS = [
  {
    id: "newsletter",
    label: "Newsletter sponsor slot",
    price: "$150",
    unit: "per issue",
    Icon: Mail,
    summary:
      "One primary sponsor per monthly issue. ~60-word ad block at the top, your logo, and a CTA button.",
    features: [
      "Top-of-issue placement (above the editorial)",
      "~60-word ad block + logo + CTA",
      "One primary sponsor per issue",
      "Monthly cadence — next open slot ships ~30 days out",
    ],
  },
  {
    id: "blog",
    label: "Blog sponsor placement",
    price: "$300",
    unit: "per post",
    Icon: FileText,
    summary:
      "Sponsored ~200-word inline block inside a new or existing blog post with in-topic relevance. Lives for 12 months.",
    features: [
      "~200 words inline, in-topic",
      "Stays live 12 months (indexed, linked)",
      "Disclosed as \"Sponsored\" per FTC guidance",
      "Up to 3 placements per quarter",
    ],
    highlight: true,
  },
  {
    id: "stack",
    label: "Stack feature",
    price: "$500",
    unit: "per month",
    Icon: Layers,
    summary:
      "Dedicated sponsor block on /stack for 30 days, plus inclusion in the monthly newsletter.",
    features: [
      "Dedicated block on /stack (30 days)",
      "Included in that month's newsletter",
      "Up to 2 sponsors featured at a time",
      "Renewable month-to-month",
    ],
  },
];

const MONTH_OPTIONS = [
  "As soon as possible",
  "Next month",
  "1-2 months out",
  "3+ months out",
  "Flexible",
];

const FAQ = [
  {
    q: "Do you run editorial approval on sponsor copy?",
    a: "Yes. We edit for clarity, tone, and factual accuracy — and we reserve the right to decline copy that misrepresents a product, targets consumers unrelated to our audience, or violates our \"not a good fit\" list. You get one round of revisions before we publish.",
  },
  {
    q: "How is the sponsorship disclosed?",
    a: "Every placement is labeled \"Sponsored\" above the block, per FTC endorsement guidance. Newsletter slots carry a \"Sponsored by [Brand]\" header. Blog placements get an inline disclosure tag and a rel=\"sponsored\" link. We don't do native-without-disclosure.",
  },
  {
    q: "What analytics do I receive?",
    a: "Newsletter sponsors get open rate, click count on the CTA, and unique-subscriber click count after the issue has been live for 7 days. Blog sponsors get cumulative pageviews, clicks on the sponsored link, and scroll-to-block rate at 30 / 90 / 365 days. Stack sponsors get a monthly impressions + clicks report.",
  },
  {
    q: "How do you measure whether a placement performed?",
    a: "We benchmark against the previous three issues / comparable posts and share the delta honestly. We'd rather you know a slot underperformed so you can pick a different angle next time than protect a recurring book of unhappy sponsors.",
  },
  {
    q: "What's your refund / make-good policy?",
    a: "If a newsletter doesn't ship on the committed date, we'll either credit you to the next issue or refund. If a blog placement drops in rank materially within 90 days (lost indexing, URL change on our end), we re-run it in a comparable post at no charge. We don't refund based on performance — only on execution.",
  },
  {
    q: "How does payment work?",
    a: "Invoice via Stripe. Net-15 for first-time sponsors; returning sponsors can set up a saved card or ACH for auto-billing. We ask for payment before the placement goes live so there's no awkward chasing after the fact.",
  },
];

// Mock newsletter preview — HTML/CSS only so it ships in the static
// bundle and stays accessible. No inline SVG or external image means
// we aren't shipping a "screenshot" that becomes stale when the
// design changes.
function NewsletterMockup() {
  return (
    <div
      aria-label="Example newsletter sponsor block"
      style={{
        border: "1px solid var(--syn-border, #e5e7eb)",
        borderRadius: 12,
        overflow: "hidden",
        background: "var(--syn-surface, #fff)",
        boxShadow: "0 10px 30px -15px rgba(15, 108, 189, 0.25)",
        maxWidth: 560,
        margin: "0 auto",
        fontSize: "0.92rem",
      }}
    >
      <div
        style={{
          background: "#0F6CBD",
          color: "#fff",
          padding: "10px 16px",
          fontSize: "0.78rem",
          letterSpacing: "0.5px",
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        Simple IT SRQ Monthly — Issue #X
      </div>
      <div
        style={{
          padding: "8px 16px",
          background: "rgba(15, 108, 189, 0.06)",
          fontSize: "0.72rem",
          letterSpacing: "0.6px",
          textTransform: "uppercase",
          color: "#0F6CBD",
          fontWeight: 700,
          borderBottom: "1px dashed rgba(15, 108, 189, 0.25)",
        }}
      >
        Sponsored by [YourBrand]
      </div>
      <div style={{ padding: "18px 20px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 10,
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              background: "linear-gradient(135deg, #0F6CBD, #4CC2FF)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            YB
          </div>
          <strong style={{ fontSize: "1.02rem" }}>[YourBrand] — one-line tagline</strong>
        </div>
        <p style={{ margin: "0 0 14px", lineHeight: 1.55, color: "var(--syn-text, #0B0D10)" }}>
          Stop chasing paper HIPAA binders. [YourBrand] gives Florida practices
          a living risk assessment, automated policy reminders, and an audit-ready
          export whenever OCR (or your cyber-insurance broker) asks. Built for
          offices under 50 people — set up in an afternoon. Readers of Simple IT
          SRQ get 20% off the first year.
        </p>
        <a
          href="#example"
          onClick={(e) => e.preventDefault()}
          style={{
            display: "inline-block",
            padding: "10px 18px",
            background: "#0F6CBD",
            color: "#fff",
            borderRadius: 8,
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "0.92rem",
          }}
        >
          Claim the SRQ reader discount &rarr;
        </a>
      </div>
    </div>
  );
}

export default function Advertise() {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState(TIERS[0].label);
  const [month, setMonth] = useState(MONTH_OPTIONS[1]);
  const [url, setUrl] = useState("");
  const [copy, setCopy] = useState("");

  const [status, setStatus] = useState("idle"); // idle | sending | ok | error
  const [error, setError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");

  const { containerRef: turnstileRef, reset: resetTurnstile } = useTurnstile(setTurnstileToken);

  useSEO({
    title: "Advertise / Sponsor | Simple IT SRQ",
    description:
      "Reach Florida small-business decision-makers. Sponsor the Simple IT SRQ newsletter, a blog post, or the Stack. Transparent pricing, editorial controls, and FTC-compliant disclosure.",
    canonical: `${SITE_URL}/advertise`,
    image: `${SITE_URL}/og-image.png`,
    breadcrumbs: [
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Advertise", url: `${SITE_URL}/advertise` },
    ],
  });

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError("");

    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }

    setStatus("sending");

    // Piggyback on /api/contact — the source tag lets us route
    // sponsor inquiries in the inbox without touching the API.
    const message = [
      "SPONSOR / ADVERTISE INQUIRY",
      "",
      `Company: ${company.trim() || "(not provided)"}`,
      `Preferred tier: ${tier}`,
      `Timing: ${month}`,
      `URL to promote: ${url.trim() || "(none provided)"}`,
      "",
      "Ad copy / pitch:",
      copy.trim() || "(none provided)",
    ].join("\n");

    try {
      const res = await csrfFetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          company: company.trim(),
          message,
          source: "sponsor-inquiry",
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
  }, [name, email, company, tier, month, url, copy, turnstileToken, resetTurnstile]);

  return (
    <main id="main" className="advertise-page">
      {/* Hero */}
      <section className="section">
        <div className="container" style={{ maxWidth: 900 }}>
          <div className="section-head" style={{ textAlign: "center" }}>
            <span className="eyebrow">
              <Megaphone size={14} style={{ display: "inline", marginRight: 6 }} />
              Advertise / sponsor
            </span>
            <h1 className="display">
              Reach Florida small-business decision-makers.
            </h1>
            <p className="lede">
              Get in front of practice owners, law-firm partners, and operations
              leads who actually pay for the tools you're selling. Newsletter,
              blog, and Stack sponsorships — transparent pricing, editorial
              controls, and FTC-compliant disclosure.
            </p>
          </div>
        </div>
      </section>

      {/* Audience block */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container" style={{ maxWidth: 1040 }}>
          <h2 className="title-2" style={{ textAlign: "center" }}>Who you'll reach</h2>
          <p className="section-sub" style={{ textAlign: "center", marginBottom: "1.75rem" }}>
            Numbers are current estimates and will be updated as we grow.
          </p>

          <div
            className="advertise-stats"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "1.25rem",
              marginBottom: "1.5rem",
            }}
          >
            {[
              { Icon: TrendingUp, v: "3,000-5,000", l: "Monthly visitors" },
              { Icon: Mail, v: "500+", l: "Newsletter subscribers (growing)" },
              { Icon: Users, v: "HIPAA · Law · CPA · SaaS", l: "Industry mix" },
              { Icon: MapPin, v: "85%+ FL", l: "Sarasota-Bradenton-Venice corridor" },
            ].map((s) => (
              <div
                key={s.l}
                style={{
                  border: "1px solid var(--syn-border, #e5e7eb)",
                  borderRadius: 12,
                  padding: "1.25rem",
                  background: "var(--syn-surface, transparent)",
                  textAlign: "center",
                }}
              >
                <s.Icon size={22} color="#0F6CBD" style={{ marginBottom: 8 }} />
                <div style={{ fontSize: "1.4rem", fontWeight: 700, lineHeight: 1.15 }}>{s.v}</div>
                <div style={{ fontSize: "0.88rem", color: "var(--syn-text-muted, #6b7280)", marginTop: 4 }}>
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing tiers */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container" style={{ maxWidth: 1100 }}>
          <h2 className="title-2" style={{ textAlign: "center" }}>Three ways to sponsor</h2>
          <p className="section-sub" style={{ textAlign: "center", marginBottom: "1.75rem" }}>
            Pick the placement that matches your goal — awareness, evergreen SEO, or month-long visibility.
          </p>

          <div
            className="advertise-tiers"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "1.5rem",
            }}
          >
            {TIERS.map((t) => (
              <article
                key={t.id}
                style={{
                  border: t.highlight
                    ? "2px solid #0F6CBD"
                    : "1px solid var(--syn-border, #e5e7eb)",
                  borderRadius: 14,
                  padding: "1.5rem",
                  background: "var(--syn-surface, transparent)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.9rem",
                  boxShadow: t.highlight
                    ? "0 14px 40px -18px rgba(15, 108, 189, 0.45)"
                    : "none",
                  position: "relative",
                }}
              >
                {t.highlight && (
                  <span
                    style={{
                      position: "absolute",
                      top: -12,
                      right: 16,
                      background: "#0F6CBD",
                      color: "#fff",
                      fontSize: "0.7rem",
                      letterSpacing: "0.5px",
                      textTransform: "uppercase",
                      padding: "4px 10px",
                      borderRadius: 999,
                      fontWeight: 700,
                    }}
                  >
                    Most evergreen
                  </span>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <t.Icon size={22} color="#0F6CBD" />
                  <h3 style={{ margin: 0, fontSize: "1.1rem" }}>{t.label}</h3>
                </div>
                <div>
                  <span style={{ fontSize: "2rem", fontWeight: 700 }}>{t.price}</span>
                  <span style={{ fontSize: "0.95rem", color: "var(--syn-text-muted, #6b7280)", marginLeft: 6 }}>
                    {t.unit}
                  </span>
                </div>
                <p style={{ margin: 0, color: "var(--syn-text-muted, #6b7280)", fontSize: "0.95rem", lineHeight: 1.5 }}>
                  {t.summary}
                </p>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
                  {t.features.map((f) => (
                    <li key={f} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: "0.92rem" }}>
                      <Check size={16} color="#107C10" style={{ flexShrink: 0, marginTop: 3 }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ marginTop: "auto", justifySelf: "start" }}
                  onClick={() => {
                    setTier(t.label);
                    document
                      .getElementById("sponsor-form")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  Reserve a {t.label.split(" ")[0].toLowerCase()} slot
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter mockup */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container" style={{ maxWidth: 900 }}>
          <h2 className="title-2" style={{ textAlign: "center" }}>What a sponsored slot looks like</h2>
          <p className="section-sub" style={{ textAlign: "center", marginBottom: "1.5rem" }}>
            We don't have past issues to link yet — here's the layout your
            ~60-word newsletter block will ship in.
          </p>
          <NewsletterMockup />
        </div>
      </section>

      {/* Good fit / not a fit */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container" style={{ maxWidth: 1000 }}>
          <h2 className="title-2" style={{ textAlign: "center" }}>What makes a good fit</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "1.5rem",
              marginTop: "1.5rem",
            }}
          >
            <article
              style={{
                border: "1px solid rgba(16, 124, 16, 0.3)",
                background: "rgba(16, 124, 16, 0.04)",
                borderRadius: 12,
                padding: "1.5rem",
              }}
            >
              <h3 style={{ marginTop: 0, display: "flex", gap: 8, alignItems: "center", fontSize: "1.05rem" }}>
                <Check size={20} color="#107C10" /> Great fits
              </h3>
              <ul style={{ margin: 0, paddingLeft: "1.1rem", lineHeight: 1.7, fontSize: "0.95rem" }}>
                <li>Microsoft 365 add-ons (backup, security, DLP, retention)</li>
                <li>Backup / disaster-recovery software</li>
                <li>Compliance tools (HIPAA, SOC 2, FTC Safeguards, WISP)</li>
                <li>Managed-IT-adjacent services (monitoring, patching, endpoint)</li>
                <li>Vertical SaaS for legal, medical, accounting, property mgmt</li>
                <li>Cyber-insurance brokers & MSP tooling vendors</li>
              </ul>
            </article>
            <article
              style={{
                border: "1px solid rgba(220, 38, 38, 0.3)",
                background: "rgba(220, 38, 38, 0.04)",
                borderRadius: 12,
                padding: "1.5rem",
              }}
            >
              <h3 style={{ marginTop: 0, display: "flex", gap: 8, alignItems: "center", fontSize: "1.05rem" }}>
                <Ban size={20} color="#dc2626" /> We decline
              </h3>
              <ul style={{ margin: 0, paddingLeft: "1.1rem", lineHeight: 1.7, fontSize: "0.95rem" }}>
                <li>Crypto, NFTs, token pre-sales</li>
                <li>Gambling, sportsbooks, prediction markets</li>
                <li>MLM / network-marketing offers</li>
                <li>Consumer apps unrelated to running a small business</li>
                <li>Anything requiring health / financial claims we can't verify</li>
                <li>Competing MSPs in our direct service area</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      {/* Lead form */}
      <section className="section" id="sponsor-form" style={{ paddingTop: 0 }}>
        <div className="container" style={{ maxWidth: 720 }}>
          <div className="form-shell">
            <h2 className="title-2" style={{ marginTop: 0 }}>
              Tell us about your placement
            </h2>
            <p className="section-sub" style={{ marginBottom: "1.5rem" }}>
              We reply within one business day with availability, a media kit
              PDF, and the checkout link for the tier you pick.
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
                    Got it — we'll be in touch within one business day.
                  </strong>
                  <span style={{ fontSize: "0.92rem" }}>
                    Check your inbox (and spam folder) for a reply from
                    hello@simpleitsrq.com. We'll include open slots, the media
                    kit, and the invoice link.
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <label className="field">
                    <span className="field-label">Sponsor tier</span>
                    <select value={tier} onChange={(e) => setTier(e.target.value)}>
                      {TIERS.map((t) => (
                        <option key={t.id} value={t.label}>
                          {t.label} — {t.price} {t.unit}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Month preference</span>
                    <select value={month} onChange={(e) => setMonth(e.target.value)}>
                      {MONTH_OPTIONS.map((m) => (<option key={m}>{m}</option>))}
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span className="field-label">URL you want promoted</span>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    maxLength={500}
                    placeholder="https://"
                    inputMode="url"
                  />
                </label>
                <label className="field">
                  <span className="field-label">
                    Ad copy / pitch (draft is fine — we'll edit with you)
                  </span>
                  <textarea
                    rows={5}
                    value={copy}
                    onChange={(e) => setCopy(e.target.value)}
                    maxLength={5000}
                    placeholder="~60 words for a newsletter slot; ~200 for a blog placement."
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
                      <Send size={16} /> Send sponsor inquiry
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section" style={{ paddingTop: 0 }}>
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
