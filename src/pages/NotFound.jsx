import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Link } from "../lib/Link";
import { ArrowLeft, Search, BookOpen, Shield, MapPin, Calendar, FileText, Calculator } from "lucide-react";
import { useSEO } from "../lib/seo";

// Curated destinations shown on the 404 page. Mirrors what's in the
// primary nav + lead-magnet surfaces so a visitor who hits a bad URL
// still has a clear path forward instead of dead-ending at "Back to
// home." Every link below resolves to a real, indexed route.
const SUGGESTIONS = [
  { to: "/exposure-scan",  Icon: Shield,     title: "Free Exposure Scan",       desc: "10-second DNS + email-auth audit on any domain you own. No signup." },
  { to: "/stack",           Icon: Calculator, title: "Vendor Stack + Calculator", desc: "Every tool we install for a new client + a monthly-cost estimator." },
  { to: "/store",           Icon: FileText,   title: "Templates & Playbooks",     desc: "HIPAA Kit, WISP, Hurricane Prep — pre-filled for Florida small offices." },
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
    // Don't index 404s — search engines should drop the broken URL
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
          {/* Header — short, honest, no over-apology. Shows the path
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
              }}>{pathname}</code>{" "}
              — typo, dead link, or moved page. Pick a working destination below.
            </p>
            <div className="hero-ctas" style={{ justifyContent: "center", marginTop: 24 }}>
              <Link to="/" className="btn btn-primary btn-lg">
                <ArrowLeft size={16} /> Back to home
              </Link>
              <Link to="/blog" className="btn btn-secondary btn-lg">
                Read the blog
              </Link>
            </div>
          </div>

          {/* Suggestions grid — every link goes somewhere real and useful.
              Replaces the previous home/blog-only dead end. */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 14,
            marginTop: 8,
          }}>
            {SUGGESTIONS.map(({ to, Icon, title, desc }) => (
              <Link
                key={to}
                to={to}
                style={{
                  display: "block",
                  padding: "18px 20px",
                  borderRadius: 12,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text-1)",
                  textDecoration: "none",
                  transition: "border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease",
                }}
                className="notfound-card"
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <Icon size={18} color="var(--brand)" aria-hidden="true" />
                  <strong style={{ fontSize: 15 }}>{title}</strong>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-2)", lineHeight: 1.5 }}>
                  {desc}
                </p>
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
      <style>{`
        .notfound-card:hover {
          transform: translateY(-2px);
          border-color: var(--brand);
          box-shadow: 0 8px 24px rgba(15, 108, 189, 0.10);
        }
      `}</style>
    </main>
  );
}
