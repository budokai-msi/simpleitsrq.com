
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
import { Metric, SignalPill, Table, EmptyState, fmtNumber, fmtMoney, fmtTime, getJson, postJson } from "./shared";

const PERIODS = [
  ["last7days", "Last 7 days"],
  ["last30days", "Last 30 days"],
  ["last90days", "Last 90 days"],
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

export default function AffiliateTab({ data, errors, busy, runAction }) {
  const snapshot = data["affiliate-stats"];
  const [period, setPeriod] = useState("last30days");
  const [aff, setAff] = useState(snapshot);
  const series = aff?.series || [];
  const byNetwork = aff?.byNetwork || [];
  const totals = aff?.totals || {};
  const revenueSignals = data["revenue-signals"];
  const env = data["admin-status"]?.env || {};
  const programs = [
    ["Amazon Associates", "VITE_AFF_AMAZON_TAG", env.VITE_AFF_AMAZON_TAG, "Amazon product and search links in /tools and blog posts."],
    ["Gusto", "VITE_AFF_GUSTO_REF", env.VITE_AFF_GUSTO_REF, "Payroll referral links."],
    ["1Password", "VITE_AFF_1PASSWORD_REF", env.VITE_AFF_1PASSWORD_REF, "Password-manager referral links."],
    ["HoneyBook", "VITE_AFF_HONEYBOOK_REF", env.VITE_AFF_HONEYBOOK_REF, "Service-business CRM referrals."],
    ["Acronis", "VITE_AFF_ACRONIS_REF", env.VITE_AFF_ACRONIS_REF, "Backup and endpoint protection referrals."],
    ["Ubiquiti", "VITE_AFF_UBNT_REF", env.VITE_AFF_UBNT_REF, "UniFi camera/networking referrals."],
    ["Reolink", "VITE_AFF_REOLINK_REF", env.VITE_AFF_REOLINK_REF, "Camera/NVR referrals."],
    ["B&H Photo", "VITE_AFF_BH_REF", env.VITE_AFF_BH_REF, "Pro AV and networking hardware referrals."],
    ["Backblaze", "VITE_AFF_BACKBLAZE_REF", env.VITE_AFF_BACKBLAZE_REF, "Cloud-backup referrals."],
  ];

  // Affiliate + trends dashboard state (merged from the former Affiliate+Trends tab).
  const [source, setSource] = useState("");
  const [network, setNetwork] = useState("");
  const [keyword, setKeyword] = useState("");
  const [sort, setSort] = useState("epc");
  const [summary, setSummary] = useState(data["affiliate-dashboard-summary"]);
  const [trends, setTrends] = useState(null);
  const [products, setProducts] = useState(null);
  const [ingesting, setIngesting] = useState(false);
  const [ingestMsg, setIngestMsg] = useState("");

  // Affiliate setup state (merged from the former Affiliate Setup tab).
  const [setup, setSetup] = useState(data["affiliate-setup"] || null);
  const [setupError, setSetupError] = useState(null);
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getJson("affiliate-stats", { period })
      .then((res) => { if (!cancelled) setAff(res); })
      .catch(() => { /* keep the current snapshot on failure */ });
    return () => { cancelled = true; };
  }, [period]);

  // Load trends + products on filter change.
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

  // Load affiliate-setup on mount if not already present.
  useEffect(() => {
    if (!setup) {
      getJson("affiliate-setup")
        .then(setSetup)
        .catch((e) => setSetupError(String(e.message || e)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const loadSetup = async () => {
    setSetupError(null);
    try {
      setSetup(await getJson("affiliate-setup"));
    } catch (e) {
      setSetupError(String(e.message || e));
    }
  };

  const copyEnv = async (envVar) => {
    try {
      await navigator.clipboard.writeText(envVar);
      setCopied(envVar);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setSetupError("Clipboard unavailable.");
    }
  };

  const exportCsv = () => {
    const rows = aff?.recent || [];
    const header = ["ts", "network", "label", "slug", "country"];
    const lines = [header.join(",")];
    rows.forEach((r) => {
      const cells = [r.ts, r.network, r.label, r.slug, r.country].map((v) => {
        const s = v == null ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      });
      lines.push(cells.join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `affiliate-clicks-${period}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // --- Derived data for the trends/products sections ----------------------
  const trendRows = trends?.trends || [];
  const productRows = products?.products || [];
  const productFilters = products?.filters || { networks: [], categories: [] };
  const summaryTrends = summary?.trends?.top || [];
  const summaryProducts = summary?.products || {};

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

  const setupPrograms = setup?.programs || [];
  const linkCoverage = setup?.linkCoverage || [];

  return (
    <div className="ops-grid">
      <section className="admin-aff-card ops-panel">
        <div className="ops-panel__head">
          <h2>Affiliate signal</h2>
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
          </div>
        </div>
        <div className="ops-metric-grid">
          <Metric label="Clicks" value={fmtNumber(aff?.totalClicks)} />
          <Metric label="Networks" value={fmtNumber(aff?.byNetwork?.length)} />
          <Metric label="Revenue posts" value={fmtNumber(revenueSignals?.postLeaderboard?.length)} />
        </div>
      </section>
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head">
          <h2>Configured affiliate programs</h2>
          <SignalPill state={programs.some((p) => p[2]) ? "good" : "warn"}>
            {programs.filter((p) => p[2]).length} / {programs.length} live
          </SignalPill>
        </div>
        <p className="ops-panel__copy">
          Values stay server/build-side; this dashboard only shows whether a program is configured.
        </p>
        <Table
          columns={["Program", "Env var", "Status", "Where it earns"]}
          rows={programs}
          empty="No affiliate programs configured."
          renderRow={(row) => (
            <tr key={row[1]}>
              <td>{row[0]}</td>
              <td className="ops-mono">{row[1]}</td>
              <td><SignalPill state={row[2] ? "good" : "warn"}>{row[2] ? "configured" : "missing"}</SignalPill></td>
              <td>{row[3]}</td>
            </tr>
          )}
        />
      </section>
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Top networks</h2></div>
        <Table
          columns={["Network", "Clicks", "Unique", "Last click"]}
          rows={aff?.byNetwork || []}
          empty="No affiliate clicks recorded."
          renderRow={(row) => (
            <tr key={row.network}>
              <td>{row.network}</td>
              <td>{fmtNumber(row.clicks)}</td>
              <td>{fmtNumber(row.unique_visitors)}</td>
              <td>{fmtTime(row.last_click)}</td>
            </tr>
          )}
        />
      </section>
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Top pages</h2></div>
        <Table
          columns={["Page", "Clicks", "Unique", "Conversions", "Commissions", "Last click"]}
          rows={aff?.bySlug || []}
          empty="No affiliate clicks recorded."
          renderRow={(row) => (
            <tr key={row.slug}>
              <td>{row.slug || "-"}</td>
              <td>{fmtNumber(row.clicks)}</td>
              <td>{fmtNumber(row.unique_visitors)}</td>
              <td>{fmtNumber(row.conversions)}</td>
              <td>{fmtMoney(row.commissionsCents)}</td>
              <td>{fmtTime(row.lastClick)}</td>
            </tr>
          )}
        />
      </section>
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Clicks over time</h2></div>
        {series.length ? (
          <div className="ops-chart" style={{ width: "100%", height: 260 }}>
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
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head">
          <h2>Recent clicks</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={exportCsv}>Export CSV</button>
        </div>
        <Table
          columns={["Time", "Network", "Product", "Page", "Country"]}
          rows={aff?.recent || []}
          empty="No recent affiliate clicks."
          renderRow={(row, index) => (
            <tr key={`${row.ts}-${index}`}>
              <td>{fmtTime(row.ts)}</td>
              <td>{row.network}</td>
              <td>{row.label || "-"}</td>
              <td>{row.slug || "-"}</td>
              <td>{row.country || "-"}</td>
            </tr>
          )}
        />
      </section>

      {/* --- Affiliate + trends command center (merged) --- */}
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
          <Metric label="Clicks" value={fmtNumber(aff?.totalClicks ?? summary?.totals?.clicks)} />
          <Metric label="Conversions" value={fmtNumber(totals.conversions)} />
          <Metric label="Commissions" value={fmtMoney(totals.commissionsCents)} />
          <Metric label="Products" value={fmtNumber(summaryProducts.topByEpc?.length || productRows.length)} />
          <Metric label="Trends today" value={fmtNumber(summaryTrends.length)} />
        </div>
      </section>

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

      {/* --- Affiliate setup (merged) --- */}
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>Affiliate programs</h2>
          <button className="btn btn-primary btn-sm" type="button" onClick={loadSetup}>Re-check</button>
        </div>
        {setupError ? <div className="ops-notice">{setupError}</div> : null}
        <Table
          columns={["Program", "Env var", "Status", ""]}
          rows={setupPrograms}
          empty="No affiliate programs."
          renderRow={(p) => (
            <tr key={p.code}>
              <td><strong>{p.name}</strong></td>
              <td className="ops-mono">{p.envVar}</td>
              <td><SignalPill state={p.configured ? "good" : "bad"}>{p.configured ? "configured" : "missing"}</SignalPill></td>
              <td>
                <button className="btn btn-secondary btn-sm" type="button" onClick={() => copyEnv(p.envVar)}>
                  {copied === p.envVar ? "Copied" : "Copy env var name"}
                </button>
              </td>
            </tr>
          )}
        />
      </section>

      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Link coverage</h2></div>
        <Table
          columns={["Program", "Posts linked"]}
          rows={linkCoverage}
          empty="No link coverage data."
          renderRow={(p) => (
            <tr key={p.code}>
              <td>{p.code}</td>
              <td>{fmtNumber(p.postsLinked)}</td>
            </tr>
          )}
        />
      </section>
    </div>
  );
}
