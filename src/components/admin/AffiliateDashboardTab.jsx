// src/components/admin/AffiliateDashboardTab.jsx
//
// Full-stack affiliate + trends aggregation dashboard. Combines:
//   - Daily trending topics (Wikipedia, HN, Reddit, DuckDuckGo)
//   - Affiliate product listings across all configured networks
//   - Click / conversion / commission analytics
//   - Interactive filters, charts, and cross-platform comparison
//
// Data comes from the portal API actions:
//   affiliate-dashboard-summary, trends, affiliate-products, affiliate-stats

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
import { Metric, SignalPill, Table, EmptyState, fmtNumber, fmtMoney, getJson, postJson } from "./shared";

const PERIODS = [
  ["last7days", "7d"],
  ["last30days", "30d"],
  ["last90days", "90d"],
];

const SOURCE_LABELS = {
  wikipedia: "Wikipedia",
  hackernews: "Hacker News",
  reddit: "Reddit",
  duckduckgo: "DuckDuckGo",
};

const NETWORK_COLORS = {
  amazon: "#FF9900",
  ebay: "#E53238",
  aliexpress: "#E62E04",
  shareasale: "#1E90FF",
  cj: "#00A651",
  impact: "#7B2FF7",
  awin: "#FF4F00",
  rakuten: "#BF0000",
};

