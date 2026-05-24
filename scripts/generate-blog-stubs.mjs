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
import matter from "gray-matter";
import { loadAllPosts } from "./_posts-source.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const SHELL = path.join(DIST, "index.html");
const CONTENT_DIR = path.join(ROOT, "content", "posts");
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

const escUrl = (s) => escAttr(String(s ?? "").trim());

function affiliateLabel(token) {
  const raw = String(token || "").trim();
  const label = raw.includes("|") ? raw.split("|").pop() : raw.replace(/^[a-z_]+:/i, "");
  return label
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripMdxNoise(markdown) {
  return String(markdown || "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/<Affiliate\s+token=["']([^"']+)["']\s*\/>/gi, (_, token) => affiliateLabel(token))
    .replace(/\[\[([a-z_]+:[^\]|]+)\|([^\]]+)\]\]/gi, "$2")
    .split(/\r?\n/)
    .filter((line) => !/^\s*(import|export)\s+/.test(line))
    .filter((line) => !/^\s*<\/?[A-Z][A-Za-z0-9]*(\s[^>]*)?>\s*$/.test(line))
    .join("\n");
}

function renderInline(raw) {
  const tokens = [];
  const stash = (html) => {
    const id = tokens.length;
    tokens.push(html);
    return `@@HTML${id}@@`;
  };

  let text = String(raw || "").replace(/`([^`]+)`/g, (_, value) => {
    return stash(`<code>${escText(value)}</code>`);
  });

  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) =>
    stash(`<img src="${escUrl(url)}" alt="${escAttr(alt)}" loading="lazy" />`),
  );
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) =>
    stash(`<a href="${escUrl(url)}">${renderInline(label)}</a>`),
  );

  text = escText(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>");

  return text.replace(/@@HTML(\d+)@@/g, (_, id) => tokens[Number(id)] || "");
}

function isBlockStart(line) {
  return /^(#{1,6})\s+/.test(line)
    || /^>\s?/.test(line)
    || /^[-*]\s+/.test(line)
    || /^\d+\.\s+/.test(line)
    || /^```/.test(line);
}

function renderMarkdownBody(markdown) {
  const lines = stripMdxNoise(markdown).split(/\r?\n/);
  const html = [];

  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    const fence = trimmed.match(/^```(\w+)?/);
    if (fence) {
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        code.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      const lang = fence[1] ? ` class="language-${escAttr(fence[1])}"` : "";
      html.push(`<pre><code${lang}>${escText(code.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = Math.min(6, heading[1].length + 1);
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const parts = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        parts.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      html.push(`<blockquote><p>${renderInline(parts.join(" "))}</p></blockquote>`);
      continue;
    }

    const unordered = /^[-*]\s+/.test(trimmed);
    const ordered = /^\d+\.\s+/.test(trimmed);
    if (unordered || ordered) {
      const tag = ordered ? "ol" : "ul";
      const itemRe = ordered ? /^\d+\.\s+/ : /^[-*]\s+/;
      const items = [];
      while (i < lines.length && itemRe.test(lines[i].trim())) {
        items.push(`<li>${renderInline(lines[i].trim().replace(itemRe, ""))}</li>`);
        i++;
      }
      html.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }

    const parts = [trimmed];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i].trim())) {
      parts.push(lines[i].trim());
      i++;
    }
    html.push(`<p>${renderInline(parts.join(" "))}</p>`);
  }

  return html.join("\n");
}

function loadPostBody(post) {
  const file = path.join(CONTENT_DIR, `${post.slug}.mdx`);
  if (!fs.existsSync(file)) return "";
  const raw = fs.readFileSync(file, "utf8");
  return matter(raw).content;
}

function renderStaticArticle(post) {
  const body = renderMarkdownBody(loadPostBody(post));
  if (!body) return "";

  const date = post.date
    ? `<time datetime="${escAttr(post.date)}">${escText(post.date)}</time>`
    : "";
  const category = post.category ? `<span>${escText(post.category)}</span>` : "";
  const meta = [date, category].filter(Boolean).join("");

  return `
    <article class="static-blog-article" data-prerendered="true">
      <header>
        ${meta ? `<div class="static-blog-article__meta">${meta}</div>` : ""}
        <h1>${escText(post.title || "Simple IT SRQ")}</h1>
        ${post.excerpt ? `<p class="static-blog-article__excerpt">${escText(post.excerpt)}</p>` : ""}
      </header>
      ${body}
    </article>
  `;
}

function injectStaticArticle(html, post) {
  const article = renderStaticArticle(post);
  if (!article) return html;
  if (/<div\s+id="root"\s*><\/div>/.test(html)) {
    return html.replace(/<div\s+id="root"\s*><\/div>/, `<div id="root">${article}</div>`);
  }
  return html.replace(/<body([^>]*)>/, `<body$1>${article}`);
}

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

  return injectStaticArticle(html, post);
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

  // Sentinel for prod debug: confirms postbuild output reaches deployed dist
  fs.writeFileSync(path.join(DIST, "blog", "_sentinel.txt"), `built ${new Date().toISOString()}\n${written} posts\n`, "utf8");
}

main();
