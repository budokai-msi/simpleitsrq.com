import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Check, ShieldCheck, FileText, ArrowRight, Clock, RefreshCw, Mail, Building2,
  BookOpen,
} from "lucide-react";
import { products } from "../data/products";
import { useSEO } from "../lib/seo";
import Testimonials from "../components/Testimonials";
import { csrfFetch } from "../lib/csrf";

const FAQ = [
  {
    q: "Is this really specific to Florida, or just a generic HIPAA template with the state name swapped in?",
    a: "Genuinely Florida-specific. The Physical Safeguards section covers hurricane procedures, FEMA flood-zone documentation, and the vehicle-storage rule that causes the most HIPAA breaches on the Gulf Coast. The Administrative and Technical sections assume Microsoft 365 Business Premium or Google Workspace Business Plus — the licensing tier Florida dental and medical practices actually run — and give step-by-step settings for each platform.",
  },
  {
    q: "Who wrote this?",
    a: "The team at Simple IT SRQ, a Sarasota- and Bradenton-based MSP. We write a version of this document from scratch for every new HIPAA-bound client we onboard. The kit is the same document, generalized and made self-serve.",
  },
  {
    q: "Is this a substitute for an attorney or a compliance consultant?",
    a: "No. It is a much cheaper starting point that gets you to 80% of the documentation an auditor expects to see. For the last 20% — the parts specific to your risk profile, your state-law obligations outside HIPAA, and your cyber-insurance policy language — you still want a qualified advisor. The kit makes those conversations shorter and cheaper because your paperwork is already in order.",
  },
  {
    q: "Does the price include updates?",
    a: "Yes. Lifetime updates. When OCR publishes new guidance, Microsoft changes a default, or Florida updates its data-privacy law, we revise the kit and email existing buyers the new version. No resubscription, no new purchase.",
  },
  {
    q: "Refund policy?",
    a: "30 days, no questions asked. If the kit does not match what you expected, reply to your receipt and we will refund you — you keep the kit.",
  },
  {
    q: "I want the full MSP service, not just the paperwork.",
    a: "Book a free 15-minute call from our contact page. If you buy the kit first and then sign on as a managed-services client within 90 days, we credit the kit price against your first month.",
  },
];

const KIT_PREVIEW_SECTIONS = [
  {
    h: "1. Administrative Safeguards (9 required standards)",
    body: "Plain-English guide to every Administrative Safeguard, plus a checklist with an Evidence column for each item. Most practices have paperwork for 2 of the 9 standards and assume the rest will come up only if audited. OCR asks for all 9.",
    example: "Sample item from §164.308(a)(1)(ii)(A):\n\n☐ Current written Risk Assessment, reviewed within the last 12 months.\nEvidence: _______________________________________________\n\n☐ Documented risk mitigation plan for every risk rated Medium or High.\nEvidence: _______________________________________________",
  },
  {
    h: "2. Physical Safeguards (Florida-specific additions)",
    body: "The standard checklist plus four additions for Gulf Coast offices: hurricane procedure for PHI-bearing devices, FEMA flood-zone documentation, humidity-log evidence for the server room, and the explicit prohibition on leaving unencrypted devices in parked vehicles (Florida heat is the #1 loss cause in the state).",
    example: "Florida Addition §FL-1.1:\n\n☐ Hurricane procedure documents where laptops, servers, and paper charts are relocated when a named storm is forecast, and identifies the workforce member responsible for executing the move.\nEvidence: _______________________________________________",
  },
  {
    h: "3. Technical Safeguards (Microsoft 365 and Google Workspace specifics)",
    body: "Step-by-step settings for each required standard, tailored to the two platforms Florida small practices actually run. Includes which license tier meets audit requirements — the cheaper tiers fail Audit Controls §164.312(b) and will cost you on renewal.",
    example: "§164.312(d) — Person or Entity Authentication:\n\nMicrosoft 365 Business Premium:\n1. Admin Center → Users → Active users\n2. Multi-factor authentication → Bulk update → Enable for all\n3. Require FIDO2 or Authenticator app (not SMS) for all admin roles\n4. Configure Conditional Access: block sign-in from outside US + require compliant device\n\nGoogle Workspace Business Plus:\n1. Admin Console → Security → Authentication → 2-step verification\n2. Enforce on for all users, 2-week grace period\n3. Require hardware security keys for Super Admins\n4. Disable SMS as a second factor organization-wide",
  },
  {
    h: "4. Business Associate Agreement (BAA) template",
    body: "Six-page attorney-reviewed BAA you can hand to any vendor. Pre-filled with the clauses OCR has flagged in recent enforcement actions. Just drop your practice name and the vendor name in the first paragraph and sign.",
    example: "BUSINESS ASSOCIATE AGREEMENT\n\nThis Business Associate Agreement ('Agreement') is entered into as of __________ ('Effective Date') between __________ ('Covered Entity') and __________ ('Business Associate'), each a 'Party' and collectively the 'Parties.'\n\nWHEREAS, the Parties have entered or intend to enter into a service arrangement (the 'Services') under which Business Associate may create, receive, maintain, or transmit Protected Health Information ('PHI') as defined at 45 C.F.R. § 160.103 on behalf of Covered Entity…",
  },
  {
    h: "5. Risk Assessment questionnaire (42 questions)",
    body: "Every question OCR auditors and cyber-insurance carriers ask during a real assessment. Answers are where most practices fall short. Each question includes a Model Answer rated 'good / better / best' by expected premium impact.",
    example: "Q19. Does every device that stores PHI — including laptops, phones, tablets, and external drives — have full-disk encryption enabled?\n\nFor each device, document:\n- Make, model, and serial number\n- Encryption method (BitLocker, FileVault, device-native)\n- Encryption recovery key storage location\n\nBEST-rated answer: Yes, enforced by MDM; recovery keys stored in the MDM console and escrowed with the practice's IT contact. Inventory reviewed quarterly.\n\nGOOD-rated answer: Yes on laptops and company phones; personal devices follow BYOD policy requiring FileVault/BitLocker.\n\nAVOID: 'All staff know they should turn it on' — this triggers a policy decline on most 2026 renewals.",
  },
];

