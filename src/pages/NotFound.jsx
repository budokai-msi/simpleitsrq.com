import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Search } from "lucide-react";
import { useSEO } from "../lib/seo";

export default function NotFound() {
  useSEO({
    title: "Page not found | Simple IT SRQ",
    description: "The page you were looking for does not exist. Try the home page, the blog, or contact Simple IT SRQ directly.",
    canonical: "https://simpleitsrq.com/404",
    image: "https://simpleitsrq.com/og-image.png",
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
    <main id="main" className="blog-post-main">
      <article className="blog-post">
        <div className="container blog-post-container" style={{ textAlign: "center" }}>
          <div
            className="blog-post-hero"
            aria-hidden="true"
            style={{ height: 200, marginBottom: 32 }}
          >
            <Search size={64} />
          </div>
          <span className="eyebrow">404 - Page not found</span>
          <h1 className="blog-post-title">We could not find that page</h1>
          <p className="blog-post-lede">
            The link may be broken, or the page may have moved. Try one of the popular
            destinations below, or get in touch and we will point you in the right
            direction.
          </p>
          <div className="hero-ctas" style={{ justifyContent: "center", marginTop: 24 }}>
            <Link to="/" className="btn btn-primary btn-lg">
              <ArrowLeft size={16} /> Back to home
            </Link>
            <Link to="/blog" className="btn btn-secondary btn-lg">
              Read the blog
            </Link>
          </div>
          <p style={{ marginTop: 32, color: "#707070", fontSize: 14 }}>
            Need help right now? Email{" "}
            <a href="mailto:hello@simpleitsrq.com" style={{ color: "#0F6CBD" }}>hello@simpleitsrq.com</a>.
          </p>
        </div>
      </article>
    </main>
  );
}