export default function AffiliateDashboardTab({ data, errors, busy, runAction }) {
  const [period, setPeriod] = useState("last7days");
  const [source, setSource] = useState("");
  const [network, setNetwork] = useState("");
  const [keyword, setKeyword] = useState("");
  const [sort, setSort] = useState("epc");
  const [summary, setSummary] = useState(data["affiliate-dashboard-summary"]);
  const [trends, setTrends] = useState(null);
  const [products, setProducts] = useState(null);
  const [stats, setStats] = useState(data["affiliate-stats"]);
  const [ingesting, setIngesting] = useState(false);
  const [ingestMsg, setIngestMsg] = useState("");

  // Load trends + products on mount / filter change.
  useEffect(() => {
    let cancelled = false;
    const params = { period };
    if (source) params.source = source;
    getJson("trends", params)
      .then((res) => { if (!cancelled) setTrends(res); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [period, source]);

  useEffect(() => {
    let cancelled = false;
    const params = { sort, limit: 50 };
    if (keyword) params.keyword = keyword;
    if (network) params.platform = network;
    getJson("affiliate-products", params)
      .then((res) => { if (!cancelled) setProducts(res); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sort, keyword, network]);

  useEffect(() => {
    let cancelled = false;
    getJson("affiliate-stats", { period })
      .then((res) => { if (!cancelled) setStats(res); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [period]);

  // Refresh the summary after ingest.
  const refreshSummary = () => {
    getJson("affiliate-dashboard-summary")
      .then(setSummary)
      .catch(() => {});
  };

  const runIngest = async () => {
    setIngesting(true);
    setIngestMsg("");
    try {
      const res = await postJson("affiliate-ingest", {});
      setIngestMsg(`Ingested ${res.summary?.seed || 0} seed + ${res.summary?.ebay || 0} eBay products.`);
      refreshSummary();
    } catch (err) {
      setIngestMsg(`Ingest failed: ${err.message}`);
    } finally {
      setIngesting(false);
    }
  };

  // --- Derived data --------------------------------------------------------

  const trendRows = trends?.trends || [];
  const productRows = products?.products || [];
  const productFilters = products?.filters || { networks: [], categories: [] };
  const series = stats?.series || [];
  const byNetwork = stats?.byNetwork || [];
  const totals = stats?.totals || {};
  const summaryTrends = summary?.trends?.top || [];
  const summaryProducts = summary?.products || {};
  const summaryTotals = summary?.totals || {};

  // Cross-platform comparison: products grouped by network with avg EPC.
  const platformCompare = useMemo(() => {
    const map = {};
    for (const p of productRows) {
      if (!map[p.network]) map[p.network] = { network: p.network, count: 0, epcSum: 0, priceSum: 0 };
      map[p.network].count += 1;
      map[p.network].epcSum += Number(p.epc || 0);
      map[p.network].priceSum += Number(p.priceCents || 0);
    }
    return Object.values(map)
      .map((g) => ({
        network: g.network,
        products: g.count,
        avgEpc: g.count ? Math.round(g.epcSum / g.count) : 0,
        avgPrice: g.count ? Math.round(g.priceSum / g.count) : 0,
      }))
      .sort((a, b) => b.avgEpc - a.avgEpc);
  }, [productRows]);

  // Trend source distribution for a chart.
  const trendBySource = useMemo(() => {
    const map = {};
    for (const t of trendRows) map[t.source] = (map[t.source] || 0) + 1;
    return Object.entries(map).map(([source, count]) => ({
      source: SOURCE_LABELS[source] || source,
      count,
    }));
  }, [trendRows]);

  const sourceOptions = trends?.sources || Object.keys(SOURCE_LABELS);
  const networkOptions = productFilters.networks?.length
    ? productFilters.networks
    : (summary?.networks || []).map((n) => ({ code: n.code, name: n.name }));

  return (
    <div className="ops-grid">
      {/* --- Header / controls --- */}
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head">
          <h2>Affiliate + trends command center</h2>
          <div className="ops-head__actions">
            {PERIODS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`btn btn-sm ${period === key ? "btn-primary" : "btn-secondary"}`}
                aria-pressed={period === key}
                onClick={() => setPeriod(key)}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={runIngest}
              disabled={ingesting}
            >
              {ingesting ? "Ingesting…" : "Ingest products"}
            </button>
          </div>
        </div>
        {ingestMsg ? <p className="ops-panel__copy">{ingestMsg}</p> : null}
        <div className="ops-metric-grid">
          <Metric label="Clicks" value={fmtNumber(stats?.totalClicks ?? summaryTotals.clicks)} />
          <Metric label="Conversions" value={fmtNumber(totals.conversions)} />
          <Metric label="Commissions" value={fmtMoney(totals.commissionsCents)} />
          <Metric label="Products" value={fmtNumber(summaryProducts.topByEpc?.length || productRows.length)} />
          <Metric label="Trends today" value={fmtNumber(summaryTrends.length)} />
        </div>
      </section>

      {/* --- Filters --- */}
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Filters</h2></div>
        <div className="ops-filter-row">
          <label className="ops-filter">
            <span>Trend source</span>
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">All sources</option>
              {sourceOptions.map((s) => (
                <option key={s} value={s}>{SOURCE_LABELS[s] || s}</option>
              ))}
            </select>
          </label>
          <label className="ops-filter">
            <span>Network</span>
            <select value={network} onChange={(e) => setNetwork(e.target.value)}>
              <option value="">All networks</option>
              {networkOptions.map((n) => (
                <option key={n.code} value={n.code}>{n.name || n.code}</option>
              ))}
            </select>
          </label>
          <label className="ops-filter">
            <span>Keyword</span>
            <input
              type="text"
              value={keyword}
              placeholder="Search products…"
              onChange={(e) => setKeyword(e.target.value)}
            />
          </label>
          <label className="ops-filter">
            <span>Sort by</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="epc">EPC</option>
              <option value="commission_rate">Commission</option>
              <option value="price">Price</option>
            </select>
          </label>
        </div>
      </section>

      {/* --- Trends --- */}
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head">
          <h2>Daily trending topics</h2>
          <SignalPill state={trendRows.length ? "good" : "warn"}>
            {trendRows.length} topics · {period}
          </SignalPill>
        </div>
        {trendRows.length ? (
          <>
            <div className="ops-chart" style={{ width: "100%", height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendBySource} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="source" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#d1d5db" }} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" name="Topics" fill="#0F6CBD" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Table
              columns={["Topic", "Source", "Score", "Volume"]}
              rows={trendRows.slice(0, 20)}
              empty="No trends in this period."
              renderRow={(row) => (
                <tr key={`${row.date}-${row.source}-${row.keyword}`}>
                  <td><a href={row.url} target="_blank" rel="noopener noreferrer">{row.keyword}</a></td>
                  <td><SignalPill state="neutral">{SOURCE_LABELS[row.source] || row.source}</SignalPill></td>
                  <td>{fmtNumber(row.score)}</td>
                  <td>{row.volume ? fmtNumber(row.volume) : "—"}</td>
                </tr>
              )}
            />
          </>
        ) : (
          <EmptyState>No trends yet. Run the daily trend fetch or wait for the cron.</EmptyState>
        )}
      </section>

      {/* --- Cross-platform comparison --- */}
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head">
          <h2>Cross-platform comparison</h2>
          <SignalPill state={platformCompare.length ? "good" : "neutral"}>
            {platformCompare.length} networks
          </SignalPill>
        </div>
        {platformCompare.length ? (
          <div className="ops-chart" style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={platformCompare} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="network" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#d1d5db" }} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="avgEpc" name="Avg EPC (¢)" radius={[3, 3, 0, 0]}>
                  {platformCompare.map((entry) => (
                    <Cell key={entry.network} fill={NETWORK_COLORS[entry.network] || "#0F6CBD"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState>No product data to compare yet.</EmptyState>
        )}
      </section>

      {/* --- Products --- */}
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head">
          <h2>Affiliate products</h2>
          <SignalPill state={productRows.length ? "good" : "warn"}>
            {productRows.length} products
          </SignalPill>
        </div>
        {productRows.length ? (
          <Table
            columns={["Product", "Network", "Price", "Commission", "EPC", "Conv."]}
            rows={productRows}
            empty="No products match the filters."
            renderRow={(row) => (
              <tr key={row.id}>
                <td><a href={row.productUrl} target="_blank" rel="noopener noreferrer">{row.title}</a></td>
                <td><SignalPill state="neutral">{row.network}</SignalPill></td>
                <td>{fmtMoney(row.priceCents)}</td>
                <td>{row.commissionType === "percent" ? `${row.commissionRate}%` : fmtMoney(row.commissionRate * 100)}</td>
                <td>{fmtNumber(row.epc)}¢</td>
                <td>{row.conversionRate ? `${(row.conversionRate * 100).toFixed(1)}%` : "—"}</td>
              </tr>
            )}
          />
        ) : (
          <EmptyState>No products yet. Click "Ingest products" to seed the catalog.</EmptyState>
        )}
      </section>

      {/* --- Clicks over time --- */}
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Clicks over time</h2></div>
        {series.length ? (
          <div className="ops-chart" style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#d1d5db" }} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="clicks" name="Clicks" stroke="#0F6CBD" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="conversions" name="Conversions" stroke="#9ca3af" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState>No click data in this period yet.</EmptyState>
        )}
      </section>

      {/* --- Network performance --- */}
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Network performance</h2></div>
        {byNetwork.length ? (
          <Table
            columns={["Network", "Clicks", "Unique", "Conversions", "Commissions", "EPC"]}
            rows={byNetwork}
            empty="No affiliate clicks recorded."
            renderRow={(row) => (
              <tr key={row.network}>
                <td>{row.network}</td>
                <td>{fmtNumber(row.clicks)}</td>
                <td>{fmtNumber(row.unique_visitors)}</td>
                <td>{fmtNumber(row.conversions)}</td>
                <td>{fmtMoney(row.commissionsCents)}</td>
                <td>{fmtNumber(row.epc)}¢</td>
              </tr>
            )}
          />
        ) : (
          <EmptyState>No affiliate clicks recorded.</EmptyState>
        )}
      </section>
    </div>
  );
}
