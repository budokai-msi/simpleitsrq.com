import { useEffect, useState } from "react";
import { Link } from "../lib/Link";
import {
  ArrowRight, Check, MapPin, Database, Mail, Zap, ShieldCheck,
  Filter, Send, BarChart3, Building2,
  Calculator, Search, Gauge, Target,
} from "lucide-react";
import { useSEO, SITE_URL } from "../lib/seo";

const TIERS = [
  {
    id: "free",
    name: "Free",
    monthly: 0,
    annual: 0,
    blurb: "A tiny sample list so you can inspect the source fields first.",
    cta: "Request free sample",
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
      "Email support",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    monthly: 19,
    annual: 15,
    blurb: "One zip, one business type, one reviewed campaign test.",
    cta: "Start the $19 test",
    ctaHref: "/book?topic=leadgen-growth",
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
      "1-business-day onboarding review",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthly: 99,
    annual: 79,
    blurb: "For repeat campaigns across several territories or niches.",
    cta: "Start Pro",
    ctaHref: "/book?topic=leadgen-pro",
    stripeMonthly: import.meta.env.VITE_LEADGEN_PRO_MONTHLY_URL,
    stripeAnnual: import.meta.env.VITE_LEADGEN_PRO_ANNUAL_URL,
    highlight: false,
    features: [
      "Unlimited zip-radius searches",
      "Up to 5,000 verified business records / month",
      "5 concurrent outreach campaigns",
      "Webhook-ready export",
      "Open, click, and reply tracking",
      "Priority email support",
      "Custom enrichment fields",
      "Quarterly deliverability review",
    ],
  },
];

const FEATURES = [
  {
    Icon: MapPin,
    title: "Public business records",
    body: "Start with OpenStreetMap business records, keep the source ID, and let you inspect where the record came from before outreach.",
  },
  {
    Icon: Database,
    title: "Published contact emails",
    body: "Find contact emails from business websites and run basic deliverability checks before a contact lands in the campaign queue.",
  },
  {
    Icon: Filter,
    title: "Narrow local targeting",
    body: "Pick a zip code and one business type so the campaign stays specific enough to write a useful offer.",
  },
  {
    Icon: Send,
    title: "Capped sending",
    body: "Set daily send caps, include an unsubscribe link and physical address, and pause campaigns that start bouncing.",
  },
  {
    Icon: BarChart3,
    title: "Reply tracking",
    body: "Track opens, clicks, replies, and unsubscribes so you know whether the niche is worth another campaign.",
  },
  {
    Icon: ShieldCheck,
    title: "Exports and source fields",
    body: "Export the list with source fields and campaign status so you can review the work outside the dashboard.",
  },
];

const STEPS = [
  { Icon: MapPin, label: "1. Pick a local market", body: "Choose one zip code and one business type, such as dental offices in 34237 or contractors in Bradenton." },
  { Icon: Mail,   label: "2. Build the list", body: "Pull public business records, find published contact emails, and remove obvious duplicates before export or outreach." },
  { Icon: Send,   label: "3. Review before sending", body: "Check the offer, sender, footer, unsubscribe link, and daily cap before the first email leaves." },
  { Icon: BarChart3, label: "4. Follow the replies", body: "Watch replies, clicks, and unsubscribes so you can decide whether to keep the niche, change the offer, or stop." },
];

const COMPLIANCE = [
  "Physical mailing address and unsubscribe link on outreach emails",
  "No purchased email lists",
  "OpenStreetMap source IDs retained where available",
  "Daily send caps by plan",
  "Campaigns pause when bounce problems show up",
  "First campaign reviewed before launch",
];

