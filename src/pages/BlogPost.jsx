import { useMemo } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { ArrowRight, Calendar, User, Tag, ArrowLeft, Lock, Server, Cloud, FileCheck, Shield, Briefcase, Star } from "lucide-react";
import { posts } from "../data/posts";
import { resolveAffiliate, postHasAffiliateContent } from "../data/affiliates";
import { useSEO } from "../lib/seo";
import BlogCover from "../components/BlogCover";
import LeadCaptureCTA from "../components/LeadCaptureCTA";
import Newsletter from "../components/Newsletter";
import AffiliateDisclosure from "../components/AffiliateDisclosure";
import AdUnit from "../components/AdSense";
import ToolsUsedFooter from "../components/ToolsUsedFooter";

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
function renderAffiliateToken(raw, key) {
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
    >
      {aff.label}
    </a>
  );
}

function renderInline(text, key = 0) {
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
      parts.push(renderAffiliateToken(token, `${key}-a-${idx++}`));
      remaining = remaining.slice(nextIdx + full.length);
    }
  }
  return parts;
}

function renderMarkdown(md) {
  const lines = md.split("\n");
  const out = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith("## ")) {
      out.push(<h2 key={key++}>{renderInline(line.slice(3), key)}</h2>);
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      out.push(<h3 key={key++}>{renderInline(line.slice(4), key)}</h3>);
      i++;
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
    // paragraph: gather until blank line
    const para = [];
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith("## ") && !lines[i].startsWith("### ") && !lines[i].startsWith("- ")) {
      para.push(lines[i]);
      i++;
    }
    out.push(<p key={key++}>{renderInline(para.join(" "), key)}</p>);
  }
  return out;
}

function relatedPosts(current) {
  return posts
    .filter((p) => p.slug !== current.slug && p.category === current.category)
    .slice(0, 3);
}

function readingTime(text) {
  const words = text.split(/\s+/).length;
  return Math.max(2, Math.round(words / 220));
}

export default function BlogPost() {
  const { slug } = useParams();
  const post = useMemo(() => posts.find((p) => p.slug === slug), [slug]);

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

  const related = relatedPosts(post);
  const minutes = readingTime(post.content);
  const hasAffiliate = postHasAffiliateContent(post.content);

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
            {(() => {
              const blocks = renderMarkdown(post.content);
              const mid = Math.min(4, Math.floor(blocks.length / 2));
              return [
                ...blocks.slice(0, mid),
                <AdUnit key="ad-mid" format="auto" className="ad-in-article" />,
                ...blocks.slice(mid),
                <AdUnit key="ad-bottom" format="auto" className="ad-in-article" />,
              ];
            })()}
          </div>
          <div className="blog-post-tags">
            <Tag size={14} />
            {post.tags.map((t) => <span key={t} className="blog-tag">{t}</span>)}
          </div>
          <ToolsUsedFooter content={post.content} />
          <LeadCaptureCTA />
          <Newsletter />
          <AffiliateDisclosure variant={hasAffiliate ? "affiliate" : "partnership"} />
          {post.sourceUrl && (
            <p className="blog-post-source">Original source: <a href={post.sourceUrl} target="_blank" rel="noopener noreferrer">{post.sourceUrl}</a></p>
          )}
        </div>
      </article>
      {related.length > 0 && (
        <section className="section section-alt">
          <div className="container">
            <h2 className="title-2">Related posts</h2>
            <div className="blog-grid">
              {related.map((p) => (
                <article key={p.slug} className="blog-card">
                  <Link to={`/blog/${p.slug}`} className="blog-card-img" aria-label={p.title}>
                    <BlogCover post={p} variant="card" />
                  </Link>
                  <div className="blog-card-body">
                    <span className="blog-card-category">{p.category}</span>
                    <h3 className="blog-card-title"><Link to={`/blog/${p.slug}`}>{p.title}</Link></h3>
                    <p className="blog-card-excerpt">{p.excerpt}</p>
                    <div className="blog-card-meta">
                      <time dateTime={p.date}>{new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</time>
                      <Link to={`/blog/${p.slug}`} className="blog-card-readmore">Read more <ArrowRight size={14} /></Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
