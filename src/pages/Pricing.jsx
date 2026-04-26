import { Link } from "../lib/Link";
import {
  Check, ArrowRight, ShieldCheck, Phone, FileText, Wrench, Camera, Network, RefreshCw,
} from "lucide-react";
import { useSEO } from "../lib/seo";
import { services } from "../data/services";
import NewsletterSignup from "../components/NewsletterSignup";

// /pricing — public-pricing SERP target.
//
// Most managed-IT shops hide pricing behind a quote form. We don't —
// the prices below are the same numbers we send in a written quote,
// just published. This page captures the search intent ("IT support
// pricing Sarasota", "MSP pricing Florida", "computer repair cost
// Sarasota") that hidden-pricing competitors leave on the table.
//
// Source of truth: src/data/services.js. Edits there flow here.

const RECURRING_TIERS = [
  {
    name: "Managed IT — Essentials",
    price: 95,
    suffix: "/user/month",
    audience: "Business",
    minimum: "10-user minimum",
    contents: [
      "Unlimited helpdesk (call, email, text — real Sarasota tech answers)",
      "24/7 endpoint monitoring + alert response",
      "Modern antivirus + email scam filtering on every device",
      "Patch management and software updates",
      "Off-site daily backups + quarterly restore tests",
      "On-site visits as scheduled",
      "Quarterly check-in with a senior tech",
    ],
    flagshipExtra: false,
    cta: { label: "Book a free 30-min call", href: "/book" },
  },
  {
    name: "Managed IT — Plus",
    price: 135,
    suffix: "/user/month",
    audience: "Business",
    minimum: "10-user minimum",
    contents: [
      "Everything in Essentials, plus:",
      "Microsoft 365 Business Premium licensing managed for you",
      "Conditional Access + 2FA enforcement on every account",
      "Cyber-insurance evidence binder kept current quarterly",
      "Business phone system (modern VoIP, included for up to 25 numbers)",
      "Annual disaster-recovery tabletop exercise",
      "vCIO planning meeting twice a year",
    ],
    flagshipExtra: true,
    cta: { label: "Book a free 30-min call", href: "/book" },
  },
  {
    name: "Managed IT — Premium (HIPAA)",
    price: 185,
    suffix: "/user/month",
    audience: "Business",
    minimum: "Medical / dental / regulated only",
    contents: [
      "Everything in Plus, plus:",
      "Full HIPAA documentation kept current (Risk Assessment, Safeguards, BAAs)",
      "Annual on-site Risk Assessment with written deliverable",
      "Security Academy seat per user (insurance-required training)",
      "Quarterly phishing simulations with practice-specific lures",
      "Audit-day support — we sit with you when the surveyor arrives",
      "Incident-response retainer (we handle the breach playbook)",
    ],
    flagshipExtra: false,
    cta: { label: "Book a free 30-min call", href: "/book" },
  },
];

const RESIDENTIAL_RECURRING = [
  {
    name: "Residential Watch",
    price: 39,
    suffix: "/month",
    audience: "Residential",
    minimum: "Single household, 1–3 devices",
    contents: [
      "Remote monitoring on up to 3 home computers",
      "Quarterly remote tune-up + malware sweep",
      "Email + phone help when something breaks",
      "Discounted rate ($79/hr vs. $129/hr) on any on-site visit",
    ],
    flagshipExtra: false,
    cta: { label: "Book a free 30-min call", href: "/book" },
  },
  {
    name: "Snowbird Watch",
    price: 49,
    suffix: "/month (Nov–Apr)",
    audience: "Residential",
    minimum: "Sarasota / Bradenton / Venice / Casey Key",
    contents: [
      "Monthly property-arrival check (Wi-Fi, cameras, smart locks, computers)",
      "Pre-arrival visit before your November flight south",
      "Storm-watch: pre-storm device shutdown + post-storm recovery",
      "Direct line to a local tech while you're up north",
    ],
    flagshipExtra: true,
    cta: { label: "Book a free 30-min call", href: "/book" },
  },
];

