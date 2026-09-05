import { Link } from "../lib/Link";
import { Check, ArrowRight } from "lucide-react";
import { trackEvent } from "../lib/analytics";

// Transparent pricing table — targets "how much does IT support cost" style
// searches and pairs with /blog/what-managed-it-costs-sarasota-bradenton-2026.
const PLANS = [
  {
    name: "Essential Care",
    price: "$97",
    unit: "/user/mo",
    best: false,
    tagline: "For stable offices that mostly need a fast, competent answer when something breaks.",
    features: [
      "Unlimited remote support during business hours",
      "Patch management + managed antivirus",
      "Backup monitoring with quarterly restore tests",
      "Vendor liaison — we deal with Microsoft, printers, ISPs",
      "No contract required; 30-day notice to cancel",
    ],
  },
  {
    name: "Managed Office",
    price: "$149",
    unit: "/user/mo",
    best: true,
    tagline: "Our core plan for 10–40 person Sarasota & Bradenton businesses. This is what most offices need.",
    features: [
      "Everything in Essential Care",
      "24x7 endpoint monitoring with human triage",
      "DNS filtering + email security stack",
      "Microsoft 365 administration & security tuning",
      "On-site visits included across SRQ/Bradenton",
      "Quarterly business review with a named engineer",
    ],
  },
  {
    name: "Managed Security+",
    price: "$199",
    unit: "/user/mo",
    best: false,
    tagline: "For regulated industries — healthcare, law, finance — and anyone whose insurer keeps asking questions.",
    features: [
      "Everything in Managed Office",
      "Endpoint detection & response (EDR)",
      "Annual HIPAA / cyber-insurance risk assessment with documentation",
      "Security awareness training for staff",
      "Dark-web credential monitoring",
      "Priority after-hours emergency response",
    ],
  },
];

const ONE_TIME = [
  ["Computer repair / diagnostic", "from $149", "Parts quoted before work proceeds."],
  ["Microsoft 365 migration", "from $75/mailbox", "Email, files, and users moved over a weekend."],
  ["Network / Wi-Fi refresh", "from $3,500", "Small-office design, hardware, configuration, documentation."],
  ["Risk assessment (HIPAA / insurance)", "from $1,500", "Written report mapped to CIS / HIPAA Safeguards."],
];

export default function PricingSection() {
  return (
    <section className="section section-alt" id="pricing" aria-labelledby="pricing-title">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">Straight answers on price</span>
          <h2 className="title-1" id="pricing-title">What IT support actually costs</h2>
          <p className="section-sub">
            No "contact us for pricing" games. Most 10–40 person offices land between $120–$200 per user per month
            all-in. Full breakdown of what's behind these numbers is in{" "}
            <Link to="/blog/what-managed-it-costs-sarasota-bradenton-2026-pricing">our pricing guide</Link>.
          </p>
        </div>
        <div className="pricing-grid">
          {PLANS.map((plan) => (
            <article key={plan.name} className={`pricing-card${plan.best ? " pricing-card--best" : ""}`}>
              {plan.best && <span className="pricing-badge">Most Sarasota offices pick this</span>}
              <h3 className="pricing-name">{plan.name}</h3>
              <p className="pricing-tagline">{plan.tagline}</p>
              <p className="pricing-price">
                <strong>{plan.price}</strong>
                <span>{plan.unit}</span>
              </p>
              <ul className="pricing-features">
                {plan.features.map((f) => (
                  <li key={f}><Check size={14} color="var(--success)" /><span>{f}</span></li>
                ))}
              </ul>
              <Link
                to={`/book?topic=${plan.name === "Managed Security+" ? "security" : "managed-it"}`}
                className="btn btn-primary svc-buy-btn"
                onClick={() => trackEvent("generate_lead", { source: "services_pricing", plan: plan.name })}
              >
                Start with a free review <ArrowRight size={16} />
              </Link>
            </article>
          ))}
        </div>
        <div className="pricing-onetime">
          <h3 className="pricing-onetime-title">One-time projects</h3>
          <table className="pricing-table">
            <thead><tr><th>Project</th><th>Typical price</th><th>Notes</th></tr></thead>
            <tbody>
              {ONE_TIME.map(([name, price, note]) => (
                <tr key={name}><td>{name}</td><td>{price}</td><td>{note}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
