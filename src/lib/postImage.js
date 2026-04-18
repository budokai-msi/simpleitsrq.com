// Deterministic hero image URL for a blog post. Seeded by the post slug so
// each post always gets the same photo but every post is visually distinct.
// If a post ever specifies a `heroImage` field, that wins.
export function postImageUrl(post, { width = 800, height = 450 } = {}) {
  if (post?.heroImage) return post.heroImage;
  const seed = encodeURIComponent(post?.slug || "default");
  return `https://picsum.photos/seed/${seed}/${width}/${height}`;
}
