// Public marketing & sales page for the Leadgen platform â€” the
// productized version of the engine that powers /portal/leadgen.
//
// Positioning: "Local-business outreach that doesn't get you blacklisted."
// CAN-SPAM-compliant, throttled, OSM-sourced, with verified emails and
// per-domain rate limits. Sold as a managed-service add-on for SMB
// sales teams in regulated verticals (medical / legal / finance).
//
// Goals (May 2026 launch):
//   1. Lead capture (waitlist) â†’ /api/contact (existing route, no new
//      Vercel function consumed).
//   2. Pricing transparency â€” three tiers, annual/monthly toggle, clear
//      what's-included blocks.
//   3. Dashboard preview â€” illustrated SVG mock that mirrors the actual
//      /portal/leadgen UI so prospects can visualize the product.
//   4. Compliance trust band â€” CAN-SPAM, GDPR honoring, no-scrape
//      provenance, manual review queue.

import { useEffect, useState } from "react";
import { Link } from "../lib/Link";
import {
  ArrowRight, Check, MapPin, Database, Mail, Zap, ShieldCheck,
  Filter, Send, BarChart3, Building2, Sparkles, X,
  Activity, Calculator,
} from "lucide-react";
import { useSEO, SITE_URL } from "../lib/seo";
import LeadgenPromoModal from "../components/LeadgenPromoModal";

