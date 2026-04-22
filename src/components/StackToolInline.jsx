// Inline "stack tool card" — renders a compact affiliate-aware card for
// any tool defined in src/data/stack.js.
//
// Two entry points feed this component:
//   1. Legacy markdown `[[tool:<id>]]` shortcode — parsed inside
//      BlogPost.renderInline() and dispatched here.
//   2. MDX `<Tool id="..." />` component — bound via getMdxComponents()
//      in BlogPost.jsx so `slug` is carried through for tracking.
//
// If the tool id doesn't resolve, we render the raw id as plain text so a
// typo doesn't break the page. The primary outbound link carries the
// affiliate tag (when configured); a secondary "details →" link goes to
// /stack#<id> for the full rationale.
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { STACK, resolveStackLink } from "../data/stack";
import { trackAffiliateClick } from "../lib/trackClick";

function findTool(toolId) {
  if (!toolId) return null;
  for (const cat of STACK) {
    const hit = cat.tools.find((t) => t.id === toolId);
    if (hit) return hit;
  }
  return null;
}

export default function StackToolInline({ toolId, id, compact = false, slug = null }) {
  // Accept either `toolId` (legacy-markdown dispatch) or `id` (MDX prop)
  // since the MDX author writes `<Tool id="..." />`.
  const resolvedId = toolId || id;
  const tool = findTool(resolvedId);
  if (!tool) return <span>{resolvedId}</span>;

  const link = resolveStackLink(tool);
  const isInternal = link.href.startsWith("/");
  const className = `stack-tool-inline${compact ? " stack-tool-inline--compact" : ""}`;

  const ctaLabel = link.isAffiliate
    ? `Check price — ${tool.name}`
    : `Visit ${tool.name}`;

  const handleClick = () => {
    if (link.isAffiliate) {
      trackAffiliateClick({
        slug,
        destination: link.href,
        label: tool.name,
        network: link.label,
      });
    }
  };

  const primary = link.href ? (
    isInternal ? (
      <Link to={link.href} className="stack-tool-inline__cta">
        {ctaLabel}
      </Link>
    ) : (
      <a
        href={link.href}
        target="_blank"
        rel={link.isAffiliate ? "sponsored noopener noreferrer" : "noopener noreferrer"}
        className="stack-tool-inline__cta"
        onClick={handleClick}
      >
        {ctaLabel}
        <ExternalLink size={12} aria-hidden="true" />
      </a>
    )
  ) : null;

  if (compact) {
    return (
      <span className={className}>
        <strong className="stack-tool-inline__name">{tool.name}</strong>
        {tool.priceHint && (
          <span className="stack-tool-inline__price">{tool.priceHint}</span>
        )}
        {primary}
        <Link to={`/stack#${tool.id}`} className="stack-tool-inline__details">
          details →
        </Link>
      </span>
    );
  }

  return (
    <span className={className} role="group" aria-label={`${tool.name} — stack tool`}>
      <span className="stack-tool-inline__row">
        <strong className="stack-tool-inline__name">{tool.name}</strong>
        {tool.priceHint && (
          <span className="stack-tool-inline__price">{tool.priceHint}</span>
        )}
        {link.isAffiliate && (
          <span className="stack-tool-inline__aff" aria-label="Affiliate link">
            Referral
          </span>
        )}
      </span>
      {tool.tagline && (
        <span className="stack-tool-inline__tagline">{tool.tagline}</span>
      )}
      <span className="stack-tool-inline__row stack-tool-inline__row--ctas">
        {primary}
        <Link to={`/stack#${tool.id}`} className="stack-tool-inline__details">
          details →
        </Link>
      </span>
    </span>
  );
}
