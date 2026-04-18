import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Download, Mail, ShieldCheck, FileText, ArrowRight } from "lucide-react";
import { products } from "../data/products";
import { useSEO } from "../lib/seo";

function ProductCard({ product }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const live = !!product.buyLink;

  const joinWaitlist = async (e) => {
    e.preventDefault();
    if (!email) return;
    try {
      await fetch("/api/contact", {
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
    <article className="store-card">
      <header className="store-card-head">
        <div className="store-card-badge"><FileText size={18} /></div>
        <div>
          <h3 className="store-card-title">{product.title}</h3>
          <p className="store-card-tagline">{product.tagline}</p>
        </div>
        <div className="store-card-price">${product.price}</div>
      </header>

      <p className="store-card-desc">{product.description}</p>

      <div className="store-card-audience">
        <strong>Who it's for:</strong> {product.audience}
      </div>

      <details className="store-card-contents">
        <summary>What's inside ({product.contents.length} items)</summary>
        <ul>
          {product.contents.map((c) => (
            <li key={c}><Check size={14} color="#107C10" /> {c}</li>
          ))}
        </ul>
      </details>

      <div className="store-card-cta">
        {live ? (
          <a href={product.buyLink} className="btn btn-primary" target="_blank" rel="noopener noreferrer">
            Buy — ${product.price} <ArrowRight size={14} />
          </a>
        ) : sent ? (
          <div className="store-card-waitlisted">
            <Check size={18} color="#107C10" />
            <span>You're on the list — we'll email you when it's ready.</span>
          </div>
        ) : (
          <form className="store-waitlist" onSubmit={joinWaitlist}>
            <label className="store-waitlist-label">
              <Mail size={14} />
              <span>Notify me when this is ready</span>
            </label>
            <div className="store-waitlist-row">
              <input
                className="store-waitlist-input"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button type="submit" className="btn btn-secondary">Join waitlist</button>
            </div>
          </form>
        )}
        {product.previewUrl && (
          <a href={product.previewUrl} className="store-card-preview-link" target="_blank" rel="noopener noreferrer">
            <Download size={13} /> Preview the table of contents
          </a>
        )}
      </div>
    </article>
  );
}

export default function Store() {
  useSEO({
    title: "Store — HIPAA, WISP, and IT Continuity Templates | Simple IT SRQ",
    description: "Florida small-business compliance documents — HIPAA starter kit, Written Information Security Program, cyber-insurance answer kit, hurricane IT continuity playbook. Written by the team that runs IT for Sarasota and Bradenton offices.",
    canonical: "https://simpleitsrq.com/store",
    breadcrumbs: [
      { name: "Home", url: "https://simpleitsrq.com/" },
      { name: "Store", url: "https://simpleitsrq.com/store" },
    ],
  });

  const sorted = [...products].sort((a, b) => a.priority - b.priority);

  return (
    <main id="main" className="store-page">
      <section className="section store-hero">
        <div className="container">
          <span className="eyebrow">Templates & Playbooks</span>
          <h1 className="display">Compliance paperwork, done once</h1>
          <p className="lede">
            We keep writing the same documents for every new client — so we packaged them. Florida-specific, plain-English, and already formatted for the cyber-insurance renewal questions carriers actually ask in 2026.
          </p>
          <div className="store-hero-chips">
            <span className="store-chip"><ShieldCheck size={14} /> Written by the MSP that runs your neighbor's IT</span>
            <span className="store-chip"><Check size={14} color="#107C10" /> Lifetime updates</span>
            <span className="store-chip"><Check size={14} color="#107C10" /> 30-day refund, no questions</span>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <div className="store-grid">
            {sorted.map((p) => <ProductCard key={p.slug} product={p} />)}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="store-note">
            <h2 className="title-2">Why these exist</h2>
            <p>
              Every Sarasota, Bradenton, or Venice practice we onboard asks us for the same three documents: a HIPAA risk assessment, a WISP for their cyber-insurance renewal, and a hurricane-season runbook. We used to write those from scratch every time. Now we write them once, and sell the templates to offices that want the paperwork without a managed-services engagement.
            </p>
            <p>
              If you end up wanting the full service too — the compliance work, the backups, the phone that gets answered — {" "}
              <Link to="/book">book a free 15-minute call</Link>. The price of any template credits toward your first month.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