const PROOF_POINTS = [
  { label: "Source", value: "Public records", detail: "OSM business data with source fields" },
  { label: "Contact", value: "Website emails", detail: "Published contact pages and mailto links" },
  { label: "Safety", value: "Capped sends", detail: "Daily limits and bounce pauses" },
  { label: "Start", value: "$19 test", detail: "One zip, one niche, one review" },
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

function LeadgenPlanLink({ tierId = "growth", billing = "monthly", className = "btn btn-primary", children }) {
  const tier = TIERS.find((t) => t.id === tierId) || TIERS[1];
  const stripeUrl = billing === "annual" ? tier.stripeAnnual : tier.stripeMonthly;
  if (stripeUrl) {
    return (
      <a href={stripeUrl} className={className} rel="noopener">
        {children || tier.cta} <ArrowRight size={16} />
      </a>
    );
  }
  return (
    <Link to={tier.ctaHref} className={className}>
      {children || tier.cta} <ArrowRight size={16} />
    </Link>
  );
}

export default function Leadgen() {
  const [billing, setBilling] = useState("monthly");

  useSEO({
    title: "Get Local Leads | Simple IT SRQ",
    description:
      "Run a small local lead test: one zip, one business type, verified contacts, capped sends, and reply tracking from $19/month.",
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
      {/* Hero */}
      <section className="section hero hero-clean leadgen-hero">
        <div className="container leadgen-hero__inner">
          <div className="leadgen-hero__copy">
            <h1 className="display">Find local businesses. Send a small, reviewed campaign.</h1>
            <p className="lede">
              Pick one zip code and one business type. We pull public business
              records, look for published contact emails, cap the sending volume,
              and review the first campaign before it launches.
            </p>
            <div className="hero-ctas">
              <LeadgenPlanLink tierId="growth" billing="monthly" className="btn btn-primary btn-lg">
                Start the $19 test
              </LeadgenPlanLink>
              <Link to="/book?topic=leadgen-demo" className="btn btn-secondary btn-lg">
                Book setup call
              </Link>
            </div>
            <div className="leadgen-hero__trust">
              <span><Check size={14} /> Public source records</span>
              <span><Check size={14} /> Human review before sending</span>
              <span><Check size={14} /> Daily send caps</span>
            </div>
            <div className="leadgen-hero__offer" aria-label="Growth trial offer">
              <div>
                <span>Start</span>
                <strong>$19/mo</strong>
              </div>
              <div>
                <span>Target</span>
                <strong>one zip + one niche</strong>
              </div>
              <div>
                <span>You get</span>
                <strong>verified contacts</strong>
              </div>
            </div>
          </div>

          <LeadgenDashboardMock />
        </div>
      </section>

      <LeadgenProofStrip />

      {/* Operating rules */}
      <section className="section leadgen-statband-section">
        <div className="container">
          <div className="leadgen-statband">
            <div className="leadgen-statband__cell">
              <div className="leadgen-statband__num">1</div>
              <div className="leadgen-statband__label">Zip code to start</div>
            </div>
            <div className="leadgen-statband__cell">
              <div className="leadgen-statband__num">1</div>
              <div className="leadgen-statband__label">Business type to target</div>
            </div>
            <div className="leadgen-statband__cell">
              <div className="leadgen-statband__num">35</div>
              <div className="leadgen-statband__label">Default daily send cap</div>
            </div>
            <div className="leadgen-statband__cell">
              <div className="leadgen-statband__num">$19</div>
              <div className="leadgen-statband__label">First paid test</div>
            </div>
          </div>
        </div>
      </section>

      <LeadgenROICalculator />

      {/* How it works */}
      <section className="section section-alt">
        <div className="container">
          <div className="section-head" style={{ maxWidth: 720 }}>
            <span className="eyebrow">How it works</span>
            <h2 className="title-1">Four steps from a local market to a real reply.</h2>
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
            <h2 className="title-1">The parts that matter before you send.</h2>
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
            <h2 className="title-1">Built to keep the first test controlled.</h2>
            <p className="lede">
              The goal is not maximum volume. The goal is a narrow list, a clean
              offer, a working unsubscribe path, and enough replies to know whether
              the market is worth chasing.
            </p>
          </div>
          <ul className="leadgen-compliance-list">
            {COMPLIANCE.map((c) => (
              <li key={c}><Check size={16} /> {c}</li>
            ))}
          </ul>
        </div>
      </section>

      <LeadgenTestimonials />

      <LeadgenLimits />

      {/* Pricing */}
      <section id="pricing" className="section">
        <div className="container">
          <div className="section-head" style={{ maxWidth: 720 }}>
            <span className="eyebrow">Pricing</span>
            <h2 className="title-1">Start small. Upgrade only if the list is useful.</h2>
            <p className="lede">
              Growth is the default first test. Free is a sample. Pro is for teams
              already running repeat campaigns.
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
              Annual <span className="leadgen-billing-save">Save up to {Math.max(...TIERS.filter(t => t.monthly > 0).map(t => Math.round((1 - t.annual / t.monthly) * 100)))}%</span>
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
          <h2 className="title-1">Start with one local list.</h2>
          <p className="lede" style={{ marginTop: 12 }}>
            Growth is the fastest honest test: enough records to learn, enough
            throttling to stay safe, and a one-business-day review before launch.
          </p>
          <div className="hero-ctas" style={{ justifyContent: "center", marginTop: 24 }}>
            <LeadgenPlanLink tierId="growth" billing="monthly" className="btn btn-primary btn-lg">
              Start the $19 test
            </LeadgenPlanLink>
            <Link to="/book?topic=leadgen-demo" className="btn btn-secondary btn-lg">
              Walk me through it
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function LeadgenProofStrip() {
  return (
    <section className="leadgen-proof" aria-label="Leadgen proof points">
      <div className="container leadgen-proof__grid">
        {PROOF_POINTS.map((point) => (
          <div key={point.label} className="leadgen-proof__item">
            <span className="leadgen-proof__label">{point.label}</span>
            <strong>{point.value}</strong>
            <span>{point.detail}</span>
          </div>
        ))}
      </div>
    </section>
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
        <span className="leadgen-mock__title">Local lead test - campaign overview</span>
      </div>
      <div className="leadgen-mock__body">
        <div className="leadgen-mock__query">
          <div className="leadgen-mock__query-cell">
            <Search size={14} />
            <span>34237</span>
          </div>
          <div className="leadgen-mock__query-cell">
            <Target size={14} />
            <span>Dental practices</span>
          </div>
          <div className="leadgen-mock__query-cell leadgen-mock__query-cell--dark">
            <Gauge size={14} />
            <span>35/day cap</span>
          </div>
        </div>
        <div className="leadgen-mock__kpis">
          <div className="leadgen-mock__kpi">
            <div className="leadgen-mock__kpi-label"><Building2 size={11} /> Businesses</div>
            <div className="leadgen-mock__kpi-num">142</div>
            <div className="leadgen-mock__kpi-delta">local records</div>
          </div>
          <div className="leadgen-mock__kpi">
            <div className="leadgen-mock__kpi-label"><Mail size={11} /> Deliverable</div>
            <div className="leadgen-mock__kpi-num">57</div>
            <div className="leadgen-mock__kpi-delta">emails found</div>
          </div>
          <div className="leadgen-mock__kpi">
            <div className="leadgen-mock__kpi-label"><Zap size={11} /> Reply rate</div>
            <div className="leadgen-mock__kpi-num">35/day</div>
            <div className="leadgen-mock__kpi-delta leadgen-mock__kpi-delta--up">send cap</div>
          </div>
        </div>
        <div className="leadgen-mock__chart">
          <svg viewBox="0 0 320 120" width="100%" style={{ height: 'auto', aspectRatio: '320/120' }} preserveAspectRatio="xMidYMid meet">
            <defs>
              <linearGradient id="lg-mock-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#111827" stopOpacity="0.40" />
                <stop offset="1" stopColor="#111827" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M0 90 L20 78 L40 84 L60 65 L80 70 L100 55 L120 60 L140 42 L160 50 L180 35 L200 38 L220 26 L240 30 L260 22 L280 16 L300 22 L320 14 L320 120 L0 120 Z" fill="url(#lg-mock-fill)" />
            <path d="M0 90 L20 78 L40 84 L60 65 L80 70 L100 55 L120 60 L140 42 L160 50 L180 35 L200 38 L220 26 L240 30 L260 22 L280 16 L300 22 L320 14" fill="none" stroke="#111827" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx="320" cy="14" r="4" fill="#9ca3af" />
            <circle cx="320" cy="14" r="8" fill="#9ca3af" fillOpacity="0.25" />
          </svg>
        </div>
        <div className="leadgen-mock__rows">
          {[
            { dot: "#6b7280", name: "Dental practices, 34237", val: "draft ready for review" },
            { dot: "#6b7280", name: "Contractors, Bradenton", val: "source check running" },
            { dot: "#9ca3af", name: "Law firms, Sarasota", val: "paused for copy edit" },
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
    title: "What keeps this from getting sloppy?",
    body: "Small batches, daily caps, unsubscribe links, a physical address, and a pre-send review on the first campaign. If the list or offer is weak, we say that before sending.",
    color: "#111827",
  },
  {
    Icon: Database,
    title: "Where do the records actually come from?",
    body: "Business records start with OpenStreetMap. Contact emails come from published business websites, contact pages, and mailto links, not purchased email lists.",
    color: "#6b7280",
  },
  {
    Icon: BarChart3,
    title: "What should I expect?",
    body: "A paid test should tell you whether one local niche responds to one clear offer. It is not a promise of customers; it is a faster way to stop guessing.",
    color: "#9ca3af",
  },
];

function LeadgenTestimonials() {
  return (
    <section className="section leadgen-testimonials">
      <div className="container">
        <div className="section-head" style={{ maxWidth: 720 }}>
          <span className="eyebrow">Before you sign</span>
          <h2 className="title-1">The questions we would ask before buying it.</h2>
          <p className="lede">
            No fake testimonials. No mystery database. This is the plain version
            of what the tool does and where it can disappoint you.
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

function LeadgenLimits() {
  return (
    <section className="section section-alt leadgen-limits">
      <div className="container leadgen-limits__grid">
        <div>
          <span className="eyebrow">Honest limits</span>
          <h2 className="title-1">This will not fix a bad offer.</h2>
          <p className="lede">
            Leadgen gives you local data and safer outbound mechanics.
            It still needs a real offer, a narrow audience, and replies handled
            by a human who knows the business.
          </p>
        </div>
        <div className="leadgen-limits__panel">
          <h3>What happens after signup</h3>
          <ol>
            <li>We review your target zip, niche, and offer within one business day.</li>
            <li>You run the first Growth search and inspect the source records.</li>
            <li>We tune the first campaign cap before anything sends.</li>
            <li>You get replies in your inbox, plus open/click/reply tracking in the dashboard.</li>
          </ol>
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
  // lint and avoids a pointless re-render.
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
        background: "linear-gradient(135deg, #111827 0%, #374151 100%)",
        color: "#fff",
        padding: "20px 16px",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 8, fontWeight: 700, fontSize: "1.05rem" }}>
          <Check size={20} aria-hidden="true" />
          You&rsquo;re in. Welcome to Leadgen {tierLabel}{cadenceLabel ? ` - ${cadenceLabel}` : ""}.
        </div>
        <p style={{ margin: "4px 0 12px", fontSize: "0.95rem", opacity: 0.95, lineHeight: 1.5 }}>
          Your receipt is on its way from Stripe. We&rsquo;ll email your onboarding
          checklist within 1 business hour, and your dashboard credentials within 24 hours.
        </p>
        <div style={{ display: "inline-flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <a
            href={`mailto:hello@simpleitsrq.com?subject=Leadgen%20${tierLabel}%20onboarding`}
            className="btn btn-secondary btn-sm"
            style={{ background: "#fff", color: "#111827", borderColor: "#fff" }}
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

// ---------- ROI calculator ----------
// Inputs: avg deal size, close rate. Produces projected pipeline at each
// tier based on tier volume, a conservative reply rate, close rate, and ACV.
// Numbers are framed as estimates; the form is read-only beyond the two
// sliders so prospects can't game it into nonsense.
const TIER_ESTIMATES = [
  { id: "growth",  name: "Growth",  monthly: 19, contacts: 500,  replyRate: 0.012 },
  { id: "pro",     name: "Pro",     monthly: 99, contacts: 5000, replyRate: 0.010 },
  { id: "free",    name: "Free sample", monthly: 0, contacts: 10, replyRate: 0 },
];

function fmt(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000)      return `$${Math.round(n / 1000).toLocaleString()}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function LeadgenROICalculator() {
  const [acv, setAcv] = useState(8000);          // average annual contract value
  const [closeRate, setCloseRate] = useState(8); // 0-100 percent

  const rows = TIER_ESTIMATES.map((t) => {
    const replies = t.contacts * t.replyRate;        // monthly replies
    const closed = replies * (closeRate / 100);      // monthly new customers
    const annualRev = closed * 12 * acv;             // gross annual book
    const yearlyCost = t.monthly * 12;
    const breakEvenCustomers = yearlyCost > 0 ? yearlyCost / acv : 0;
    return { ...t, replies, closed, annualRev, breakEvenCustomers };
  });

  return (
    <section className="section section-alt leadgen-roi">
      <div className="container">
        <div className="section-head" style={{ maxWidth: 720 }}>
          <span className="eyebrow">
            <Calculator size={14} style={{ display: "inline", marginRight: 6 }} />
            Deal math
          </span>
          <h2 className="title-1">Pressure-test the paid trial before you buy it.</h2>
          <p className="lede">
            Drag the sliders. This is a conservative pipeline forecast, not a
            sales promise. Growth is usually the cleanest first test.
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
                Reply-to-customer rate
                <strong>{closeRate}%</strong>
              </span>
              <input
                type="range"
                min="1"
                max="25"
                step="1"
                value={closeRate}
                onChange={(e) => setCloseRate(Number(e.target.value))}
                aria-label="Reply to customer rate"
              />
              <span className="leadgen-roi__field-scale">
                <span>1%</span><span>25%</span>
              </span>
            </label>
            <p className="leadgen-roi__note">
              Estimates only. We use deliberately modest reply rates and do
              not count the free sample as a revenue channel.
            </p>
          </div>

          <div className="leadgen-roi__results">
            {rows.map((r) => (
              <div key={r.id} className={`leadgen-roi__card leadgen-roi__card--${r.id}`}>
                <div className="leadgen-roi__card-head">
                  <span className="leadgen-roi__card-tier">{r.name}</span>
                  <span className="leadgen-roi__card-roi">
                    {r.monthly > 0 ? `break-even: ${r.breakEvenCustomers.toFixed(2)} client/yr` : "sample only"}
                  </span>
                </div>
                <div className="leadgen-roi__card-stats">
                  <div>
                    <span>Likely replies / mo</span>
                    <strong>{r.replies > 0 ? r.replies.toFixed(1) : "0"}</strong>
                  </div>
                  <div>
                    <span>Likely customers / mo</span>
                    <strong>{r.closed.toFixed(1)}</strong>
                  </div>
                  <div>
                    <span>Projected annual book</span>
                    <strong>{fmt(r.annualRev)}</strong>
                  </div>
                </div>
                <LeadgenPlanLink
                  tierId={r.id === "free" ? "free" : r.id}
                  billing="monthly"
                  className={`btn ${r.id === "growth" ? "btn-primary" : "btn-secondary"} leadgen-roi__cta`}
                >
                  {r.id === "growth" ? "Start the $19 test" : `Choose ${r.name}`}
                </LeadgenPlanLink>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
