import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  Eye,
  FileText,
  Lock,
  RadioTower,
  RefreshCcw,
  Search,
  Shield,
  Target,
  XCircle,
} from "lucide-react";
import { csrfFetch } from "../lib/csrf";
import { useSEO } from "../lib/seo";
import NotFound from "./NotFound";

const TABS = [
  ["ops", "Ops", Activity],
  ["visitors", "Visitors", Eye],
  ["drafts", "Drafts", FileText],
  ["affiliate", "Affiliate", DollarSign],
  ["leadgen", "Leadgen", Target],
  ["adsense", "AdSense", BarChart3],
  ["opsec", "OpSec", Shield],
];

const CORE_ACTIONS = [
  "admin-status",
  "ops-status",
  "countermeasures",
  "drafts",
  "affiliate-stats",
  "revenue-signals",
  "behavior-insights",
  "hot-leads",
  "lead-intel",
  "revenue-summary",
  "leadgen-status",
  "adsense-health",
  "opsec-data",
  "opsec-hunt-brief",
];

function fmtNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toLocaleString() : "-";
}

function fmtMoney(cents) {
  const n = Number(cents || 0) / 100;
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtTime(value) {
  if (!value) return "-";
  try { return new Date(value).toLocaleString(); } catch { return String(value); }
}

function fmtDuration(ms) {
  const sec = Math.round(Number(ms || 0) / 1000);
  if (!Number.isFinite(sec) || sec <= 0) return "0s";
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem ? `${min}m ${rem}s` : `${min}m`;
}

function formatJobProgress(row) {
  const total = Number(row?.total);
  const progress = Number(row?.progress);
  if (!Number.isFinite(total) || total <= 0) return row?.status === "done" ? "done" : "-";
  if (row?.status === "done" && row?.kind === "osm_zip" && progress === 0) return `${fmtNumber(total)} / ${fmtNumber(total)}`;
  if (!Number.isFinite(progress) || progress < 0) return `0 / ${fmtNumber(total)}`;
  return `${fmtNumber(progress)} / ${fmtNumber(total)}`;
}

function formatJobOutput(row) {
  const result = row?.result || {};
  if (row?.kind === "osm_zip") {
    const discovered = Number(result?.discovered ?? row?.total ?? 0);
    const inserted = Number(result?.inserted ?? 0);
    const updated = Number(result?.updated ?? 0);
    if (discovered > 0) return `${fmtNumber(discovered)} discovered | ${fmtNumber(inserted)} new | ${fmtNumber(updated)} refreshed`;
  }
  if (row?.kind === "website_emails") {
    if (result?.skipped) return `Skipped: ${result.skipped}`;
    const found = Number(result?.found ?? 0);
    const inserted = Number(result?.inserted ?? 0);
    return `${fmtNumber(found)} found | ${fmtNumber(inserted)} new`;
  }
  if (row?.error) return row.error;
  return "-";
}

async function getJson(action, params = {}) {
  const url = new URL("/api/portal", window.location.origin);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== "") url.searchParams.set(key, value);
  });
  const res = await fetch(url.pathname + url.search, { credentials: "same-origin" });
  const data = await res.json().catch(() => {
    throw new Error(`HTTP ${res.status} non_json_response`);
  });
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function postJson(action, body = {}) {
  const res = await csrfFetch(`/api/portal?action=${encodeURIComponent(action)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function SignalPill({ state, children }) {
  return <span className={`ops-pill ops-pill--${state || "neutral"}`}>{children}</span>;
}

function Metric({ label, value, hint, state }) {
  return (
    <article className="ops-metric">
      <span className="ops-metric__label">{label}</span>
      <strong>{value ?? "-"}</strong>
      {hint ? <span className={`ops-metric__hint${state ? ` is-${state}` : ""}`}>{hint}</span> : null}
    </article>
  );
}

function EmptyState({ children }) {
  return (
    <div className="ops-empty">
      <AlertTriangle size={16} />
      <span>{children}</span>
    </div>
  );
}

function Table({ columns, rows, empty, renderRow }) {
  if (!rows?.length) return <EmptyState>{empty || "No records yet."}</EmptyState>;
  return (
    <div className="ops-table-wrap">
      <table className="admin-aff-table ops-table">
        <thead>
          <tr>{columns.map((col) => <th key={col}>{col}</th>)}</tr>
        </thead>
        <tbody>{rows.map(renderRow)}</tbody>
      </table>
    </div>
  );
}

function deriveIntel(data) {
  const admin = data["admin-status"];
  const ops = data["ops-status"];
  const leadgen = data["leadgen-status"];
  const drafts = data.drafts?.drafts || [];
  const affiliate = data["affiliate-stats"];
  const adsense = data["adsense-health"];
  const opsec = data["opsec-data"];
  const env = admin?.env || {};
  const counts = admin?.counts || {};

  const checks = [
    {
      label: "Blog engine",
      state: env.GROQ_API_KEY && env.GITHUB_TOKEN ? "good" : "warn",
      detail: env.GROQ_API_KEY && env.GITHUB_TOKEN ? "Groq and GitHub publish path are present." : "Needs Groq plus GitHub token to publish cleanly.",
    },
    {
      label: "Leadgen engine",
      state: env.SMTP_HOST && env.SMTP_USER && Number(leadgen?.businesses?.total || 0) > 0 ? "good" : "warn",
      detail: `${fmtNumber(leadgen?.businesses?.total)} businesses, ${fmtNumber(leadgen?.emails?.deliverable)} deliverable emails.`,
    },
    {
      label: "Affiliate capture",
      state: (env.VITE_AFF_AMAZON_TAG || affiliate?.totalClicks > 0) ? "good" : "warn",
      detail: `${fmtNumber(affiliate?.totalClicks)} clicks in the selected window.`,
    },
    {
      label: "AdSense beacons",
      state: adsense && !adsense.noData ? "good" : "warn",
      detail: adsense?.headline || "Waiting for beacon data.",
    },
    {
      label: "OpSec tables",
      state: (opsec?.domains?.length || opsec?.iocs?.length || opsec?.threats?.total) ? "good" : "warn",
      detail: `${fmtNumber(opsec?.domains?.length)} watched domains, ${fmtNumber(opsec?.iocs?.length)} IOCs.`,
    },
    {
      label: "Audit chain",
      state: !ops ? "warn" : ops?.audit?.ok === false ? "bad" : "good",
      detail: !ops ? "Waiting for ops-status." : ops?.audit?.ok === false ? "Audit chain needs attention." : "Audit status endpoint is reachable.",
    },
  ];

  const actions = [];
  if (drafts.some((d) => d.status === "draft")) actions.push("Review pending blog drafts before they decay into noise.");
  if ((leadgen?.recent_jobs || []).some((j) => j.status === "failed")) actions.push("Open Leadgen jobs and clear failed crawls before launching campaigns.");
  if (!env.VITE_AFF_AMAZON_TAG) actions.push("Add Amazon Associates tag in Vercel before pushing more gadget content.");
  if (adsense?.noData) actions.push("Seed AdSense health from a clean browser after deploy and watch the first beacon.");
  if (!opsec?.domains?.length) actions.push("Add simpleitsrq.com and critical customer domains to OpSec watch.");
  if (!counts?.security_events?.n) actions.push("Verify security event collection so the ops timeline is not blind.");
  if (!actions.length) actions.push("Systems are online. Next move: publish one useful post, launch one narrow leadgen segment, and watch revenue signals.");

  return { checks, actions };
}

export default function AdminOps() {
  useSEO({
    title: "Admin Ops | Simple IT SRQ",
    description: "Internal Simple IT SRQ operations cockpit.",
    canonical: "https://simpleitsrq.com/portal/ops",
    robots: "noindex, nofollow",
  });

  const initialTab = new URLSearchParams(window.location.search).get("tab") || "ops";
  const [tab, setTab] = useState(TABS.some(([key]) => key === initialTab) ? initialTab : "ops");
  const [data, setData] = useState({});
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = async () => {
    setLoading(true);
    const entries = await Promise.all(CORE_ACTIONS.map(async (action) => {
      try {
        const params = action === "affiliate-stats" ? { days: "30" } : action === "adsense-health" ? { range: "7d" } : {};
        return [action, await getJson(action, params), null];
      } catch (e) {
        return [action, null, String(e.message || e)];
      }
    }));
    const nextData = {};
    const nextErrors = {};
    for (const [action, value, error] of entries) {
      if (error) nextErrors[action] = error;
      else nextData[action] = value;
    }
    setData(nextData);
    setErrors(nextErrors);
    setLoading(false);
  };

  useEffect(() => {
    let alive = true;
    const run = async () => { if (alive) await load(); };
    run();
    const timer = setInterval(run, 60_000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const forbidden = Object.values(errors).some((e) => /401|403|forbidden|unauthorized/i.test(e));
  const intel = useMemo(() => deriveIntel(data), [data]);

  const runAction = async (action, body, success) => {
    setBusy(action);
    setNotice(null);
    try {
      await postJson(action, body);
      setNotice(success || `${action} complete.`);
      await load();
    } catch (e) {
      setNotice(`Failed: ${String(e.message || e)}`);
    } finally {
      setBusy(null);
    }
  };

  const authConfirmed = Object.keys(data).length > 0;

  // Opsec: never confirm this route exists to a non-admin. A probe that isn't
  // authorized — or any visitor before the admin check resolves — sees the
  // ordinary site 404, not a "restricted, sign in" page that reveals an admin
  // surface lives here. The real gate is server-side (requireAdmin on every
  // action); this just removes the client-side disclosure.
  if (forbidden || (!authConfirmed && !loading)) {
    return <NotFound />;
  }

  // Hold the dashboard shell (tabs, panel structure) until at least one admin
  // action has returned data, so the cockpit layout isn't exposed during the
  // initial auth round-trip.
  if (!authConfirmed) {
    return (
      <main id="main" className="section">
        <div className="container" style={{ padding: "80px 0", textAlign: "center", color: "var(--syn-text-muted, #6b7280)" }}>
          <Lock size={20} aria-hidden="true" />
          <p style={{ marginTop: 12 }}>Loading…</p>
        </div>
      </main>
    );
  }

  return (
    <main id="main" className="section admin-affiliates admin-ops">
      <div className="container">
        <header className="admin-aff-head ops-head">
          <Link to="/portal" className="admin-aff-back">Portal</Link>
          <div className="ops-head__row">
            <div>
              <h1 className="display-2">Operations</h1>
              <p className="admin-aff-sub">
                Internal command surface for revenue, content, leadgen, AdSense, and defensive operations.
              </p>
            </div>
            <div className="ops-head__actions">
              <SignalPill state={loading ? "neutral" : "good"}>{loading ? "Syncing" : "Live"}</SignalPill>
              <button className="btn btn-secondary btn-sm" type="button" onClick={load} disabled={loading}>
                <RefreshCcw size={14} /> Refresh
              </button>
            </div>
          </div>
          {notice ? <div className="ops-notice">{notice}</div> : null}
        </header>

        <section className="ops-graph">
          <div className="ops-graph__main">
            <h2>Operating graph</h2>
            <p>Sources feed functions. Functions create outcomes. Anything weak shows up here before it turns into wasted traffic.</p>
          </div>
          <div className="ops-graph__rail" aria-label="Data flow">
            {["Traffic", "HN drafts", "OSM leads", "Affiliate clicks", "Ad beacons", "Threat feeds"].map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </section>

        <div className="ops-status-grid">
          {intel.checks.map((check) => (
            <article className="ops-status-card" key={check.label}>
              {check.state === "good" ? <CheckCircle2 size={18} /> : check.state === "bad" ? <XCircle size={18} /> : <AlertTriangle size={18} />}
              <div>
                <strong>{check.label}</strong>
                <p>{check.detail}</p>
              </div>
              <SignalPill state={check.state}>{check.state}</SignalPill>
            </article>
          ))}
        </div>

        <nav className="admin-leadgen-tabs ops-tabs" aria-label="Admin ops sections">
          {TABS.map(([key, label, Icon]) => (
            <button
              key={key}
              className={`admin-leadgen-tab${tab === key ? " is-active" : ""}`}
              type="button"
              onClick={() => setTab(key)}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </nav>

        <section className="admin-leadgen-tab-body">
          {tab === "ops" && <OpsTab data={data} errors={errors} intel={intel} busy={busy} runAction={runAction} />}
          {tab === "visitors" && <VisitorsTab data={data["behavior-insights"]} hotLeads={data["hot-leads"]} leadIntel={data["lead-intel"]} errors={errors} />}
          {tab === "drafts" && <DraftsTab drafts={data.drafts?.drafts || []} errors={errors} busy={busy} runAction={runAction} />}
          {tab === "affiliate" && <AffiliateTab data={data} />}
          {tab === "leadgen" && <LeadgenTab status={data["leadgen-status"]} />}
          {tab === "adsense" && <AdsenseTab health={data["adsense-health"]} />}
          {tab === "opsec" && <OpsecTab data={{ ...(data["opsec-data"] || {}), huntBrief: data["opsec-hunt-brief"] }} busy={busy} runAction={runAction} />}
        </section>
      </div>
    </main>
  );
}

function OpsTab({ data, errors, intel, busy, runAction }) {
  const admin = data["admin-status"];
  const counts = admin?.counts || {};
  const revenue = data["revenue-summary"];
  const ops = data["ops-status"];
  return (
    <div className="ops-grid">
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head">
          <h2>Next actions</h2>
          <SignalPill state="neutral">computed</SignalPill>
        </div>
        <ol className="ops-action-list">
          {intel.actions.map((action) => <li key={action}>{action}</li>)}
        </ol>
      </section>

      <section className="admin-aff-card ops-panel">
        <div className="ops-panel__head"><h2>Revenue</h2></div>
        <div className="ops-metric-grid">
          <Metric label="30-day Stripe" value={revenue?.configured ? fmtMoney(revenue.paid_total_cents) : "Not configured"} />
          <Metric label="MRR" value={revenue?.configured ? fmtMoney(revenue.mrr_cents) : "-"} />
          <Metric label="Paid invoices" value={revenue?.configured ? fmtNumber(revenue.paid_count) : "-"} />
        </div>
      </section>

      <section className="admin-aff-card ops-panel">
        <div className="ops-panel__head"><h2>Database pulse</h2></div>
        <div className="ops-metric-grid">
          <Metric label="Lead businesses" value={fmtNumber(counts.lead_businesses?.n)} hint={`${fmtNumber(counts.lead_businesses?.active)} active`} />
          <Metric label="Email contacts" value={fmtNumber(counts.lead_emails?.n)} hint={`${fmtNumber(counts.lead_emails?.deliverable)} deliverable`} />
          <Metric label="Security events" value={fmtNumber(counts.security_events?.n)} />
          <Metric label="Engagement events" value={fmtNumber(counts.engagement_events?.n)} />
        </div>
      </section>

      <section className="admin-aff-card ops-panel">
        <div className="ops-panel__head"><h2>Functions</h2></div>
        <div className="ops-button-stack">
          <button className="btn btn-secondary btn-sm" disabled={busy === "run-audit-migration"} onClick={() => runAction("run-audit-migration", {}, "Audit/ops migrations checked.")}>Run migrations</button>
          <button className="btn btn-secondary btn-sm" disabled={busy === "osint-refresh"} onClick={() => runAction("osint-refresh", {}, "OSINT feeds refreshed.")}>Refresh OSINT</button>
          <Link className="btn btn-primary btn-sm" to="/portal/leadgen">Open Leadgen</Link>
        </div>
      </section>

      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Recent jobs</h2><SignalPill state={errors["admin-status"] ? "bad" : "good"}>{errors["admin-status"] || "admin-status"}</SignalPill></div>
        <Table
          columns={["ID", "Kind", "Status", "Progress", "Created", "Output"]}
          rows={admin?.recent_jobs || []}
          empty="No leadgen jobs have run yet."
          renderRow={(row) => (
            <tr key={row.id || row.error}>
              <td>{row.id || "-"}</td>
              <td>{row.kind || "-"}</td>
              <td><SignalPill state={row.status === "failed" ? "bad" : row.status === "done" ? "good" : "neutral"}>{row.status || "-"}</SignalPill></td>
              <td>{formatJobProgress(row)}</td>
              <td>{fmtTime(row.created_at)}</td>
              <td>{formatJobOutput(row)}</td>
            </tr>
          )}
        />
      </section>

      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Ops status</h2></div>
        <pre className="ops-pre">{JSON.stringify({ migrations: ops?.migrations, osint: ops?.osint, errors }, null, 2)}</pre>
      </section>
    </div>
  );
}

function HotLeadsPanel({ hotLeads, error }) {
  const leads = hotLeads?.leads || [];
  return (
    <section className="admin-aff-card ops-panel ops-panel--wide">
      <div className="ops-panel__head">
        <h2>🔥 Hot leads</h2>
        <SignalPill state={hotLeads?.local_count ? "good" : "neutral"}>
          {fmtNumber(hotLeads?.local_count)} local · {fmtNumber(leads.length)} ranked
        </SignalPill>
      </div>
      <p className="ops-panel__copy">
        Recent visitors scored by how likely they are to become an IT client — local geo,
        high-intent pages (services, booking, leadgen, contact, city pages), time on site, and depth.
      </p>
      {error ? <EmptyState>{error}</EmptyState> : null}
      {!error && leads.length === 0 ? <EmptyState>No ranked sessions yet — leads appear here as visitors engage.</EmptyState> : null}
      {leads.length > 0 ? (
        <table className="admin-aff-table ops-table">
          <thead>
            <tr><th>Score</th><th>Location</th><th>Activity</th><th>Entry → Exit</th><th>Source</th><th>Why</th></tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id}>
                <td>
                  <strong style={{ color: l.score >= 70 ? "#067647" : l.score >= 40 ? "#B54708" : "inherit" }}>{l.score}</strong>
                </td>
                <td>
                  {l.is_local ? <span title="In the service area" style={{ marginRight: 6 }}>📍</span> : null}
                  {l.location}
                </td>
                <td className="admin-leadgen-muted">{l.page_count} pp · {l.dwell_sec}s · {l.max_scroll_pct}%{l.engaged ? " · engaged" : ""}</td>
                <td className="admin-leadgen-muted" style={{ fontSize: 11 }}>{l.landing_path || "?"}{l.exit_path && l.exit_path !== l.landing_path ? ` → ${l.exit_path}` : ""}</td>
                <td className="admin-leadgen-muted" style={{ fontSize: 11 }}>{l.referrer}</td>
                <td className="admin-leadgen-muted" style={{ fontSize: 11 }}>{(l.reasons || []).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}

function FunnelBar({ label, value, pct, tone }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
        <span>{label}</span>
        <strong>{fmtNumber(value)} <span style={{ opacity: 0.6, fontWeight: 400 }}>({pct}%)</span></strong>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: "var(--syn-surface-2, #eef1f4)", overflow: "hidden" }}>
        <div style={{ width: `${Math.max(2, pct)}%`, height: "100%", background: tone || "#0F6CBD" }} />
      </div>
    </div>
  );
}

function LeadIntelPanels({ leadIntel, error }) {
  const funnel = leadIntel?.funnel || {};
  const returning = leadIntel?.returning || [];
  const sources = leadIntel?.sources || [];
  return (
    <>
      <section className="admin-aff-card ops-panel">
        <div className="ops-panel__head"><h2>Conversion funnel</h2><SignalPill state={funnel.sessions ? "good" : "neutral"}>14 days</SignalPill></div>
        {error ? <EmptyState>{error}</EmptyState> : null}
        <FunnelBar label="Visitors (sessions)" value={funnel.sessions} pct={100} tone="#0F6CBD" />
        <FunnelBar label="Engaged" value={funnel.engaged} pct={funnel.engaged_pct} tone="#2563eb" />
        <FunnelBar label="High-intent pages" value={funnel.high_intent} pct={funnel.high_intent_pct} tone="#7c3aed" />
        <FunnelBar label="Reached booking / contact" value={funnel.reached_booking} pct={funnel.reached_booking_pct} tone="#067647" />
      </section>

      <section className="admin-aff-card ops-panel">
        <div className="ops-panel__head"><h2>Traffic sources</h2><SignalPill state={sources.length ? "good" : "neutral"}>14 days</SignalPill></div>
        {error ? <EmptyState>{error}</EmptyState> : null}
        {!error && sources.length === 0 ? <EmptyState>No source data yet.</EmptyState> : null}
        {sources.length ? (
          <table className="admin-aff-table ops-table">
            <thead><tr><th>Source</th><th style={{ textAlign: "right" }}>Sessions</th><th style={{ textAlign: "right" }}>Engaged</th></tr></thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.source}><td>{s.source}</td><td style={{ textAlign: "right" }}>{fmtNumber(s.sessions)}</td><td style={{ textAlign: "right" }}>{s.engaged_pct}%</td></tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>

      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Returning visitors</h2><SignalPill state={returning.length ? "good" : "neutral"}>{fmtNumber(returning.length)} watching · 30d</SignalPill></div>
        {error ? <EmptyState>{error}</EmptyState> : null}
        {!error && returning.length === 0 ? <EmptyState>No repeat visitors yet — they show up here after a second visit.</EmptyState> : null}
        {returning.length ? (
          <table className="admin-aff-table ops-table">
            <thead><tr><th>Location</th><th style={{ textAlign: "right" }}>Visits</th><th style={{ textAlign: "right" }}>Days</th><th style={{ textAlign: "right" }}>Pages</th><th>Engaged</th></tr></thead>
            <tbody>
              {returning.map((r) => (
                <tr key={r.anon_id}>
                  <td>{r.location}</td>
                  <td style={{ textAlign: "right" }}>{fmtNumber(r.sessions)}</td>
                  <td style={{ textAlign: "right" }}>{fmtNumber(r.days)}</td>
                  <td style={{ textAlign: "right" }}>{fmtNumber(r.total_pages)}</td>
                  <td>{r.ever_engaged ? "✓" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
    </>
  );
}

function VisitorsTab({ data, hotLeads, leadIntel, errors }) {
  const totals = data?.totals || {};
  const situationFunnel = data?.situationFunnel || {};
  const engagedRate = totals.sessions14d
    ? Math.round((Number(totals.engaged14d || 0) / Number(totals.sessions14d || 1)) * 100)
    : 0;
  return (
    <div className="ops-grid">
      <HotLeadsPanel hotLeads={hotLeads} error={errors["hot-leads"]} />
      <LeadIntelPanels leadIntel={leadIntel} error={errors["lead-intel"]} />
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head">
          <h2>Live visitor intent</h2>
          <SignalPill state={totals.liveSessions ? "good" : "neutral"}>{fmtNumber(totals.liveSessions)} live</SignalPill>
        </div>
        <p className="ops-panel__copy">
          {data?.privacy?.note || "Field telemetry stores intent signals, not raw private form contents."}
        </p>
        {errors["behavior-insights"] ? <EmptyState>{errors["behavior-insights"]}</EmptyState> : null}
        <div className="ops-metric-grid">
          <Metric label="Live sessions" value={fmtNumber(totals.liveSessions)} hint="active in 30 min" />
          <Metric label="14d sessions" value={fmtNumber(totals.sessions14d)} />
          <Metric label="14d visitors" value={fmtNumber(totals.visitors14d)} />
          <Metric label="Engaged rate" value={`${engagedRate}%`} hint={`${fmtNumber(totals.engaged14d)} engaged`} />
        </div>
      </section>

      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Active sessions</h2><RadioTower size={16} /></div>
        <Table
          columns={["Last", "Interest", "Current page", "Pages", "Dwell", "Scroll", "Location", "Last action"]}
          rows={data?.liveSessions || []}
          empty="No active sessions in the last 30 minutes."
          renderRow={(row) => (
            <tr key={row.id}>
              <td>{fmtTime(row.lastActivity)}</td>
              <td><SignalPill state={row.engaged ? "good" : "neutral"}>{row.interest || "General site"}</SignalPill></td>
              <td className="ops-path-cell">{row.exitPath || row.landingPath || "-"}</td>
              <td>{fmtNumber(row.pageCount)}</td>
              <td>{fmtDuration(row.totalDwellMs)}</td>
              <td>{fmtNumber(row.maxScrollPct)}%</td>
              <td>{[row.city, row.region, row.country].filter(Boolean).join(", ") || "-"}</td>
              <td>{row.lastEventKind || "-"}</td>
            </tr>
          )}
        />
      </section>

      <section className="admin-aff-card ops-panel">
        <div className="ops-panel__head"><h2>Product interest</h2></div>
        <Table
          columns={["Area", "Views", "Visitors", "Sessions"]}
          rows={data?.interests || []}
          empty="No interest data yet."
          renderRow={(row) => (
            <tr key={row.interest}>
              <td><strong>{row.interest}</strong></td>
              <td>{fmtNumber(row.views)}</td>
              <td>{fmtNumber(row.visitors)}</td>
              <td>{fmtNumber(row.sessions)}</td>
            </tr>
          )}
        />
      </section>

      <section className="admin-aff-card ops-panel">
        <div className="ops-panel__head"><h2>Retention</h2></div>
        <Table
          columns={["Day", "Sessions", "Visitors", "Engaged", "Avg pages", "Avg dwell"]}
          rows={data?.retention || []}
          empty="No retention data yet."
          renderRow={(row) => (
            <tr key={row.day}>
              <td>{row.day}</td>
              <td>{fmtNumber(row.sessions)}</td>
              <td>{fmtNumber(row.visitors)}</td>
              <td>{fmtNumber(row.engaged_sessions)}</td>
              <td>{row.avg_pages || "-"}</td>
              <td>{row.avg_dwell_sec ? `${row.avg_dwell_sec}s` : "-"}</td>
            </tr>
          )}
        />
      </section>

      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Homepage situation funnel (14d)</h2><Target size={16} /></div>
        <div className="ops-metric-grid">
          <Metric label="First interactions" value={fmtNumber(situationFunnel.first_interactions)} />
          <Metric label="Scenario switches" value={fmtNumber(situationFunnel.switches)} />
          <Metric label="CTA clicks" value={fmtNumber(situationFunnel.cta_clicks)} />
          <Metric label="Primary CTA" value={fmtNumber(situationFunnel.primary_cta_clicks)} hint="Book support" />
          <Metric label="Secondary CTA" value={fmtNumber(situationFunnel.secondary_cta_clicks)} hint="See services" />
        </div>
      </section>

      <section className="admin-aff-card ops-panel">
        <div className="ops-panel__head"><h2>Scenario performance</h2></div>
        <Table
          columns={["Scenario", "Switches", "CTA clicks", "Primary", "Secondary"]}
          rows={data?.situationByScenario || []}
          empty="No scenario interaction data yet."
          renderRow={(row) => (
            <tr key={row.scenario_id}>
              <td><strong>{row.scenario_id || "unknown"}</strong></td>
              <td>{fmtNumber(row.switches)}</td>
              <td>{fmtNumber(row.cta_clicks)}</td>
              <td>{fmtNumber(row.primary_clicks)}</td>
              <td>{fmtNumber(row.secondary_clicks)}</td>
            </tr>
          )}
        />
      </section>

      <section className="admin-aff-card ops-panel">
        <div className="ops-panel__head"><h2>Recent funnel events</h2></div>
        <Table
          columns={["Time", "Event", "Scenario", "Detail"]}
          rows={data?.situationRecent || []}
          empty="No recent funnel events yet."
          renderRow={(row, index) => (
            <tr key={`${row.ts}-${index}`}>
              <td>{fmtTime(row.ts)}</td>
              <td>{row.kind || "-"}</td>
              <td>{row.meta?.scenario_id || row.meta?.selected_scenario || row.value_text || "-"}</td>
              <td>{row.meta?.cta_kind || (row.meta?.from_scenario && row.meta?.to_scenario ? `${row.meta.from_scenario} → ${row.meta.to_scenario}` : "-")}</td>
            </tr>
          )}
        />
      </section>

      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>On-site searches</h2><Search size={16} /></div>
        <Table
          columns={["Time", "Query", "Results", "Page", "Interest", "Location"]}
          rows={data?.searchTerms || []}
          empty="No site searches recorded yet."
          renderRow={(row, index) => (
            <tr key={`${row.ts}-${row.query}-${index}`}>
              <td>{fmtTime(row.ts)}</td>
              <td><strong>{row.query || "-"}</strong></td>
              <td>{row.result_count != null ? fmtNumber(row.result_count) : "-"}</td>
              <td className="ops-path-cell">{row.path || "-"}</td>
              <td>{row.interest || "-"}</td>
              <td>{[row.city, row.region, row.country].filter(Boolean).join(", ") || "-"}</td>
            </tr>
          )}
        />
      </section>

      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Typing and form intent</h2><Eye size={16} /></div>
        <Table
          columns={["Time", "Interest", "Page", "Form", "Field", "Length"]}
          rows={data?.typedSignals || []}
          empty="No form focus or typing-intent events yet."
          renderRow={(row, index) => (
            <tr key={`${row.ts}-${index}`}>
              <td>{fmtTime(row.ts)}</td>
              <td>{row.interest || "-"}</td>
              <td className="ops-path-cell">{row.path || "-"}</td>
              <td>{row.meta?.form || "-"}</td>
              <td><strong>{row.meta?.field || row.value_text || "-"}</strong></td>
              <td>{row.value_num != null ? fmtNumber(row.value_num) : "-"}</td>
            </tr>
          )}
        />
      </section>

      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Top forms</h2></div>
        <Table
          columns={["Form", "Field", "Events", "Sessions", "Last seen"]}
          rows={data?.topForms || []}
          empty="No form-level activity yet."
          renderRow={(row) => (
            <tr key={`${row.form}-${row.field}`}>
              <td>{row.form}</td>
              <td><strong>{row.field}</strong></td>
              <td>{fmtNumber(row.events)}</td>
              <td>{fmtNumber(row.sessions)}</td>
              <td>{fmtTime(row.last_seen)}</td>
            </tr>
          )}
        />
      </section>

      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Page depth</h2></div>
        <Table
          columns={["Path", "Exits", "Avg dwell", "Avg scroll", "Clicks"]}
          rows={data?.contentDepth || []}
          empty="No page-depth events yet."
          renderRow={(row) => (
            <tr key={row.path}>
              <td className="ops-path-cell">{row.path}</td>
              <td>{fmtNumber(row.exits)}</td>
              <td>{row.avg_dwell_sec ? `${row.avg_dwell_sec}s` : "-"}</td>
              <td>{row.avg_scroll ? `${row.avg_scroll}%` : "-"}</td>
              <td>{fmtNumber(row.clicks)}</td>
            </tr>
          )}
        />
      </section>
    </div>
  );
}

function DraftsTab({ drafts, errors, busy, runAction }) {
  const pending = drafts.filter((d) => d.status === "draft");
  return (
    <div className="ops-grid">
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head">
          <h2>Blog drafts</h2>
          <SignalPill state={pending.length ? "warn" : "good"}>{pending.length} pending</SignalPill>
        </div>
        {errors.drafts ? <EmptyState>{errors.drafts}</EmptyState> : null}
        <Table
          columns={["Title", "Status", "Category", "Created", "Actions"]}
          rows={drafts}
          empty="No HN/local blog drafts yet."
          renderRow={(draft) => (
            <tr key={draft.id}>
              <td>
                <strong>{draft.title}</strong>
                <div className="admin-aff-slug">{draft.slug}</div>
              </td>
              <td><SignalPill state={draft.status === "published" ? "good" : draft.status === "rejected" ? "bad" : "warn"}>{draft.status}</SignalPill></td>
              <td>{draft.category || "-"}</td>
              <td>{fmtTime(draft.createdAt)}</td>
              <td className="ops-row-actions">
                {draft.status === "draft" ? (
                  <>
                    <button className="btn btn-secondary btn-sm" disabled={busy === "reject-draft"} onClick={() => runAction("reject-draft", { id: draft.id }, "Draft rejected.")}>Reject</button>
                    <button className="btn btn-primary btn-sm" disabled={busy === "publish-draft"} onClick={() => runAction("publish-draft", { id: draft.id }, "Draft published to GitHub.")}>Publish</button>
                  </>
                ) : null}
              </td>
            </tr>
          )}
        />
      </section>
    </div>
  );
}

function AffiliateTab({ data }) {
  const aff = data["affiliate-stats"];
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
  return (
    <div className="ops-grid">
      <section className="admin-aff-card ops-panel">
        <div className="ops-panel__head"><h2>Affiliate signal</h2></div>
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
        <div className="ops-panel__head"><h2>Recent clicks</h2></div>
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

function LeadgenTab({ status }) {
  return (
    <div className="ops-grid">
      <section className="admin-aff-card ops-panel">
        <div className="ops-panel__head"><h2>Pipeline</h2><Link className="btn btn-primary btn-sm" to="/portal/leadgen">Open workspace</Link></div>
        <div className="ops-metric-grid">
          <Metric label="Businesses" value={fmtNumber(status?.businesses?.total)} hint={`${fmtNumber(status?.businesses?.with_website)} with website`} />
          <Metric label="Deliverable emails" value={fmtNumber(status?.emails?.deliverable)} />
          <Metric label="Campaigns" value={fmtNumber(status?.campaigns?.total)} hint={`${fmtNumber(status?.campaigns?.running)} running`} />
          <Metric label="Replies" value={fmtNumber(status?.sends?.replied)} />
        </div>
      </section>
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Recent crawl jobs</h2></div>
        <Table
          columns={["ID", "Kind", "Status", "Progress", "Created", "Output"]}
          rows={status?.recent_jobs || []}
          empty="No leadgen jobs yet."
          renderRow={(row) => (
            <tr key={row.id}>
              <td>{row.id}</td>
              <td>{row.kind}</td>
              <td><SignalPill state={row.status === "failed" ? "bad" : row.status === "done" ? "good" : "neutral"}>{row.status}</SignalPill></td>
              <td>{formatJobProgress(row)}</td>
              <td>{fmtTime(row.created_at)}</td>
              <td>{formatJobOutput(row)}</td>
            </tr>
          )}
        />
      </section>
    </div>
  );
}

function AdsenseTab({ health }) {
  return (
    <div className="ops-grid">
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>AdSense health</h2><SignalPill state={health?.noData ? "warn" : "good"}>{health?.range || "7d"}</SignalPill></div>
        <p className="ops-panel__copy">{health?.headline || health?.hint || "No AdSense health response yet."}</p>
        <div className="ops-metric-grid">
          <Metric label="Sessions" value={fmtNumber(health?.summary?.sessions)} />
          <Metric label="Slots" value={fmtNumber(health?.summary?.totalSlots)} />
          <Metric label="Filled" value={`${health?.summary?.fillPct ?? 0}%`} />
          <Metric label="Blocked" value={`${health?.summary?.blockedPct ?? 0}%`} />
        </div>
      </section>
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Pages</h2></div>
        <Table
          columns={["Path", "Sessions", "Slots", "Filled", "Blocked", "Timeout"]}
          rows={health?.byPath || []}
          empty="No page-level AdSense beacons yet."
          renderRow={(row) => (
            <tr key={row.path}>
              <td>{row.path}</td>
              <td>{fmtNumber(row.sessions)}</td>
              <td>{fmtNumber(row.slots)}</td>
              <td>{fmtNumber(row.filled)}</td>
              <td>{fmtNumber(row.blocked)}</td>
              <td>{fmtNumber(row.timeout)}</td>
            </tr>
          )}
        />
      </section>
    </div>
  );
}

function OpsecTab({ data, busy, runAction }) {
  const hunt = data?.huntBrief;
  const [domain, setDomain] = useState("");
  const [ioc, setIoc] = useState({ ioc_type: "domain", value: "", severity: "medium" });
  const [note, setNote] = useState({ title: "", body: "", tags: "" });

  return (
    <div className="ops-grid">
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head">
          <h2>Hunt brief</h2>
          <SignalPill state={hunt?.level === "critical" ? "bad" : hunt?.level === "elevated" ? "warn" : "good"}>
            {hunt?.level || "loading"}
          </SignalPill>
        </div>
        <p className="ops-panel__copy">{hunt?.headline || "Building defensive brief from recent security telemetry."}</p>
        <div className="ops-metric-grid">
          <Metric label="24h threats" value={fmtNumber(hunt?.metrics?.threats24h)} hint={`${fmtNumber(hunt?.metrics?.threatIps24h)} IPs`} />
          <Metric label="Campaigns" value={fmtNumber(hunt?.campaigns?.length)} hint="rotating fingerprints" />
          <Metric label="Exploit events" value={fmtNumber(hunt?.metrics?.exploitEvents24h)} />
          <Metric label="Honeypot creds" value={fmtNumber(hunt?.metrics?.honeypotCredentials24h)} />
          <Metric label="Threat feeds" value={fmtNumber(hunt?.metrics?.threatFeedEntries)} hint={`${fmtNumber(hunt?.metrics?.threatFeedSources)} sources`} />
          <Metric label="Active IOCs" value={fmtNumber(hunt?.metrics?.activeIocs)} />
        </div>
      </section>
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Action queue</h2><Shield size={16} /></div>
        <Table
          columns={["Priority", "Action", "Reason"]}
          rows={hunt?.actionQueue || []}
          empty="No hunt actions yet."
          renderRow={(row) => (
            <tr key={`${row.priority}-${row.action}`}>
              <td><SignalPill state={row.priority === "P0" || row.priority === "P1" ? "bad" : row.priority === "P2" ? "warn" : "neutral"}>{row.priority}</SignalPill></td>
              <td><strong>{row.action}</strong></td>
              <td>{row.reason}</td>
            </tr>
          )}
        />
      </section>
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Top attackers</h2><RadioTower size={16} /></div>
        <Table
          columns={["IP", "Hits", "Country", "Classes", "Last seen"]}
          rows={hunt?.topAttackers || []}
          empty="No attacker telemetry in the selected window."
          renderRow={(row) => (
            <tr key={row.ip}>
              <td className="ops-mono">{row.ip}</td>
              <td>{fmtNumber(row.hits)}</td>
              <td>{row.country || "-"}</td>
              <td>{(row.classes || []).join(", ") || "-"}</td>
              <td>{fmtTime(row.lastSeen)}</td>
            </tr>
          )}
        />
      </section>
      <section className="admin-aff-card ops-panel">
        <div className="ops-panel__head"><h2>Add watch</h2><Eye size={16} /></div>
        <div className="ops-form-row">
          <input className="admin-leadgen-input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="domain.com" />
          <button className="btn btn-primary btn-sm" disabled={busy === "opsec-domain-add"} onClick={() => runAction("opsec-domain-add", { domain }, "Domain added to watch list.").then(() => setDomain(""))}>Add</button>
        </div>
      </section>
      <section className="admin-aff-card ops-panel">
        <div className="ops-panel__head"><h2>Add IOC</h2><RadioTower size={16} /></div>
        <div className="ops-form-grid">
          <select className="admin-leadgen-input" value={ioc.ioc_type} onChange={(e) => setIoc({ ...ioc, ioc_type: e.target.value })}>
            {["ip", "domain", "url", "email", "hash", "cidr", "user_agent", "other"].map((type) => <option key={type}>{type}</option>)}
          </select>
          <select className="admin-leadgen-input" value={ioc.severity} onChange={(e) => setIoc({ ...ioc, severity: e.target.value })}>
            {["low", "medium", "high", "critical"].map((severity) => <option key={severity}>{severity}</option>)}
          </select>
          <input className="admin-leadgen-input ops-form-grid__full" value={ioc.value} onChange={(e) => setIoc({ ...ioc, value: e.target.value })} placeholder="indicator value" />
          <button className="btn btn-primary btn-sm ops-form-grid__full" disabled={busy === "opsec-ioc-add"} onClick={() => runAction("opsec-ioc-add", ioc, "IOC saved.").then(() => setIoc({ ...ioc, value: "" }))}>Save IOC</button>
        </div>
      </section>
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Watched domains</h2></div>
        <Table
          columns={["Domain", "Label", "Active", "Last scanned"]}
          rows={data?.domains || []}
          empty="No watched domains yet."
          renderRow={(row) => (
            <tr key={row.id}>
              <td>{row.domain}</td>
              <td>{row.label || "-"}</td>
              <td><SignalPill state={row.is_active ? "good" : "neutral"}>{row.is_active ? "active" : "paused"}</SignalPill></td>
              <td>{fmtTime(row.last_scanned_at)}</td>
            </tr>
          )}
        />
      </section>
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Indicators</h2></div>
        <Table
          columns={["Type", "Value", "Severity", "Source", "Last seen"]}
          rows={data?.iocs || []}
          empty="No indicators saved."
          renderRow={(row) => (
            <tr key={row.id}>
              <td>{row.ioc_type}</td>
              <td className="ops-mono">{row.value}</td>
              <td><SignalPill state={row.severity === "critical" || row.severity === "high" ? "bad" : row.severity === "medium" ? "warn" : "neutral"}>{row.severity}</SignalPill></td>
              <td>{row.source || "-"}</td>
              <td>{fmtTime(row.last_seen_at)}</td>
            </tr>
          )}
        />
      </section>
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Notes</h2><Search size={16} /></div>
        <div className="ops-note-editor">
          <input className="admin-leadgen-input" value={note.title} onChange={(e) => setNote({ ...note, title: e.target.value })} placeholder="Title" />
          <input className="admin-leadgen-input" value={note.tags} onChange={(e) => setNote({ ...note, tags: e.target.value })} placeholder="tags, comma separated" />
          <textarea className="admin-leadgen-input admin-leadgen-textarea" rows={5} value={note.body} onChange={(e) => setNote({ ...note, body: e.target.value })} placeholder="Investigation note" />
          <button className="btn btn-primary btn-sm" disabled={busy === "opsec-note-save"} onClick={() => runAction("opsec-note-save", { ...note, tags: note.tags.split(",").map((t) => t.trim()).filter(Boolean) }, "Note saved.").then(() => setNote({ title: "", body: "", tags: "" }))}>Save note</button>
        </div>
        <Table
          columns={["Title", "Tags", "Updated"]}
          rows={data?.notes || []}
          empty="No OpSec notes yet."
          renderRow={(row) => (
            <tr key={row.id}>
              <td>{row.title || "(untitled)"}<div className="ops-muted">{String(row.body || "").slice(0, 120)}</div></td>
              <td>{(row.tags || []).join(", ")}</td>
              <td>{fmtTime(row.updated_at)}</td>
            </tr>
          )}
        />
      </section>
    </div>
  );
}

