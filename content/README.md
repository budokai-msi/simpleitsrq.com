# Blog content authoring guide

Posts live as MDX files under `content/posts/<slug>.mdx`. Each file is
one-post-one-chunk — Vite's `import.meta.glob` turns each file into its
own lazy-loaded JS bundle, so adding a post doesn't bloat the main app.

## Adding a new post

1. Pick a slug. Use kebab-case, no trailing date (the frontmatter has a
   date). Examples: `gpu-shortage-msp-impact-2026`,
   `why-your-cyber-policy-got-canceled`.

2. Create `content/posts/<slug>.mdx` with frontmatter at the top:

   ```mdx
   ---
   slug: "your-slug-here"
   title: "Your title — keep it under 120 chars"
   metaDescription: "The sentence Google shows in search results. 140-160 chars."
   date: "2026-04-21"
   author: "Simple IT SRQ Team"
   category: "Cybersecurity"
   tags:
     - tag-one
     - tag-two
   excerpt: "The 1-2 sentence blurb on the blog index and at the top of the post."
   heroAlt: "Plain-English alt text describing the hero image."
   # image: "https://..."   # optional; overrides the generated cover
   ---

   ## Your first H2 heading

   Write the post in Markdown. Blank line between paragraphs.
   **Bold** and *italic* and [inline links](https://example.com) all work.

   - Bulleted lists
   - Work like this

   ## Affiliate links

   Use the `<Affiliate>` component (auto-injected, no import needed):

   <Affiliate token="amazon_search:YubiKey 5C NFC|YubiKey 5C NFC security key" />

   The token format matches the `[[...]]` shortcode from the legacy
   posts.js — see `src/data/affiliates.js` for the full list of programs.

   ## Stack-tool cards

   To surface any tool defined in `src/data/stack.js` inline — with the
   same affiliate-aware link the /stack page uses — write `<Tool>` in
   MDX, or use the `[[tool:<id>]]` shortcode inside legacy markdown:

   <Tool id="acronis-cyber-protect" />
   <Tool id="1password-business" compact />

   Legacy markdown equivalent: `[[tool:acronis-cyber-protect]]`. Unknown
   ids degrade to plain text so typos don't break the page. Each card
   links primarily to the vendor (affiliate when configured) and
   secondarily to `/stack#<id>` for the full rationale.
   ```

3. Valid categories (exact match, case-sensitive):
   `Cybersecurity`, `AI & Productivity`, `Cloud`, `Compliance`,
   `Privacy`, `Business Tech`, `Industry News`. Adding a new one means
   updating the filter list in `src/pages/BlogIndex.jsx`.

4. Run `npm run prebuild` to regenerate:
   - `src/data/posts-meta.json` (the index/home preview)
   - `public/sitemap.xml`
   - `public/rss.xml`

   Commit the regenerated files alongside your MDX file. They're
   deterministic, so a second run produces the same bytes.

5. `npm run build` to verify the post compiles. Open `npm run dev` and
   visit `/blog/<slug>` to see it.

## Supported MDX features

- Standard Markdown (headings, paragraphs, lists, links, bold, italic,
  code fences, blockquotes).
- The `<Affiliate>` component, auto-injected by `BlogPost.jsx`.
- YAML frontmatter re-exported as a named `frontmatter` export (via
  `remark-mdx-frontmatter`). `BlogPost.jsx` reads metadata from the
  generated `posts-meta.json` rather than the runtime export, so the
  index/home previews work without downloading the MDX chunk.

## Legacy posts

Posts still living in `src/data/posts.js` render through the legacy
Markdown renderer in `BlogPost.jsx`. The MDX source takes precedence
when a slug exists in both places, so migrating a legacy post is just
"create the MDX file with the same slug." The `prebuild` scripts
automatically union the two sources.

## Gotchas

- MDX is stricter than plain Markdown about less-than signs — `<` inside
  prose becomes a JSX tag. Escape bare `<` as `\<` or wrap in a code
  span.
- A line starting with `<Component` must be at the start of a line (no
  leading indent) or MDX treats it as indented code.
- Tables without `| ---` header rows don't render; use
  [GitHub-flavored Markdown tables](https://github.github.com/gfm/#tables-extension-).
