import { useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Calendar,
  Globe,
  Monitor,
  MousePointerClick,
  Smartphone,
  Users,
} from "lucide-react";
import { Metric, SignalPill, fmtNumber } from "./shared";

// ─────────────────────────────────────────────────────────────
// Vercel-style Analytics tab.
//
// Mirrors the Vercel Analytics dashboard layout: a row of stat
// cards (visitors, page views, bounce rate) on top, then breakdown
// tables (top pages, referrers, countries, devices, browsers, OS,
// UTM) each with a proportional bar. Data comes from the site's own
// `visits` / `web_sessions` tables via the `analytics` portal action.
// ─────────────────────────────────────────────────────────────

const RANGES = [
  ["24h", "24h"],
  ["7d", "7d"],
  ["30d", "30d"],
  ["90d", "90d"],
];

// A Vercel-style breakdown row: label + value + proportional bar.
function BreakdownRow({ label, value, max, sub }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="vz-breakdown-row">
      <div className="vz-breakdown-row__main">
        <span className="vz-breakdown-row__label">{label}</span>
        <span className="vz-breakdown-row__value">{fmtNumber(value)}</span>
      </div>
      <div className="vz-breakdown-row__track">
        <div className="vz-breakdown-row__fill" style={{ width: `${pct}%` }} />
      </div>
      {sub ? <span className="vz-breakdown-row__sub">{sub}</span> : null}
    </div>
  );
}

