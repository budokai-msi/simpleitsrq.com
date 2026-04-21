import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import postsMeta from "../data/posts-meta.json";
import BlogCover from "./BlogCover";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RECENCY_WINDOW_DAYS = 90;

// Score every post in `pool` relative to `current`:
//   +3 per shared tag, +2 same category, +1 if within 90 days,
//   -10 for self (belt-and-suspenders — we also filter by slug).
// Ties break by date descending so the freshest of equal-relevance wins.
function scoreRelated(current, pool) {
  const currentTags = new Set(current.tags || []);
  const currentCategory = current.category || null;
  const currentTime = current.date ? Date.parse(current.date) : NaN;

  return pool.map((p) => {
    let score = 0;
    if (p.slug === current.slug) score -= 10;
    const pTags = p.tags || [];
    for (const t of pTags) {
      if (currentTags.has(t)) score += 3;
    }
    if (currentCategory && p.category === currentCategory) score += 2;
    if (!Number.isNaN(currentTime) && p.date) {
      const diff = Math.abs(Date.parse(p.date) - currentTime);
      if (!Number.isNaN(diff) && diff <= RECENCY_WINDOW_DAYS * MS_PER_DAY) {
        score += 1;
      }
    }
    return { post: p, score };
  });
}

function pickRelated(current, pool, limit) {
  const hasSignal = (current.tags && current.tags.length > 0) || Boolean(current.category);
  const others = pool.filter((p) => p.slug !== current.slug);

  // No tags + no category → can't rank meaningfully. Fall back to recency.
  if (!hasSignal) {
    return [...others]
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, limit);
  }

  return scoreRelated(current, others)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.post.date || "").localeCompare(a.post.date || "");
    })
    .slice(0, limit)
    .map((r) => r.post);
}

export default function RelatedPosts({ currentSlug, limit = 3 }) {
  const related = useMemo(() => {
    const current = postsMeta.find((p) => p.slug === currentSlug);
    if (!current) return [];
    return pickRelated(current, postsMeta, limit);
  }, [currentSlug, limit]);

  if (related.length === 0) return null;

  const headingId = "related-posts-heading";

  return (
    <section
      className="section section-alt"
      aria-labelledby={headingId}
    >
      <div className="container">
        <h2 id={headingId} className="title-2">Keep reading</h2>
        <div className="blog-grid">
          {related.map((p) => (
            <article key={p.slug} className="blog-card">
              <Link
                to={`/blog/${p.slug}`}
                className="blog-card-img"
                aria-label={`Read: ${p.title}`}
              >
                <BlogCover post={p} variant="card" />
              </Link>
              <div className="blog-card-body">
                <span className="blog-card-category">{p.category}</span>
                <h3 className="blog-card-title">
                  <Link to={`/blog/${p.slug}`}>{p.title}</Link>
                </h3>
                <p
                  className="blog-card-excerpt"
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {p.excerpt}
                </p>
                <div className="blog-card-meta">
                  <time dateTime={p.date}>
                    {p.date
                      ? new Date(p.date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : ""}
                  </time>
                  <Link
                    to={`/blog/${p.slug}`}
                    className="blog-card-readmore"
                    aria-label={`Read: ${p.title}`}
                  >
                    Read post <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
