import { Link } from "../lib/Link";
import { ArrowRight } from "lucide-react";
import BlogCover from "./BlogCover";

export default function BlogCard({ post }) {
  return (
    <article className="blog-card">
      <Link to={`/blog/${post.slug}`} className="blog-card-img" aria-label={post.title}>
        <BlogCover post={post} variant="card" />
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