// One-shot fixed-fee services pulled from services.js, grouped by audience.
function oneShotsForAudience(audience) {
  return services
    .filter((s) => s.audiences?.includes(audience) && s.status !== "consult" && s.price > 0)
    .sort((a, b) => a.price - b.price);
}

const ICON_BY_SLUG = {
  "computer-tune-up": Wrench,
  "virus-removal": ShieldCheck,
  "ssd-upgrade": RefreshCw,
  "laptop-battery": Wrench,
  "network-audit": Network,
  "camera-install-deposit": Camera,
  "m365-migration": RefreshCw,
  "snowbird-arrival-setup": ShieldCheck,
};

function TierCard({ tier }) {
  return (
    <article className={`pricing-tier${tier.flagshipExtra ? " is-flagship" : ""} reveal-up`} data-reveal>
      {tier.flagshipExtra && <span className="pricing-tier-badge">Most popular</span>}
      <header>
        <span className="pricing-tier-audience">{tier.audience}</span>
        <h3 className="pricing-tier-name">{tier.name}</h3>
        <div className="pricing-tier-price">
          <span className="pricing-tier-price-amount">${tier.price}</span>
          <span className="pricing-tier-price-suffix">{tier.suffix}</span>
        </div>
        <p className="pricing-tier-minimum">{tier.minimum}</p>
      </header>
      <ul className="pricing-tier-includes">
        {tier.contents.map((c) => (
          <li key={c}><Check size={14} color="var(--success)" /> <span>{c}</span></li>
        ))}
      </ul>
      <Link to={tier.cta.href} className="btn btn-secondary pricing-tier-cta">
        {tier.cta.label} <ArrowRight size={16} />
      </Link>
    </article>
  );
}

function OneShotRow({ svc }) {
  const Icon = ICON_BY_SLUG[svc.slug] || Wrench;
  return (
    <tr>
      <td className="pricing-svc-name">
        <span className="pricing-svc-icon"><Icon size={16} /></span>
        <Link to={`/services#${svc.slug}`}>{svc.title}</Link>
      </td>
      <td className="pricing-svc-tagline">{svc.tagline}</td>
      <td className="pricing-svc-price">
        {svc.priceFrom && <span className="pricing-svc-from">from </span>}
        ${svc.price.toLocaleString()}{svc.priceSuffix}
      </td>
      <td className="pricing-svc-cta">
        <Link to={`/services#${svc.slug}`} className="link-arrow">
          Buy <ArrowRight size={14} />
        </Link>
      </td>
    </tr>
  );
}

const QUOTE_REQUIRED = [
  "Multi-site or multi-building networks (warehouse + office, multiple clinics, etc.)",
  "Active Directory / Entra rebuilds for offices over 50 users",
  "Server replacements with custom storage (NAS, hypervisors, dedicated backup appliances)",
  "Custom security camera systems beyond the 4-cam package (10+ cams, license-plate readers, multi-building)",
  "Compliance projects beyond HIPAA (SOC 2 prep, PCI-DSS Level 2+, CMMC)",
  "After-hours emergency response for non-clients",
];

