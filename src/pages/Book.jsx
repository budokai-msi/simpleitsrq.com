import { useEffect, useRef } from "react";
import { Calendar, Clock, Video, ShieldCheck, Check, Mail } from "lucide-react";
import { useSEO } from "../lib/seo";

// Full Cal.com path, e.g. "simpleitsrq/free-consultation".
// Set via Vercel env var VITE_CALCOM_CAL_LINK. If unset, the page falls back
// to a "booking coming soon" placeholder with a direct email CTA.
const CAL_LINK = import.meta.env.VITE_CALCOM_CAL_LINK || "";
const CAL_EMBED_SRC = "https://app.cal.com/embed/embed.js";

/**
 * Loads Cal.com's embed script once and renders an inline calendar into
 * the container. Uses the vanilla embed API (no npm dep) to stay consistent
 * with how Turnstile is integrated.
 */
function useCalcomInline(calLink) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!calLink || !containerRef.current) return;
    let cancelled = false;

    const loadScript = () =>
      new Promise((resolve, reject) => {
        if (window.Cal) return resolve();
        const existing = document.querySelector(`script[data-calcom="1"]`);
        if (existing) {
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", reject, { once: true });
          return;
        }
        const s = document.createElement("script");
        s.src = CAL_EMBED_SRC;
        s.async = true;
        s.defer = true;
        s.dataset.calcom = "1";
        s.onload = () => resolve();
        s.onerror = reject;
        document.head.appendChild(s);
      });

    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.Cal) return;
        try {
          window.Cal("init", { origin: "https://cal.com" });
          window.Cal("inline", {
            elementOrSelector: containerRef.current,
            calLink,
            layout: "month_view",
          });
          window.Cal("ui", {
            hideEventTypeDetails: false,
            layout: "month_view",
            theme: "auto",
            cssVarsPerTheme: {
              light: { "cal-brand": "#0F6CBD" },
              dark: { "cal-brand": "#4CC2FF" },
            },
          });
        } catch (err) {
          console.warn("[cal.com] inline init failed", err);
        }
      })
      .catch((err) => {
        console.warn("[cal.com] script failed to load", err);
      });

    return () => {
      cancelled = true;
    };
  }, [calLink]);

  return containerRef;
}

function BookingEmbed({ calLink }) {
  const containerRef = useCalcomInline(calLink);
  return (
    <div
      ref={containerRef}
      className="cal-inline"
      style={{ width: "100%", minHeight: "720px", overflow: "hidden" }}
      aria-label="Booking calendar"
    />
  );
}

function BookingPlaceholder() {
  return (
    <div className="form-shell" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
      <Calendar size={40} color="#0F6CBD" style={{ marginBottom: "0.75rem" }} />
      <h3 className="title-2" style={{ marginTop: 0 }}>Online booking launching soon</h3>
      <p className="section-sub" style={{ maxWidth: "42ch", margin: "0.5rem auto 1.5rem" }}>
        While we finish wiring up self-service scheduling, the fastest way to get a free IT consultation is to email us directly. We'll reply within one business hour.
      </p>
      <a href="mailto:hello@simpleitsrq.com?subject=Free%20IT%20Consultation" className="btn btn-primary btn-lg">
        <Mail size={16} /> Email hello@simpleitsrq.com
      </a>
    </div>
  );
}

export default function Book() {
  useSEO({
    title: "Book a Free IT Consultation | Simple IT SRQ",
    description:
      "Schedule a free 30-minute IT consultation with a local engineer in Sarasota or Bradenton. Google Meet, Zoom, or Microsoft Teams. Reschedule anytime.",
    canonical: "https://simpleitsrq.com/book",
    image: "https://simpleitsrq.com/og-image.png",
    breadcrumbs: [
      { name: "Home", url: "https://simpleitsrq.com/" },
      { name: "Book", url: "https://simpleitsrq.com/book" },
    ],
  });

  const bullets = [
    { Icon: Clock, text: "30 minutes, no obligation" },
    { Icon: Video, text: "Google Meet, Zoom, or Microsoft Teams" },
    { Icon: ShieldCheck, text: "Covered by an NDA on request" },
    { Icon: Check, text: "Same-day confirmation" },
  ];

  return (
    <main id="main">
      <section className="section" aria-labelledby="book-title">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Book a Free Consultation</span>
            <h1 id="book-title" className="title-1">Talk to a local engineer</h1>
            <p className="section-sub">
              Pick a time that works for you. We will meet on Google Meet, Zoom, or Microsoft Teams - whichever your team prefers. You will get a calendar invite automatically on any device: Android, iPhone, Google Workspace, or Microsoft 365.
            </p>
          </div>
          <ul
            className="feature-list"
            style={{ display: "flex", flexWrap: "wrap", gap: "1rem 2rem", justifyContent: "center", margin: "0 0 2rem", padding: 0, listStyle: "none" }}
            aria-label="What to expect"
          >
            {bullets.map((item) => (
              <li key={item.text} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <item.Icon size={18} color="#0F6CBD" /> {item.text}
              </li>
            ))}
          </ul>

          {CAL_LINK ? <BookingEmbed calLink={CAL_LINK} /> : <BookingPlaceholder />}
        </div>
      </section>
    </main>
  );
}
