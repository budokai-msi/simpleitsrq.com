import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Link } from "../lib/Link";
import { ArrowLeft, Search, BookOpen, Shield, MapPin, Calendar, Wrench, Calculator } from "lucide-react";
import { useSEO } from "../lib/seo";

// Curated destinations shown on the 404 page. Mirrors what's in the
// primary nav + lead-magnet surfaces so a visitor who hits a bad URL
// still has a clear path forward instead of dead-ending at "Back to
// home." Every link below resolves to a real, indexed route.
const SUGGESTIONS = [
  { to: "/exposure-scan",  Icon: Shield,     title: "Free Exposure Scan",       desc: "10-second DNS + email-auth audit on any domain you own. No signup." },
  { to: "/stack",           Icon: Calculator, title: "Vendor Stack + Calculator", desc: "Every tool we install for a new client + a monthly-cost estimator." },
    { to: "/services",        Icon: Wrench,     title: "Fixed-Fee IT Services",     desc: "Computer repair, WiFi, network setup, cameras, backups, and office moves." },
  { to: "/glossary",        Icon: BookOpen,   title: "Plain-English Glossary",    desc: "25+ cybersecurity + compliance terms defined in 30 seconds each." },
  { to: "/service-area",    Icon: MapPin,     title: "Service Area",              desc: "City-by-city coverage across Sarasota and Manatee counties." },
  { to: "/book",            Icon: Calendar,   title: "Book a Free Consult",       desc: "30-min call with a Sarasota engineer. No obligation." },
];

export default function NotFound() {
  const { pathname } = useLocation();

  useSEO({
    title: "Page not found | Simple IT SRQ",
    description: "The page you were looking for does not exist. Try the home page, the blog, or contact Simple IT SRQ directly.",
    canonical: "https://simpleitsrq.com/404",
    image: "https://simpleitsrq.com/og-image.png",
    // Don't index 404s - search engines should drop the broken URL
    // they followed instead of caching a "Page not found" entry.
    robots: "noindex, nofollow",
    breadcrumbs: [
      { name: "Home", url: "https://simpleitsrq.com/" },
      { name: "Not found", url: "https://simpleitsrq.com/404" },
    ],
  });

  // Hint to crawlers and pre-render tooling that this is a 404 response.
  useEffect(() => {
    if (typeof document !== "undefined") {
      let meta = document.head.querySelector('meta[name="prerender-status-code"]');
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", "prerender-status-code");
        document.head.appendChild(meta);
      }
      meta.setAttribute("content", "404");
      return () => meta.remove();
    }
  }, []);

  return (
    <main id="main">
      <section className="section">
        <div className="container" style={{ maxWidth: 920 }}>
          {/* Header - short, honest, no over-apology. Shows the path
              they actually requested so they can spot a typo immediately. */}
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 88, height: 88, borderRadius: 18,
              background: "var(--brand-subtle)",
              color: "var(--brand)",
              marginBottom: 20,
            }}>
              <Search size={42} aria-hidden="true" />
            </div>
            <span className="eyebrow">404 · Page not found</span>
            <h1 className="display" style={{ fontSize: "clamp(28px, 5vw, 44px)", marginTop: 8 }}>
              That page doesn't exist
            </h1>
            <p className="lede" style={{ maxWidth: 560, margin: "12px auto 0" }}>
              You requested{" "}
              <code style={{
                background: "var(--surface-2)", padding: "2px 8px", borderRadius: 6,
                fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.85em",
              }}>{pathname}</code>{" "} - typo, dead link, or moved page. Pick a working destination below.
            </p>
            <div className="hero-ctas" style={{ justifyContent: "center", marginTop: 24 }}>
              <Link to="/" className="btn btn-primary btn-lg">
                <ArrowLeft size={16} /> Back to home
              </Link>
              <Link to="/blog" className="btn btn btn-lg">
                Read the blog
              </Link>
            </div>
          </div>

          {/* Suggestions grid - every link goes somewhere real and useful.
              Replaces the previous home/blog-only dead end. */}
          <div className="grid gap-3.5 mt-2 sm:grid-cols-2 lg:grid-cols-3">
            {SUGGESTIONS.map(({ to, Icon, title, desc }) => (
              <Link
                key={to}
                to={to}
                className="card card-border bg-base-100 no-underline hover:border-primary"
              >
                <div className="card-body">
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <Icon size={18} className="text-primary" aria-hidden="true" />
                    <strong className="text-sm">{title}</strong>
                  </div>
                  <p className="m-0 text-xs text-base-content/70 leading-relaxed">
                    {desc}
                  </p>
                </div>
              </Link>
            ))}
          </div>

          <p style={{ marginTop: 36, textAlign: "center", color: "var(--text-2)", fontSize: 14 }}>
            Still stuck? Email{" "}
            <a href="mailto:hello@simpleitsrq.com" style={{ color: "var(--brand)" }}>
              hello@simpleitsrq.com
            </a>{" "}
            and we'll point you the right way within the business day.
          </p>
        </div>
      </section>
    </main>
  );
}
