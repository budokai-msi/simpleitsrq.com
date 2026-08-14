import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Link } from "../lib/Link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import posts from "../data/posts-meta.json";
import { useSEO } from "../lib/seo";
import BlogCover from "../components/BlogCover";
import BlogSearch from "../components/BlogSearch";
import EmptyState from "../components/EmptyState";
import AdUnit from "../components/AdSense";
import { ADSENSE_SLOTS } from "../lib/adsenseSlots";

const PAGE_SIZE = 12;
const CATEGORIES = ["All", "Cybersecurity", "AI & Productivity", "Cloud", "Privacy", "Business Tech", "Industry News"];

function paginationItems(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = Array.from(new Set([1, total, current - 1, current, current + 1]))
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b);
  const items = [];
  pages.forEach((page, index) => {
    if (index && page - pages[index - 1] > 1) items.push(`gap-${page}`);
    items.push(page);
  });
  return items;
}

export default function BlogIndex() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const initialPage = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const [active, setActive] = useState("All");
  const sorted = useMemo(() => [...posts].sort((a, b) => b.date.localeCompare(a.date)), []);
  const [searchResults, setSearchResults] = useState(sorted);
  const [committedQuery, setCommittedQuery] = useState(initialQuery);
  const [page, setPage] = useState(initialPage);

  const filtered = useMemo(
    () => active === "All" ? searchResults : searchResults.filter((post) => post.category === active),
    [active, searchResults],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  const setPageState = useCallback((nextPage, { scroll = true } = {}) => {
    const normalized = Math.max(1, Number(nextPage) || 1);
    setPage(normalized);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (normalized > 1) next.set("page", String(normalized));
      else next.delete("page");
      return next;
    }, { replace: true });
    if (scroll && typeof window !== "undefined") {
      window.requestAnimationFrame(() => document.querySelector(".blog-grid")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }, [setSearchParams]);

  const handleQueryChange = useCallback((query) => {
    setCommittedQuery(query);
    setPage(1);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (query) next.set("q", query);
      else next.delete("q");
      next.delete("page");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const handleFilter = useCallback((results) => {
    setSearchResults(results);
    setPage(1);
  }, []);

  const selectCategory = (category) => {
    setActive(category);
    setPageState(1, { scroll: false });
  };

  useSEO({
    title: "Practical IT Notes for Local Businesses | Simple IT SRQ",
    description: "Source-backed notes on security, hardware, networking, cloud services and business technology, with practical context for Sarasota and Bradenton organizations.",
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
            <span className="eyebrow">Field notes & analysis</span>
            <h1 className="display">Technology news is only useful when it changes what you do.</h1>
            <p className="lede">We read the original source, link back to it, and add the practical IT context that is easy to miss in a headline. The goal is a useful answer: what happened, what it means, and whether you need to do anything about it.</p>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <BlogSearch posts={sorted} initialQuery={initialQuery} onFilter={handleFilter} onQueryChange={handleQueryChange} />

          <div className="blog-filters" role="tablist" aria-label="Categories">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                role="tab"
                aria-selected={active === category}
                className={`blog-filter ${active === category ? "is-active" : ""}`}
                onClick={() => selectCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>

          <div className="blog-grid">
            {visible.flatMap((post, index) => {
              const card = (
                <article key={post.slug} className="blog-card">
                  <Link to={`/blog/${post.slug}`} className="blog-card-img" aria-label={post.title}>
                    <BlogCover post={post} variant="card" />
                  </Link>
                  <div className="blog-card-body">
                    <span className="blog-card-category">{post.category}</span>
                    <h3 className="blog-card-title"><Link to={`/blog/${post.slug}`}>{post.title}</Link></h3>
                    <p className="blog-card-excerpt">{post.excerpt}</p>
                    <div className="blog-card-meta">
                      <time dateTime={post.date}>{new Date(post.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</time>
                      <Link to={`/blog/${post.slug}`} className="blog-card-readmore">Read analysis <ArrowRight size={14} /></Link>
                    </div>
                  </div>
                </article>
              );
              return (index + 1) % 6 === 0 && index < visible.length - 1
                ? [card, <AdUnit key={`ad-${safePage}-${index}`} slot={ADSENSE_SLOTS.inFeed} format="fluid" className="ad-in-feed" />]
                : [card];
            })}
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={committedQuery ? "search" : "inbox"}
              title={committedQuery ? `No posts match “${committedQuery}”` : "No posts in this category yet"}
              body="Try another search or check back for the next source-backed analysis."
            />
          ) : null}

          {filtered.length > PAGE_SIZE ? (
            <nav className="blog-pagination" aria-label="Blog pagination">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={safePage <= 1}
                onClick={() => setPageState(safePage - 1)}
              >
                <ChevronLeft size={16} /> Previous
              </button>
              <div className="blog-pagination__pages" aria-label={`Page ${safePage} of ${pageCount}`}>
                {paginationItems(safePage, pageCount).map((item) => typeof item === "number" ? (
                  <button
                    type="button"
                    key={item}
                    className={`blog-page-btn${item === safePage ? " is-active" : ""}`}
                    aria-current={item === safePage ? "page" : undefined}
                    aria-label={`Go to page ${item}`}
                    onClick={() => setPageState(item)}
                  >
                    {item}
                  </button>
                ) : (
                  <span key={item} className="blog-page-btn" aria-hidden="true">…</span>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={safePage >= pageCount}
                onClick={() => setPageState(safePage + 1)}
              >
                Next <ChevronRight size={16} />
              </button>
              <span className="blog-pagination__status">{filtered.length} articles · page {safePage} of {pageCount}</span>
            </nav>
          ) : null}

          <section className="blog-convert-cta">
            <div>
              <span className="eyebrow">Need help with something you read?</span>
              <h2 className="title-2">We can help turn the advice into a plan.</h2>
              <p>For computer repair, network problems, Microsoft 365 issues, or ongoing business IT support in Sarasota and Bradenton, tell us what is happening.</p>
            </div>
            <div className="blog-convert-cta__actions">
              <Link to="/services" className="btn btn-primary btn-lg">See IT services <ArrowRight size={16} /></Link>
              <Link to="/leadgen" className="btn btn-secondary btn-lg">Explore Leadgen <ArrowRight size={16} /></Link>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}