import { Link } from "react-router-dom";
import { BookOpen, ArrowRight } from "lucide-react";
import { useSEO, SITE_URL } from "../lib/seo";
import { glossaryAlphabetical } from "../data/glossary";
import AdUnit from "../components/AdSense";

export default function Glossary() {
  const entries = glossaryAlphabetical();

  useSEO({
    title: "Cybersecurity & Compliance Glossary for Florida Small Business | Simple IT SRQ",
    description:
      "Plain-English definitions of HIPAA, SOC 2, FTC Safeguards, MFA, ransomware, cyber insurance, BAA, encryption, and 20+ other cybersecurity and compliance terms — written for Florida small-business owners.",
    canonical: `${SITE_URL}/glossary`,
    image: `${SITE_URL}/og-image.png`,
    breadcrumbs: [
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Glossary", url: `${SITE_URL}/glossary` },
    ],
  });

  return (
    <main id="main" className="glossary-index">
      <section className="section">
        <div className="container" style={{ maxWidth: 900 }}>
          <div className="section-head">
            <span className="eyebrow">
              <BookOpen size={14} style={{ display: "inline", marginRight: 6 }} />
              Glossary
            </span>
            <h1 className="display">
              Cybersecurity &amp; compliance terms in plain English
            </h1>
            <p className="lede">
              Every term Florida small-business owners hear from auditors,
              insurance carriers, and IT vendors — defined in 30 seconds, with
              the "why it matters" and "what to do" attached.
            </p>
          </div>

          <AdUnit format="auto" className="ad-in-article" />

          {/* A-Z list, big tappable cards. Each click is its own pageview =
              its own AdSense impression set. */}
          <div className="glossary-grid">
            {entries.map((entry) => (
              <Link
                key={entry.slug}
                to={`/glossary/${entry.slug}`}
                className="glossary-card"
              >
                <h2 className="glossary-card__term">{entry.term}</h2>
                <p className="glossary-card__short">{entry.short}</p>
                <span className="glossary-card__cta">
                  Read more <ArrowRight size={14} />
                </span>
              </Link>
            ))}
          </div>

          <AdUnit format="auto" className="ad-in-article" />

          <div style={{ marginTop: 32, padding: "20px 24px", borderRadius: 12, background: "var(--syn-surface, #f9fafb)", border: "1px solid var(--syn-border, #e5e7eb)" }}>
            <h2 className="title-2" style={{ marginTop: 0 }}>Need this for a real audit?</h2>
            <p className="section-sub">
              Definitions are a starting point. The actual paperwork — Risk
              Assessments, WISP, BAAs, Evidence Binder — is what carriers and
              auditors ask for. We sell the templates pre-filled for Florida
              small offices.
            </p>
            <Link to="/store" className="btn btn-primary">
              Browse the templates <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
