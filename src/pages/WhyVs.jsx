import { useParams, Navigate } from "react-router-dom";
import { Link } from "../lib/Link";
import { ArrowRight, ArrowLeft, Check, MapPin } from "lucide-react";
import { useSEO, SITE_URL } from "../lib/seo";
import { getWhyVs, WHY_VS_LIST } from "../data/why-vs";

export default function WhyVs() {
  const { slug } = useParams();
  const data = getWhyVs(slug);

  useSEO(
    data
      ? {
          title: data.title,
          description: data.metaDescription,
          canonical: `${SITE_URL}/why/${data.slug}`,
          image: `${SITE_URL}/og-image.png`,
          breadcrumbs: [
            { name: "Home", url: `${SITE_URL}/` },
            { name: "Why Simple IT SRQ", url: `${SITE_URL}/why` },
            { name: data.competitor, url: `${SITE_URL}/why/${data.slug}` },
          ],
        }
      : { title: "Not found | Simple IT SRQ" },
  );

  if (!data) return <Navigate to="/why" replace />;

  const others = WHY_VS_LIST.filter((w) => w.slug !== data.slug);

  return (
    <main id="main" className="why-vs">
      <section className="section hero hero-clean">
        <div className="container" style={{ maxWidth: 880 }}>
          <Link to="/why" className="why-vs__back">
            <ArrowLeft size={14} /> All comparisons
          </Link>
          <span className="eyebrow">{data.eyebrow}</span>
          <h1 className="display">{data.h1}</h1>
          <p className="lede">{data.subhead}</p>
          <div className="hero-ctas">
            <Link to={data.cta.primaryHref} className="btn btn-primary btn-lg">
              {data.cta.primary} <ArrowRight size={16} />
            </Link>
            <Link to={data.cta.secondaryHref} className="btn btn-secondary btn-lg">
              {data.cta.secondary}
            </Link>
          </div>
          <div className="services-trust-row" style={{ marginTop: 18 }}>
            <span><MapPin size={14} /> Sarasota / Bradenton dispatch</span>
            <span><Check size={14} /> Flat monthly contract · named engineers</span>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container" style={{ maxWidth: 1080 }}>
          <h2 className="title-1" style={{ marginBottom: 18 }}>
            Side-by-side
          </h2>
          <div className="why-vs__table-wrap">
            <table className="why-vs__table">
              <thead>
                <tr>
                  <th scope="col" className="why-vs__th-attr">Attribute</th>
                  <th scope="col" className="why-vs__th-sirq">Simple IT SRQ</th>
                  <th scope="col" className="why-vs__th-them">{data.competitor}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.attribute}>
                    <th scope="row" className="why-vs__row-attr">{r.attribute}</th>
                    <td className="why-vs__cell-sirq">{r.sirq}</td>
                    <td className="why-vs__cell-them">{r.them}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container" style={{ maxWidth: 760 }}>
          <h2 className="title-2">{data.closer.h2}</h2>
          <p className="lede" style={{ marginTop: 12 }}>{data.closer.body}</p>
          <div className="hero-ctas" style={{ marginTop: 24 }}>
            <Link to={data.cta.primaryHref} className="btn btn-primary btn-lg">
              {data.cta.primary} <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {others.length > 0 && (
        <section className="section section-alt">
          <div className="container" style={{ maxWidth: 880 }}>
            <h2 className="title-2" style={{ marginBottom: 14 }}>Other comparisons</h2>
            <div className="why-vs__related">
              {others.map((o) => (
                <Link key={o.slug} to={`/why/${o.slug}`} className="why-vs__related-card">
                  <span className="eyebrow">{o.eyebrow}</span>
                  <span className="why-vs__related-h1">{o.h1}</span>
                  <span className="why-vs__related-cta">
                    Read comparison <ArrowRight size={14} />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
