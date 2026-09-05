import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Activity,
  BookOpen,
  DollarSign,
  Inbox,
  Lock,
  Package,
  RefreshCcw,
  Send,
  Shield,
  Target,
  Ticket,
} from "lucide-react";
import { useSEO } from "../lib/seo";
import AdminNav from "../components/AdminNav";
import Breadcrumbs from "../components/Breadcrumbs";
import NotFound from "./NotFound";
import {
  SignalPill,
  deriveIntel,
  fmtNumber,
  getJson,
  postJson,
} from "../components/admin/shared";
import { ToastProvider, useToast } from "../components/admin/Toast";
// Dashboard-only stylesheet, imported per-route (not in App.jsx) so it ships
// in a lazy CSS chunk instead of the global render-blocking bundle. Vite
// dedupes the import across the leadgen routes.

// Tab panels are split into per-tab chunks under components/admin and
// lazily loaded so the main dashboard bundle stays small.
import { lazy, Suspense } from "react";
const LazyOpsTab = lazy(() => import("../components/admin/OpsTab"));
const LazyLeadsInboxTab = lazy(() => import("../components/admin/LeadsInboxTab"));
import OpsecTab from "../components/admin/OpsecTab";
const LazyBlogHealthTab = lazy(() => import("../components/admin/BlogHealthTab"));
const LazyCampaignBuilderTab = lazy(() => import("../components/admin/CampaignBuilderTab"));
const LazyProductFinderTab = lazy(() => import("../components/admin/ProductFinderTab"));

const TABS = [
  ["ops", "Ops", Activity, "Revenue, attention list, and system health"],
  ["leads", "Leads", Inbox, "New inquiries and replies"],
  ["blog-health", "Blog Health", Activity, "Auto-publish runs and failures"],
  ["campaigns", "Campaigns", Send, "Build and launch leadgen campaigns"],
  ["products", "Product Finder", Package, "What to sell and to whom"],
];

const CORE_ACTIONS = [
  "admin-status",
  "ops-status",
  "drafts",
  "leads-inbox",
  "revenue-summary",
  "leadgen-status",
  "opsec-data",
  "opsec-hunt-brief",
  "blog-engine-health",
  "leadgen-campaigns",
  "affiliate-setup",
  "content-hygiene",
];


export default function AdminOps() {
  return (
    <ToastProvider>
      <AdminOpsInner />
    </ToastProvider>
  );
}

