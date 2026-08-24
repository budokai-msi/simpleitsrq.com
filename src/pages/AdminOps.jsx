import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  ExternalLink,
  Eye,
  FileText,
  Inbox,
  Lock,
  Mail,
  RadioTower,
  RefreshCcw,
  Search,
  Send,
  Shield,
  Target,
  Ticket,
  XCircle,
} from "lucide-react";
import { csrfFetch } from "../lib/csrf";
import { useSEO } from "../lib/seo";
import AdminNav from "../components/AdminNav";
import NotFound from "./NotFound";
// Dashboard-only stylesheet, imported per-route (not in App.jsx) so it ships
// in a lazy CSS chunk instead of the global render-blocking bundle. Vite
// dedupes the import across the leadgen routes.
import "../styles/leadgen.css";

const TABS = [
  ["ops", "Ops", Activity],
  ["leads", "Leads", Inbox],
  ["visitors", "Visitors", Eye],
  ["content", "Content", BookOpen],
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
  "content-insights",
  "hot-leads",
  "lead-intel",
  "leads-inbox",
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

  const pathTab = window.location.pathname.includes("/opsec") ? "opsec" : window.location.pathname.includes("/leadgen") ? "leadgen" : "ops";
  const initialTab = new URLSearchParams(window.location.search).get("tab") || pathTab;
  const [tab, setTab] = useState(TABS.some(([key]) => key === initialTab) ? initialTab : pathTab);
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
      return true;
    } catch (e) {
      setNotice(`Failed: ${String(e.message || e)}`);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const authConfirmed = Object.keys(data).length > 0;

  if (forbidden || (!authConfirmed && !loading)) {
    return (
      <main id="main" className="container" style={{ padding: "80px 20px", maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 36, boxShadow: "var(--shadow-md)" }}>
          <Shield size={40} color="var(--brand)" style={{ margin: "0 auto 16px" }} />
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 12px" }}>Admin Cockpit & OpSec Console</h1>
          <p style={{ color: "var(--text-2)", fontSize: 15, lineHeight: 1.6, margin: "0 0 24px" }}>
            Sign in with your verified owner Google account to access the operations dashboard and OpSec controls.
          </p>
          <a
            href="/api/auth/login?provider=google&returnTo=/portal/ops"
            className="btn btn-primary"
            style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "12px 24px", fontSize: 15 }}
          >
            Sign in to Admin Dashboard
          </a>
        </div>
      </main>
    );
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
        <AdminNav />
        <header className="admin-aff-head ops-head">
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

        {/* Master Operations Unified KPI Header */}
        <div className="admin-aff-grid" style={{ marginBottom: 24 }}>
          <div className="admin-aff-stat">
            <div className="admin-aff-stat-head">
              <span className="admin-aff-stat-label">Local IT & Repair Leads</span>
              <Ticket size={16} className="admin-aff-stat-icon" />
            </div>
            <div className="admin-aff-stat-value">{fmtNumber(data["admin-status"]?.counts?.leads || 0)}</div>
            <div className="admin-aff-stat-sub">Sarasota & Bradenton Queue</div>
          </div>
          <div className="admin-aff-stat">
            <div className="admin-aff-stat-head">
              <span className="admin-aff-stat-label">B2B Leadgen Pipeline</span>
              <Target size={16} className="admin-aff-stat-icon" />
            </div>
            <div className="admin-aff-stat-value">{fmtNumber(data["leadgen-status"]?.counts?.discovered || 0)}</div>
            <div className="admin-aff-stat-sub">{fmtNumber(data["leadgen-status"]?.counts?.emails || 0)} Verified Emails</div>
          </div>
          <div className="admin-aff-stat">
            <div className="admin-aff-stat-head">
              <span className="admin-aff-stat-label">Gemma Local Blog Engine</span>
              <BookOpen size={16} className="admin-aff-stat-icon" />
            </div>
            <div className="admin-aff-stat-value">{fmtNumber(data.drafts?.publishedCount || 77)}</div>
            <div className="admin-aff-stat-sub">{fmtNumber((data.drafts?.drafts || []).length)} Drafts Pending</div>
          </div>
          <div className="admin-aff-stat">
            <div className="admin-aff-stat-head">
              <span className="admin-aff-stat-label">Affiliate Traffic (30d)</span>
              <DollarSign size={16} className="admin-aff-stat-icon" />
            </div>
            <div className="admin-aff-stat-value">{fmtNumber(data["affiliate-stats"]?.total_clicks || 0)}</div>
            <div className="admin-aff-stat-sub">Active Revenue Links</div>
          </div>
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
          {tab === "leads" && <LeadsInboxTab data={data["leads-inbox"]} error={errors["leads-inbox"]} reload={load} />}
          {tab === "visitors" && <VisitorsTab data={data["behavior-insights"]} hotLeads={data["hot-leads"]} leadIntel={data["lead-intel"]} errors={errors} />}
          {tab === "content" && <ContentTab data={data["content-insights"]} error={errors["content-insights"]} />}
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
    <>
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

      <div className="ops-status-grid" style={{ marginBottom: 32 }}>
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
    </>
  );
}

