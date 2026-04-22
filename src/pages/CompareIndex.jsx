import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useSEO, SITE_URL } from "../lib/seo";
import { COMPARISONS } from "../data/comparisons";

export default function CompareIndex() {
  useSEO({
    title: "Head-to-Head: Tool vs Tool Comparisons for Florida SMBs | Simple IT SRQ",
    description:
      "Vendor-vs-vendor comparisons for the tools a Sarasota-Bradenton small office actually has to choose between — password managers, productivity suites, backup, payroll, and more.",
    canonical: `${SITE_URL}/compare`,
    image: `${SITE_URL}/og-image.png`,
    breadcrumbs: [
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Compare", url: `${SITE_URL}/compare` },
    ],
  });

  return (
    <main id="main" className="compare-index">
      <section className="section">
        <div className="container" style={{ maxWidth: 860 }}>
          <span className="eyebrow">Head-to-head</span>
          <h1 className="display">Tool vs tool, picked for Florida SMBs</h1>
          <p className="lede">
            The buying decisions a small Sarasota-Bradenton office has to make,
            resolved against the 2026 cyber-insurance questionnaire and actual
            staff-adoption data from our client base. No affiliate pick that
            doesn't match the right answer.
          </p>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container" style={{ maxWidth: 960 }}>
          <div className="compare-index__grid">
            {COMPARISONS.map((c) => (
              <Link key={c.slug} to={`/compare/${c.slug}`} className="compare-index__card">
                <h2 className="compare-index__card-title">{c.h1}</h2>
                <p className="compare-index__card-sub">{c.subhead}</p>
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
