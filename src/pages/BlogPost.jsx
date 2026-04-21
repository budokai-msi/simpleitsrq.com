import { createElement, useMemo, useState, useEffect, lazy, Suspense } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { ArrowRight, Calendar, User, Tag, ArrowLeft, Lock, Server, Cloud, FileCheck, Shield, Briefcase, Star } from "lucide-react";
import postsMeta from "../data/posts-meta.json";
import { resolveAffiliate, postHasAffiliateContent } from "../data/affiliates";
import { useSEO } from "../lib/seo";
import BlogCover from "../components/BlogCover";
import LeadCaptureCTA from "../components/LeadCaptureCTA";
import Newsletter from "../components/Newsletter";
import AffiliateDisclosure from "../components/AffiliateDisclosure";
import AdUnit from "../components/AdSense";
import ToolsUsedFooter from "../components/ToolsUsedFooter";
import StoreCrossSell from "../components/StoreCrossSell";
import Affiliate from "../components/Affiliate";
import RelatedPosts from "../components/RelatedPosts";
import { trackAffiliateClick } from "../lib/trackClick";

// Lazy-loaded MDX modules. Each post ships as its own chunk so adding a
// post to content/posts/*.mdx doesn't bloat the entry bundle. The `?raw`
// variant gives us the untouched source for ToolsUsedFooter scanning and
// reading-time estimation without re-downloading the compiled module.
const mdxModules = import.meta.glob("/content/posts/*.mdx");
const mdxSources = import.meta.glob("/content/posts/*.mdx", { query: "?raw", import: "default" });

function slugToPath(slug) {
  return `/content/posts/${slug}.mdx`;
}

// Module-scope cache so React.lazy isn't re-invoked on every render. Calling
// lazy() inside a component would reset Suspense state and re-trigger the
// dynamic import every rerender — bad for state, bad for network.
const lazyBySlug = new Map();
function getLazyMdxComponent(slug) {
  if (!slug) return null;
  const loader = mdxModules[slugToPath(slug)];
  if (!loader) return null;
  if (!lazyBySlug.has(slug)) lazyBySlug.set(slug, lazy(loader));
  return lazyBySlug.get(slug);
}

// Stable binder so the `components` prop identity stays the same across
// renders for a given slug — avoids re-rendering the whole MDX subtree.
const componentsBySlug = new Map();
function getMdxComponents(slug) {
  if (!componentsBySlug.has(slug)) {
    function BoundAffiliate(props) { return <Affiliate slug={slug} {...props} />; }
    BoundAffiliate.displayName = `Affiliate(${slug})`;
    componentsBySlug.set(slug, { Affiliate: BoundAffiliate });
  }
  return componentsBySlug.get(slug);
}

function CategoryIcon({ category, size = 28 }) {
  const map = {
    "Cybersecurity": Lock,
    "AI & Productivity": Server,
    "Cloud": Cloud,
    "Compliance": FileCheck,
    "Privacy": Shield,
    "Business Tech": Briefcase,
    "Industry News": Star,
  };
  const Icon = map[category] || Briefcase;
  return <Icon size={size} />;
}

// [[token]] resolves through the affiliate registry. If the program is not
// configured (env var missing), the token degrades to a plain-text label so
// posts written ahead of signup do not break.
function renderAffiliateToken(raw, key, slug) {
  const aff = resolveAffiliate(raw);
  if (!aff) {
    // Strip any "amazon:ASIN|" prefix and show only the label half. For
    // single-word tokens like "gusto" we just show the capitalized name.
    const display = raw.startsWith("amazon:") || raw.startsWith("amazon_search:")
      ? (raw.split("|")[1] || raw.split(":")[1] || raw)
      : raw.charAt(0).toUpperCase() + raw.slice(1);
    return <span key={key}>{display}</span>;
  }
  return (
    <a
      key={key}
      href={aff.href}
      target="_blank"
      rel="sponsored noopener noreferrer"
      className="affiliate-link"
      title={aff.blurb}
      onClick={() => trackAffiliateClick({
        slug, destination: aff.href, label: aff.label, network: aff.vendor,
      })}
    >
      {aff.label}
    </a>
  );
}

