// Auto-rendered "Tools mentioned in this article" block.
//
// Scans a post's body for [[amazon_search:<query>|<label>]] tokens,
// dedupes by query, and renders each as a standalone affiliate card
// at the bottom of the article. Goes below the newsletter / above
// the disclosure. Adds a second exposure for the same affiliate link
// without touching the body prose.

import { resolveAffiliate } from "../data/affiliates";
import { trackAffiliateClick } from "../lib/trackClick";

const TOKEN_RE = /\[\[(amazon(?:_search)?:[^\]]+)\]\]/g;

function extractTools(content) {
  // Defensive typeof guard — `content` can be a lazy-imported MDX module
  // (object) in some dynamic-import paths; .exec() against a non-string
  // would throw during render.
  if (!content || typeof content !== "string") return [];
  const seen = new Map();
  // Create a fresh matcher per call so module-scope lastIndex from a prior
  // render doesn't corrupt this one.
  const re = new RegExp(TOKEN_RE.source, "g");
  let m;
  while ((m = re.exec(content)) !== null) {
    const raw = m[1];
    // Key on the query half so duplicates (same tool mentioned twice) collapse.
    const key = raw.split("|")[0];
    if (!seen.has(key)) {
      const aff = resolveAffiliate(raw);
      if (aff) seen.set(key, aff);
    }
  }
  return Array.from(seen.values());
}

export default function ToolsUsedFooter({ content, slug }) {
  const tools = extractTools(content);
  if (tools.length === 0) return null;
  return (
    <aside className="tools-used-footer" aria-label="Tools mentioned in this article">
      <h3 className="tools-used-title">Tools mentioned in this article</h3>
      <p className="tools-used-sub">Every product below is on Amazon. The links are affiliate — buying through them helps support the blog at no cost to you.</p>
      <ul className="tools-used-list">
        {tools.map((t, i) => (
          <li key={i} className="tools-used-item">
            <a
              href={t.href}
              target="_blank"
              rel="sponsored noopener noreferrer"
              className="tools-used-link"
              title={t.blurb}
              onClick={() => trackAffiliateClick({
                slug, destination: t.href, label: t.label, network: t.vendor,
              })}
            >
              {t.label}
            </a>
            {t.blurb && <span className="tools-used-blurb"> — {t.blurb}</span>}
          </li>
        ))}
      </ul>
    </aside>
  );
}