function analyzeMicrosoftDocs(msg = "") {
  const text = String(msg).toLowerCase();
  const docs = [];

  if (text.includes("microsoft") || text.includes("m365") || text.includes("outlook") || text.includes("account")) {
    docs.push({
      title: "Microsoft 365 Admin Account & Identity Cleanup",
      url: "https://learn.microsoft.com/en-us/microsoft-365/admin/setup/add-domain",
      desc: "Official guide for consolidating legacy accounts, unlinking redundant credentials, and primary domain identities."
    });
  }

  if (text.includes("onedrive") || text.includes("folder") || text.includes("file") || text.includes("share")) {
    docs.push({
      title: "OneDrive for Business Folder Structure & Access Permissions",
      url: "https://learn.microsoft.com/en-us/onedrive/plan-onedrive-enterprise",
      desc: "Best practices for folder hierarchies, tenant file sharing permissions, and unlinking personal accounts."
    });
  }

  if (text.includes("device") || text.includes("personal") || text.includes("work") || text.includes("windows")) {
    docs.push({
      title: "Separate Personal & Work Accounts in Windows 11",
      url: "https://support.microsoft.com/en-us/windows/add-or-remove-accounts-on-your-pc-104fac0f-070b-4297-05db-c4d4e158b902",
      desc: "Step-by-step unlinking of personal Microsoft accounts from corporate Windows workstations."
    });
  }

  if (docs.length === 0) {
    docs.push({
      title: "Microsoft 365 Business System Architecture",
      url: "https://learn.microsoft.com/en-us/microsoft-365/",
      desc: "Official Microsoft documentation for business subscriptions, accounts, and workstation security."
    });
  }

  return docs;
}

function StatusChip({ status }) {
  const st = String(status || "new").toLowerCase();
  const isNew = st === "new";
  const isWon = st === "won";
  const isContacted = st === "contacted";
  return (
    <span
      style={{
        padding: "3px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        background: isNew ? "rgba(239, 68, 68, 0.15)" : isWon ? "rgba(16, 185, 129, 0.15)" : isContacted ? "rgba(59, 130, 246, 0.15)" : "rgba(148, 163, 184, 0.15)",
        color: isNew ? "#ef4444" : isWon ? "#10b981" : isContacted ? "#3b82f6" : "#64748b",
      }}
    >
      {st}
    </span>
  );
}

