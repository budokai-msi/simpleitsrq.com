import { Link } from "../lib/Link";
import { Check, ShieldCheck, GraduationCap, Mail, FileCheck, Users, Calendar, ArrowRight } from "lucide-react";
import { useSEO, SITE_URL } from "../lib/seo";

const FEATURES = [
  { Icon: GraduationCap, title: "Monthly 5-minute training modules", desc: "One topic per month, short enough that nobody skips. 12 topics a year covering phishing, password hygiene, MFA, device security, data handling, and more." },
  { Icon: Mail, title: "Quarterly phishing simulations", desc: "Industry-specific lures — medical-office, legal, real-estate, invoice-fraud templates. Staff who click get a 60-second coaching moment immediately." },
  { Icon: Users, title: "User-by-user risk scoring", desc: "See which staff members need extra attention before they cost you a breach. Updated monthly." },
  { Icon: FileCheck, title: "Annual compliance report", desc: "~8 pages in Simple IT SRQ branding. Drops into your Cyber-Insurance Evidence Binder or HIPAA audit file. Carriers love it." },
  { Icon: Calendar, title: "Directory sync + automation", desc: "Microsoft 365 or Google Workspace. New hires auto-enroll on hire; departures auto-remove. You never manage a roster." },
  { Icon: ShieldCheck, title: "HIPAA track included", desc: "Medical, dental, physical therapy, and specialty practices get the HIPAA-specific curriculum at no extra cost." },
];

const PRICING_ROWS = [
  { plan: "Monthly", price: "$12", unit: "/user/mo", min: "10 users", best: "Trying it out, small teams" },
  { plan: "Annual", price: "$100", unit: "/user/yr", min: "10 users", best: "Any team on an annual compliance rhythm", savings: "Save $44/user" },
];

const FAQ = [
  {
    q: "Is this a re-seller of an off-the-shelf platform?",
    a: "Under the hood we partner with a best-in-class MSP-focused training platform so you get enterprise-grade content without the enterprise price tag. Above the hood, everything you and your staff see is Simple IT SRQ branded, managed by our Sarasota team, and integrated with the rest of your IT stack. You never touch the underlying vendor's portal unless you want to.",
  },
  {
    q: "How long does setup take?",
    a: "48 hours from signed agreement to first training module in staff inboxes. We do the M365 / Google directory integration, branding setup, and first-month content calibration.",
  },
  {
    q: "Does this replace my HIPAA training?",
    a: "Yes. The HIPAA-specific track satisfies 45 CFR §164.308(a)(5) Security Awareness and Training. You get the documented curriculum plus completion evidence a HHS OCR auditor would expect.",
  },
  {
    q: "What if my business has fewer than 10 staff?",
    a: "Join the waitlist anyway — we're evaluating a sub-10 tier. If there's enough demand we'll launch one at a slightly higher per-user rate.",
  },
  {
    q: "Can I cancel?",
    a: "Annual billing, no auto-renew. Cancel anytime; the paid period runs to completion. Monthly billing is month-to-month.",
  },
];