function BuyCta({ product, compact = false }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const live = !!product.buyLink;

  const joinWaitlist = async (e) => {
    e.preventDefault();
    if (!email) return;
    try {
      await csrfFetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name: "(product waitlist)",
          message: `Waitlist signup for: ${product.title} ($${product.price})`,
          source: `store-waitlist-${product.slug}`,
        }),
      }).catch(() => {});
      setSent(true);
    } catch {
      setSent(true);
    }
  };

  if (live) {
    return (
      <a
        href={product.buyLink}
        className={`btn btn-primary ${compact ? "" : "btn-lg"}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Buy the kit — ${product.price} <ArrowRight size={compact ? 14 : 16} />
      </a>
    );
  }

  if (sent) {
    return (
      <div className="store-launch-success">
        <Check size={20} color="#107C10" />
        <span>You're on the early-access list. We will email you the moment the kit is ready, with a launch discount for the first 25 buyers.</span>
      </div>
    );
  }

  return (
    <form className="store-launch-form" onSubmit={joinWaitlist}>
      <div className="store-launch-label">
        <Mail size={14} />
        <span>Early access + launch discount — ${Math.round(product.price * 0.5)} for the first 25 buyers</span>
      </div>
      <div className="store-launch-row">
        <input
          type="email"
          className="store-launch-input"
          placeholder="you@practice.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button type="submit" className={`btn btn-primary ${compact ? "" : "btn-lg"}`}>
          Notify me <ArrowRight size={compact ? 14 : 16} />
        </button>
      </div>
    </form>
  );
}

function SeriesCard({ product }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const live = !!product.buyLink;

  const joinWaitlist = async (e) => {
    e.preventDefault();
    if (!email) return;
    try {
      await csrfFetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name: "(product waitlist)",
          message: `Waitlist signup for: ${product.title} ($${product.price})`,
          source: `store-waitlist-${product.slug}`,
        }),
      }).catch(() => {});
      setSent(true);
    } catch {
      setSent(true);
    }
  };

  return (
    <article className="series-card">
      <header className="series-card-head">
        <div className="series-card-icon"><FileText size={20} /></div>
        <div className="series-card-price">${product.price}{product.priceSuffix || ""}</div>
      </header>
      <h3 className="series-card-title">{product.title}</h3>
      <p className="series-card-tagline">{product.tagline}</p>
      <p className="series-card-desc">{product.description}</p>
      {product.previewUrl && (
        <a
          className="series-card-preview"
          href={product.previewUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <BookOpen size={13} /> Read preview ({product.contents.length} sections inside)
        </a>
      )}
      <div className="series-card-cta">
        {live ? (
          <a href={product.buyLink} className="btn btn-primary" target="_blank" rel="noopener noreferrer">
            Buy — ${product.price} <ArrowRight size={14} />
          </a>
        ) : sent ? (
          <div className="series-card-sent">
            <Check size={16} color="#107C10" />
            <span>On the list — we'll email you at launch.</span>
          </div>
        ) : (
          <form className="series-card-form" onSubmit={joinWaitlist}>
            <input
              type="email"
              className="store-launch-input"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-secondary">Notify me</button>
          </form>
        )}
      </div>
    </article>
  );
}

export default function Store() {
  const featured = products.find((p) => p.featured) || products[0];
  const bundle = products.find((p) => p.isBundle);
  const series = products
    .filter((p) => p.featured && p.slug !== featured.slug && !p.isBundle)
    .sort((a, b) => a.priority - b.priority);
  const managedServices = products.filter((p) => p.isManagedService);

  useSEO({
    title: "Florida HIPAA Starter Kit | Simple IT SRQ",
    description: "A 62-page HIPAA compliance kit written for Florida dental, medical, and specialty-practice offices. Administrative, Physical, and Technical Safeguards checklists, BAA template, risk assessment, and Florida-specific hurricane provisions. $79.",
    canonical: "https://simpleitsrq.com/store",
    breadcrumbs: [
      { name: "Home", url: "https://simpleitsrq.com/" },
      { name: "Store", url: "https://simpleitsrq.com/store" },
    ],
    products: products.filter((p) => p.featured || p.isBundle),
  });

  return (
    <main id="main" className="product-page">
      {/* HERO */}
      <section className="section product-hero">
        <div className="container product-hero-inner">
          <div className="product-hero-copy">
            <span className="eyebrow">Compliance Template</span>
            <h1 className="display">{featured.title}</h1>
            <p className="lede">{featured.tagline}</p>
            <p className="product-hero-desc">{featured.description}</p>
            <div className="product-hero-cta">
              <BuyCta product={featured} />
            </div>
            <div className="product-hero-trust">
              <span><Check size={14} color="#107C10" /> Lifetime updates</span>
              <span><RefreshCw size={14} /> 30-day refund</span>
              <span><ShieldCheck size={14} /> Florida-specific</span>
            </div>
          </div>
          <aside className="product-hero-cover" aria-hidden="true">
            <div className="product-cover">
              <div className="product-cover-eyebrow">Simple IT SRQ</div>
              <div className="product-cover-title">Florida Small-Business<br/>HIPAA Starter Kit</div>
              <div className="product-cover-meta">62 pages · Admin + Physical + Technical · BAA · Risk Assessment</div>
              <div className="product-cover-fineprint">Last revision: April 2026 · Lifetime updates</div>
            </div>
          </aside>
        </div>
      </section>

      {/* WHAT YOU GET */}
      <section className="section section-alt">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">What's inside</span>
            <h2 className="title-1">Everything a Florida practice actually needs</h2>
            <p className="section-sub">Ten self-contained deliverables. Each one stands alone; together they form an audit-ready HIPAA documentation package.</p>
          </div>
          <ul className="product-contents-grid">
            {featured.contents.map((c) => (
              <li key={c}>
                <Check size={16} color="#107C10" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* WHO IT'S FOR */}
      <section className="section">
        <div className="container product-narrow">
          <div className="section-head">
            <span className="eyebrow">Who it's for</span>
            <h2 className="title-1">Built for the practice you actually run</h2>
          </div>
          <div className="product-audience-grid">
            <div><Building2 size={22} /><strong>2–20 person offices</strong><p>Right-sized for dental, medical, physical therapy, and specialty practices on the Gulf Coast.</p></div>
            <div><Clock size={22} /><strong>Renewing cyber insurance</strong><p>Written to answer the 2026 questionnaires from Chubb, Travelers, and Beazley without triggering a policy decline.</p></div>
            <div><ShieldCheck size={22} /><strong>First-time HIPAA audit prep</strong><p>The documentation package a first-time auditor expects to see on the table, day one.</p></div>
          </div>
        </div>
      </section>

      {/* PREVIEW — real content inline */}
      <section className="section section-alt">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Preview</span>
            <h2 className="title-1">Read the real content before you buy</h2>
            <p className="section-sub">Five excerpts pulled directly from the kit. This is the tone and depth of the whole document.</p>
          </div>
          <div className="product-preview-list">
            {KIT_PREVIEW_SECTIONS.map((s) => (
              <article key={s.h} className="product-preview-section">
                <h3>{s.h}</h3>
                <p>{s.body}</p>
                <pre className="product-preview-example">{s.example}</pre>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* GUARANTEE */}
      <section className="section">
        <div className="container product-narrow">
          <div className="product-guarantee">
            <ShieldCheck size={40} />
            <h2 className="title-2">30-day refund, no questions</h2>
            <p>If the kit does not match what you expected, reply to your receipt and we refund you in full — you keep the documents. We prefer keeping the customer who leaves happy over the customer who felt stuck.</p>
          </div>
        </div>
      </section>

      {/* MANAGED SERVICES — recurring-revenue offerings like Security Academy.
          Distinct card style from the one-shot templates so visitors see this
          as a different kind of product. */}
      {managedServices.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">Managed service</span>
              <h2 className="title-1">Prefer a recurring program to a one-shot template?</h2>
              <p className="section-sub">Fully-managed security-awareness training for your team — monthly 5-minute modules, quarterly phishing simulations, annual compliance report. Priced per user per month. Waitlist open for Q3 2026 launch.</p>
            </div>
            <div className="managed-service-grid">
              {managedServices.map((s) => (
                <Link key={s.slug} to="/security-academy" className="managed-service-card">
                  <div className="managed-service-head">
                    <span className="managed-service-badge">Ongoing service</span>
                    <div className="managed-service-price">
                      <span className="managed-service-amount">${s.price}</span>
                      <span className="managed-service-unit">{s.priceSuffix || ""}</span>
                    </div>
                  </div>
                  <h3>{s.title}</h3>
                  <p>{s.tagline}</p>
                  <span className="managed-service-cta">Learn more <ArrowRight size={14} /></span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* BUNDLE banner — shown between featured hero + the series grid */}
      {bundle && (
        <section className="section">
          <div className="container">
            <div className="bundle-banner">
              <div className="bundle-banner-copy">
                <span className="bundle-badge">Save ${bundle.originalPrice - bundle.price}</span>
                <h2 className="title-1">{bundle.title}</h2>
                <p>{bundle.description}</p>
                <ul className="bundle-list">
                  {bundle.contents.slice(0, 5).map((c) => (
                    <li key={c}><Check size={14} color="#107C10" /> {c}</li>
                  ))}
                </ul>
              </div>
              <div className="bundle-banner-cta">
                <div className="bundle-price">
                  <span className="bundle-price-strike">${bundle.originalPrice}</span>
                  <span className="bundle-price-now">${bundle.price}</span>
                </div>
                <BuyCta product={bundle} />
                <p className="bundle-fineprint">Every template in the library. Lifetime updates. 30-day refund.</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* SERIES */}
      {series.length > 0 && (
        <section className="section section-alt">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">Complete Series</span>
              <h2 className="title-1">More compliance templates for Florida small offices</h2>
              <p className="section-sub">Each one stands alone; together they cover the paperwork every small practice in Sarasota or Bradenton eventually needs.</p>
            </div>
            <div className="series-grid">
              {series.map((p) => <SeriesCard key={p.slug} product={p} />)}
            </div>
          </div>
        </section>
      )}

      {/* TESTIMONIALS — self-hides when empty, no fake content ever */}
      <Testimonials subtitle="Short quotes from Florida small-business owners we support. Approved by the client before it ever appears here." />

      {/* FAQ */}
      <section className="section">
        <div className="container product-narrow">
          <div className="section-head">
            <span className="eyebrow">FAQ</span>
            <h2 className="title-1">Questions we hear before every sale</h2>
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

      {/* FINAL CTA */}
      <section className="section">
        <div className="container product-narrow product-final-cta">
          <h2 className="title-1">Get your paperwork in order</h2>
          <p className="product-final-sub">One-time purchase. Lifetime updates. 30-day refund. If you also want the full service — the backups, the phone that gets answered — <Link to="/book">book a free 15-minute call</Link> and the kit price credits toward your first month.</p>
          <BuyCta product={featured} />
        </div>
      </section>
    </main>
  );
}
