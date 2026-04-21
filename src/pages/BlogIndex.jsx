import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { posts } from "../data/posts";
import { useSEO } from "../lib/seo";
import BlogCover from "../components/BlogCover";
import AdUnit from "../components/AdSense";

const PAGE_SIZE = 12;

const CATEGORIES = ["All", "Cybersecurity", "AI & Productivity", "Cloud", "Compliance", "Privacy", "Business Tech", "Industry News"];

export default function BlogIndex() {
  const [active, setActive] = useState("All");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // Reset visible count when the user switches category so "Load more"
  // starts fresh rather than leaking state from the previous filter. Using
  // the "prev value during render" pattern from the React 19 docs — lets
  // us react to prop changes without a layout-effect round trip.
  const [prevActive, setPrevActive] = useState(active);
  if (prevActive !== active) {
    setPrevActive(active);
    setVisibleCount(PAGE_SIZE);
  }

  const sorted = useMemo(() => [...posts].sort((a, b) => b.date.localeCompare(a.date)), []);
  const filtered = active === "All" ? sorted : sorted.filter((p) => p.category === active);
  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

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
            {visible.flatMap((p, i) => {
              const card = (
                <article key={p.slug} className="blog-card">
                  <Link to={`/blog/${p.slug}`} className="blog-card-img" aria-label={p.title}>
                    <BlogCover post={p} variant="card" />
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
              );
              // In-feed ad unit after every 6th card (1-indexed). Google's
              // fluid/in-feed format renders as a native-looking card so it
              // doesn't disrupt the grid visually.
              return (i + 1) % 6 === 0 && i < visible.length - 1
                ? [card, <AdUnit key={`ad-feed-${i}`} format="fluid" className="ad-in-feed" />]
                : [card];
            })}
          </div>
          {filtered.length === 0 && <p className="blog-empty">No posts in this category yet.</p>}
          {hasMore && (
            <div className="blog-load-more">
              <button
                type="button"
                className="btn btn-secondary btn-lg"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              >
                Load more posts ({filtered.length - visibleCount} more)
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
