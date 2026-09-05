import { useCallback, useEffect, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { EmptyState, Metric, SignalPill, Table, fmtMoney, fmtNumber, getJson } from "./shared";

// Best-effort category → industry_group keyword map. Used to estimate how many
// local businesses in the lead database a given sellable product could
// plausibly be pitched to. Purely a planning heuristic — not a guarantee. If a
// product matches no segment, the tab shows its commission rate only.
const CATEGORY_SEGMENT_KEYWORDS = [
  ["security", "security"],
  ["camera", "security"],
  ["surveillance", "security"],
  ["network", "network"],
  ["networking", "network"],
  ["router", "network"],
  ["switch", "network"],
  ["software", "software"],
  ["microsoft", "software"],
  ["backup", "backup"],
  ["storage", "storage"],
  ["computer", "computer"],
  ["laptop", "computer"],
  ["printer", "office"],
  ["office", "office"],
  ["phone", "phone"],
  ["pos", "retail"],
  ["point of sale", "retail"],
  ["restaurant", "restaurant"],
  ["food", "restaurant"],
  ["medical", "medical"],
  ["health", "health"],
  ["dental", "medical"],
  ["legal", "legal"],
  ["real estate", "real estate"],
  ["construction", "construction"],
  ["automotive", "automotive"],
  ["auto", "automotive"],
  ["education", "education"],
  ["school", "education"],
  ["finance", "finance"],
  ["accounting", "finance"],
  ["insurance", "insurance"],
  ["salon", "beauty"],
  ["beauty", "beauty"],
  ["fitness", "fitness"],
  ["gym", "fitness"],
  ["hotel", "hospitality"],
  ["hospitality", "hospitality"],
  ["retail", "retail"],
  ["store", "retail"],
  ["manufacturing", "manufacturing"],
  ["logistics", "logistics"],
  ["warehouse", "logistics"],
  ["pet", "pet"],
  ["veterinary", "medical"],
  ["cleaning", "home services"],
  ["landscaping", "home services"],
  ["hvac", "home services"],
  ["plumbing", "home services"],
  ["electrical", "home services"],
  ["roofing", "construction"],
  ["painting", "home services"],
  ["marine", "marine"],
  ["boat", "marine"],
  ["government", "government"],
  ["nonprofit", "nonprofit"],
  ["church", "religious"],
];

// Read-only "Product Finder" tab. Tells the operator which sellable affiliate
// products to pitch to which local business segments, and the potential
// commission. Fetches its own data via getJson("product-finder") and only
// displays — no buttons that mutate data, just a Refresh that re-fetches.
export default function ProductFinderTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getJson("product-finder");
      setData(res);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const segments = data?.segments || [];
  const products = data?.products || [];
  const trends = data?.trends || [];
  const maxSeg = Math.max(0, ...segments.map((s) => Number(s.businesses) || 0));
  const totalBusinesses = segments.reduce((sum, s) => sum + (Number(s.businesses) || 0), 0);

  // Best-effort: which local segments could a product plausibly be pitched to?
  const matchSegments = (product) => {
    const haystack = `${product.category || ""} ${product.title || ""} ${product.brand || ""}`.toLowerCase();
    return segments.filter((seg) => {
      const group = String(seg.industry_group || "").toLowerCase();
      if (!group) return false;
      for (const [kw, groupKw] of CATEGORY_SEGMENT_KEYWORDS) {
        if (haystack.includes(kw) && group.includes(groupKw)) return true;
      }
      // Fallback: direct substring overlap on words >= 3 chars.
      const words = haystack.split(/\W+/).filter((w) => w.length >= 3);
      return words.some((w) => group.includes(w) || w.includes(group));
    });
  };

  const productRows = products
    .map((p) => {
      const matched = matchSegments(p);
      const businesses = matched.reduce((sum, s) => sum + (Number(s.businesses) || 0), 0);
      const rate = Number(p.commission_rate) || 0;
      const potential = matched.length ? businesses * rate : null;
      return { ...p, matched, businesses, potential };
    })
    .sort((a, b) => (b.potential ?? -1) - (a.potential ?? -1));

  const fmtRate = (p) => {
    const rate = Number(p.commission_rate) || 0;
    const type = String(p.commission_type || "").toLowerCase();
    if (type.includes("percent") || type.includes("pct") || type === "%") return `${rate}%`;
    if (type.includes("fixed") || type.includes("flat") || type.includes("amount")) return fmtMoney(rate * 100);
    return `${rate}`;
  };

  const topTrend = trends[0];

  return (
    <div className="ops-grid">
      <div className="ops-panel__head" style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 0 }}>
        <h2 style={{ margin: 0 }}>Product Finder</h2>
        <button className="btn btn-secondary btn-sm" type="button" onClick={load} disabled={loading}>
          <RefreshCcw size={14} /> {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="stats stats-vertical sm:stats-horizontal" style={{ gridColumn: "1 / -1" }}>
        <Metric label="Active businesses" value={fmtNumber(totalBusinesses)} hint="in matched segments" />
        <Metric label="Sellable products" value={fmtNumber(products.length)} hint="affiliate catalog" />
        <Metric label="Top trend" value={topTrend ? topTrend.keyword : "-"} hint={topTrend ? `score ${Number(topTrend.score).toFixed(0)}` : "no signals yet"} />
      </div>

      <section className="card card-border bg-base-100 col-span-full p-4">
        <div className="ops-panel__head">
          <h2>Local market segments</h2>
          <SignalPill state={segments.length ? "good" : "neutral"}>{fmtNumber(segments.length)} segments</SignalPill>
        </div>
        <p className="ops-panel__copy">
          Where the demand is: active businesses in the lead database grouped by industry. The bar shows each segment's share of the largest segment.
        </p>
        {error ? <EmptyState>{error}</EmptyState> : null}
        {!error && segments.length === 0 ? <EmptyState>No active business segments found yet.</EmptyState> : null}
        {segments.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {segments.map((s) => {
              const count = Number(s.businesses) || 0;
              const pct = maxSeg > 0 ? Math.round((count / maxSeg) * 100) : 0;
              return (
                <div key={s.industry_group}>
                  <div className="ops-funnel-row__head">
                    <span>{s.industry_group}</span>
                    <strong>{fmtNumber(count)}</strong>
                  </div>
                  <div className="ops-funnel-track">
                    <div className="ops-funnel-fill" style={{ width: `${Math.max(2, pct)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="card card-border bg-base-100 col-span-full p-4">
        <div className="ops-panel__head">
          <h2>Products you can sell</h2>
          <SignalPill state={productRows.length ? "good" : "neutral"}>{fmtNumber(productRows.length)} products</SignalPill>
        </div>
        <p className="ops-panel__copy">
          Sellable affiliate products ranked by estimated potential commission: matching local businesses × commission rate. Products with no segment match show their commission rate only.
        </p>
        {error ? <EmptyState>{error}</EmptyState> : null}
        {!error && productRows.length === 0 ? <EmptyState>No sellable products synced yet.</EmptyState> : null}
        {productRows.length ? (
          <Table
            columns={["Product", "Category", "Price", "Commission", "Gravity", "Potential"]}
            rows={productRows}
            empty="No products."
            renderRow={(p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.title}</strong>
                  {p.brand ? <span style={{ fontSize: 12, color: "var(--text-2)" }}>{p.brand}</span> : null}
                </td>
                <td>{p.category || "-"}</td>
                <td>{fmtMoney(p.price_cents)}</td>
                <td>{fmtRate(p)}</td>
                <td>{p.gravity != null ? Number(p.gravity).toFixed(1) : "-"}</td>
                <td>
                  {p.potential != null ? (
                    <SignalPill state="good">{fmtNumber(p.potential)}</SignalPill>
                  ) : (
                    <span style={{ color: "var(--text-2)", fontSize: 12 }}>no segment match</span>
                  )}
                </td>
              </tr>
            )}
          />
        ) : null}
      </section>

      <section className="card card-border bg-base-100 col-span-full p-4">
        <div className="ops-panel__head">
          <h2>What's trending</h2>
          <SignalPill state={trends.length ? "good" : "neutral"}>{fmtNumber(trends.length)} signals</SignalPill>
        </div>
        <p className="ops-panel__copy">
          Top demand signals from the trends feed — keywords people are searching right now, with their score and volume.
        </p>
        {error ? <EmptyState>{error}</EmptyState> : null}
        {!error && trends.length === 0 ? <EmptyState>No trend signals collected yet.</EmptyState> : null}
        {trends.length ? (
          <Table
            columns={["Keyword", "Source", "Score", "Volume"]}
            rows={trends}
            empty="No trends."
            renderRow={(t) => (
              <tr key={`${t.keyword}-${t.source}-${t.score}`}>
                <td><strong>{t.keyword}</strong></td>
                <td>{t.source || "-"}</td>
                <td>
                  <SignalPill state={Number(t.score) >= 70 ? "good" : Number(t.score) >= 40 ? "warn" : "neutral"}>
                    {Number(t.score).toFixed(0)}
                  </SignalPill>
                </td>
                <td>{t.volume != null ? fmtNumber(t.volume) : "-"}</td>
              </tr>
            )}
          />
        ) : null}
      </section>
    </div>
  );
}
