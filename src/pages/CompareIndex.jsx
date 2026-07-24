import { Link } from "../lib/Link";
import { ArrowRight, ShieldCheck, Wrench } from "lucide-react";
import { useSEO, SITE_URL } from "../lib/seo";
import { COMPARISONS } from "../data/comparisons";
import { WHY_VS_LIST } from "../data/why-vs";

export default function CompareIndex() {
  useSEO({
    title: "IT Tool & Vendor Comparisons for Florida Businesses | Simple IT SRQ",
    description:
      "Head-to-head comparisons of password managers, cloud office suites, backup tools, and managed IT service models for Sarasota-Bradenton businesses.",
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
          <span className="eyebrow">Defensible Comparisons</span>
          <h1 className="display">Compare software tools & IT support models</h1>
          <p className="lede">
            Whether you are evaluating business software stack renewals or deciding between managed IT, internal hiring, and retail repair, we resolve the options for Sarasota and Bradenton businesses without marketing fluff.
          </p>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container" style={{ maxWidth: 1040 }}>
          <div style={{ marginBottom: 32 }}>
            <h2 className="title-2" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <ShieldCheck size={22} color="var(--brand)" /> Managed IT & Service Model Comparisons
            </h2>
            <p className="subtext">
              How Simple IT SRQ stacks up against common Florida IT delivery models.
            </p>
          </div>
          <div className="compare-index__grid" style={{ marginBottom: 48 }}>
            {WHY_VS_LIST.map((w) => (
              <Link key={w.slug} to={`/compare/${w.slug}`} className="compare-index__card">
                <span className="eyebrow">{w.eyebrow}</span>
                <h3 className="compare-index__card-title">{w.h1}</h3>
                <p className="compare-index__card-sub">{w.subhead.split(". ")[0]}.</p>
                <span className="compare-index__card-cta">
                  Read comparison <ArrowRight size={14} />
                </span>
              </Link>
            ))}
          </div>

          <div style={{ marginBottom: 32 }}>
            <h2 className="title-2" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Wrench size={22} color="var(--brand)" /> Software & Tool Head-to-Head
            </h2>
            <p className="subtext">
              Direct comparisons for 2026 security compliance, adoption, and pricing.
            </p>
          </div>
          <div className="compare-index__grid">
            {COMPARISONS.map((c) => (
              <Link key={c.slug} to={`/compare/${c.slug}`} className="compare-index__card">
                <h3 className="compare-index__card-title">{c.h1}</h3>
                <p className="compare-index__card-sub">{c.subhead}</p>
                <span className="compare-index__card-cta">
                  Read tool breakdown <ArrowRight size={14} />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