export default function SecurityAcademy() {
  useSEO({
    title: "Simple IT SRQ Security Academy — Security Awareness Training for Sarasota Businesses",
    description: "Managed security awareness training for Sarasota and Bradenton small businesses. Monthly modules, quarterly phishing simulations, annual compliance report — everything your cyber-insurance carrier asks for. Starts at $12/user/mo. Join the Q3 2026 launch waitlist.",
    canonical: `${SITE_URL}/security-academy`,
    image: `${SITE_URL}/og-image.png`,
    breadcrumbs: [
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Security Academy", url: `${SITE_URL}/security-academy` },
    ],
  });

  return (
    <main id="main" className="security-academy">
      <section className="section hero hero-clean">
        <div className="hero-bg" aria-hidden="true" />
        <div className="container hero-stack-clean">
          <div className="hero-copy hero-copy-centered">
            <span className="eyebrow"><GraduationCap size={14} /> Launching Q3 2026 · Waitlist open</span>
            <h1 className="display">Security awareness training <span className="brand-accent">your team will actually finish</span></h1>
            <p className="lede">
              A branded, fully-managed security-awareness program for your staff. Monthly 5-minute modules, quarterly phishing simulations keyed to your industry, and an annual compliance report that drops straight into your Cyber-Insurance Evidence Binder. Managed end-to-end by the Simple IT SRQ team.
            </p>
            <div className="hero-ctas">
              <Link to="/#contact" className="btn btn-primary btn-lg">Join the waitlist <ArrowRight size={16} /></Link>
              <a href="/products/security-academy-preview.md" className="btn btn-secondary btn-lg">Read the full spec</a>
            </div>
            <ul className="trust-row" aria-label="Trust indicators">
              <li><Check size={14} /> Required by most 2026 cyber-insurance carriers</li>
              <li><Check size={14} /> HIPAA §164.308(a)(5) aligned</li>
              <li><Check size={14} /> Florida FIPA §501.171 ready</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">What's included</span>
            <h2 className="title-1">Everything your carrier asks for, nothing your staff has to figure out</h2>
            <p className="section-sub">
              The Academy is not a login your team has to remember. Training comes to them via email, runs in their browser, and closes in 5 minutes. You see the results in a one-page dashboard or a monthly executive summary to your inbox.
            </p>
          </div>
          <div className="solution-grid">
            {FEATURES.map(({ Icon, title, desc }) => (
              <article key={title} className="solution-card">
                <div className="solution-card-head">
                  <span className="solution-card-icon"><Icon size={18} /></span>
                  <h3 className="solution-card-title">{title}</h3>
                </div>
                <p className="solution-card-desc">{desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Pricing</span>
            <h2 className="title-1">$12 a month per user. Flat.</h2>
            <p className="section-sub">
              A single cyber-insurance premium increase from "no training documented" typically runs $2,800–$6,500/year for an office your size. The Academy pays for itself on the renewal line alone for most clients.
            </p>
          </div>
          <div className="pricing-grid">
            {PRICING_ROWS.map((row) => (
              <div key={row.plan} className={`pricing-card ${row.savings ? "is-featured" : ""}`}>
                {row.savings && <span className="pricing-badge">{row.savings}</span>}
                <h3>{row.plan}</h3>
                <div className="pricing-price">
                  <span className="pricing-amount">{row.price}</span>
                  <span className="pricing-unit">{row.unit}</span>
                </div>
                <p className="pricing-min">Minimum {row.min}</p>
                <p className="pricing-best">Best for: {row.best}</p>
                <Link to="/#contact" className="btn btn-primary">Join the waitlist</Link>
              </div>
            ))}
          </div>
          <div className="pricing-examples">
            <h3>Example billings</h3>
            <ul>
              <li><strong>10-person dental office</strong>, annual: $1,000/year</li>
              <li><strong>22-person law firm</strong>, annual: $2,200/year</li>
              <li><strong>45-person real estate brokerage</strong>, annual: $4,500/year</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">FAQ</span>
            <h2 className="title-1">Questions we've already been asked</h2>
          </div>
          <div className="faq-list">
            {FAQ.map((f) => (
              <details key={f.q} className="faq-item">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-cta">
        <div className="container">
          <div className="cta-card">
            <h2>Waitlist founders lock founding-client pricing for 24 months.</h2>
            <p>
              We launch Q3 2026. Waitlisters get priority setup slots, founding-client rates (even if list price rises in 2027), and a 30-day no-commitment pilot. Mention "Security Academy" on the contact form — we'll reach out within one business day.
            </p>
            <Link to="/#contact" className="btn btn-primary btn-lg">Join the waitlist <ArrowRight size={16} /></Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">While you wait</span>
            <h2 className="title-1">Two ways to start before Q3</h2>
            <p className="section-sub">
              The Academy is the long game. If you have a cyber-insurance renewal coming up sooner — or you just want to improve posture this month — these two get you moving today.
            </p>
          </div>
          <div className="free-tools-grid">
            <Link to="/password-check" className="free-tools-card">
              <span className="free-tools-tag">Free · 5 seconds</span>
              <h3>Check a password for known breaches</h3>
              <p>Our privacy-preserving tool tests any password against 800M+ known-breached credentials without the password ever leaving your browser.</p>
              <span className="free-tools-cta">Run the check <ArrowRight size={14} /></span>
            </Link>
            <Link to="/store/saas-incident-response-playbook" className="free-tools-card">
              <span className="free-tools-tag">$29 · One-shot</span>
              <h3>SaaS Incident Response Playbook</h3>
              <p>14-page printable fillable playbook — vendor-breach decision tree, pre-written client notifications, Florida FIPA 30-day quick reference. Ship it today.</p>
              <span className="free-tools-cta">See the preview <ArrowRight size={14} /></span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