function renderInline(text, key = 0, slug = null) {
  const parts = [];
  let remaining = text;
  let idx = 0;
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/;
  const boldRe = /\*\*([^*]+)\*\*/;
  const affRe  = /\[\[([^\]]+)\]\]/;
  while (remaining.length) {
    const linkMatch = linkRe.exec(remaining);
    const boldMatch = boldRe.exec(remaining);
    const affMatch  = affRe.exec(remaining);

    // Pick whichever matched pattern starts earliest in the remaining string.
    let nextIdx = Infinity;
    let which = null;
    if (linkMatch && linkMatch.index < nextIdx) { nextIdx = linkMatch.index; which = "link"; }
    if (boldMatch && boldMatch.index < nextIdx) { nextIdx = boldMatch.index; which = "bold"; }
    if (affMatch  && affMatch.index  < nextIdx) { nextIdx = affMatch.index;  which = "aff";  }

    if (which == null) {
      parts.push(remaining);
      break;
    }
    if (nextIdx > 0) parts.push(remaining.slice(0, nextIdx));
    if (which === "link") {
      const [full, label, url] = linkMatch;
      if (url.startsWith("/")) {
        parts.push(<Link key={`${key}-l-${idx++}`} to={url}>{label}</Link>);
      } else {
        parts.push(<a key={`${key}-l-${idx++}`} href={url} target="_blank" rel="noopener noreferrer">{label}</a>);
      }
      remaining = remaining.slice(nextIdx + full.length);
    } else if (which === "bold") {
      const [full, inner] = boldMatch;
      parts.push(<strong key={`${key}-b-${idx++}`}>{inner}</strong>);
      remaining = remaining.slice(nextIdx + full.length);
    } else {
      const [full, token] = affMatch;
      parts.push(renderAffiliateToken(token, `${key}-a-${idx++}`, slug));
      remaining = remaining.slice(nextIdx + full.length);
    }
  }
  return parts;
}

function renderMarkdown(md, slug = null) {
  const lines = md.split("\n");
  const out = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith("## ")) {
      out.push(<h2 key={key++}>{renderInline(line.slice(3), key, slug)}</h2>);
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      out.push(<h3 key={key++}>{renderInline(line.slice(4), key, slug)}</h3>);
      i++;
      continue;
    }
    if (line.startsWith("- ")) {
      const items = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(<li key={`${key}-li-${i}`}>{renderInline(lines[i].slice(2), key + i, slug)}</li>);
        i++;
      }
      out.push(<ul key={key++}>{items}</ul>);
      continue;
    }
    // paragraph: gather until blank line
    const para = [];
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith("## ") && !lines[i].startsWith("### ") && !lines[i].startsWith("- ")) {
      para.push(lines[i]);
      i++;
    }
    out.push(<p key={key++}>{renderInline(para.join(" "), key, slug)}</p>);
  }
  return out;
}

function readingTime(text) {
  const words = (text || "").split(/\s+/).length;
  return Math.max(2, Math.round(words / 220));
}

// Lazy wrapper for one MDX module. Lookups go through the module-scope
// caches so the lazy wrapper and its `components` prop stay identity-stable
// across BlogPost rerenders. Use createElement(Comp, ...) instead of <Comp />
// JSX so the static-components linter can see Comp is a stable reference
// produced by the cache, not something defined inline per render.
function MdxBody({ slug }) {
  const LazyMdx = getLazyMdxComponent(slug);
  const components = getMdxComponents(slug);
  if (!LazyMdx) return null;
  return (
    <Suspense fallback={<p>Loading…</p>}>
      {createElement(LazyMdx, { components })}
    </Suspense>
  );
}

