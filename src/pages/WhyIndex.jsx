import { Link } from "../lib/Link";
import { ArrowRight } from "lucide-react";
import { useSEO, SITE_URL } from "../lib/seo";
import { WHY_VS_LIST } from "../data/why-vs";

export default function WhyIndex() {
  useSEO({
    title: "Why Simple IT SRQ | Sarasota IT Support",
    description:
      "Compare Simple IT SRQ with Tampa MSPs, Geek Squad, and regional IT options for Sarasota and Bradenton businesses choosing local support.",
    canonical: `${SITE_URL}/why`,
    image: `${SITE_URL}/og-image.png`,
    breadcrumbs: [
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Why Simple IT SRQ", url: `${SITE_URL}/why` },
    ],
  });

  return (
    <main id="main" className="why-index">
      <section className="section hero hero-clean">
        <div className="container" style={{ maxWidth: 820 }}>
          <span className="eyebrow">Why Simple IT SRQ</span>
          <h1 className="display">Pick the model that matches the risk you actually carry.</h1>
          <p className="lede">
            Side-by-side comparisons against the alternatives Sarasota and
            Bradenton buyers are actually weighing — written to be defensible
            in a sales call, not to score on a marketing scorecard.
          </p>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container" style={{ maxWidth: 980 }}>
          <div className="compare-index__grid">
            {WHY_VS_LIST.map((w) => (
              <Link key={w.slug} to={`/why/${w.slug}`} className="compare-index__card">
                <span className="eyebrow">{w.eyebrow}</span>
                <h2 className="compare-index__card-title">{w.h1}</h2>
                <p className="compare-index__card-sub">{w.subhead.split(". ")[0]}.</p>
                <span className="compare-index__card-cta">
                  Read comparison <ArrowRight size={14} />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
