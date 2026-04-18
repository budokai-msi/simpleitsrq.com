import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Lock, Server, Cloud, FileCheck, Shield, Briefcase, Star } from "lucide-react";
import { posts } from "../data/posts";
import { useSEO } from "../lib/seo";
import { postImageUrl } from "../lib/postImage";

const CATEGORIES = ["All", "Cybersecurity", "AI & Productivity", "Cloud", "Compliance", "Privacy", "Business Tech", "Industry News"];

function CategoryIcon({ category }) {
  const map = {
    "Cybersecurity": Lock,
    "AI & Productivity": Server,
    "Cloud": Cloud,
    "Compliance": FileCheck,
    "Privacy": Shield,
    "Business Tech": Briefcase,
    "Industry News": Star,
  };
  const Icon = map[category] || Briefcase;
  return <Icon size={28} />;
}

export default function BlogIndex() {
  const [active, setActive] = useState("All");
  const sorted = useMemo(() => [...posts].sort((a, b) => b.date.localeCompare(a.date)), []);
  const filtered = active === "All" ? sorted : sorted.filter((p) => p.category === active);

  useSEO({
    title: "Blog | Simple IT SRQ - Insights for Sarasota and Bradenton Businesses",
    description: "Plain-English takes on cybersecurity, AI, cloud, and compliance for Sarasota and Bradenton businesses. Updated weekly by Simple IT SRQ.",
    canonical: "https://simpleitsrq.com/blog",
    image: "https://simpleitsrq.com/og-image.png",
    breadcrumbs: [
      { name: "Home", url: "https://simpleitsrq.com/" },
      { name: "Blog", url: "https://simpleitsrq.com/blog" },
    ],
  });

  return (
    <main id="main">
      <section className="section blog-hero">
        <div className="container">
          <span className="eyebrow">Simple IT SRQ Blog</span>
          <h1 className="display">Insights for Sarasota and Bradenton Businesses</h1>
          <p className="lede">
            Cybersecurity, AI, cloud, and compliance stories rewritten for SRQ business owners.
            Updated every business day.
          </p>
        </div>
      </section>
      <section className="section section-alt">
        <div className="container">
          <div className="blog-filters" role="tablist" aria-label="Categories">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                role="tab"
                aria-selected={active === cat}
                className={`blog-filter ${active === cat ? "is-active" : ""}`}
                onClick={() => setActive(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="blog-grid">
            {filtered.map((p) => (
              <article key={p.slug} className="blog-card">
                <Link to={`/blog/${p.slug}`} className="blog-card-img" aria-label={p.title}>
                  <img
                    src={postImageUrl(p, { width: 800, height: 450 })}
                    alt={p.heroAlt || ""}
                    loading="lazy"
                    decoding="async"
                    width="800"
                    height="450"
                  />
                  <div className="blog-card-img-badge" aria-hidden="true"><CategoryIcon category={p.category} /></div>
                </Link>
                <div className="blog-card-body">
                  <span className="blog-card-category">{p.category}</span>
                  <h3 className="blog-card-title"><Link to={`/blog/${p.slug}`}>{p.title}</Link></h3>
                  <p className="blog-card-excerpt">{p.excerpt}</p>
                  <div className="blog-card-meta">
                    <time dateTime={p.date}>{new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</time>
                    <Link to={`/blog/${p.slug}`} className="blog-card-readmore">Read more <ArrowRight size={14} /></Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {filtered.length === 0 && <p className="blog-empty">No posts in this category yet.</p>}
        </div>
      </section>
    </main>
  );
}