export default function BlogPost() {
  const { slug } = useParams();

  // Prefer the MDX meta entry (from posts-meta.json) so the page can render
  // SEO + hero without waiting for the MDX chunk. Fall back to the legacy
  // posts.js entry (loaded via dynamic import so readers who land on a
  // migrated MDX post never pay for the ~550 kB legacy-posts chunk).
  const metaEntry = useMemo(() => postsMeta.find((p) => p.slug === slug), [slug]);
  const isMdx = Boolean(mdxModules[slugToPath(slug)]);
  const [legacyEntry, setLegacyEntry] = useState(null);
  const [rawBody, setRawBody] = useState("");

  // Fetch the legacy entry only if we can't resolve the slug via MDX. The
  // setLegacyEntry(null) reset when switching to an MDX slug is required —
  // without it, the previous legacy entry would linger in state and the
  // page would try to render two different posts. Lint plugin can't see
  // that, so the disable is intentional.
  useEffect(() => {
    if (!slug || isMdx) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLegacyEntry(null);
      return undefined;
    }
    let cancelled = false;
    import("../data/posts").then(({ posts }) => {
      if (cancelled) return;
      const entry = posts.find((p) => p.slug === slug) || null;
      setLegacyEntry(entry);
      if (entry) setRawBody(entry.content || "");
    });
    return () => { cancelled = true; };
  }, [slug, isMdx]);

  const post = metaEntry || legacyEntry;

  // Raw MDX source — loaded lazily alongside the compiled module so the
  // ToolsUsedFooter and reading-time heuristic keep working without a
  // second round trip.
  useEffect(() => {
    if (!slug || !isMdx) return;
    let cancelled = false;
    const loader = mdxSources[slugToPath(slug)];
    if (!loader) return;
    loader().then((src) => { if (!cancelled) setRawBody(src); });
    return () => { cancelled = true; };
  }, [slug, isMdx]);

  useSEO(
    post
      ? {
          title: `${post.title} | Simple IT SRQ`,
          description: post.metaDescription,
          canonical: `https://simpleitsrq.com/blog/${post.slug}`,
          image: `https://simpleitsrq.com/og-blog-${post.slug}.png`,
          post,
          breadcrumbs: [
            { name: "Home", url: "https://simpleitsrq.com/" },
            { name: "Blog", url: "https://simpleitsrq.com/blog" },
            { name: post.title, url: `https://simpleitsrq.com/blog/${post.slug}` },
          ],
        }
      : {}
  );

  if (!post) return <Navigate to="/blog" replace />;

  const minutes = readingTime(rawBody || post.excerpt || "");
  const hasAffiliate = postHasAffiliateContent(rawBody);

  return (
    <main id="main" className="blog-post-main">
      <article className="blog-post">
        <div className="container blog-post-container">
          <Link to="/blog" className="blog-back"><ArrowLeft size={14} /> Back to all posts</Link>
          <span className="blog-card-category">{post.category}</span>
          <h1 className="blog-post-title">{post.title}</h1>
          <p className="blog-post-lede">{post.excerpt}</p>
          <div className="blog-post-meta">
            <span><Calendar size={14} /> {new Date(post.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
            <span><User size={14} /> {post.author}</span>
            <span>{minutes} min read</span>
          </div>
          <div className="blog-post-hero">
            <BlogCover post={post} variant="hero" />
          </div>
          <div className="blog-post-content">
            {isMdx ? (
              // MDX path — one lazy chunk per post, sandwiched between the
              // same ad units the legacy renderer uses.
              <>
                <AdUnit key="ad-top" format="auto" className="ad-in-article" />
                <MdxBody slug={slug} />
                <AdUnit key="ad-bottom" format="auto" className="ad-in-article" />
              </>
            ) : (
              (() => {
                const blocks = renderMarkdown(legacyEntry?.content || "", post.slug);
                const mid = Math.min(4, Math.floor(blocks.length / 2));
                return [
                  ...blocks.slice(0, mid),
                  <AdUnit key="ad-mid" format="auto" className="ad-in-article" />,
                  ...blocks.slice(mid),
                  <AdUnit key="ad-bottom" format="auto" className="ad-in-article" />,
                ];
              })()
            )}
          </div>
          <div className="blog-post-tags">
            <Tag size={14} />
            {(post.tags || []).map((t) => <span key={t} className="blog-tag">{t}</span>)}
          </div>
          <StoreCrossSell post={post} />
          <ToolsUsedFooter content={rawBody} slug={post.slug} />
          <LeadCaptureCTA />
          <Newsletter />
          <AffiliateDisclosure variant={hasAffiliate ? "affiliate" : "partnership"} />
          {post.sourceUrl && (
            <p className="blog-post-source">Original source: <a href={post.sourceUrl} target="_blank" rel="noopener noreferrer">{post.sourceUrl}</a></p>
          )}
        </div>
      </article>
      <RelatedPosts currentSlug={slug} />
    </main>
  );
}
