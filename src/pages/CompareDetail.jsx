import { useEffect, useMemo } from "react";
import { useParams, Navigate } from "react-router-dom";
import { Link } from "../lib/Link";
import { Check, X, ArrowRight, ExternalLink, ArrowLeft } from "lucide-react";
import { useSEO, SITE_URL } from "../lib/seo";
import { getComparison, COMPARISONS } from "../data/comparisons";
import { STACK, resolveStackLink } from "../data/stack";
import { resolveAffiliate } from "../data/affiliates";
import { trackAffiliateClick } from "../lib/trackClick";
import AffiliateDisclosure from "../components/AffiliateDisclosure";
import CyberInsuranceCTA from "../components/CyberInsuranceCTA";

// Resolve the outbound link for one side of a comparison. Preference order:
//   1. product.stackToolId → resolveStackLink (picks up affiliateKey set on
//      the stack tool; falls back to the tool's fallbackUrl).
//   2. product.affiliateKey → resolveAffiliate directly.
//   3. product.fallbackUrl → plain vendor homepage.
// Returns { href, isAffiliate, label }.
function resolveProductLink(product) {
  if (product.stackToolId) {
    for (const cat of STACK) {
      const tool = cat.tools.find((t) => t.id === product.stackToolId);
      if (tool) {
        const link = resolveStackLink(tool);
        if (link.href) return link;
        break;
      }
    }
  }
  if (product.affiliateKey) {
    const aff = resolveAffiliate(product.affiliateKey);
    if (aff?.href) {
      return { href: aff.href, isAffiliate: true, label: aff.label };
    }
  }
  return { href: product.fallbackUrl, isAffiliate: false, label: product.name };
}

function ProductHeroCard({ product, slug, side }) {
  const link = resolveProductLink(product);
  const onClick = () => {
    if (!link.isAffiliate || !link.href) return;
    trackAffiliateClick({
      slug: `compare/${slug}`,
      destination: link.href,
      label: product.name,
      network: link.label,
    });
  };
  return (
    <div className={`compare-vs-card compare-vs-card--${side}`}>
      <div className="compare-vs-card__side" aria-hidden="true">
        {side === "a" ? "Option A" : "Option B"}
      </div>
      <h2 className="compare-vs-card__name">{product.name}</h2>
      <p className="compare-vs-card__price">{product.priceHint}</p>
      <p className="compare-vs-card__best-for">
        <strong>Best for:</strong> {product.bestFor}
      </p>
      {link.href ? (
        <a
          href={link.href}
          target="_blank"
          rel={link.isAffiliate ? "sponsored noopener noreferrer" : "noopener noreferrer"}
          className="btn btn-primary compare-vs-card__cta"
          onClick={onClick}
        >
          {link.isAffiliate ? "Check price — " : "Visit — "}
          {product.name}
          <ExternalLink size={14} />
        </a>
      ) : null}
      {link.isAffiliate && (
        <span className="compare-vs-card__aff-tag">Referral link</span>
      )}
    </div>
  );
}

