import { useMemo } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, ShieldCheck, Lightbulb, Tag } from "lucide-react";
import { useSEO, SITE_URL } from "../lib/seo";
import { findGlossaryEntry, GLOSSARY } from "../data/glossary";
import { products } from "../data/products";
import AdUnit from "../components/AdSense";
import CyberInsuranceCTA from "../components/CyberInsuranceCTA";

function buildDefinedTermSchema(entry) {
  // schema.org/DefinedTerm — Google sometimes surfaces this as the
  // featured-snippet source for "what is X" queries. Keep it minimal
  // and fact-only.
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    name: entry.term,
    description: entry.short,
    inDefinedTermSet: {
      "@type": "DefinedTermSet",
      name: "Simple IT SRQ Cybersecurity & Compliance Glossary",
      url: `${SITE_URL}/glossary`,
    },
    url: `${SITE_URL}/glossary/${entry.slug}`,
  };
}

export default function GlossaryEntry() {
  const { slug } = useParams();
  const entry = useMemo(() => findGlossaryEntry(slug), [slug]);

  const product = entry?.product
    ? products.find((p) => p.slug === entry.product)
    : null;

  const relatedEntries = (entry?.related || [])
    .map((s) => GLOSSARY.find((g) => g.slug === s))
    .filter(Boolean);

  // useSEO must run unconditionally (rules-of-hooks). Pass empty SEO
  // when entry is missing so the redirect still happens cleanly below.
  useSEO(
    entry
      ? {
          title: `What is ${entry.term}? Plain-English Definition | Simple IT SRQ`,
          description: entry.short,
          canonical: `${SITE_URL}/glossary/${entry.slug}`,
          image: `${SITE_URL}/og-image.png`,
          breadcrumbs: [
            { name: "Home", url: `${SITE_URL}/` },
            { name: "Glossary", url: `${SITE_URL}/glossary` },
            { name: entry.term, url: `${SITE_URL}/glossary/${entry.slug}` },
          ],
        }
      : {}
  );

  // Defensive — if someone hits /glossary/<typo>, send them to the index.
  if (!entry) return <Navigate to="/glossary" replace />;

  return (
    <main id="main" className="glossary-entry blog-post-main">
      <article className="blog-post">
        <div className="container blog-post-container">
          {/* Per-entry JSON-LD for DefinedTerm rich result eligibility. */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(buildDefinedTermSchema(entry)) }}
          />

          <Link to="/glossary" className="blog-back">
            <ArrowLeft size={14} /> Back to glossary
          </Link>

          <h1 className="blog-post-title">What is {entry.term}?</h1>

          {/* The featured-snippet candidate paragraph. Keep this above
              every other element so Google picks it up cleanly. */}
          <p className="blog-post-lede" style={{ fontSize: "1.15rem", lineHeight: 1.55 }}>
            {entry.short}
          </p>

          <AdUnit format="auto" className="ad-in-article" />

          <div className="blog-post-content">
            {entry.full.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}

            <aside
              style={{
                margin: "32px 0",
                padding: "20px 24px",
                borderRadius: 12,
                background: "var(--syn-surface, #f9fafb)",
                border: "1px solid var(--syn-border, #e5e7eb)",
                borderLeft: "4px solid #0F6CBD",
              }}
            >
              <h3 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "1.05rem", marginTop: 0 }}>
                <ShieldCheck size={18} color="#0F6CBD" /> Why it matters for Florida small business
              </h3>
              <p style={{ margin: 0, lineHeight: 1.6 }}>{entry.why}</p>
            </aside>

            <AdUnit format="auto" className="ad-in-article" />

            <aside
              style={{
                margin: "32px 0",
                padding: "20px 24px",
                borderRadius: 12,
                background: "rgba(16, 124, 16, 0.06)",
                border: "1px solid rgba(16, 124, 16, 0.24)",
                borderLeft: "4px solid #107C10",
              }}
            >
              <h3 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "1.05rem", marginTop: 0 }}>
                <Lightbulb size={18} color="#107C10" /> What to do
              </h3>
              <p style={{ margin: 0, lineHeight: 1.6 }}>{entry.action}</p>
            </aside>

            {/* In-context product CTA — only shown if the term has a
                mapped product, so generic-term pages don't push a
                non-sequitur product. */}
            {product && (
              <aside
                style={{
                  margin: "32px 0",
                  padding: "24px",
                  borderRadius: 12,
                  background: "var(--syn-surface, #ffffff)",
                  border: "1px solid var(--syn-border, #e5e7eb)",
                }}
              >
                <span className="eyebrow">
                  <Tag size={12} style={{ display: "inline", marginRight: 6 }} />
                  Save the weekend
                </span>
                <h3 className="title-2" style={{ marginTop: 8 }}>{product.title}</h3>
                <p className="section-sub" style={{ marginBottom: 16 }}>{product.tagline}</p>
                <Link to={`/store/${product.slug}`} className="btn btn-primary">
                  See the {product.priceSuffix ? `${product.priceSuffix.replace("/", " / ")}` : `$${product.price}`} kit
                  <ArrowRight size={14} />
                </Link>
              </aside>
            )}
          </div>

          {/* Cyber-insurance CTA at the bottom of every glossary entry —
              all of these terms are insurance-adjacent. Drives the rail
              that pays $300-$2k per bound policy. */}
          <CyberInsuranceCTA slug={`glossary/${entry.slug}`} />

          <AdUnit format="auto" className="ad-in-article" />

          {/* Related glossary terms — multi-pageview engine. Each click
              is another AdSense impression set on a high-CPM keyword. */}
          {relatedEntries.length > 0 && (
            <section style={{ marginTop: 40, paddingTop: 32, borderTop: "1px solid var(--syn-border, #e5e7eb)" }}>
              <h2 className="title-2" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <BookOpen size={20} color="#0F6CBD" /> Related terms
              </h2>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: "1rem",
                  marginTop: 16,
                }}
              >
                {relatedEntries.map((rel) => (
                  <Link
                    key={rel.slug}
                    to={`/glossary/${rel.slug}`}
                    className="glossary-card"
                  >
                    <h3 className="glossary-card__term" style={{ fontSize: "1.05rem" }}>{rel.term}</h3>
                    <p className="glossary-card__short" style={{ fontSize: "0.9rem" }}>{rel.short}</p>
                    <span className="glossary-card__cta">
                      Read more <ArrowRight size={14} />
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </article>
    </main>
  );
}
