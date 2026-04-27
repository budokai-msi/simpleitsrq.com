import { useEffect, useState, useMemo } from "react";
import { Link } from "../lib/Link";
import {
  ArrowLeft, BarChart3, ExternalLink, AlertTriangle, RefreshCw,
} from "lucide-react";
import { useAuth } from "../lib/authContext.js";
import { useSEO } from "../lib/seo";

// /admin/affiliates — admin-only dashboard for affiliate click attribution.
//
// Fluent-free: this page deliberately does NOT import @fluentui/* so it
// stays out of the ClientPortal lazy chunk and renders fast even on the
// first visit. Auth is server-side via /api/portal?action=affiliate-stats
// (which gates on requireAdmin). If the API returns 403, we show a
// "Not authorized" view; if it returns 503/configured=false, we show a
// "Database not reachable" hint.

const RANGE_OPTIONS = [7, 30, 60, 90];

// Approximate per-click commission ranges (cents) for back-of-envelope
// revenue estimation. Conservative — actual commissions vary by program,
// product mix, and conversion rate. Rendered as "estimated revenue range"
// not a guaranteed number.
const REVENUE_BY_NETWORK = {
  amazon:     { ratePct: 4,   notes: "Amazon Associates ~3-8% on hardware. Assumes ~3% click→conversion." },
  ubiquiti:   { ratePct: 5,   notes: "UniFi Partner Program ~3-8% on UniFi gear." },
  reolink:    { ratePct: 7,   notes: "Reolink Impact ~5-10% on Reolink hardware." },
  "B&H Photo":{ ratePct: 3,   notes: "B&H Pro Affiliate ~1-8% by category." },
  Backblaze:  { ratePct: 100, notes: "Backblaze ~$25-45 flat per signup." },
  bhphoto:    { ratePct: 3,   notes: "B&H Pro Affiliate ~1-8% by category." },
  backblaze:  { ratePct: 100, notes: "Backblaze ~$25-45 flat per signup." },
  Gusto:      { ratePct: 100, notes: "Gusto $200 flat per first-payroll signup." },
  gusto:      { ratePct: 100, notes: "Gusto $200 flat per first-payroll signup." },
  "1Password":{ ratePct: 100, notes: "1Password ~20-30% Year 1." },
  HoneyBook:  { ratePct: 100, notes: "HoneyBook $50-300 per signup." },
  Acronis:    { ratePct: 20,  notes: "Acronis 15-25% recurring." },
  unknown:    { ratePct: 2,   notes: "Network unknown — conservative 2% rough estimate." },
};

