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

export function useSEO({ title, description, canonical, image, post, breadcrumbs }) {
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
  }, [title, description, canonical, image, post, breadcrumbs]);
}

export { SITE_URL, SITE_NAME };
