import { useEffect, useState } from "react";
import { Star, ExternalLink } from "lucide-react";

// Live Google Business Profile reviews block. Pulls from /api/reviews
// (server-side Place Details proxy). When the backend isn't configured
// (GOOGLE_PLACES_API_KEY / GOOGLE_PLACE_ID missing) the component
// renders nothing — no fake placeholder, no broken-card flash.
//
// Caches aggressively at the edge (6h fresh, 24h SWR) so this is one
// fetch per region per 6h, not per pageview.

function Stars({ rating }) {
  const full = Math.round(rating || 0);
  return (
    <span className="reviews-stars" aria-label={`${rating} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={14}
          fill={n <= full ? "#F7B500" : "transparent"}
          stroke={n <= full ? "#F7B500" : "var(--border-strong)"}
          strokeWidth={1.5}
        />
      ))}
    </span>
  );
}

export default function GoogleReviews() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | unconfigured | error

  useEffect(() => {
    let cancelled = false;
    fetch("/api/reviews", { headers: { Accept: "application/json" } })
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (cancelled) return;
        if (r.status === 503 && body?.configured === false) {
          setStatus("unconfigured");
          return;
        }
        if (!r.ok || !body?.ok) {
          setStatus("error");
          return;
        }
        setData(body);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => { cancelled = true; };
  }, []);

  if (status !== "ready" || !data) return null;
  if (!data.reviews?.length) return null;

  return (
    <section className="reviews-section" aria-labelledby="google-reviews-title">
      <div className="container">
        <div className="reviews-head">
          <span className="eyebrow">What clients say</span>
          <h2 id="google-reviews-title" className="title-1">
            <Stars rating={data.rating} />
            <span className="reviews-rating-num">{Number(data.rating).toFixed(1)}</span>
            <span className="reviews-rating-suffix">on Google · {data.total} reviews</span>
          </h2>
          {data.profileUrl && (
            <a
              href={data.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="reviews-profile-link"
            >
              See all reviews on Google <ExternalLink size={12} />
            </a>
          )}
        </div>
        <div className="reviews-grid">
          {data.reviews.slice(0, 6).map((rev) => (
            <article key={`${rev.author}-${rev.time}`} className="review-card">
              <header className="review-card-head">
                {rev.authorPhoto && (
                  <img
                    src={rev.authorPhoto}
                    alt=""
                    className="review-avatar"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                )}
                <div className="review-meta">
                  <strong>{rev.author}</strong>
                  <Stars rating={rev.rating} />
                  <span className="review-time">{rev.relative}</span>
                </div>
              </header>
              <p className="review-text">{rev.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
