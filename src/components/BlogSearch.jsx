import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";

/**
 * Client-side fuzzy-ish search for the blog index. No new deps.
 *
 * Matching rules:
 *   - Empty query returns all posts untouched.
 *   - Query is split on whitespace; each term must appear SOMEWHERE in the
 *     combined searchable text (AND across terms, any order). So "hipaa
 *     florida" and "florida hipaa" both match the same posts.
 *   - Case-insensitive substring match, no stemming, no ranking fanciness
 *     beyond a 3-tier score (title hit > tag/category hit > description hit)
 *     to keep relevance-sorted results above purely-incidental hits.
 *
 * The component owns two pieces of state: the live `query` (raw input, 1:1
 * with keystrokes) and the `committed` query (debounced). Only the debounced
 * value triggers the filter — typing "cybersecurity" no longer runs 13
 * filter passes across 50+ posts.
 */
const DEBOUNCE_MS = 150;

function buildSearchIndex(posts) {
  // Pre-lowercase every post's searchable fields once, not per keystroke.
  // Returns an array parallel to `posts` so we can filter/rank without
  // touching the original objects.
  return posts.map((p) => {
    const title = (p.title || "").toLowerCase();
    const description = ((p.metaDescription || "") + " " + (p.excerpt || "")).toLowerCase();
    const tagText = ((p.category || "") + " " + (Array.isArray(p.tags) ? p.tags.join(" ") : "")).toLowerCase();
    return { post: p, title, description, tagText };
  });
}

function scoreEntry(entry, terms) {
  // Every term must hit somewhere. The best-tier location for each term
  // contributes to the score; missing a term disqualifies the post.
  let score = 0;
  for (const term of terms) {
    if (entry.title.includes(term)) score += 3;
    else if (entry.tagText.includes(term)) score += 2;
    else if (entry.description.includes(term)) score += 1;
    else return -1; // one missing term = no match (AND semantics)
  }
  return score;
}

export default function BlogSearch({ posts, onFilter, initialQuery = "", onQueryChange }) {
  const [query, setQuery] = useState(initialQuery);
  const [committed, setCommitted] = useState(initialQuery);
  const index = useMemo(() => buildSearchIndex(posts), [posts]);

  // Debounce the raw input into `committed`. A trailing 150ms timer is
  // short enough to feel live but long enough that fast typists don't
  // re-filter on every keystroke.
  useEffect(() => {
    const handle = setTimeout(() => setCommitted(query), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  // Keep the input in sync when the parent changes initialQuery (e.g. a
  // URL ?q= param on load or navigation).
  const lastInitial = useRef(initialQuery);
  useEffect(() => {
    if (initialQuery !== lastInitial.current) {
      lastInitial.current = initialQuery;
      setQuery(initialQuery);
      setCommitted(initialQuery);
    }
  }, [initialQuery]);

  // Run the filter whenever the committed query (or post list) changes.
  // We use useMemo so a re-render with the same inputs doesn't re-filter.
  const filtered = useMemo(() => {
    const trimmed = committed.trim().toLowerCase();
    if (!trimmed) return posts;
    const terms = trimmed.split(/\s+/).filter(Boolean);
    if (terms.length === 0) return posts;

    const scored = [];
    for (const entry of index) {
      const score = scoreEntry(entry, terms);
      if (score > 0) scored.push({ post: entry.post, score });
    }
    // Stable relevance sort: higher score first, then date desc as a
    // tiebreaker so newer posts win among equally-relevant matches.
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.post.date || "").localeCompare(a.post.date || "");
    });
    return scored.map((s) => s.post);
  }, [committed, index, posts]);

  // Push the filtered list up. We also notify the parent of the committed
  // query so it can reflect it in the URL.
  useEffect(() => { onFilter(filtered, committed.trim()); }, [filtered, committed, onFilter]);
  useEffect(() => { if (onQueryChange) onQueryChange(committed.trim()); }, [committed, onQueryChange]);

  const clear = () => {
    setQuery("");
    setCommitted("");
  };

  const trimmed = committed.trim();
  const hasQuery = trimmed.length > 0;

  return (
    <div className="blog-search">
      <label htmlFor="blog-search-input" className="blog-search-label">Search posts</label>
      <div className="blog-search-field">
        <Search size={16} aria-hidden="true" className="blog-search-icon" />
        <input
          id="blog-search-input"
          type="search"
          role="searchbox"
          aria-label="Search blog posts"
          aria-describedby="blog-search-status"
          className="blog-search-input"
          placeholder="Search by title, topic, or tag…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          spellCheck="false"
        />
        {query && (
          <button
            type="button"
            className="blog-search-clear"
            aria-label="Clear search"
            onClick={clear}
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      {/* Screen-reader live region announces the result count whenever the
          committed query changes. Visually hidden — sighted users get the
          visual feedback of the list updating. */}
      <div id="blog-search-status" className="sr-only" aria-live="polite" aria-atomic="true">
        {hasQuery
          ? `${filtered.length} ${filtered.length === 1 ? "post matches" : "posts match"} "${trimmed}"`
          : ""}
      </div>
    </div>
  );
}
