import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, ArrowRight, Info } from "lucide-react";
import { useSEO, SITE_URL } from "../lib/seo";
import { STACK, resolveStackLink, stackHasAffiliates } from "../data/stack";
import { trackAffiliateClick } from "../lib/trackClick";
import AffiliateDisclosure from "../components/AffiliateDisclosure";
import CyberInsuranceCTA from "../components/CyberInsuranceCTA";

// Map each stack tool to { Product, Offer } JSON-LD so Google surfaces rich
// pricing snippets under the page in search results. Only tools with a
// concrete priceHint are emitted — we're not going to synthesize an offer
// for managed-services rows.
function buildItemListSchema() {
  const items = [];
  let position = 1;
  for (const category of STACK) {
    for (const tool of category.tools) {
      const { href } = resolveStackLink(tool);
      const item = {
        "@type": "ListItem",
        position,
        item: {
          "@type": "Product",
          name: tool.name,
          description: tool.tagline,
          url: href || `${SITE_URL}/stack#${tool.id}`,
        },
      };
      items.push(item);
      position += 1;
    }
  }
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Florida Small-Business Tech Stack",
    itemListElement: items,
  };
}

export default function Stack() {
  const itemListSchema = useMemo(() => buildItemListSchema(), []);
  const hasAnyAffiliate = useMemo(() => stackHasAffiliates(), []);

  useSEO({
    title: "The Florida Small-Business Tech Stack | Simple IT SRQ",
    description:
      "Every tool we install and recommend for Florida small businesses in 2026 — M365 Business Premium, 1Password, Acronis, Gusto, HoneyBook, YubiKey, and more. Grouped by what they do, with the tier that actually passes a cyber-insurance audit.",
    canonical: `${SITE_URL}/stack`,
    image: `${SITE_URL}/og-image.png`,
    breadcrumbs: [
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Tech stack", url: `${SITE_URL}/stack` },
    ],
  });

  return (
    <main id="main" className="stack-page">
      {/* Inline the stack-specific schema separately from useSEO's standard
          blocks (post/products/org/etc.) so we don't conflict with the
          existing slot IDs. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
      />

      <section className="section">
        <div className="container" style={{ maxWidth: 900 }}>
          <div className="section-head">
            <span className="eyebrow">The stack we actually run</span>
            <h1 className="display">
              The Florida small-business tech stack for 2026
            </h1>
            <p className="lede">
              Every tool we install for a new Sarasota or Bradenton client, grouped
              by what it does. Tier recommendations are the ones that pass a
              cyber-insurance renewal — not the cheapest that works. Links to
              vendors we have a referral relationship with are marked; others are
              just plain vendor links.
            </p>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "12px 16px",
                borderRadius: 10,
                background: "rgba(15, 108, 189, 0.06)",
                border: "1px solid rgba(15, 108, 189, 0.18)",
                marginTop: "1.25rem",
                fontSize: "0.92rem",
                color: "var(--syn-text, #0B0D10)",
              }}
            >
              <Info size={18} color="#0F6CBD" style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                <strong>Why this list is short.</strong> We install dozens of
                products across our client base, but the ones on this page are
                the defaults we recommend before hearing a single
                business-specific requirement. Anything else is a conversation,
                not a default.
              </span>
            </div>
          </div>

          {hasAnyAffiliate && (
            <div style={{ margin: "0 0 2rem" }}>
              <AffiliateDisclosure variant="affiliate" />
            </div>
          )}
        </div>
      </section>

      {/* Anchor nav for the categories — turns the page into a glanceable menu. */}
      <nav
        aria-label="Stack categories"
        style={{
          borderTop: "1px solid var(--syn-border, #e5e7eb)",
          borderBottom: "1px solid var(--syn-border, #e5e7eb)",
          padding: "12px 0",
          background: "var(--syn-surface-hi, #f9fafb)",
          marginBottom: "2rem",
        }}
      >
        <div className="container">
          <ul
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.5rem 1.25rem",
              listStyle: "none",
              margin: 0,
              padding: 0,
              fontSize: "0.9rem",
            }}
          >
            {STACK.map((cat) => (
              <li key={cat.id}>
                <a href={`#${cat.id}`} style={{ color: "#0F6CBD", textDecoration: "none" }}>
                  {cat.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {STACK.map((category) => (
        <section key={category.id} id={category.id} className="section" style={{ paddingTop: "2rem" }}>
          <div className="container" style={{ maxWidth: 900 }}>
            <h2 className="title-2" style={{ marginBottom: "0.5rem" }}>{category.title}</h2>
            <p className="section-sub" style={{ marginTop: 0, marginBottom: "1.5rem" }}>
              {category.intro}
            </p>

            <div style={{ display: "grid", gap: "1.25rem" }}>
              {category.tools.map((tool) => {
                const link = resolveStackLink(tool);
                const isInternal = link.href.startsWith("/");
                return (
                  <article
                    key={tool.id}
                    id={tool.id}
                    className="stack-tool"
                  >
                    <header className="stack-tool__header">
                      <h3 className="stack-tool__name">{tool.name}</h3>
                      {tool.priceHint && (
                        <span className="stack-tool__price">{tool.priceHint}</span>
                      )}
                    </header>
                    <p className="stack-tool__tagline">{tool.tagline}</p>
                    {tool.tier && (
                      <p className="stack-tool__tier">
                        <strong>Tier:</strong> {tool.tier}
                      </p>
                    )}
                    <p className="stack-tool__why">{tool.whyThis}</p>
                    {tool.goodFor && (
                      <p className="stack-tool__good-for">
                        <strong>Good for:</strong> {tool.goodFor}
                      </p>
                    )}
                    {tool.alternatives?.length > 0 && (
                      <p className="stack-tool__alts">
                        <strong>Alternatives we considered:</strong>{" "}
                        {tool.alternatives.join(", ")}
                      </p>
                    )}
                    {link.href && (
                      <div className="stack-tool__cta-row">
                        {isInternal ? (
                          <Link to={link.href} className="btn btn-primary">
                            {link.isAffiliate ? "Go to " : "More details — "}{tool.name}
                            <ArrowRight size={16} />
                          </Link>
                        ) : (
                          <a
                            href={link.href}
                            target="_blank"
                            rel={link.isAffiliate ? "sponsored noopener noreferrer" : "noopener noreferrer"}
                            className="btn btn-primary"
                            onClick={() => {
                              if (link.isAffiliate) {
                                trackAffiliateClick({
                                  slug: `stack#${tool.id}`,
                                  destination: link.href,
                                  label: tool.name,
                                  network: link.label,
                                });
                              }
                            }}
                          >
                            {link.isAffiliate ? "Check price — " : "Visit vendor — "}
                            {tool.name}
                            <ExternalLink size={14} />
                          </a>
                        )}
                        {link.isAffiliate && (
                          <span className="stack-tool__aff-tag" aria-label="Affiliate link">
                            Referral link
                          </span>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      ))}

      {/* Cyber-insurance CTA makes sense on this page for the same reason
          it makes sense on blog posts about compliance: the reader is
          evaluating their stack, which is one Google search away from
          evaluating their coverage. */}
      <section className="section">
        <div className="container" style={{ maxWidth: 780 }}>
          <CyberInsuranceCTA slug="stack" />
        </div>
      </section>
    </main>
  );
}
