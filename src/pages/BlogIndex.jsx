import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Link } from "../lib/Link";
import { ArrowRight } from "lucide-react";
import posts from "../data/posts-meta.json";
import { useSEO } from "../lib/seo";
import BlogCover from "../components/BlogCover";
import BlogSearch from "../components/BlogSearch";
import EmptyState from "../components/EmptyState";
import AdUnit from "../components/AdSense";
import { ADSENSE_SLOTS } from "../lib/adsenseSlots";

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
  // "Load more" starts fresh. Intentional setState in effect — this is
  // the classic "derived reset" pattern that the lint plugin can't
  // distinguish from a cascading-render bug.
  // eslint-disable-next-line react-hooks/set-state-in-effect
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
        <div className="container blog-hero__inner">
          <div className="blog-hero__copy">
            <span className="eyebrow">Simple IT SRQ Blog</span>
            <h1 className="display">Insights for Sarasota and Bradenton Businesses</h1>
            <p className="lede">
              Cybersecurity, AI, cloud, and compliance stories rewritten for SRQ business owners.
              Updated every business day.
            </p>
          </div>
          <div className="blog-hero__art" aria-hidden="true">
            <svg viewBox="0 0 280 220" width="280" height="220">
              <defs>
                <linearGradient id="bh-card" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#FFFFFF" />
                  <stop offset="1" stopColor="#f3f4f6" />
                </linearGradient>
                <linearGradient id="bh-blue" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#111827" />
                  <stop offset="1" stopColor="#000000" />
                </linearGradient>
                <radialGradient id="bh-glow" cx="0.5" cy="0.5" r="0.6">
                  <stop offset="0" stopColor="#6b7280" stopOpacity="0.30" />
                  <stop offset="1" stopColor="#6b7280" stopOpacity="0" />
                </radialGradient>
              </defs>
              <rect x="0" y="0" width="280" height="220" fill="url(#bh-glow)" />
              {/* Back card */}
              <g transform="translate(48 28) rotate(-6 90 60)">
                <rect width="180" height="120" rx="10" fill="#f3f4f6" stroke="#111827" strokeOpacity="0.20" />
                <rect x="16" y="16" width="60" height="6" rx="3" fill="#111827" opacity="0.30" />
                <rect x="16" y="32" width="148" height="5" rx="2.5" fill="#111827" opacity="0.18" />
                <rect x="16" y="44" width="120" height="5" rx="2.5" fill="#111827" opacity="0.18" />
                <rect x="16" y="60" width="60" height="24" rx="4" fill="#111827" opacity="0.10" />
              </g>
              {/* Middle card */}
              <g transform="translate(58 50) rotate(2 90 60)">
                <rect width="180" height="120" rx="10" fill="url(#bh-card)" stroke="#111827" strokeOpacity="0.30" />
                <rect x="16" y="16" width="40" height="6" rx="3" fill="#374151" />
                <rect x="16" y="32" width="148" height="5" rx="2.5" fill="#111827" opacity="0.30" />
                <rect x="16" y="44" width="100" height="5" rx="2.5" fill="#111827" opacity="0.30" />
                <rect x="16" y="68" width="148" height="4" rx="2" fill="#111827" opacity="0.18" />
                <rect x="16" y="78" width="130" height="4" rx="2" fill="#111827" opacity="0.18" />
                <rect x="16" y="88" width="110" height="4" rx="2" fill="#111827" opacity="0.18" />
              </g>
              {/* Front card */}
              <g transform="translate(70 70) rotate(8 90 60)">
                <rect width="180" height="120" rx="10" fill="url(#bh-blue)" />
                <rect x="0" y="0" width="180" height="120" rx="10" fill="#FFFFFF" opacity="0.04" />
                <rect x="16" y="16" width="50" height="6" rx="3" fill="#9ca3af" />
                <rect x="16" y="32" width="148" height="6" rx="3" fill="#FFFFFF" opacity="0.85" />
                <rect x="16" y="46" width="120" height="6" rx="3" fill="#FFFFFF" opacity="0.85" />
                <rect x="16" y="74" width="148" height="3" rx="1.5" fill="#FFFFFF" opacity="0.40" />
                <rect x="16" y="82" width="130" height="3" rx="1.5" fill="#FFFFFF" opacity="0.40" />
                <rect x="16" y="90" width="110" height="3" rx="1.5" fill="#FFFFFF" opacity="0.40" />
                <circle cx="160" cy="100" r="4" fill="#9ca3af" />
              </g>
            </svg>
          </div>
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
                ? [card, <AdUnit key={`ad-feed-${i}`} slot={ADSENSE_SLOTS.inFeed} format="fluid" className="ad-in-feed" />]
                : [card];
            })}
          </div>
          {filtered.length === 0 && (
            <EmptyState
              icon={committedQuery ? "search" : "inbox"}
              title={committedQuery ? `No posts match “${committedQuery}”` : "No posts in this category yet"}
              body={committedQuery ? "Try different keywords or clear the filter to see every recent post." : "Check back tomorrow — we publish every business day."}
            />
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
