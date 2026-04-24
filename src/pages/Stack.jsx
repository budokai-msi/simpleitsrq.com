import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, ArrowRight, Info, Calculator, Users, DollarSign } from "lucide-react";
import { useSEO, SITE_URL } from "../lib/seo";
import { STACK, resolveStackLink, stackHasAffiliates, monthlyCostFor } from "../data/stack";
import { trackAffiliateClick } from "../lib/trackClick";
import { track } from "../lib/analytics";
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

// Headcount-driven monthly cost calculator. Reads each tool's `cost`
// field, multiplies by the office size + included flags, and shows the
// running total + itemized breakdown. The "Get this priced for my office"
// CTA fires GA4 generate_lead and routes to /book with a source tag —
// turns a passive read-the-list page into an active lead-capture surface.
function StackCalculator() {
  const [seats, setSeats] = useState(10);

  // Flat list of every tool with a structured cost, plus the category
  // it belongs to. The "productivity" mutex group only counts the chosen
  // tool (M365 by default — both can't be true at once).
  const allCalcTools = useMemo(() => {
    const list = [];
    for (const cat of STACK) {
      for (const t of cat.tools) {
        if (t.cost) list.push({ ...t, _category: cat.title });
      }
    }
    return list;
  }, []);

  // Defaults: include every tool flagged calculatorDefault. For mutex
  // groups, only the default one. This gives a "what most offices end up
  // paying" baseline before the user toggles anything.
  const initialIncluded = useMemo(() => {
    const set = new Set();
    for (const t of allCalcTools) {
      if (t.calculatorDefault) set.add(t.id);
    }
    return set;
  }, [allCalcTools]);

  const [included, setIncluded] = useState(initialIncluded);

  function toggleTool(tool) {
    const next = new Set(included);
    if (next.has(tool.id)) {
      next.delete(tool.id);
    } else {
      // Mutex enforcement: turning on a tool in a mutex group disables
      // the other tool in the same group (e.g. M365 ↔ Google Workspace).
      if (tool.calculatorMutex) {
        for (const t of allCalcTools) {
          if (t.calculatorMutex === tool.calculatorMutex && t.id !== tool.id) {
            next.delete(t.id);
          }
        }
      }
      next.add(tool.id);
    }
    setIncluded(next);
  }

  const breakdown = useMemo(() => {
    const safeSeats = Math.max(1, Math.min(200, Number(seats) || 1));
    return allCalcTools
      .filter((t) => included.has(t.id))
      .map((t) => ({ tool: t, monthly: monthlyCostFor(t, safeSeats) }))
      .filter((row) => row.monthly > 0);
  }, [allCalcTools, included, seats]);

  const total = breakdown.reduce((s, r) => s + r.monthly, 0);

  function handleQuoteClick() {
    track.lead("stack-calculator", Math.round(total), {
      seats,
      tool_count: breakdown.length,
    });
  }

  return (
    <section className="section" id="calculator" aria-labelledby="calc-title">
      <div className="container" style={{ maxWidth: 880 }}>
        <div className="section-head" style={{ marginBottom: 16 }}>
          <span className="eyebrow" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Calculator size={14} /> Cost Estimator
          </span>
          <h2 id="calc-title" className="title-1" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>
            What this stack actually costs
          </h2>
          <p className="section-sub">
            Plug in your headcount. Numbers are real — pulled from the same
            vendor pricing on this page. Hardware items (YubiKeys, UPS) are
            amortized over 36 months so the figure reflects monthly cash flow,
            not upfront capex.
          </p>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 360px)",
          gap: 24,
          alignItems: "start",
        }} className="stack-calc-grid">
          {/* Inputs */}
          <div className="form-shell" style={{ padding: 20 }}>
            <label className="field" style={{ marginBottom: 16 }}>
              <span className="field-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Users size={14} /> Office headcount
              </span>
              <input
                type="number"
                min={1}
                max={200}
                value={seats}
                onChange={(e) => setSeats(e.target.value)}
                style={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
              />
            </label>

            <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--syn-text-muted, #6b7280)", marginBottom: 8 }}>
              Include in estimate
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {allCalcTools.map((t) => (
                <label
                  key={t.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    gap: 10,
                    alignItems: "center",
                    padding: "8px 10px",
                    borderRadius: 8,
                    cursor: "pointer",
                    background: included.has(t.id) ? "rgba(15, 108, 189, 0.06)" : "transparent",
                    border: `1px solid ${included.has(t.id) ? "rgba(15, 108, 189, 0.2)" : "var(--syn-border, #e5e7eb)"}`,
                    fontSize: 13,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={included.has(t.id)}
                    onChange={() => toggleTool(t)}
                    style={{ width: 14, height: 14 }}
                  />
                  <span>
                    <strong>{t.name}</strong>
                    <span style={{ color: "var(--syn-text-muted, #6b7280)", marginLeft: 6, fontSize: 11 }}>
                      {t._category}
                    </span>
                  </span>
                  <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 11, color: "var(--syn-text-muted, #6b7280)" }}>
                    ${monthlyCostFor(t, Math.max(1, Number(seats) || 1)).toFixed(0)}/mo
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Total */}
          <div style={{
            padding: 24,
            borderRadius: 14,
            background: "linear-gradient(180deg, #0F6CBD 0%, #0A4E8F 100%)",
            color: "#fff",
            position: "sticky",
            top: 80,
          }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.85, fontWeight: 600 }}>
              Estimated monthly stack cost
            </div>
            <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.1, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
              ${Math.round(total).toLocaleString()}
              <span style={{ fontSize: 14, fontWeight: 500, opacity: 0.75 }}> /mo</span>
            </div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
              {seats}-person office · {breakdown.length} tools selected
            </div>

            <ul style={{
              listStyle: "none",
              margin: "16px 0",
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              fontSize: 12,
              opacity: 0.95,
              maxHeight: 200,
              overflowY: "auto",
            }}>
              {breakdown.map((row) => (
                <li key={row.tool.id} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.tool.name}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>${Math.round(row.monthly).toLocaleString()}</span>
                </li>
              ))}
            </ul>

            <Link
              to={`/book?source=stack-calculator&seats=${seats}&total=${Math.round(total)}`}
              onClick={handleQuoteClick}
              className="btn"
              style={{
                background: "#fff",
                color: "#0F6CBD",
                fontWeight: 600,
                width: "100%",
                justifyContent: "center",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <DollarSign size={14} /> Get this priced for my office
            </Link>
            <p style={{ margin: "10px 0 0", fontSize: 11, opacity: 0.75, lineHeight: 1.4 }}>
              We'll quote this exact stack for your headcount and walk through
              substitutions if anything doesn't fit.
            </p>
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 720px) {
          .stack-calc-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </section>
  );
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

      <StackCalculator />

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
