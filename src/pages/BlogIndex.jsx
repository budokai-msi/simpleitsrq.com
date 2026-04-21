import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import posts from "../data/posts-meta.json";
import { useSEO } from "../lib/seo";
import BlogCover from "../components/BlogCover";
import BlogSearch from "../components/BlogSearch";
import AdUnit from "../components/AdSense";

const PAGE_SIZE = 12;

const CATEGORIES = ["All", "Cybersecurity", "AI & Productivity", "Cloud", "Compliance", "Privacy", "Business Tech", "Industry News"];

export default function BlogIndex() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const [active, setActive] = useState("All");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // `searchResults` is the post list after BlogSearch has applied its
  // title/tag/description match. When the query is empty, BlogSearch
  // returns the original sorted array untouched, so the rest of the
  // pipeline behaves identically to before.
  const sorted = useMemo(() => [...posts].sort((a, b) => b.date.localeCompare(a.date)), []);
  const [searchResults, setSearchResults] = useState(sorted);
  const [committedQuery, setCommittedQuery] = useState(initialQuery);

  // Category filter and search compose as an intersection: pick the
  // category first, then keep the search's relevance ordering among
  // those that remain. Because the search list is already deduped
  // against `posts` we can filter it in place.
  const filtered = useMemo(() => {
    if (active === "All") return searchResults;
    return searchResults.filter((p) => p.category === active);
  }, [active, searchResults]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  // Reset pagination whenever category OR search query changes so
  // "Load more" starts fresh.
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [active, committedQuery]);

  // Keep ?q=... in sync with the committed search query. We use replace
  // (not push) to avoid polluting the browser history on every debounced
  // keystroke — the back button should escape the blog, not walk back
  // through 20 query states.
  const handleQueryChange = useCallback((q) => {
    setCommittedQuery(q);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (q) next.set("q", q);
        else next.delete("q");
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  const handleFilter = useCallback((next) => { setSearchResults(next); }, []);

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
          <BlogSearch
            posts={sorted}
            initialQuery={initialQuery}
            onFilter={handleFilter}
            onQueryChange={handleQueryChange}
          />
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
          {filtered.length === 0 && (
            <p className="blog-empty">
              {committedQuery
                ? `No posts match "${committedQuery}". Try different keywords.`
                : "No posts in this category yet."}
            </p>
          )}
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