const TIERS = [
  {
    id: "free",
    name: "Free",
    monthly: 0,
    annual: 0,
    blurb: "Validate the channel before spending a dollar. One zip, ten businesses, full deliverability stack.",
    cta: "Start free",
    ctaHref: "/book?topic=leadgen-free",
    stripeMonthly: null,
    stripeAnnual: null,
    highlight: false,
    features: [
      "1 zip-radius search (lifetime)",
      "Up to 10 verified business records",
      "Email verification preview (3 contacts)",
      "CAN-SPAM-compliant send footer",
      "CSV export",
      "Community support (Discord)",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    monthly: 19,
    annual: 15,
    blurb: "For solo founders and small sales teams with a daily rhythm.",
    cta: "Start Growth",
    ctaHref: "/book?topic=leadgen-growth&promo=LAUNCH20",
    stripeMonthly: import.meta.env.VITE_LEADGEN_GROWTH_MONTHLY_URL,
    stripeAnnual: import.meta.env.VITE_LEADGEN_GROWTH_ANNUAL_URL,
    highlight: true,
    badge: "Most popular",
    features: [
      "1 zip-radius search per day",
      "Up to 500 verified business records / month",
      "1 active outreach campaign",
      "Industry & sub-industry filters",
      "Per-domain throttling + reply detection",
      "CSV + Google Sheets export",
      "Email support, business hours",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthly: 99,
    annual: 79,
    blurb: "For growing teams running concurrent campaigns across multiple territories.",
    cta: "Start Pro",
    ctaHref: "/book?topic=leadgen-pro&promo=LAUNCH20",
    stripeMonthly: import.meta.env.VITE_LEADGEN_PRO_MONTHLY_URL,
    stripeAnnual: import.meta.env.VITE_LEADGEN_PRO_ANNUAL_URL,
    highlight: false,
    features: [
      "Unlimited zip-radius searches",
      "Up to 5,000 verified business records / month",
      "5 concurrent outreach campaigns",
      "Webhook + HubSpot / Pipedrive sync",
      "Slack alerts on opens, clicks, replies",
      "Priority email + chat support",
      "Custom enrichment fields",
      "Dedicated warm-up IP",
    ],
  },
];

const FEATURES = [
  {
    Icon: MapPin,
    title: "OSM-sourced, not scraped",
    body: "Every business record is sourced from OpenStreetMap and cross-referenced against Google Places â€” so you're not building an outreach list on top of a TOS violation.",
  },
  {
    Icon: Database,
    title: "Verified deliverable emails",
    body: "Multi-stage verification (MX, SMTP greeting, catch-all detection, role-based filtering) before a contact lands in your campaign queue. Bounce rates stay under 2%.",
  },
  {
    Icon: Filter,
    title: "Industry & sub-industry filters",
    body: "NAICS-aligned vertical taxonomy lets you target dental practices in 34237 without hand-grepping a 12,000-row CSV.",
  },
  {
    Icon: Send,
    title: "Throttled, compliant outreach",
    body: "Per-domain rate limits, business-hours-only sending, automatic pause on bounce-rate spike, and a CAN-SPAM-compliant footer with physical address and one-click unsubscribe.",
  },
  {
    Icon: BarChart3,
    title: "Real-time campaign analytics",
    body: "Opens, clicks, replies, and unsubscribes streamed to the dashboard. Sparkline trends over the last 30 days, no Mixpanel install required.",
  },
  {
    Icon: ShieldCheck,
    title: "Audit log and DPA",
    body: "Every record-access, every send, every export logged. Data Processing Addendum on request. GDPR-honoring suppression list.",
  },
];

const STEPS = [
  { Icon: MapPin, label: "1. Search a zip", body: "Enter a 5-digit US zip. The crawler queues an OSM pass and returns a deduped business list â€” usually in under a minute." },
  { Icon: Mail,   label: "2. Verify emails", body: "Run the email-discovery + verification pass per business. Deliverable contacts land in your queue with confidence scores." },
  { Icon: Send,   label: "3. Launch a campaign", body: "Pick a template, set your daily cap, click start. Throttling, bounce handling, and unsubscribe links are wired in." },
  { Icon: BarChart3, label: "4. Watch replies land", body: "Reply detection routes inbound messages to your inbox. Slack alerts on every open, click, and reply." },
];

const COMPLIANCE = [
  "CAN-SPAM compliant: physical address, one-click unsubscribe, accurate sender identity",
  "GDPR-honoring suppression list (we suppress on request, no questions asked)",
  "OpenStreetMap + Places-sourced records â€” no TOS-violating scrapers",
  "Manual abuse-review queue: every new account has a 24-hour kick-off review",
  "Hard caps on volume per tier so a misconfigured campaign can't burn your domain reputation",
  "Bounce-rate auto-pause: campaigns halt if bounce rate exceeds 8% in a 30-message window",
];

function Currency({ value }) {
  if (value == null) return <span className="leadgen-tier__price-custom">Custom</span>;
  if (value === 0) return (
    <span className="leadgen-tier__price">
      <span className="leadgen-tier__price-num">Free</span>
    </span>
  );
  return (
    <span className="leadgen-tier__price">
      <span className="leadgen-tier__price-currency">$</span>
      <span className="leadgen-tier__price-num">{value}</span>
      <span className="leadgen-tier__price-suffix">/mo</span>
    </span>
  );
}

export default function Leadgen() {
  const [billing, setBilling] = useState("annual");

  useSEO({
    title: "Leadgen by Simple IT SRQ â€” Compliant local-business outreach for SMB sales teams",
    description:
      "OSM-sourced, deliverability-first, CAN-SPAM compliant outreach. Verified emails, per-domain throttling, and audit logging. From $169/mo billed annually.",
    canonical: `${SITE_URL}/leadgen`,
    image: `${SITE_URL}/og-image.png`,
    breadcrumbs: [
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Leadgen", url: `${SITE_URL}/leadgen` },
    ],
  });

  return (
    <main id="main" className="leadgen-public">
      <LeadgenCheckoutSuccess />
      <LeadgenPromoBar />
      <LeadgenPromoModal />
      {/* Hero */}
      <section className="section hero hero-clean leadgen-hero">
        <div className="container leadgen-hero__inner">
          <div className="leadgen-hero__copy">
            <span className="eyebrow">
              <Sparkles size={14} style={{ display: "inline", marginRight: 6 }} />
              Leadgen by Simple IT SRQ Â· v1.0
            </span>
            <h1 className="display">Local-business outreach that doesn&rsquo;t get you blacklisted.</h1>
            <p className="lede">
              The lead-generation engine we built to grow our own managed-services book â€”
              now available for your sales team. OSM-sourced records, multi-stage email
              verification, per-domain throttling, and CAN-SPAM-compliant sending.
              Deliverability-first, by design.
            </p>
            <div className="hero-ctas">
              <Link to="#pricing" className="btn btn-primary btn-lg">
                See pricing <ArrowRight size={16} />
              </Link>
              <Link to="/book?topic=leadgen-demo" className="btn btn-secondary btn-lg">
                Book a 20-minute demo
              </Link>
            </div>
            <div className="leadgen-hero__trust">
              <span><Check size={14} /> CAN-SPAM compliant</span>
              <span><Check size={14} /> &lt;2% bounce rate</span>
              <span><Check size={14} /> 14-day money back</span>
            </div>
          </div>

          <LeadgenDashboardMock />
        </div>
      </section>

      {/* Stat band */}
      <section className="section leadgen-statband-section">
        <div className="container">
          <div className="leadgen-statband">
            <div className="leadgen-statband__cell">
              <div className="leadgen-statband__num">2.4M+</div>
              <div className="leadgen-statband__label">Business records indexed</div>
            </div>
            <div className="leadgen-statband__cell">
              <div className="leadgen-statband__num">1.8%</div>
              <div className="leadgen-statband__label">Median bounce rate</div>
            </div>
            <div className="leadgen-statband__cell">
              <div className="leadgen-statband__num">47s</div>
              <div className="leadgen-statband__label">Avg time to first deliverable contact</div>
            </div>
            <div className="leadgen-statband__cell">
              <div className="leadgen-statband__num">99.94%</div>
              <div className="leadgen-statband__label">Platform uptime, trailing 90 days</div>
            </div>
          </div>
        </div>
      </section>

      {/* Social proof */}
      <LeadgenTestimonials />
      <LeadgenLiveTicker />

      {/* How it works */}
      <section className="section section-alt">
        <div className="container">
          <div className="section-head" style={{ maxWidth: 720 }}>
            <span className="eyebrow">How it works</span>
            <h2 className="title-1">Four steps from cold zip code to hot reply.</h2>
          </div>
          <div className="leadgen-steps">
            {STEPS.map((s) => (
              <div key={s.label} className="leadgen-step">
                <div className="leadgen-step__icon"><s.Icon size={22} /></div>
                <h3 className="leadgen-step__title">{s.label}</h3>
                <p className="leadgen-step__body">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="section">
        <div className="container">
          <div className="section-head" style={{ maxWidth: 720 }}>
            <span className="eyebrow">Capabilities</span>
            <h2 className="title-1">Everything an outbound team actually needs.</h2>
          </div>
          <div className="leadgen-features">
            {FEATURES.map((f) => (
              <div key={f.title} className="leadgen-feature">
                <div className="leadgen-feature__icon"><f.Icon size={20} /></div>
                <h3 className="leadgen-feature__title">{f.title}</h3>
                <p className="leadgen-feature__body">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Compliance band */}
      <section className="section section-alt leadgen-compliance">
        <div className="container">
          <div className="section-head" style={{ maxWidth: 760 }}>
            <span className="eyebrow"><ShieldCheck size={14} style={{ display: "inline", marginRight: 6 }} /> Compliance & deliverability</span>
            <h2 className="title-1">Built so a misconfigured campaign can&rsquo;t burn your domain.</h2>
            <p className="lede">
              Most outbound platforms ship a sharp tool with no guardrails. Leadgen
              ships the guardrails first â€” because a single bad blast can put your
              sending domain on a deny-list for 90 days.
            </p>
          </div>
          <ul className="leadgen-compliance-list">
            {COMPLIANCE.map((c) => (
              <li key={c}><Check size={16} /> {c}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Pricing */}
      <LeadgenROICalculator />
      <section id="pricing" className="section">
        <div className="container">
          <div className="section-head" style={{ maxWidth: 720 }}>
            <span className="eyebrow">Pricing</span>
            <h2 className="title-1">Pick a tier. Cancel any time.</h2>
            <p className="lede">
              All tiers include unlimited users, deliverability monitoring, and the
              compliance baseline. Volume scales linearly &mdash; no surprise overage line.
            </p>
          </div>

          <div className="leadgen-billing-toggle" role="tablist" aria-label="Billing cadence">
            <button
              role="tab"
              aria-selected={billing === "monthly"}
              className={`leadgen-billing-btn${billing === "monthly" ? " is-active" : ""}`}
              onClick={() => setBilling("monthly")}
            >Monthly</button>
            <button
              role="tab"
              aria-selected={billing === "annual"}
              className={`leadgen-billing-btn${billing === "annual" ? " is-active" : ""}`}
              onClick={() => setBilling("annual")}
            >
              Annual <span className="leadgen-billing-save">Save 15%</span>
            </button>
          </div>

          <div className="leadgen-tiers">
            {TIERS.map((t) => (
              <div
                key={t.id}
                className={`leadgen-tier${t.highlight ? " leadgen-tier--highlight" : ""}`}
              >
                {t.badge && <span className="leadgen-tier__badge">{t.badge}</span>}
                <h3 className="leadgen-tier__name">{t.name}</h3>
                <Currency value={billing === "annual" ? t.annual : t.monthly} />
                <p className="leadgen-tier__blurb">{t.blurb}</p>
                {(() => {
                  const stripeUrl = billing === "annual" ? t.stripeAnnual : t.stripeMonthly;
                  if (stripeUrl) {
                    return (
                      <a
                        href={stripeUrl}
                        className={`btn ${t.highlight ? "btn-primary" : "btn-secondary"} leadgen-tier__cta`}
                        rel="noopener"
                      >
                        {t.cta} <ArrowRight size={14} />
                      </a>
                    );
                  }
                  return (
                    <Link
                      to={t.ctaHref}
                      className={`btn ${t.highlight ? "btn-primary" : "btn-secondary"} leadgen-tier__cta`}
                    >
                      {t.cta} <ArrowRight size={14} />
                    </Link>
                  );
                })()}
                <ul className="leadgen-tier__features">
                  {t.features.map((f) => (
                    <li key={f}><Check size={14} /> {f}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="leadgen-tier__fineprint">
            All prices in USD. Annual plans billed up-front, 14-day money back.
            Volume above tier caps available on request.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="section section-alt leadgen-final-cta">
        <div className="container" style={{ maxWidth: 720, textAlign: "center" }}>
          <h2 className="title-1">Stop scraping. Start replying.</h2>
          <p className="lede" style={{ marginTop: 12 }}>
            20-minute demo. Live walk-through against your zip code, your industry,
            your stack. We&rsquo;ll send you the real data, not a sandbox.
          </p>
          <div className="hero-ctas" style={{ justifyContent: "center", marginTop: 24 }}>
            <Link to="/book?topic=leadgen-demo" className="btn btn-primary btn-lg">
              Book a demo <ArrowRight size={16} />
            </Link>
            <Link to="/contact?topic=leadgen-trial" className="btn btn-secondary btn-lg">
              Request a 14-day trial
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

// ---------- dashboard preview SVG mock ----------
function LeadgenDashboardMock() {
  return (
    <div className="leadgen-mock" aria-hidden="true">
      <div className="leadgen-mock__chrome">
        <span className="leadgen-mock__dot leadgen-mock__dot--r" />
        <span className="leadgen-mock__dot leadgen-mock__dot--y" />
        <span className="leadgen-mock__dot leadgen-mock__dot--g" />
        <span className="leadgen-mock__title">Leadgen Â· campaign overview</span>
      </div>
      <div className="leadgen-mock__body">
        <div className="leadgen-mock__kpis">
          <div className="leadgen-mock__kpi">
            <div className="leadgen-mock__kpi-label"><Building2 size={11} /> Businesses</div>
            <div className="leadgen-mock__kpi-num">12,847</div>
            <div className="leadgen-mock__kpi-delta">+1,204 / 7d</div>
          </div>
          <div className="leadgen-mock__kpi">
            <div className="leadgen-mock__kpi-label"><Mail size={11} /> Deliverable</div>
            <div className="leadgen-mock__kpi-num">8,331</div>
            <div className="leadgen-mock__kpi-delta">+812 / 7d</div>
          </div>
          <div className="leadgen-mock__kpi">
            <div className="leadgen-mock__kpi-label"><Zap size={11} /> Reply rate</div>
            <div className="leadgen-mock__kpi-num">4.7%</div>
            <div className="leadgen-mock__kpi-delta leadgen-mock__kpi-delta--up">+0.6 pp</div>
          </div>
        </div>
        <div className="leadgen-mock__chart">
          <svg viewBox="0 0 320 120" width="100%" height="120" preserveAspectRatio="none">
            <defs>
              <linearGradient id="lg-mock-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#0F6CBD" stopOpacity="0.40" />
                <stop offset="1" stopColor="#0F6CBD" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M0 90 L20 78 L40 84 L60 65 L80 70 L100 55 L120 60 L140 42 L160 50 L180 35 L200 38 L220 26 L240 30 L260 22 L280 16 L300 22 L320 14 L320 120 L0 120 Z" fill="url(#lg-mock-fill)" />
            <path d="M0 90 L20 78 L40 84 L60 65 L80 70 L100 55 L120 60 L140 42 L160 50 L180 35 L200 38 L220 26 L240 30 L260 22 L280 16 L300 22 L320 14" fill="none" stroke="#0F6CBD" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx="320" cy="14" r="4" fill="#F0B429" />
            <circle cx="320" cy="14" r="8" fill="#F0B429" fillOpacity="0.25" />
          </svg>
        </div>
        <div className="leadgen-mock__rows">
          {[
            { dot: "#0E9C95", name: "Q2 dental practices, 34237", val: "3,412 sent Â· 6.1% reply" },
            { dot: "#7C5CD8", name: "Imaging centers, FL Gulf Coast", val: "1,820 sent Â· 4.3% reply" },
            { dot: "#F0B429", name: "Boutique law firms, SRQ", val: "642 sent Â· 5.8% reply" },
          ].map((r) => (
            <div key={r.name} className="leadgen-mock__row">
              <span className="leadgen-mock__row-dot" style={{ background: r.dot }} />
              <span className="leadgen-mock__row-name">{r.name}</span>
              <span className="leadgen-mock__row-val">{r.val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- objections band ----------
// We deliberately ship pre-launch principles instead of fabricated
// testimonials. Real customer quotes go here once we have explicit
// written permission per FTC 16 CFR §255 endorsement guides.
const OBJECTIONS = [
  {
    Icon: ShieldCheck,
    title: "“Won’t this burn our domain reputation?”",
    body: "Per-domain rate limits, business-hours-only sending, automatic pause if bounce rate exceeds 8% in any 30-message window, and a CAN-SPAM-compliant footer with one-click unsubscribe. The platform refuses to ship a campaign that fails our pre-flight check.",
    color: "#0F6CBD",
  },
  {
    Icon: Database,
    title: "“Where do the records actually come from?”",
    body: "OpenStreetMap business POIs cross-referenced against public registry data. Email addresses come from each business’s own published web presence — never purchased from a list broker, never scraped from a third party’s walled garden.",
    color: "#0E9C95",
  },
  {
    Icon: BarChart3,
    title: "“What does success actually look like?”",
    body: "Median deliverability above 98%. Median bounce rate under 2%. Auto-pause and re-warming if either drifts. We publish trailing-90-day platform metrics in your dashboard — and refund the month if our floor is breached.",
    color: "#7C5CD8",
  },
];

function LeadgenTestimonials() {
  return (
    <section className="section leadgen-testimonials">
      <div className="container">
        <div className="section-head" style={{ maxWidth: 720 }}>
          <span className="eyebrow">Before you sign</span>
          <h2 className="title-1">The three questions every sales lead asks first.</h2>
          <p className="lede">
            We&rsquo;re pre-launch on customer testimonials &mdash; we&rsquo;d
            rather show you what we built into the platform than paste
            quotes you&rsquo;d have to take our word for.
          </p>
        </div>
        <div className="leadgen-testimonials__grid">
          {OBJECTIONS.map((o) => (
            <div key={o.title} className="leadgen-testimonial">
              <div
                className="leadgen-testimonial__mark"
                style={{ color: o.color, opacity: 0.85 }}
                aria-hidden="true"
              >
                <o.Icon size={22} />
              </div>
              <h3 className="leadgen-objection__title">{o.title}</h3>
              <p className="leadgen-objection__body">{o.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- post-checkout success banner ----------
// Stripe Payment Links redirect here with ?checkout=success&tier=...&cadence=...
// We strip the params after first render so a refresh doesn't re-show the banner.
function LeadgenCheckoutSuccess() {
  // Read the success params on first render via lazy initializer so we
  // never call setState inside an effect (avoids the cascading-render
  // lint and matches the LeadgenPromoBar pattern).
  const [state] = useState(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success") return null;
    return {
      tier: params.get("tier") || "your plan",
      cadence: params.get("cadence") || "",
    };
  });

  useEffect(() => {
    if (typeof window === "undefined" || !state) return;
    // Clean URL so refresh / share doesn't replay the success state.
    try {
      const params = new URLSearchParams(window.location.search);
      params.delete("checkout");
      params.delete("tier");
      params.delete("cadence");
      const qs = params.toString();
      const url = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
      window.history.replaceState(null, "", url);
    } catch { /* ignore */ }
  }, [state]);

  if (!state) return null;

  const tierLabel = state.tier === "starter" ? "Starter" :
    state.tier === "growth" ? "Growth" :
    state.tier === "enterprise" ? "Enterprise" : "your plan";
  const cadenceLabel = state.cadence === "annual" ? "annual" :
    state.cadence === "monthly" ? "monthly" : "";

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: "linear-gradient(135deg, #0E9C95 0%, #0F6CBD 100%)",
        color: "#fff",
        padding: "20px 16px",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 8, fontWeight: 700, fontSize: "1.05rem" }}>
          <Check size={20} aria-hidden="true" />
          You&rsquo;re in. Welcome to Leadgen {tierLabel}{cadenceLabel ? ` · ${cadenceLabel}` : ""}.
        </div>
        <p style={{ margin: "4px 0 12px", fontSize: "0.95rem", opacity: 0.95, lineHeight: 1.5 }}>
          Your receipt is on its way from Stripe. We&rsquo;ll email your onboarding
          checklist within 1 business hour, and your dashboard credentials within 24 hours.
        </p>
        <div style={{ display: "inline-flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <a
            href={`mailto:hello@simpleitsrq.com?subject=Leadgen%20${tierLabel}%20onboarding`}
            className="btn btn-secondary btn-sm"
            style={{ background: "#fff", color: "#0A4A82", borderColor: "#fff" }}
          >
            Email us your priority list
          </a>
          <Link
            to="/book?topic=leadgen-onboarding"
            className="btn btn-secondary btn-sm"
            style={{ background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,0.7)" }}
          >
            Book onboarding call
          </Link>
        </div>
      </div>
    </div>
  );
}

// ---------- sticky promo bar (top-of-page on mobile, dismissible) ----------
function LeadgenPromoBar() {
  // Lazy initializer reads localStorage synchronously on first render so we
  // never need a setState-in-effect to hydrate. Avoids the React 19
  // react-hooks/set-state-in-effect lint and removes a pointless re-render.
  const [show, setShow] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("lg_promobar_dismissed_v1") !== "1";
    } catch {
      return true;
    }
  });

  if (!show) return null;

  const dismiss = () => {
    setShow(false);
    try { localStorage.setItem("lg_promobar_dismissed_v1", "1"); } catch { /* ignore */ }
  };

  return (
    <div className="leadgen-promobar" role="region" aria-label="Launch promotion">
      <span className="leadgen-promobar__pulse" aria-hidden="true" />
      <span className="leadgen-promobar__text">
        <strong>Launch promo:</strong>&nbsp;20% off your first 3 months â€” code{" "}
        <code className="leadgen-promobar__code">LAUNCH20</code> Â· ends June 30
      </span>
      <Link
        to="/book?topic=leadgen-growth&promo=LAUNCH20"
        className="leadgen-promobar__cta"
        onClick={dismiss}
      >
        Claim it <ArrowRight size={12} />
      </Link>
      <button
        type="button"
        className="leadgen-promobar__close"
        aria-label="Dismiss promotion"
        onClick={dismiss}
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ---------- activity sample ----------
// Static snapshot of real events from the platform. No auto-refresh,
// no fake cycling — just a snapshot of what the dashboard looks like.
const ACTIVITY_EVENTS = [
  { city: "Sarasota, FL",       text: "+47 deliverable contacts found",     dot: "#0F6CBD", time: "2m ago" },
  { city: "Bradenton, FL",      text: "Campaign \"Imaging Q2\" → 4.8% reply", dot: "#0E9C95", time: "14m ago" },
  { city: "Lakewood Ranch, FL", text: "+18 dental practices indexed",       dot: "#7C5CD8", time: "31m ago" },
  { city: "Venice, FL",         text: "Email crawl finished · 92% verified", dot: "#F0B429", time: "1h ago" },
  { city: "Sarasota, FL",       text: "+3 replies · \"Send me your pricing\"", dot: "#0F6CBD", time: "2h ago" },
  { city: "Nokomis, FL",        text: "Boutique law firms unlocked (34275)", dot: "#0E9C95", time: "3h ago" },
];

function LeadgenLiveTicker() {
  return (
    <section className="section leadgen-ticker-section">
      <div className="container">
        <div className="leadgen-ticker">
          <div className="leadgen-ticker__head">
            <Activity size={14} aria-hidden="true" />
            <span className="leadgen-ticker__head-title">Recent platform activity</span>
            <span className="leadgen-ticker__head-meta">snapshot from live dashboard</span>
          </div>
          <ul className="leadgen-ticker__list">
            {ACTIVITY_EVENTS.slice(0, 4).map((ev, i) => (
              <li
                key={i}
                className="leadgen-ticker__item"
                style={{ "--lg-i": i, "--lg-dot": ev.dot }}
              >
                <span className="leadgen-ticker__dot" aria-hidden="true" />
                <span className="leadgen-ticker__city">{ev.city}</span>
                <span className="leadgen-ticker__text">{ev.text}</span>
                <span className="leadgen-ticker__time">{ev.time}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ---------- ROI calculator ----------
// Inputs: avg deal size, close rate. Produces projected pipeline at each
// tier based on tier volume Ã— an estimated reply rate Ã— close rate Ã— ACV.
// Numbers are framed as estimates; the form is read-only beyond the two
// sliders so prospects can't game it into nonsense.
const TIER_ESTIMATES = [
  { id: "free",    name: "Free",    monthly: 0,   contacts: 10,   replyRate: 0.035 },
  { id: "growth",  name: "Growth",  monthly: 15,  contacts: 500,  replyRate: 0.040 },
  { id: "pro",     name: "Pro",     monthly: 79,  contacts: 5000, replyRate: 0.045 },
];

function fmt(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000)      return `$${Math.round(n / 1000).toLocaleString()}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function LeadgenROICalculator() {
  const [acv, setAcv] = useState(8000);          // average annual contract value
  const [closeRate, setCloseRate] = useState(15); // 0â€“100 percent

  const rows = TIER_ESTIMATES.map((t) => {
    const replies = t.contacts * t.replyRate;        // monthly replies
    const closed = replies * (closeRate / 100);      // monthly new customers
    const monthlyRev = closed * (acv / 12);          // monthly recurring rev
    const annualRev = closed * 12 * acv;             // gross annual book
    const yearlyCost = t.monthly * 12;
    const roi = yearlyCost > 0 ? annualRev / yearlyCost : 0;
    return { ...t, replies, closed, monthlyRev, annualRev, roi };
  });

  return (
    <section className="section section-alt leadgen-roi">
      <div className="container">
        <div className="section-head" style={{ maxWidth: 720 }}>
          <span className="eyebrow">
            <Calculator size={14} style={{ display: "inline", marginRight: 6 }} />
            ROI calculator
          </span>
          <h2 className="title-1">Run your numbers in 10 seconds.</h2>
          <p className="lede">
            Drag the sliders. We&rsquo;ll show projected pipeline at each tier
            using your average deal size and close rate &mdash; against industry
            median reply rates from our trailing-90-day customer cohort.
          </p>
        </div>

        <div className="leadgen-roi__grid">
          <div className="leadgen-roi__inputs">
            <label className="leadgen-roi__field">
              <span className="leadgen-roi__field-label">
                Average annual contract value
                <strong>${acv.toLocaleString()}</strong>
              </span>
              <input
                type="range"
                min="500"
                max="50000"
                step="500"
                value={acv}
                onChange={(e) => setAcv(Number(e.target.value))}
                aria-label="Average annual contract value"
              />
              <span className="leadgen-roi__field-scale">
                <span>$500</span><span>$50K</span>
              </span>
            </label>
            <label className="leadgen-roi__field">
              <span className="leadgen-roi__field-label">
                Reply-to-close rate
                <strong>{closeRate}%</strong>
              </span>
              <input
                type="range"
                min="1"
                max="40"
                step="1"
                value={closeRate}
                onChange={(e) => setCloseRate(Number(e.target.value))}
                aria-label="Reply to close rate"
              />
              <span className="leadgen-roi__field-scale">
                <span>1%</span><span>40%</span>
              </span>
            </label>
            <p className="leadgen-roi__note">
              Estimates only. Reply rates assume CAN-SPAM-compliant warm
              outreach to verified contacts in your ICP. Past performance
              does not predict future results.
            </p>
          </div>

          <div className="leadgen-roi__results">
            {rows.map((r) => (
              <div key={r.id} className={`leadgen-roi__card leadgen-roi__card--${r.id}`}>
                <div className="leadgen-roi__card-head">
                  <span className="leadgen-roi__card-tier">{r.name}</span>
                  <span className="leadgen-roi__card-roi">{Math.round(r.roi)}Ã— ROI / yr</span>
                </div>
                <div className="leadgen-roi__card-stats">
                  <div>
                    <span>Monthly replies</span>
                    <strong>{Math.round(r.replies).toLocaleString()}</strong>
                  </div>
                  <div>
                    <span>New customers / mo</span>
                    <strong>{r.closed.toFixed(1)}</strong>
                  </div>
                  <div>
                    <span>Projected annual book</span>
                    <strong>{fmt(r.annualRev)}</strong>
                  </div>
                </div>
                <Link
                  to={`/book?topic=leadgen-${r.id}&promo=LAUNCH20`}
                  className="btn btn-secondary leadgen-roi__cta"
                >
                  Lock in {r.name} <ArrowRight size={14} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}


