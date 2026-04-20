// Fetches approved testimonials from /api/contact?testimonials=1 and
// renders a "What clients say" section. If no approved entries exist,
// the component returns null — no fake quotes, no placeholder copy,
// no "coming soon" dead state. The section simply doesn't exist until
// real client testimonials are added via the admin panel.

import { useEffect, useState } from "react";
import { Star, Quote } from "lucide-react";

export default function Testimonials({ productSlug = null, title = "What clients say", subtitle = null }) {
  const [items, setItems] = useState(null);

  useEffect(() => {
    const qs = productSlug ? `testimonials=1&product=${encodeURIComponent(productSlug)}` : "testimonials=1";
    fetch(`/api/contact?${qs}`, { credentials: "same-origin" })
      .then((r) => r.ok ? r.json() : { testimonials: [] })
      .then((d) => setItems(Array.isArray(d?.testimonials) ? d.testimonials : []))
      .catch(() => setItems([]));
  }, [productSlug]);

  // Render nothing at all while loading or when empty. The section
  // never renders without real content.
  if (!items || items.length === 0) return null;

  return (
    <section className="section testimonials-section" aria-labelledby="testimonials-title">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">Client voice</span>
          <h2 id="testimonials-title" className="title-1">{title}</h2>
          {subtitle && <p className="section-sub">{subtitle}</p>}
        </div>
        <div className="testimonials-grid">
          {items.map((t) => (
            <figure key={t.id} className="testimonial-card">
              <Quote size={22} className="testimonial-quote-icon" />
              <blockquote>{t.quote}</blockquote>
              <figcaption>
                <strong>{t.authorName}</strong>
                {t.authorRole && <span className="testimonial-role"> · {t.authorRole}</span>}
                {t.authorCompany && <div className="testimonial-company">{t.authorCompany}{t.city ? ` — ${t.city}` : ""}</div>}
                {t.rating != null && (
                  <div className="testimonial-rating" aria-label={`${t.rating} out of 5 stars`}>
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star
                        key={i}
                        size={14}
                        fill={i < t.rating ? "#F7630C" : "none"}
                        stroke={i < t.rating ? "#F7630C" : "#9ca3af"}
                      />
                    ))}
                  </div>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