export default function Pricing() {
  useSEO({
    title: "Public Pricing — Managed IT, Computer Repair, Cameras (Sarasota & Bradenton) | Simple IT SRQ",
    description: "Public pricing for IT support, computer repair, security cameras, and Microsoft 365 migration in Sarasota and Bradenton. Managed IT from $95/user/mo. Computer Tune-Up $99. SSD upgrade $249. 4-camera install reservation $500 deposit. M365 migration $1,500. No quotes, no phone tag.",
    canonical: "https://simpleitsrq.com/pricing",
    image: "https://simpleitsrq.com/og-image.png",
    breadcrumbs: [
      { name: "Home", url: "https://simpleitsrq.com/" },
      { name: "Pricing", url: "https://simpleitsrq.com/pricing" },
    ],
  });

  const businessOneShots = oneShotsForAudience("Business");
  const residentialOneShots = oneShotsForAudience("Residential");

  return (
    <main id="main" className="pricing-main">
      <section className="section pricing-hero">
        <div className="container">
          <span className="eyebrow">Public Pricing · No Quote-and-Call Dance</span>
          <h1 className="display">Real prices. Published. No hidden fees, no minimums you'll find out about later.</h1>
          <p className="lede">
            Most managed-IT shops hide pricing behind a "Request a quote"
            form. We publish ours. The numbers below are the same numbers
            you'd get in a written quote — just without the wait.
          </p>
          <div className="pricing-hero-meta">
            <span><ShieldCheck size={14} /> Flat fees · written what's-included list · 30-day satisfaction guarantee</span>
            <span><Phone size={14} /> <a href="tel:+14072421456">(407) 242-1456</a></span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Managed IT — Recurring</span>
            <h2 className="title-1">Monthly plans for businesses</h2>
            <p className="section-sub">
              Flat per-user pricing. Three tiers. No surprise add-ons.
              We're a Sarasota / Bradenton local team — every plan
              includes on-site visits at no extra travel charge inside
              our 5-county service area.
            </p>
          </div>
          <div className="pricing-tiers">
            {RECURRING_TIERS.map((t) => <TierCard key={t.name} tier={t} />)}
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Residential — Recurring</span>
            <h2 className="title-1">Monthly plans for homes and snowbird condos</h2>
            <p className="section-sub">
              Lighter, friendlier plans for residential clients and snowbirds
              who need a tech to keep an eye on the place from November to
              April.
            </p>
          </div>
          <div className="pricing-tiers pricing-tiers-2col">
            {RESIDENTIAL_RECURRING.map((t) => <TierCard key={t.name} tier={t} />)}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Business — One-Shot Pricing</span>
            <h2 className="title-1">Buy a project. No retainer.</h2>
            <p className="section-sub">
              Fixed-fee one-shot work for businesses. Pay online, schedule,
              get the work. Click any service to see what's included or buy.
            </p>
          </div>
          <div className="pricing-table-wrap">
            <table className="pricing-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>What it does</th>
                  <th>Price</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {businessOneShots.map((s) => <OneShotRow key={s.slug} svc={s} />)}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Residential — One-Shot Pricing</span>
            <h2 className="title-1">Drop-off repair pricing</h2>
            <p className="section-sub">
              Bring it in, we fix it, you pick it up. Fixed fee. No "we'll quote
              after we look at it" runaround.
            </p>
          </div>
          <div className="pricing-table-wrap">
            <table className="pricing-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>What it does</th>
                  <th>Price</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {residentialOneShots.map((s) => <OneShotRow key={s.slug} svc={s} />)}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="pricing-quote-required">
            <span className="eyebrow"><FileText size={14} /> Quote required</span>
            <h2 className="title-2">Things we don't price publicly</h2>
            <p>
              These projects are too custom to publish a one-size price for.
              Book a free 30-minute call and we'll quote them in writing
              within 3 business days. No charge for the call or the quote.
            </p>
            <ul className="pricing-quote-list">
              {QUOTE_REQUIRED.map((q) => (
                <li key={q}><Check size={14} color="var(--text-3)" /> <span>{q}</span></li>
              ))}
            </ul>
            <Link to="/book" className="btn btn-primary btn-lg">
              Book a free call <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <NewsletterSignup
            variant="card"
            headline="Bookmark this page — and get the free starter WISP while you're here"
            subhead="Pricing changes occasionally. Subscribe to the monthly Florida small-business IT brief and we'll email you a heads-up when rates move (rare). Confirm and grab a starter Written Information Security Program template the same day."
            source="pricing-page"
          />
        </div>
      </section>
    </main>
  );
}
