
import { useEffect, useState } from "react";
import { Metric, SignalPill, Table, fmtNumber, fmtMoney, fmtTime, getJson } from "./shared";

const PERIODS = [
  ["last7days", "Last 7 days"],
  ["last30days", "Last 30 days"],
  ["last90days", "Last 90 days"],
];

export default function AffiliateTab({ data }) {
  const snapshot = data["affiliate-stats"];
  const [period, setPeriod] = useState("last30days");
  const [aff, setAff] = useState(snapshot);
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

  useEffect(() => {
    let cancelled = false;
    getJson("affiliate-stats", { period })
      .then((res) => { if (!cancelled) setAff(res); })
      .catch(() => { /* keep the current snapshot on failure */ });
    return () => { cancelled = true; };
  }, [period]);

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
    </div>
  );
}
