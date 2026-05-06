#!/usr/bin/env node
// Per-post static stub generator. Runs after `vite build`.
//
// Vite emits a single dist/index.html (SPA shell) whose canonical, title,
// og:*, and twitter:* tags describe the homepage. When Googlebot or the
// AdSense reviewer fetches /blog/<slug> with JS disabled they see those
// homepage tags — every blog URL appears to be a duplicate of "/".
//
// This script clones dist/index.html for every post in content/posts and
// patches:
//   - <title>
//   - <meta name="description">
//   - <link rel="canonical">
//   - <meta property="og:url" / og:title / og:description / og:image / og:type>
//   - <meta property="article:published_time" / article:author>
//   - <meta name="twitter:title" / twitter:description / twitter:image>
//   - injects an <article> JSON-LD block
//
// Then writes the result to BOTH dist/blog/<slug>.html (for trailingSlash:false
// routing) AND dist/blog/<slug>/index.html (defensive — works regardless of
// host config). The React SPA hydrates on top, so client-side navigation,
// nonces, and runtime behavior are unchanged.
//
// Static file serving on Vercel takes precedence over the SPA rewrite, so
// crawlers that don't run JS get fully-resolved metadata while real users
// still get the same hydrated React experience.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllPosts } from "./_posts-source.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const SHELL = path.join(DIST, "index.html");
const SITE_URL = "https://simpleitsrq.com";

const escAttr = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const escText = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function patchHead(shell, post) {
  const url = `${SITE_URL}/blog/${post.slug}`;
  const title = post.title || "Simple IT SRQ";
  const description =
    post.metaDescription ||
    post.excerpt ||
    "IT support, cybersecurity, and cloud services for Sarasota & Bradenton businesses.";
  const ogImage = post.heroImage
    ? (String(post.heroImage).startsWith("http")
        ? post.heroImage
        : `${SITE_URL}${post.heroImage}`)
    : `${SITE_URL}/og-blog-${post.slug}.png`;
  // og:image fallback chain: per-post heroImage → /og-blog-<slug>.png → /og-image.png.
  // Crawlers don't follow 404s back to a fallback, so we point at the
  // expected per-post asset; missing OG images are a separate audit.

  let html = shell;

  // <title>
  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escText(title)} | Simple IT SRQ</title>`,
  );

  // meta name=description
  html = html.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${escAttr(description)}" />`,
  );

  // canonical
  html = html.replace(
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${url}" />`,
  );

  // og:type → article (default shell is "website")
  html = html.replace(
    /<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:type" content="article" />`,
  );
  html = html.replace(
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${url}" />`,
  );
  html = html.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${escAttr(title)}" />`,
  );
  html = html.replace(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${escAttr(description)}" />`,
  );
  html = html.replace(
    /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:image" content="${escAttr(ogImage)}" />`,
  );

  // twitter:*
  html = html.replace(
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/,
    `<meta name="twitter:title" content="${escAttr(title)}" />`,
  );
  html = html.replace(
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/,
    `<meta name="twitter:description" content="${escAttr(description)}" />`,
  );
  html = html.replace(
    /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/,
    `<meta name="twitter:image" content="${escAttr(ogImage)}" />`,
  );

  // article:* — inject before </head> (no-op if already present in shell)
  const articleMeta = [
    post.date ? `<meta property="article:published_time" content="${escAttr(post.date)}" />` : null,
    post.updatedDate ? `<meta property="article:modified_time" content="${escAttr(post.updatedDate)}" />` : null,
    post.author ? `<meta property="article:author" content="${escAttr(post.author)}" />` : null,
    post.category ? `<meta property="article:section" content="${escAttr(post.category)}" />` : null,
  ].filter(Boolean).join("\n    ");

  // JSON-LD Article — minimal, valid Schema.org for blog posts
  const ld = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description,
    url,
    datePublished: post.date || undefined,
    dateModified: post.updatedDate || post.date || undefined,
    image: ogImage,
    author: {
      "@type": "Organization",
      name: post.author || "Simple IT SRQ",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "Simple IT SRQ",
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/favicon-192x192.png`,
      },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  };
  // Trim undefined to keep the JSON small + valid
  for (const k of Object.keys(ld)) if (ld[k] === undefined) delete ld[k];
  const ldScript = `<script type="application/ld+json">${JSON.stringify(ld)}</script>`;

  html = html.replace(
    /<\/head>/,
    `    ${articleMeta}\n    ${ldScript}\n  </head>`,
  );

  return html;
}

function main() {
  if (!fs.existsSync(SHELL)) {
    console.error(`generate-blog-stubs: ${SHELL} missing — run 'vite build' first.`);
    process.exit(1);
  }
  const shell = fs.readFileSync(SHELL, "utf8");
  const posts = loadAllPosts();
  let written = 0;
  let skipped = 0;

  for (const post of posts) {
    if (!post.slug || !post.title) {
      skipped++;
      continue;
    }
    const html = patchHead(shell, post);

    const flatPath = path.join(DIST, "blog", `${post.slug}.html`);
    const dirPath = path.join(DIST, "blog", post.slug, "index.html");
    fs.mkdirSync(path.dirname(flatPath), { recursive: true });
    fs.mkdirSync(path.dirname(dirPath), { recursive: true });
    fs.writeFileSync(flatPath, html, "utf8");
    fs.writeFileSync(dirPath, html, "utf8");
    written++;
  }

  console.log(`generate-blog-stubs: wrote ${written} posts (skipped ${skipped} without slug/title)`);
}

main();
