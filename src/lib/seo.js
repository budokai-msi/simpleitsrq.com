import { useEffect } from "react";

const SITE_URL = "https://simpleitsrq.com";
const SITE_NAME = "Simple IT SRQ";

function setMetaTag(name, content, attr = "name") {
  if (typeof document === "undefined") return;
  let el = document.head.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(url) {
  if (typeof document === "undefined") return;
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.href = url;
}

function injectJsonLd(id, data) {
  if (typeof document === "undefined") return;
  let s = document.getElementById(id);
  if (!s) {
    s = document.createElement("script");
    s.type = "application/ld+json";
    s.id = id;
    document.head.appendChild(s);
  }
  s.textContent = JSON.stringify(data);
}

function removeJsonLd(id) {
  if (typeof document === "undefined") return;
  const s = document.getElementById(id);
  if (s) s.remove();
}

// Organization schema — identifies the business as a named entity Google
// can link to logo, social profiles, and sameAs references. Lives on the
// site root (Home) so knowledge-panel candidates can pick it up once.
export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    email: "hello@simpleitsrq.com",
    telephone: "+1-407-242-1456",
    areaServed: { "@type": "State", name: "Florida" },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "hello@simpleitsrq.com",
      telephone: "+1-407-242-1456",
      availableLanguage: "English",
    },
  };
}

// LocalBusiness schema for a specific city. Telephone omitted intentionally
// on per-city pages — Google treats a shared 407 number spread across
// multiple LocalBusiness entries as a weak signal; the Organization schema
// on Home carries the canonical contact info instead.
export function localBusinessSchema({ slug, city, description }) {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${SITE_URL}/${slug}#business`,
    name: `${SITE_NAME} — ${city}`,
    image: `${SITE_URL}/logo.png`,
    url: `${SITE_URL}/${slug}`,
    email: "hello@simpleitsrq.com",
    address: {
      "@type": "PostalAddress",
      addressLocality: city,
      addressRegion: "FL",
      addressCountry: "US",
    },
    areaServed: city,
    priceRange: "$$",
    description,
    openingHours: "Mo-Fr 08:00-18:00",
  };
}

export function faqSchema(faqs) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function blogPostingSchema(post) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.metaDescription,
    datePublished: post.date,
    dateModified: post.date,
    author: { "@type": "Person", name: post.author },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/logo.png` },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${SITE_URL}/blog/${post.slug}`,
    },
    url: `${SITE_URL}/blog/${post.slug}`,
    keywords: (post.tags || []).join(", "),
    articleSection: post.category,
    image: `${SITE_URL}/og-blog-${post.slug}.png`,
  };
}

export function breadcrumbSchema(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

export function useSEO({
  title, description, canonical, image,
  post, breadcrumbs, products,
  organization, localBusiness, faqs,
}) {
  useEffect(() => {
    if (title) document.title = title;
    if (description) {
      setMetaTag("description", description);
      setMetaTag("og:description", description, "property");
      setMetaTag("twitter:description", description);
    }
    if (title) {
      setMetaTag("og:title", title, "property");
      setMetaTag("twitter:title", title);
    }
    if (canonical) {
      setCanonical(canonical);
      setMetaTag("og:url", canonical, "property");
    }
    if (image) {
      setMetaTag("og:image", image, "property");
      setMetaTag("twitter:image", image);
    }
    if (post) {
      injectJsonLd("jsonld-post", blogPostingSchema(post));
    } else {
      removeJsonLd("jsonld-post");
    }
    if (breadcrumbs && breadcrumbs.length) {
      injectJsonLd("jsonld-breadcrumb", breadcrumbSchema(breadcrumbs));
    } else {
      removeJsonLd("jsonld-breadcrumb");
    }
    if (products && products.length) {
      injectJsonLd("jsonld-products", productListSchema(products));
    } else {
      removeJsonLd("jsonld-products");
    }
    if (organization) {
      injectJsonLd("jsonld-organization", organizationSchema());
    } else {
      removeJsonLd("jsonld-organization");
    }
    if (localBusiness) {
      injectJsonLd("jsonld-localbusiness", localBusinessSchema(localBusiness));
    } else {
      removeJsonLd("jsonld-localbusiness");
    }
    if (faqs && faqs.length) {
      injectJsonLd("jsonld-faq", faqSchema(faqs));
    } else {
      removeJsonLd("jsonld-faq");
    }
  }, [title, description, canonical, image, post, breadcrumbs, products, organization, localBusiness, faqs]);
}

// Build an ItemList of Product+Offer entries for a /store-style page. Google
// uses this for "Merchant listings" rich results and for product knowledge
// panel enrichment. Only include products that have a real buyLink or that
// we explicitly mark as coming soon — hiding draft products keeps us out of
// Merchant Center disapproval.
export function productListSchema(products) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: products.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Product",
        name: p.title,
        description: p.description || p.tagline,
        brand: { "@type": "Brand", name: SITE_NAME },
        image: `${SITE_URL}/og-image.png`,
        url: `${SITE_URL}/store#${p.slug}`,
        offers: {
          "@type": "Offer",
          price: String(p.price),
          priceCurrency: "USD",
          availability: p.buyLink
            ? "https://schema.org/InStock"
            : "https://schema.org/PreOrder",
          url: p.buyLink || `${SITE_URL}/store`,
          seller: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
        },
      },
    })),
  };
}

export { SITE_URL, SITE_NAME };
