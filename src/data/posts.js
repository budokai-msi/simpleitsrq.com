// All posts now live as MDX files under content/posts/<slug>.mdx and are
// lazy-loaded one chunk per post. This file stays as a stub because
// api/portal.js still treats src/data/posts.js as the canonical file to
// commit new posts into via the GitHub Contents API - it reads the file,
// anchors on `];\nexport default posts;`, and splices a new entry in.
//
// BlogPost.jsx also lazy-imports this file as a legacy fallback for any
// slug that doesn't have an MDX file yet. With the array empty, that
// fallback path returns null and the route naturally 404s, which is the
// correct behavior.
//
// Adding a post:
//   - Author it as content/posts/<slug>.mdx (preferred - see content/README.md)
//   - Or let the client portal splice into this file via the GitHub API,
//     which produces a legacy entry that the prebuild + BlogPost.jsx
//     pipeline handles automatically.

export const posts = [
];

export default posts;