// A Vercel-style breakdown panel (card with a title + rows).
function BreakdownPanel({ title, icon: Icon, rows, empty, max }) {
  return (
    <section className="admin-aff-card ops-panel vz-panel">
      <div className="ops-panel__head">
        <h2 className="vz-panel__title">{title}</h2>
        {Icon ? <Icon size={15} className="vz-panel__icon" /> : null}
      </div>
      {!rows?.length ? (
        <p className="ops-panel__copy">{empty || "No data yet."}</p>
      ) : (
        <div className="vz-breakdown">
          {rows.map((row, i) => (
            <BreakdownRow
              key={`${title}-${i}`}
              label={row.label}
              value={row.value}
              max={max}
              sub={row.sub}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// Stat card — Vercel's big-number + delta style.
function StatCard({ label, value, delta, icon: Icon, tone }) {
  return (
    <article className="admin-aff-card ops-panel vz-stat">
      <div className="vz-stat__top">
        <span className="vz-stat__label">{label}</span>
        {Icon ? <Icon size={15} className="vz-stat__icon" /> : null}
      </div>
      <div className="vz-stat__value" style={tone ? { color: tone } : undefined}>{value}</div>
      {delta != null ? (
        <div className={`vz-stat__delta${delta >= 0 ? " is-up" : " is-down"}`}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%
        </div>
      ) : null}
    </article>
  );
}

// Tiny sparkline from the daily series.
function Sparkline({ points }) {
  if (!points?.length) return <div className="vz-spark vz-spark--empty">no daily data</div>;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const w = 100, h = 28;
  const step = w / Math.max(points.length - 1, 1);
  const coords = points.map((p, i) => {
    const x = i * step;
    const y = h - ((p - min) / range) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg className="vz-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <polyline points={coords.join(" ")} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export default function AnalyticsTab({ data, errors, busy, runAction }) {
  const [range, setRange] = useState("7d");
  const a = data?.analytics;
  const stats = a?.stats || {};
  const daily = a?.daily || [];

  // Compute deltas vs the previous equal-length window (best-effort from
  // the daily series we have; falls back to null when we can't).
  const delta = useMemo(() => {
    if (!daily?.length) return null;
    const mid = Math.floor(daily.length / 2);
    const cur = daily.slice(mid).reduce((s, d) => s + d.visitors, 0);
    const prev = daily.slice(0, mid).reduce((s, d) => s + d.visitors, 0);
    if (!prev) return null;
    return Math.round(((cur - prev) / prev) * 100);
  }, [daily]);

  const maxPages = Math.max(...(a?.topPages || []).map(p => p.hits), 1);
  const maxRef = Math.max(...(a?.referrers || []).map(r => r.hits), 1);
  const maxCountry = Math.max(...(a?.countries || []).map(c => c.hits), 1);
  const maxDevice = Math.max(...(a?.devices || []).map(d => d.hits), 1);
  const maxBrowser = Math.max(...(a?.browsers || []).map(b => b.hits), 1);
  const maxOs = Math.max(...(a?.os || []).map(o => o.hits), 1);
  const maxUtm = Math.max(...(a?.utm || []).map(u => u.hits), 1);

  return (
    <div className="vz">
      {/* Range selector — Vercel's pill-style segmented control */}
      <div className="vz-toolbar">
        <div className="vz-range">
          {RANGES.map(([val, label]) => (
            <button
              key={val}
              className={`vz-range__btn${range === val ? " is-active" : ""}`}
              onClick={() => setRange(val)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="vz-toolbar__right">
          <SignalPill state={a ? "good" : "neutral"}>{a ? "live" : "loading"}</SignalPill>
          <button
            className="btn btn-secondary btn-sm"
            disabled={busy === "analytics"}
            onClick={() => runAction("analytics", { range }, "Analytics refreshed.")}
          >
            <BarChart3 size={13} style={{ marginRight: 6 }} />
            {busy === "analytics" ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {errors?.analytics ? (
        <div className="ops-empty" style={{ marginBottom: 16 }}>
          <Activity size={16} />
          <span>Analytics unavailable: {errors.analytics}</span>
        </div>
      ) : null}

      {/* Stat cards row */}
      <div className="vz-stats">
        <StatCard label="Visitors" value={fmtNumber(stats.visitors)} delta={delta} icon={Users} />
        <StatCard label="Page Views" value={fmtNumber(stats.pageViews)} icon={MousePointerClick} />
        <StatCard
          label="Bounce Rate"
          value={stats.bounceRate != null ? `${stats.bounceRate}%` : "—"}
          icon={Activity}
          tone={stats.bounceRate != null && stats.bounceRate > 60 ? "#c0392b" : undefined}
        />
        <StatCard label="Sessions" value={fmtNumber(stats.sessions)} icon={Calendar} />
      </div>

      {/* Daily trend sparkline */}
      <section className="admin-aff-card ops-panel ops-panel--wide vz-trend">
        <div className="ops-panel__head">
          <h2 className="vz-panel__title">Daily visitors</h2>
          <Sparkline points={daily.map(d => d.visitors)} />
        </div>
        <div className="vz-trend__days">
          {daily.map((d, i) => (
            <div className="vz-trend__day" key={i}>
              <span className="vz-trend__day-val">{fmtNumber(d.visitors)}</span>
              <span className="vz-trend__day-label">{new Date(d.day).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Breakdown panels — Vercel's two-column grid */}
      <div className="vz-grid">
        <BreakdownPanel
          title="Pages"
          icon={Globe}
          rows={(a?.topPages || []).map(p => ({ label: p.path, value: p.hits }))}
          max={maxPages}
          empty="No page views in this range."
        />
        <BreakdownPanel
          title="Referrers"
          icon={MousePointerClick}
          rows={(a?.referrers || []).map(r => ({ label: r.referrer, value: r.hits }))}
          max={maxRef}
          empty="No referrers in this range."
        />
        <BreakdownPanel
          title="Countries"
          icon={Globe}
          rows={(a?.countries || []).map(c => ({ label: c.country, value: c.hits }))}
          max={maxCountry}
          empty="No country data yet."
        />
        <BreakdownPanel
          title="Devices"
          icon={Smartphone}
          rows={(a?.devices || []).map(d => ({ label: d.device, value: d.hits }))}
          max={maxDevice}
          empty="No device data yet."
        />
        <BreakdownPanel
          title="Browsers"
          icon={Monitor}
          rows={(a?.browsers || []).map(b => ({ label: b.browser, value: b.hits }))}
          max={maxBrowser}
          empty="No browser data yet."
        />
        <BreakdownPanel
          title="Operating Systems"
          icon={Monitor}
          rows={(a?.os || []).map(o => ({ label: o.os, value: o.hits }))}
          max={maxOs}
          empty="No OS data yet."
        />
        <BreakdownPanel
          title="UTM Parameters"
          icon={BarChart3}
          rows={(a?.utm || []).map(u => ({ label: `${u.source} / ${u.medium}${u.campaign !== "(none)" ? ` / ${u.campaign}` : ""}`, value: u.hits }))}
          max={maxUtm}
          empty="No UTM data yet."
        />
      </div>
    </div>
  );
}
