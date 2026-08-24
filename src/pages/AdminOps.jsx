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

// Tab panels are split into per-tab chunks under components/admin and
// lazily loaded so the main dashboard bundle stays small.
import { lazy, Suspense } from "react";
const LazyOpsTab = lazy(() => import("../components/admin/OpsTab"));
const LazyLeadsInboxTab = lazy(() => import("../components/admin/LeadsInboxTab"));
const LazyVisitorsTab = lazy(() => import("../components/admin/VisitorsTab"));
const LazyContentTab = lazy(() => import("../components/admin/ContentTab"));
const LazyDraftsTab = lazy(() => import("../components/admin/DraftsTab"));
const LazyAffiliateTab = lazy(() => import("../components/admin/AffiliateTab"));
const LazyLeadgenTab = lazy(() => import("../components/admin/LeadgenTab"));
const LazyAdsenseTab = lazy(() => import("../components/admin/AdsenseTab"));
const LazyOpsecTab = lazy(() => import("../components/admin/OpsecTab"));

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