function ProsConsColumn({ product }) {
  return (
    <div className="compare-proscons__col">
      <h3 className="compare-proscons__heading">{product.name}</h3>
      <div className="compare-proscons__group">
        <h4 className="compare-proscons__label compare-proscons__label--pros">Pros</h4>
        <ul className="compare-proscons__list compare-proscons__list--pros">
          {product.pros.map((p, i) => (
            <li key={i}>
              <Check size={16} aria-hidden="true" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="compare-proscons__group">
        <h4 className="compare-proscons__label compare-proscons__label--cons">Cons</h4>
        <ul className="compare-proscons__list compare-proscons__list--cons">
          {product.cons.map((c, i) => (
            <li key={i}>
              <X size={16} aria-hidden="true" />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function CompareDetail() {
  const { slug } = useParams();
  const comparison = useMemo(() => getComparison(slug), [slug]);

  // Per-product Product JSON-LD — two separate blobs so Google understands
  // these are two products being compared, not a single comparison article.
  // Injected/cleaned up imperatively because useSEO only owns its standard
  // slot IDs.
  useEffect(() => {
    if (!comparison) return;
    const injected = [];
    comparison.products.forEach((product, idx) => {
      const link = resolveProductLink(product);
      const id = `jsonld-compare-product-${idx}`;
      let s = document.getElementById(id);
      if (!s) {
        s = document.createElement("script");
        s.type = "application/ld+json";
        s.id = id;
        document.head.appendChild(s);
      }
      const data = {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.name,
        description: product.bestFor,
        url: link.href || `${SITE_URL}/compare/${comparison.slug}`,
        brand: { "@type": "Brand", name: String(product.name || "").split(" ")[0] || product.name },
        offers: {
          "@type": "Offer",
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
          url: link.href || `${SITE_URL}/compare/${comparison.slug}`,
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: product.priceHint,
            priceCurrency: "USD",
          },
        },
      };
      s.textContent = JSON.stringify(data);
      injected.push(id);
    });
    return () => {
      injected.forEach((id) => document.getElementById(id)?.remove());
    };
  }, [comparison]);

  useSEO(
    comparison
      ? {
          title: comparison.title,
          description: comparison.metaDescription,
          canonical: `${SITE_URL}/compare/${comparison.slug}`,
          image: `${SITE_URL}/og-image.png`,
          breadcrumbs: [
            { name: "Home", url: `${SITE_URL}/` },
            { name: "Compare", url: `${SITE_URL}/compare` },
            { name: comparison.h1, url: `${SITE_URL}/compare/${comparison.slug}` },
          ],
        }
      : {},
  );

  if (!comparison) return <Navigate to="/" replace />;

  const [a, b] = comparison.products;
  const related = (comparison.relatedComparisons || [])
    .map((relSlug) => COMPARISONS.find((c) => c.slug === relSlug))
    .filter(Boolean);

  return (
    <main id="main" className="compare-detail">
      <section className="section">
        <div className="container" style={{ maxWidth: 960 }}>
          <Link to="/compare" className="compare-back">
            <ArrowLeft size={14} /> All comparisons
          </Link>
          <span className="eyebrow">Head-to-head</span>
          <h1 className="display compare-h1">{comparison.h1}</h1>
          <p className="lede">{comparison.subhead}</p>
          <p className="compare-meta">Last reviewed: {comparison.date}</p>
        </div>
      </section>

      {/* VS hero — two product cards with a "VS" divider between them. */}
      <section className="section section-alt">
        <div className="container" style={{ maxWidth: 1040 }}>
          <div className="compare-vs">
            <ProductHeroCard product={a} slug={comparison.slug} side="a" />
            <div className="compare-vs__divider" aria-hidden="true">
              <span>VS</span>
            </div>
            <ProductHeroCard product={b} slug={comparison.slug} side="b" />
          </div>
          <div className="compare-disclosure">
            <AffiliateDisclosure variant="affiliate" />
          </div>
        </div>
      </section>

      {/* Side-by-side attribute table. Collapses to stacked key-value pairs
          on narrow viewports so a phone reader still gets the data. */}
      <section className="section">
        <div className="container" style={{ maxWidth: 960 }}>
          <div className="section-head">
            <span className="eyebrow">Side-by-side</span>
            <h2 className="title-1">Feature comparison</h2>
            <p className="section-sub">
              Only rows we could verify from vendor documentation or field
              experience. Omitted rather than guessed.
            </p>
          </div>
          <div className="compare-table-wrap">
            <table className="compare-table">
              <thead>
                <tr>
                  <th scope="col" className="compare-table__label-col">Attribute</th>
                  <th scope="col">{a.name}</th>
                  <th scope="col">{b.name}</th>
                </tr>
              </thead>
              <tbody>
                {comparison.attributes.map((row) => (
                  <tr key={row.label}>
                    <th scope="row" className="compare-table__label">{row.label}</th>
                    <td data-col-label={a.name}>{row.values[0]}</td>
                    <td data-col-label={b.name}>{row.values[1]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Pros / cons in two columns. */}
      <section className="section section-alt">
        <div className="container" style={{ maxWidth: 1040 }}>
          <div className="section-head">
            <span className="eyebrow">What we like and don't</span>
            <h2 className="title-1">Pros and cons</h2>
          </div>
          <div className="compare-proscons">
            <ProsConsColumn product={a} />
            <ProsConsColumn product={b} />
          </div>
        </div>
      </section>

      {/* Verdict */}
      <section className="section">
        <div className="container" style={{ maxWidth: 780 }}>
          <div className="compare-verdict">
            <span className="eyebrow">Our verdict</span>
            <h2 className="title-2 compare-verdict__heading">So which one?</h2>
            <p className="compare-verdict__body">{comparison.verdict}</p>
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="section section-alt">
          <div className="container" style={{ maxWidth: 960 }}>
            <div className="section-head">
              <span className="eyebrow">Related comparisons</span>
              <h2 className="title-2">Keep evaluating</h2>
            </div>
            <div className="compare-related-grid">
              {related.map((rc) => (
                <Link key={rc.slug} to={`/compare/${rc.slug}`} className="compare-related-card">
                  <strong>{rc.h1}</strong>
                  <p>{rc.subhead}</p>
                  <span className="compare-related-card__cta">
                    Read comparison <ArrowRight size={14} />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="container" style={{ maxWidth: 780 }}>
          <CyberInsuranceCTA slug={`compare/${comparison.slug}`} />
        </div>
      </section>
    </main>
  );
}