function LeadsInboxTab({ data, error, reload }) {
  const leads = data?.leads || [];
  const counts = data?.counts || {};
  const [selectedLead, setSelectedLead] = useState(null);
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [ticketStatus, setTicketStatus] = useState(null);

  const activeLead = selectedLead || leads[0] || null;
  const msDocs = useMemo(() => analyzeMicrosoftDocs(activeLead?.message), [activeLead]);

  const selectLead = (l) => {
    setSelectedLead(l);
    setReplySubject(l ? `Re: Simple IT SRQ Inquiry — ${l.company || l.name || "Onsite IT Support"}` : "");
    setReplyBody(l ? `Hi ${l.name ? l.name.split(" ")[0] : "there"},\n\nThanks for reaching out!\n\nYes, we offer one-time onsite projects with no monthly contracts required, and we can come directly to your office.\n\nWe can send an engineer out to assist with your Microsoft accounts, Outlook, OneDrive, and personal/work device separation.\n\nWe have afternoon openings (12pm–5pm) starting next Tuesday onward, as well as weekend options (Saturday or Sunday).\n\nLet us know which day works best for you and we'll get you on the schedule!\n\nBest regards,\nSimple IT SRQ Team` : "");
    setEmailStatus(null);
    setTicketStatus(null);
  };

  const sendEmail = async () => {
    if (!activeLead || !activeLead.email || !replyBody.trim()) return;
    setSendingEmail(true);
    setEmailStatus(null);
    try {
      const res = await postJson("send-lead-email", {
        lead_id: activeLead.id,
        to: activeLead.email,
        subject: replySubject,
        body: replyBody,
      });
      setEmailStatus({ ok: true, text: `Email sent via Resend (ID: ${res.id})` });
      if (reload) reload();
    } catch (e) {
      setEmailStatus({ ok: false, text: String(e.message || e) });
    } finally {
      setSendingEmail(false);
    }
  };

  const createTicket = async () => {
    if (!activeLead) return;
    setCreatingTicket(true);
    setTicketStatus(null);
    try {
      const res = await postJson("create-lead-ticket", {
        lead_id: activeLead.id,
        title: `Onsite Project: ${activeLead.company || activeLead.name || "Website Inquiry"}`,
        category: "Microsoft 365 / Workstation Cleanup",
        priority: "normal",
        description: activeLead.message || "Lead conversion",
      });
      setTicketStatus({ ok: true, text: `Ticket ${res.code} created!` });
      if (reload) reload();
    } catch (e) {
      setTicketStatus({ ok: false, text: String(e.message || e) });
    } finally {
      setCreatingTicket(false);
    }
  };

  const fmtDate = (ts) => { try { return new Date(ts).toLocaleString(); } catch { return ts; } };

  return (
    <div className="ops-grid">
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head">
          <h2>Email & Lead Dispatcher Inbox</h2>
          <SignalPill state={(counts.new || 0) ? "good" : "neutral"}>
            {fmtNumber(counts.new || 0)} new · {fmtNumber(counts.contacted || 0)} contacted · {fmtNumber(counts.won || 0)} won
          </SignalPill>
        </div>
        <p className="ops-panel__copy">
          Track inbound inquiries, send direct email replies via Resend (`contact@simpleitsrq.com`), generate client portal tickets with 1 click, and view AI Microsoft documentation suggestions.
        </p>
        {error ? <EmptyState>{error}</EmptyState> : null}
        {!error && leads.length === 0 ? <EmptyState>No leads yet - form submissions appear here in real time.</EmptyState> : null}

        {leads.length ? (
          <div className="admin-leadgen-inbox-grid" style={{ marginTop: 16 }}>
            {/* Left Column: Lead List */}
            <div style={{ overflowX: "auto" }}>
              <table className="admin-aff-table ops-table">
                <thead>
                  <tr><th>Lead</th><th>Status</th><th>Action</th></tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {leads.map((l, i) => {
                      const isSelected = activeLead?.id === l.id;
                      return (
                        <motion.tr
                          key={l.id}
                          initial={{ opacity: 0, x: -15 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -15 }}
                          transition={{ delay: i * 0.04, type: "spring", stiffness: 400, damping: 30 }}
                          whileHover={{ scale: 1.005, backgroundColor: "var(--lg-row-hover-active, rgba(99, 102, 241, 0.08))" }}
                          whileTap={{ scale: 0.98 }}
                          style={{
                            background: isSelected ? "var(--lg-row-hover, #f1f5f9)" : "transparent",
                            cursor: "pointer",
                            position: "relative",
                            borderLeft: isSelected ? "3px solid var(--brand, #6366f1)" : "3px solid transparent",
                          }}
                          onClick={() => selectLead(l)}
                        >
                          <td>
                            <strong>{l.name || l.email}</strong>
                            {l.company ? <><br /><span style={{ fontSize: 11, opacity: 0.8 }}>{l.company}</span></> : null}
                            <br /><span className="admin-leadgen-muted" style={{ fontSize: 10 }}>{fmtDate(l.created_at)}</span>
                          </td>
                          <td>
                            <StatusChip status={l.status || "new"} />
                          </td>
                          <td>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); selectLead(l); }}>
                              Manage
                            </button>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>

            {/* Right Column: Selected Lead Workbench */}
            <AnimatePresence mode="wait">
              {activeLead ? (
                <motion.div
                  key={activeLead.id}
                  initial={{ opacity: 0, y: 15, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 350, damping: 28 }}
                  style={{ padding: 18, border: "1px solid var(--border, #cbd5e1)", borderRadius: 12, background: "var(--surface, #fff)", boxShadow: "0 8px 30px rgba(0,0,0,0.12)" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 10 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "1.1rem" }}>{activeLead.name || "Inbound Lead"}</h3>
                    <span style={{ fontSize: "0.85rem", color: "var(--text-muted, #64748b)" }}>
                      {activeLead.company} {activeLead.email ? `· ${activeLead.email}` : ""} {activeLead.phone ? `· ${activeLead.phone}` : ""}
                    </span>
                  </div>
                  <button type="button" className="btn btn-primary btn-sm" disabled={creatingTicket} onClick={createTicket}>
                    <Ticket size={14} /> {creatingTicket ? "Creating..." : "1-Click Create Ticket"}
                  </button>
                </div>

                {ticketStatus ? (
                  <p style={{ color: ticketStatus.ok ? "#10b981" : "#ef4444", fontSize: 12, margin: "4px 0 10px", fontWeight: 600 }}>{ticketStatus.text}</p>
                ) : null}

                {/* Lead Message Box — High Contrast Dark/Light Styling */}
                <div
                  style={{
                    padding: 14,
                    borderRadius: 10,
                    background: "var(--surface-2, #1e293b)",
                    border: "1px solid var(--border, #334155)",
                    marginBottom: 16,
                  }}
                >
                  <strong
                    style={{
                      fontSize: 11,
                      textTransform: "uppercase",
                      color: "var(--text-2, #94a3b8)",
                      letterSpacing: "0.06em",
                      display: "block",
                      marginBottom: 6,
                    }}
                  >
                    Inquiry Content:
                  </strong>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13.5,
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.5,
                      color: "var(--text-1, #f8fafc)",
                      fontWeight: 500,
                    }}
                  >
                    {activeLead.message || "No message body provided."}
                  </p>
                </div>

                {/* AI Microsoft Doc Suggestions */}
                <div
                  style={{
                    padding: 14,
                    borderRadius: 10,
                    background: "color-mix(in srgb, var(--brand, #6366f1) 12%, var(--surface-2, #1e293b))",
                    border: "1px solid color-mix(in srgb, var(--brand, #6366f1) 35%, transparent)",
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 8,
                      color: "var(--brand, #818cf8)",
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    <BookOpen size={16} /> Official Microsoft Documentation
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {msDocs.map((doc) => (
                      <div key={doc.title} style={{ fontSize: 12 }}>
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontWeight: 650,
                            color: "var(--brand-hover, #a5b4fc)",
                            textDecoration: "none",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <BookOpen size={13} /> {doc.title} <ExternalLink size={11} />
                        </a>
                        <p style={{ margin: "2px 0 0", color: "var(--text-2, #cbd5e1)", fontSize: 11 }}>{doc.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Email Reply Composer */}
                <div style={{ display: "grid", gap: 10 }}>
                  <strong style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, color: "var(--text-1, #f8fafc)" }}>
                    <Mail size={15} /> Reply to Lead
                  </strong>
                  <input
                    type="text"
                    className="admin-leadgen-input"
                    value={replySubject}
                    onChange={(e) => setReplySubject(e.target.value)}
                    placeholder="Subject..."
                    style={{ background: "var(--surface-2, #1e293b)", color: "var(--text-1, #f8fafc)", borderColor: "var(--border, #334155)" }}
                  />
                  <textarea
                    rows={7}
                    className="admin-leadgen-input admin-leadgen-textarea"
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Type email reply..."
                    style={{ background: "var(--surface-2, #1e293b)", color: "var(--text-1, #f8fafc)", borderColor: "var(--border, #334155)" }}
                  />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={sendingEmail || !activeLead.email}
                        onClick={sendEmail}
                      >
                        <Send size={14} /> {sendingEmail ? "Sending via Resend..." : "Send via Resend"}
                      </button>
                      {activeLead.email ? (
                        <a
                          href={`mailto:${encodeURIComponent(activeLead.email)}?subject=${encodeURIComponent(replySubject)}&body=${encodeURIComponent(replyBody)}`}
                          className="btn btn-secondary btn-sm"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Mail size={14} /> Open in Email Client (Mailto)
                        </a>
                      ) : null}
                    </div>
                    {emailStatus ? (
                      <span style={{ color: emailStatus.ok ? "#10b981" : "#ef4444", fontSize: 12, fontWeight: 600 }}>
                        {emailStatus.text}
                      </span>
                    ) : null}
                  </div>
                </div>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted, #94a3b8)", fontSize: 14 }}
                >
                  Select a lead from the list to view details
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : null}
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
        Recent visitors scored by how likely they are to become an IT client - local geo,
        high-intent pages (services, booking, leadgen, contact, city pages), time on site, and depth.
      </p>
      {error ? <EmptyState>{error}</EmptyState> : null}
      {!error && leads.length === 0 ? <EmptyState>No ranked sessions yet - leads appear here as visitors engage.</EmptyState> : null}
      {leads.length > 0 ? (
        <div className="hotlead-grid">
          {leads.map((l) => {
            const t = l.score >= 70 ? "hot" : l.score >= 40 ? "warm" : "cold";
            const journey = `${l.landing_path || "direct"}${l.exit_path && l.exit_path !== l.landing_path ? ` → ${l.exit_path}` : ""}`;
            return (
              <article key={l.id} className={`hotlead-card hotlead-card--${t}`}>
                <div className={`hotlead-ring hotlead-ring--${t}`} title={`Lead score ${l.score}/100`}>{l.score}</div>
                <div className="hotlead-body">
                  <div className="hotlead-head">
                    <span className="hotlead-loc">{l.is_local ? <span className="lead-local-pin" title="In the service area">📍</span> : null}{l.location}</span>
                    <span className={`hotlead-temp hotlead-temp--${t}`}>{t}</span>
                  </div>
                  <div className="hotlead-stats">
                    <span className="hotlead-stat">{fmtNumber(l.page_count)} pages</span>
                    <span className="hotlead-stat">{fmtDwell(l.dwell_sec)}</span>
                    <span className="hotlead-stat">{l.max_scroll_pct}% read</span>
                    {l.engaged ? <span className="hotlead-stat hotlead-stat--on">engaged</span> : null}
                  </div>
                  <div className="hotlead-journey" title={journey}>{journey}</div>
                  <div className="hotlead-journey">via {l.referrer}</div>
                  {(l.reasons || []).length ? (
                    <div className="hotlead-reasons">
                      {l.reasons.map((r, i) => <span key={i} className="hotlead-chip">{r}</span>)}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function fmtDwell(sec) {
  const s = Number(sec) || 0;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

function FunnelBar({ label, value, pct, green }) {
  return (
    <div className="ops-funnel-row">
      <div className="ops-funnel-row__head">
        <span>{label}</span>
        <strong>{fmtNumber(value)}<span className="ops-funnel-row__pct">({pct}%)</span></strong>
      </div>
      <div className="ops-funnel-track">
        <div className={`ops-funnel-fill${green ? " ops-funnel-fill--green" : ""}`} style={{ width: `${Math.max(2, pct)}%` }} />
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
        <FunnelBar label="Visitors (sessions)" value={funnel.sessions} pct={100} />
        <FunnelBar label="Engaged" value={funnel.engaged} pct={funnel.engaged_pct} />
        <FunnelBar label="High-intent pages" value={funnel.high_intent} pct={funnel.high_intent_pct} />
        <FunnelBar label="Reached booking / contact" value={funnel.reached_booking} pct={funnel.reached_booking_pct} green />
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
        {!error && returning.length === 0 ? <EmptyState>No repeat visitors yet - they show up here after a second visit.</EmptyState> : null}
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
                  <td>{r.ever_engaged ? "✓" : " - "}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
    </>
  );
}

// Content tab — which posts attract, hold, and convert readers.
function ContentTab({ data, error }) {
  const topPosts = data?.topPosts || [];
  const entryPosts = data?.entryPosts || [];
  const converters = data?.exitToBook || [];
  const searches = data?.searchTerms || [];
  const stale = data?.stalePosts || [];

  return (
    <div className="ops-grid">
      {error ? <EmptyState>{error}</EmptyState> : null}

      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Top posts (30d)</h2><BookOpen size={16} /></div>
        <Table
          columns={["Post", "Views", "Unique", "Avg dwell", "Max scroll"]}
          rows={topPosts}
          empty="No blog engagement recorded in the last 30 days."
          renderRow={(row) => (
            <tr key={row.slug}>
              <td className="ops-path-cell"><a href={`/blog/${row.slug}`} target="_blank" rel="noreferrer">{row.slug}</a></td>
              <td>{fmtNumber(row.views)}</td>
              <td>{fmtNumber(row.unique_visitors)}</td>
              <td>{row.avg_dwell_sec != null ? `${row.avg_dwell_sec}s` : "-"}</td>
              <td>{row.max_scroll_pct != null ? `${row.max_scroll_pct}%` : "-"}</td>
            </tr>
          )}
        />
      </section>

      <section className="admin-aff-card ops-panel">
        <div className="ops-panel__head"><h2>Blog → booking paths</h2></div>
        <p className="ops-panel__copy">Posts read before a /book or /contact visit. These are your money posts — keep them fresh and interlinked.</p>
        <Table
          columns={["Post", "Visitors who booked"]}
          rows={converters}
          empty="No blog-to-booking journeys recorded yet."
          renderRow={(row) => (
            <tr key={row.path}>
              <td className="ops-path-cell">{row.path}</td>
              <td><SignalPill state={Number(row.visitors_who_booked) > 0 ? "good" : "neutral"}>{fmtNumber(row.visitors_who_booked)}</SignalPill></td>
            </tr>
          )}
        />
      </section>

      <section className="admin-aff-card ops-panel">
        <div className="ops-panel__head"><h2>Blog entry pages (30d)</h2></div>
        <Table
          columns={["Landing post", "Entries", "Bounce rate", "Avg dwell"]}
          rows={entryPosts}
          empty="No blog entries recorded yet."
          renderRow={(row) => {
            const bounceRate = row.total_sessions > 0 ? Math.round((row.bounces / row.total_sessions) * 100) : 0;
            return (
              <tr key={row.landing_path}>
                <td className="ops-path-cell">{row.landing_path}</td>
                <td>{fmtNumber(row.entries)}</td>
                <td><SignalPill state={bounceRate > 60 ? "warn" : "good"}>{bounceRate}%</SignalPill></td>
                <td>{row.avg_dwell_sec != null ? `${row.avg_dwell_sec}s` : "-"}</td>
              </tr>
            );
          }}
        />
      </section>

      <section className="admin-aff-card ops-panel">
        <div className="ops-panel__head"><h2>On-site searches (30d)</h2></div>
        <p className="ops-panel__copy">What visitors look for that they can't find by browsing. Unanswered searches are content ideas.</p>
        <Table
          columns={["Query", "Searches"]}
          rows={searches}
          empty="No site searches recorded yet."
          renderRow={(row) => (
            <tr key={row.query}>
              <td>{row.query}</td>
              <td>{fmtNumber(row.searches)}</td>
            </tr>
          )}
        />
      </section>

      {stale.length ? (
        <section className="admin-aff-card ops-panel ops-panel--wide">
          <div className="ops-panel__head"><h2>Traffic dropping — refresh candidates</h2><AlertTriangle size={16} /></div>
          <p className="ops-panel__copy">These posts lost 50%+ of their views vs the prior 30 days. Updating them (new info, internal links to new posts) is the cheapest SEO win available.</p>
          <Table
            columns={["Post", "Last 30d views", "Prior 30d", "Change"]}
            rows={stale}
            renderRow={(row) => {
              const change = row.prior_views > 0 ? Math.round(((row.recent_views - row.prior_views) / row.prior_views) * 100) : 0;
              return (
                <tr key={row.slug}>
                  <td className="ops-path-cell"><a href={`/blog/${row.slug}`} target="_blank" rel="noreferrer">{row.slug}</a></td>
                  <td>{fmtNumber(row.recent_views)}</td>
                  <td>{fmtNumber(row.prior_views)}</td>
                  <td><SignalPill state="bad">{change}%</SignalPill></td>
                </tr>
              );
            }}
          />
        </section>
      ) : null}
    </div>
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

      <section className="admin-aff-card ops-panel">
        <div className="ops-panel__head"><h2>Core Web Vitals (14d)</h2><Activity size={16} /></div>
        <p className="ops-panel__copy">Real-user performance from the web-vitals library. P75 thresholds: LCP 2500ms, INP 200ms, CLS 0.1.</p>
        <Table
          columns={["Metric", "Samples", "Avg", "P75", "Good", "Needs work", "Poor"]}
          rows={data?.vitals || []}
          empty="No vitals data yet — collects once visitors opt in to analytics."
          renderRow={(row) => {
            const poor = Number(row.poor || 0);
            const total = Math.max(Number(row.samples || 1), 1);
            return (
              <tr key={row.metric}>
                <td><strong>{row.metric}</strong></td>
                <td>{fmtNumber(row.samples)}</td>
                <td>{fmtNumber(row.avg_value)}{row.metric === "CLS" ? "" : "ms"}</td>
                <td>{fmtNumber(row.p75)}{row.metric === "CLS" ? "" : "ms"}</td>
                <td><SignalPill state={poor / total > 0.15 ? "warn" : "good"}>{fmtNumber(row.good)}</SignalPill></td>
                <td>{fmtNumber(row.ni)}</td>
                <td><SignalPill state={poor / total > 0.15 ? "bad" : "neutral"}>{fmtNumber(poor)}</SignalPill></td>
              </tr>
            );
          }}
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
        <div className="ops-panel__head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2>Blog drafts</h2>
            <SignalPill state={pending.length ? "warn" : "good"}>{pending.length} pending</SignalPill>
          </div>
          <button
            className="btn btn-primary btn-sm"
            type="button"
            disabled={busy === "generate-blog-draft"}
            onClick={() => runAction("generate-blog-draft", {}, "New local blog draft generated!")}
          >
            <FileText size={14} /> Generate Local SEO Post
          </button>
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
          <button className="btn btn-primary btn-sm" disabled={busy === "opsec-domain-add"} onClick={() => runAction("opsec-domain-add", { domain }, "Domain added to watch list.").then((ok) => { if (ok) setDomain(""); })}>Add</button>
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
          <button className="btn btn-primary btn-sm ops-form-grid__full" disabled={busy === "opsec-ioc-add"} onClick={() => runAction("opsec-ioc-add", ioc, "IOC saved.").then((ok) => { if (ok) setIoc({ ...ioc, value: "" }); })}>Save IOC</button>
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
          <button className="btn btn-primary btn-sm" disabled={busy === "opsec-note-save"} onClick={() => runAction("opsec-note-save", { ...note, tags: note.tags.split(",").map((t) => t.trim()).filter(Boolean) }, "Note saved.").then((ok) => { if (ok) setNote({ title: "", body: "", tags: "" }); })}>Save note</button>
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