function fmtPct(n) { return n.toLocaleString("en-US", { maximumFractionDigits: 1 }) + "%"; }
function fmtNum(n) { return Number(n || 0).toLocaleString("en-US"); }
function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtTime(d) {
  return new Date(d).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function MiniBars({ rows, valueKey = "clicks", labelKey = "day" }) {
  const max = Math.max(...rows.map((r) => r[valueKey] || 0), 1);
  return (
    <div className="aff-bars" role="img" aria-label="Daily click volume">
      {rows.map((r, i) => {
        const pct = ((r[valueKey] || 0) / max) * 100;
        return (
          <div key={i} className="aff-bar" title={`${r[labelKey]}: ${r[valueKey]} clicks`}>
            <div className="aff-bar-fill" style={{ height: `${pct}%` }} />
          </div>
        );
      })}
    </div>
  );
}

export default function AdminAffiliates() {
  useSEO({
    title: "Affiliate Performance · Admin · Simple IT SRQ",
    description: "",
    canonical: "https://simpleitsrq.com/admin/affiliates",
    image: "https://simpleitsrq.com/og-image.png",
    robots: "noindex, nofollow",
  });

  const { user, loading: authLoading } = useAuth();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | forbidden | error

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setStatus("forbidden"); return; }

    let cancelled = false;
    fetch(`/api/portal?action=affiliate-stats&days=${days}`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    })
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (cancelled) return;
        if (r.status === 403) { setStatus("forbidden"); return; }
        if (!r.ok || !body?.ok) { setStatus("error"); return; }
        setData(body);
        setStatus("ready");
      })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, [authLoading, user, days]);

  // Setting status="loading" + clearing data lives OUTSIDE the effect so
  // the lint rule on set-state-in-effect stays clean. Called from the
  // range-button click handler.
  const changeRange = (next) => {
    if (next === days) return;
    setStatus("loading");
    setData(null);
    setDays(next);
  };

  const networkRows = data?.byNetwork ?? [];
  const dayRows = data?.byDay ?? [];
  const topPosts = data?.topPosts ?? [];
  const recent = data?.recent ?? [];

  const estimatedRevenue = useMemo(() => {
    let lo = 0, hi = 0;
    for (const row of networkRows) {
      const meta = REVENUE_BY_NETWORK[row.network] || REVENUE_BY_NETWORK.unknown;
      // Rough: convert clicks → est conversions (3%) → est revenue.
      const conversions = row.clicks * 0.03;
      if (meta.ratePct === 100) {
        // Flat-fee — use conversions × $35 average
        lo += conversions * 25;
        hi += conversions * 50;
      } else {
        // Percentage — assume $80 avg order value × rate
        lo += conversions * 80 * (meta.ratePct - 1) / 100;
        hi += conversions * 120 * (meta.ratePct + 2) / 100;
      }
    }
    return { lo, hi };
  }, [networkRows]);

  if (authLoading || status === "loading") {
    return (
      <main id="main" className="admin-affiliates">
        <div className="container" style={{ padding: "48px 24px", textAlign: "center" }}>
          <div className="route-spinner" aria-label="Loading" />
        </div>
      </main>
    );
  }

  if (status === "forbidden") {
    return (
      <main id="main" className="admin-affiliates">
        <div className="container" style={{ padding: "64px 24px", maxWidth: 560 }}>
          <h1 className="title-1">Not authorized</h1>
          <p>This page is admin-only. Sign in with an admin account to view affiliate performance.</p>
          <Link to="/portal" className="btn btn-primary">Go to portal sign-in <ExternalLink size={14} /></Link>
        </div>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main id="main" className="admin-affiliates">
        <div className="container" style={{ padding: "64px 24px", maxWidth: 560 }}>
          <h1 className="title-1">Couldn't load stats</h1>
          <p>The affiliate-stats endpoint returned an error. Check the Vercel function logs for /api/portal?action=affiliate-stats.</p>
          <button className="btn btn-primary" onClick={() => { setStatus("loading"); setData(null); }}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <main id="main" className="admin-affiliates">
      <div className="container">
        <header className="admin-aff-head">
          <Link to="/portal" className="admin-aff-back">
            <ArrowLeft size={14} /> Back to portal
          </Link>
          <h1 className="title-1">Affiliate Performance</h1>
          <p className="admin-aff-sub">
            Click-through volume across every configured affiliate network for
            the last {data.days} days. Revenue estimates are
            back-of-envelope — actual commissions vary by program, product
            mix, and conversion rate.
          </p>
          <div className="admin-aff-controls">
            {RANGE_OPTIONS.map((d) => (
              <button
                key={d}
                className={`admin-aff-range${days === d ? " is-active" : ""}`}
                onClick={() => changeRange(d)}
              >
                {d}d
              </button>
            ))}
          </div>
        </header>

        {/* Top stat strip */}
        <section className="admin-aff-strip">
          <div className="admin-aff-stat">
            <span className="admin-aff-stat-label">Total clicks</span>
            <span className="admin-aff-stat-value">{fmtNum(data.totalClicks)}</span>
          </div>
          <div className="admin-aff-stat">
            <span className="admin-aff-stat-label">Networks active</span>
            <span className="admin-aff-stat-value">{networkRows.length}</span>
          </div>
          <div className="admin-aff-stat">
            <span className="admin-aff-stat-label">Est. revenue range</span>
            <span className="admin-aff-stat-value">
              ${estimatedRevenue.lo.toFixed(0)} – ${estimatedRevenue.hi.toFixed(0)}
            </span>
          </div>
        </section>

        {/* Daily volume */}
        {dayRows.length > 0 && (
          <section className="admin-aff-section">
            <h2 className="title-2"><BarChart3 size={18} /> Daily click volume</h2>
            <div className="admin-aff-card">
              <MiniBars rows={dayRows} />
              <div className="admin-aff-bars-axis">
                <span>{dayRows[0] ? fmtDate(dayRows[0].day) : ""}</span>
                <span>{dayRows[dayRows.length - 1] ? fmtDate(dayRows[dayRows.length - 1].day) : ""}</span>
              </div>
            </div>
          </section>
        )}

        {/* Per-network */}
        <section className="admin-aff-section">
          <h2 className="title-2">By network</h2>
          {networkRows.length === 0 ? (
            <div className="admin-aff-empty">
              <AlertTriangle size={18} /> No clicks recorded in this window. Either no
              affiliate IDs are configured (set VITE_AFF_* in Vercel env) or
              traffic hasn't found them yet.
            </div>
          ) : (
            <div className="admin-aff-card">
              <table className="admin-aff-table">
                <thead>
                  <tr>
                    <th>Network</th>
                    <th>Clicks</th>
                    <th>Unique visitors</th>
                    <th>CTR per visitor</th>
                    <th>Last click</th>
                  </tr>
                </thead>
                <tbody>
                  {networkRows.map((r) => (
                    <tr key={r.network}>
                      <td><strong>{r.network}</strong></td>
                      <td>{fmtNum(r.clicks)}</td>
                      <td>{fmtNum(r.unique_visitors)}</td>
                      <td>{r.unique_visitors > 0 ? fmtPct((r.clicks / r.unique_visitors) * 100) : "—"}</td>
                      <td>{r.last_click ? fmtTime(r.last_click) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Top-converting posts */}
        {topPosts.length > 0 && (
          <section className="admin-aff-section">
            <h2 className="title-2">Top posts driving clicks</h2>
            <div className="admin-aff-card">
              <table className="admin-aff-table">
                <thead>
                  <tr>
                    <th>Post / page</th>
                    <th>Clicks</th>
                    <th>Networks engaged</th>
                  </tr>
                </thead>
                <tbody>
                  {topPosts.map((r) => (
                    <tr key={r.slug}>
                      <td>
                        <code className="admin-aff-slug">{r.slug}</code>
                      </td>
                      <td>{fmtNum(r.clicks)}</td>
                      <td>{r.networks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Recent activity log */}
        {recent.length > 0 && (
          <section className="admin-aff-section">
            <h2 className="title-2">Recent clicks</h2>
            <div className="admin-aff-card">
              <table className="admin-aff-table admin-aff-recent">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Network</th>
                    <th>Label</th>
                    <th>From</th>
                    <th>Country</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r, i) => (
                    <tr key={i}>
                      <td>{fmtTime(r.ts)}</td>
                      <td><strong>{r.network}</strong></td>
                      <td className="admin-aff-label">{r.label}</td>
                      <td><code className="admin-aff-slug">{r.slug || "/"}</code></td>
                      <td>{r.country || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