function AdminOpsInner() {
  useSEO({
    title: "Admin Ops | Simple IT SRQ",
    description: "Internal Simple IT SRQ operations cockpit.",
    canonical: "https://simpleitsrq.com/portal/ops",
    robots: "noindex, nofollow",
  });

  const { toast } = useToast();

  const initialTab = new URLSearchParams(window.location.search).get("tab") || "ops";
  const [tab, setTab] = useState(TABS.some(([key]) => key === initialTab) ? initialTab : "ops");
  const [data, setData] = useState({});
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const entries = await Promise.all(CORE_ACTIONS.map(async (action) => {
      try {
        return [action, await getJson(action), null];
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
  }, []);

  useEffect(() => {
    let alive = true;
    const run = async () => { if (alive) await load(); };
    run();
    const timer = setInterval(run, 60_000);
    return () => { alive = false; clearInterval(timer); };
  }, [load]);

  // Keyboard shortcuts: 1-4 switch tabs, r refreshes, g then o/l/s navigates.
  // Ignored while typing in an input/textarea/select.
  useEffect(() => {
    let gPending = false;
    let gTimer = null;
    const onKey = (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const key = String(e.key || "").toLowerCase();
      if (key === "g") {
        gPending = true;
        if (gTimer) clearTimeout(gTimer);
        gTimer = setTimeout(() => { gPending = false; }, 1500);
        return;
      }
      if (gPending) {
        gPending = false;
        if (gTimer) clearTimeout(gTimer);
        if (key === "o") { window.location.href = "/portal/ops"; return; }
        if (key === "l") { window.location.href = "/portal/leadgen"; return; }
        if (key === "s") { window.location.href = "/portal/opsec"; return; }
        return;
      }
      if (key === "r") { load(); return; }
      const idx = Number(key);
      if (idx >= 1 && idx <= TABS.length) {
        const t = TABS[idx - 1];
        if (t) setTab(t[0]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (gTimer) clearTimeout(gTimer);
    };
  }, [load, setTab]);

  const forbidden = Object.values(errors).some((e) => /401|403|forbidden|unauthorized/i.test(e));
  const intel = useMemo(() => deriveIntel(data), [data]);

  const runAction = async (action, body, success) => {
    setBusy(action);
    try {
      await postJson(action, body);
      toast(success || `${action} complete.`, "success");
      await load();
      return true;
    } catch (e) {
      toast(`Failed: ${String(e.message || e)}`, "error");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const authConfirmed = Object.keys(data).length > 0;

  if (forbidden || (!authConfirmed && !loading)) {
    return (
      <main id="main" className="container" style={{ padding: "80px 20px", maxWidth: 600, margin: "0 auto" }}>
        <div className="card card-border bg-base-100 p-8 text-center">
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
        <div className="container" style={{ padding: "80px 0" }}>
          <div className="card card-border bg-base-100 p-6">
            <div className="skeleton h-6 w-48 mb-4" />
            <div className="skeleton h-4 w-full mb-2" />
            <div className="skeleton h-4 w-3/4 mb-2" />
            <div className="skeleton h-4 w-1/2" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main id="main" className="section admin-affiliates admin-ops">
      <div className="container">
        <AdminNav />
        {window.location.pathname.includes("/opsec") ? (
          <OpsecTab data={{ ...(data["opsec-data"] || {}), huntBrief: data["opsec-hunt-brief"] }} busy={busy} runAction={runAction} />
        ) : (
        <>
        <Breadcrumbs items={[
          { name: "Client Portal", url: "/portal" },
          { name: "Operations", url: "/portal/ops" },
        ]} />
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
          <p className="ops-panel__copy" style={{ margin: "8px 0 0", fontSize: 12, opacity: 0.7 }}>
            1-4: tabs · r: refresh · g then o/l/s: navigate
          </p>
        </header>

        {/* Master Operations Unified KPI Header */}
        <div className="stats stats-vertical sm:stats-horizontal shadow-sm border border-base-300 mb-6">
          <div className="stat">
            <div className="stat-figure text-primary"><Ticket size={20} /></div>
            <div className="stat-title">Local IT & Repair Leads</div>
            <div className="stat-value">{fmtNumber(data["admin-status"]?.counts?.leads || 0)}</div>
            <div className="stat-desc">Sarasota & Bradenton Queue</div>
          </div>
          <div className="stat">
            <div className="stat-figure text-primary"><Target size={20} /></div>
            <div className="stat-title">B2B Leadgen Pipeline</div>
            <div className="stat-value">{fmtNumber(data["leadgen-status"]?.counts?.discovered || 0)}</div>
            <div className="stat-desc">{fmtNumber(data["leadgen-status"]?.counts?.emails || 0)} Verified Emails</div>
          </div>
          <div className="stat">
            <div className="stat-figure text-primary"><BookOpen size={20} /></div>
            <div className="stat-title">Gemma Local Blog Engine</div>
            <div className="stat-value">{fmtNumber(data.drafts?.publishedCount || 77)}</div>
            <div className="stat-desc">{fmtNumber((data.drafts?.drafts || []).length)} Drafts Pending</div>
          </div>
          <div className="stat">
            <div className="stat-figure text-primary"><DollarSign size={20} /></div>
            <div className="stat-title">Affiliate Traffic (30d)</div>
            <div className="stat-value">{fmtNumber(data["affiliate-stats"]?.total_clicks || 0)}</div>
            <div className="stat-desc">Active Revenue Links</div>
          </div>
        </div>

        <nav className="tabs tabs-border" role="tablist" aria-label="Admin ops sections">
          {TABS.map(([key, label, Icon, hint]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              className={`tab tab-lg gap-2${tab === key ? " tab-active" : ""}`}
              type="button"
              onClick={() => setTab(key)}
              data-tip={hint}
              aria-label={hint}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </nav>

        <section className="admin-leadgen-tab-body">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <Suspense fallback={<div className="card card-border bg-base-100 p-4"><div className="skeleton h-4 w-40 mb-2" /><div className="skeleton h-4 w-full mb-2" /><div className="skeleton h-4 w-3/4" /></div>}>
                {tab === "ops" && <LazyOpsTab data={data} errors={errors} intel={intel} busy={busy} runAction={runAction} />}
                {tab === "leads" && <LazyLeadsInboxTab data={data["leads-inbox"]} error={errors["leads-inbox"]} reload={load} />}
                {tab === "blog-health" && <LazyBlogHealthTab data={data} busy={busy} runAction={runAction} />}
                {tab === "campaigns" && <LazyCampaignBuilderTab data={data} busy={busy} runAction={runAction} />}
                {tab === "products" && <LazyProductFinderTab />}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </section>
        </>
        )}
      </div>
    </main>
  );
}
