import { useEffect, useMemo, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { Link } from "../lib/Link";
import { Check, ShieldCheck, RefreshCw, ArrowRight, BookOpen, ArrowLeft, FileText, Calendar } from "lucide-react";
import { products } from "../data/products";
import { useSEO, SITE_URL } from "../lib/seo";
import { useAsyncEffect } from "../lib/useAsyncEffect";
import Testimonials from "../components/Testimonials";
import { csrfFetch } from "../lib/csrf";
import { track } from "../lib/analytics";

// Minimal markdown renderer — handles the subset we actually use in our
// product preview .md files: ## h2, ### h3, bold **text**, italic *text*,
// links [label](url), inline `code`, blockquote >, ordered + unordered
// lists, tables with |header|---|---|, and horizontal-rule ---.
// Intentionally no external dependency; < 100 lines, deterministic.
function renderInline(text, key = 0) {
  if (!text) return null;
  const parts = [];
  let remaining = text;
  let idx = 0;
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/;
  const boldRe = /\*\*([^*]+)\*\*/;
  const italRe = /(?<!\*)\*([^*]+)\*(?!\*)/;
  const codeRe = /`([^`]+)`/;
  while (remaining.length) {
    const lm = linkRe.exec(remaining);
    const bm = boldRe.exec(remaining);
    const im = italRe.exec(remaining);
    const cm = codeRe.exec(remaining);
    let nextIdx = Infinity;
    let which = null;
    if (lm && lm.index < nextIdx) { nextIdx = lm.index; which = "link"; }
    if (bm && bm.index < nextIdx) { nextIdx = bm.index; which = "bold"; }
    if (im && im.index < nextIdx) { nextIdx = im.index; which = "ital"; }
    if (cm && cm.index < nextIdx) { nextIdx = cm.index; which = "code"; }
    if (which == null) { parts.push(remaining); break; }
    if (nextIdx > 0) parts.push(remaining.slice(0, nextIdx));
    if (which === "link") {
      const [full, label, url] = lm;
      parts.push(url.startsWith("/")
        ? <Link key={`${key}-l-${idx++}`} to={url}>{label}</Link>
        : <a key={`${key}-l-${idx++}`} href={url} target="_blank" rel="noopener noreferrer">{label}</a>);
      remaining = remaining.slice(nextIdx + full.length);
    } else if (which === "bold") {
      parts.push(<strong key={`${key}-b-${idx++}`}>{bm[1]}</strong>);
      remaining = remaining.slice(nextIdx + bm[0].length);
    } else if (which === "ital") {
      parts.push(<em key={`${key}-i-${idx++}`}>{im[1]}</em>);
      remaining = remaining.slice(nextIdx + im[0].length);
    } else {
      parts.push(<code key={`${key}-c-${idx++}`}>{cm[1]}</code>);
      remaining = remaining.slice(nextIdx + cm[0].length);
    }
  }
  return parts;
}

function renderTable(lines, key) {
  const rows = lines.map((l) =>
    String(l || "").split("|").slice(1, -1).map((c) => c.trim()),
  );
  if (rows.length < 2) return null;
  const header = rows[0];
  const body = rows.slice(2); // skip separator row
  return (
    <div className="markdown-table-wrap" key={key}>
      <table className="markdown-table">
        <thead><tr>{header.map((h, i) => <th key={i}>{renderInline(h, `${key}-h-${i}`)}</th>)}</tr></thead>
        <tbody>
          {body.map((row, r) => (
            <tr key={r}>{row.map((c, i) => <td key={i}>{renderInline(c, `${key}-${r}-${i}`)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderMarkdown(md) {
  if (!md || typeof md !== "string") return [];
  const lines = md.split("\n");
  const out = [];
  let i = 0, key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith("# ")) { out.push(<h1 key={key++}>{renderInline(line.slice(2), key)}</h1>); i++; continue; }
    if (line.startsWith("## ")) { out.push(<h2 key={key++}>{renderInline(line.slice(3), key)}</h2>); i++; continue; }
    if (line.startsWith("### ")) { out.push(<h3 key={key++}>{renderInline(line.slice(4), key)}</h3>); i++; continue; }
    if (line.startsWith("---")) { out.push(<hr key={key++} />); i++; continue; }
    if (line.startsWith("> ")) {
      const quote = [];
      while (i < lines.length && lines[i].startsWith("> ")) { quote.push(lines[i].slice(2)); i++; }
      out.push(<blockquote key={key++}>{renderInline(quote.join(" "), key)}</blockquote>);
      continue;
    }
    if (line.startsWith("|")) {
      const tbl = [];
      while (i < lines.length && lines[i].startsWith("|")) { tbl.push(lines[i]); i++; }
      out.push(renderTable(tbl, `tbl-${key++}`));
      continue;
    }
    if (/^\s*\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
        items.push(<li key={`${key}-li-${i}`}>{renderInline(lines[i].replace(/^\s*\d+\.\s/, ""), key + i)}</li>);
        i++;
      }
      out.push(<ol key={key++}>{items}</ol>);
      continue;
    }
    if (line.startsWith("- ")) {
      const items = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(<li key={`${key}-li-${i}`}>{renderInline(lines[i].slice(2), key + i)}</li>);
        i++;
      }
      out.push(<ul key={key++}>{items}</ul>);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith("#") && !lines[i].startsWith("- ") && !lines[i].startsWith("|") && !lines[i].startsWith(">") && !/^\s*\d+\.\s/.test(lines[i])) {
      para.push(lines[i]); i++;
    }
    out.push(<p key={key++}>{renderInline(para.join(" "), key)}</p>);
  }
  return out;
}

function BuyCta({ product }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const live = !!product.buyLink;

  const joinWaitlist = async (e) => {
    e.preventDefault();
    if (!email) return;
    const source = `product-detail-waitlist-${product.slug}`;
    try {
      const r = await csrfFetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name: "(product waitlist)",
          message: `Waitlist signup for: ${product.title} ($${product.price}${product.priceSuffix || ""})`,
          source,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok) {
        track.lead(source, typeof product.price === "number" ? product.price : undefined, {
          product_slug: product.slug,
          product_title: product.title,
        });
      }
      // UX intentionally shows success regardless — waitlist is low-stakes
      // and we'd rather not surface an error inline on a buy button.
      setSent(true);
    } catch { setSent(true); }
  };

  if (live) {
    return (
      <a
        href={product.buyLink}
        className="btn btn-primary btn-lg"
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track.beginCheckout({ slug: product.slug, title: product.title, price: product.price })}
      >
        Buy for ${product.price}{product.priceSuffix || ""} <ArrowRight size={16} />
      </a>
    );
  }
  if (sent) {
    return (
      <div className="store-launch-success">
        <Check size={20} color="#107C10" />
        <span>You're on the list. We'll email you the moment it's live, plus a launch discount for the first 25 buyers.</span>
      </div>
    );
  }
  return (
    <form className="product-detail-waitlist" onSubmit={joinWaitlist}>
      <input type="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email address for waitlist" />
      <button type="submit" className="btn btn-primary">Join the waitlist</button>
    </form>
  );
}

function relatedProducts(current) {
  return products
    .filter((p) => p.slug !== current.slug && !p.isBundle && p.featured !== false)
    .slice(0, 3);
}

export default function ProductDetail() {
  const { slug } = useParams();
  const product = useMemo(() => products.find((p) => p.slug === slug), [slug]);
  const [previewMd, setPreviewMd] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Schema.org Product markup — ships rich-result eligibility to Google.
  // Using offers with price + priceCurrency is the minimum for product-snippet;
  // the per-product OG card doubles as the schema image so the rich snippet
  // gets a real preview rather than the generic site logo.
  const productJsonLd = useMemo(() => {
    if (!product) return null;
    const offer = product.buyLink
      ? {
          "@type": "Offer",
          url: product.buyLink,
          priceCurrency: "USD",
          price: product.price,
          availability: "https://schema.org/InStock",
        }
      : {
          "@type": "Offer",
          priceCurrency: "USD",
          price: product.price,
          availability: "https://schema.org/PreOrder",
        };
    return {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.title,
      description: product.description,
      url: `${SITE_URL}/store/${product.slug}`,
      image: `${SITE_URL}/og-product-${product.slug}.png`,
      brand: { "@type": "Brand", name: "Simple IT SRQ" },
      offers: offer,
    };
  }, [product]);

  useSEO(product ? {
    title: `${product.title} | Simple IT SRQ Store`,
    description: product.description.slice(0, 160),
    canonical: `${SITE_URL}/store/${product.slug}`,
    image: `${SITE_URL}/og-product-${product.slug}.png`,
    breadcrumbs: [
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Store", url: `${SITE_URL}/store` },
      { name: product.title, url: `${SITE_URL}/store/${product.slug}` },
    ],
  } : {});

  useEffect(() => {
    if (!product || !productJsonLd) return;
    const id = `jsonld-product-${product.slug}`;
    let s = document.getElementById(id);
    if (!s) {
      s = document.createElement("script");
      s.type = "application/ld+json";
      s.id = id;
      document.head.appendChild(s);
    }
    s.textContent = JSON.stringify(productJsonLd);
    return () => { s?.remove(); };
  }, [product, productJsonLd]);

  useAsyncEffect(async (signal) => {
    if (!product?.previewUrl) return;
    setPreviewLoading(true);
    try {
      const r = await fetch(product.previewUrl);
      const text = r.ok ? await r.text() : null;
      if (!signal.cancelled) setPreviewMd(text);
    } catch {
      if (!signal.cancelled) setPreviewMd(null);
    } finally {
      if (!signal.cancelled) setPreviewLoading(false);
    }
  }, [product?.previewUrl]);

  if (!slug) return <Navigate to="/store" replace />;
  if (!product) return <Navigate to="/store" replace />;

  const related = relatedProducts(product);
  const live = !!product.buyLink;

  return (
    <main id="main" className="product-detail">
      <section className="section">
        <div className="container">
          <Link to="/store" className="product-detail-back"><ArrowLeft size={14} /> All products</Link>
          <div className="product-detail-hero">
            <div className="product-detail-hero-copy">
              <span className="eyebrow">{product.isBundle ? "Bundle" : product.waitlistOnly ? "Launching soon" : "Template"}</span>
              <h1 className="display">{product.title}</h1>
              <p className="lede">{product.tagline}</p>
              <p className="product-detail-desc">{product.description}</p>
              <div className="product-detail-cta">
                <div className="product-detail-price">
                  <span className="product-detail-amount">${product.price}</span>
                  <span className="product-detail-unit">{product.priceSuffix || " · one-time"}</span>
                  {product.priceNote && <p className="product-detail-pricenote">{product.priceNote}</p>}
                </div>
                <BuyCta product={product} />
              </div>
              <div className="product-detail-trust">
                <span><Check size={14} color="#107C10" /> Lifetime updates</span>
                <span><RefreshCw size={14} /> 30-day refund</span>
                <span><ShieldCheck size={14} /> Florida-specific</span>
              </div>
            </div>
            <aside className="product-detail-cover" aria-hidden="true">
              <div className="product-cover">
                <div className="product-cover-eyebrow">Simple IT SRQ</div>
                <div className="product-cover-title">{product.title}</div>
                <div className="product-cover-meta"><Calendar size={12} /> Last revision: April 2026</div>
                <div className="product-cover-fineprint">Lifetime updates included</div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Who it's for</span>
            <h2 className="title-1">{product.audience}</h2>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">What's inside</span>
            <h2 className="title-1">{product.contents.length} deliverables</h2>
          </div>
          <ul className="product-contents-grid">
            {product.contents.map((c) => (
              <li key={c}><Check size={18} color="#107C10" /> {c}</li>
            ))}
          </ul>
        </div>
      </section>

      {(previewLoading || previewMd) && (
        <section className="section section-alt">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow"><BookOpen size={14} /> Preview</span>
              <h2 className="title-1">Read the real content before you buy</h2>
              <p className="section-sub">Excerpts from the actual product. This is the tone and depth of the whole document.</p>
            </div>
            <div className="product-detail-preview">
              {previewLoading && <p style={{ opacity: 0.6 }}>Loading preview…</p>}
              {previewMd && <div className="markdown-body">{renderMarkdown(previewMd)}</div>}
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="container product-narrow product-final-cta">
          <h2 className="title-1">{live ? "Ready to buy?" : "Want to be first?"}</h2>
          <p className="product-final-sub">{live ? "One-time purchase. Lifetime updates. 30-day refund." : "Waitlist open. Founding-client pricing locked for 24 months."}</p>
          <BuyCta product={product} />
        </div>
      </section>

      {/* Per-product testimonials. Self-hides when no approved quotes exist
          for this slug — so a never-reviewed product shows nothing here
          instead of an empty placeholder. */}
      <Testimonials productSlug={product.slug} title={`Clients who bought the ${product.title}`} />

      {related.length > 0 && (
        <section className="section section-alt">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">More from the store</span>
              <h2 className="title-1">Related products</h2>
            </div>
            <div className="product-related-grid">
              {related.map((p) => (
                <Link key={p.slug} to={`/store/${p.slug}`} className="product-related-card">
                  <FileText size={18} />
                  <strong>{p.title}</strong>
                  <span className="product-related-price">${p.price}{p.priceSuffix || ""}</span>
                  <p>{p.tagline}</p>
                  <span className="product-related-cta">See details <ArrowRight size={14} /></span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
