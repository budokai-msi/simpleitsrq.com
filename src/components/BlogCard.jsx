import { Link } from "react-router-dom";
import { ArrowRight, Lock, Server, Cloud, FileCheck, Shield, Briefcase, Star } from "lucide-react";

const CAT_ICON = {
  "Cybersecurity": Lock,
  "AI & Productivity": Server,
  "Cloud": Cloud,
  "Compliance": FileCheck,
  "Privacy": Shield,
  "Business Tech": Briefcase,
  "Industry News": Star,
};

export default function BlogCard({ post }) {
  const Icon = CAT_ICON[post.category] || Briefcase;
  return (
    <article className="blog-card">
      <Link to={`/blog/${post.slug}`} className="blog-card-img" aria-label={post.title}>
        <div className="blog-card-img-inner"><Icon size={28} /></div>
      </Link>
      <div className="blog-card-body">
        <span className="blog-card-category">{post.category}</span>
        <h3 className="blog-card-title">
          <Link to={`/blog/${post.slug}`}>{post.title}</Link>
        </h3>
        <p className="blog-card-excerpt">{post.excerpt}</p>
        <div className="blog-card-meta">
          <time dateTime={post.date}>
            {new Date(post.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </time>
          <Link to={`/blog/${post.slug}`} className="blog-card-readmore">
            Read more <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </article>
  );
}
