// Lead-generation command center. Mounted at /portal/leadgen and gated
// behind admin role (the API enforces; the UI just hides itself if the
// status call returns 401/403).
//
// Core tabs:
//   - Command   - live operating dashboard over real leadgen tables
//   - Discover  - enter zip -> queue OSM crawl, list discovered businesses,
//                 batch-queue email crawls per zip
//   - Email     - list / create / start / monitor outreach campaigns
//   - Reports   - segment, email-health, and campaign performance views
//   - Jobs      - recent crawl_jobs queue (diagnostics)
//
// All mutations go through csrfFetch (double-submit cookie) and POST to
// /api/portal?action=leadgen-...
//
// Styling reuses the .admin-aff-* token-driven dashboard primitives from
// App.css so the leadgen command center stays visually aligned.

import "leaflet/dist/leaflet.css";
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Mail,
  MapPinned,
  Play,
  RefreshCw,
  Search,
  Send,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { csrfFetch } from "../lib/csrf";
import { trackEvent } from "../lib/analytics.js";
import { useSEO } from "../lib/seo";

// ---------- helpers ----------

async function getJson(url) {
  const r = await fetch(url, { credentials: "same-origin" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) {
    throw new Error(j.error || `HTTP ${r.status}`);
  }
  return j;
}

async function postJson(url, body) {
  const r = await csrfFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) {
    throw new Error(j.error || `HTTP ${r.status}`);
  }
  return j;
}

function fmtTime(iso) {
  if (!iso) return "-";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function hostFor(url) {
  if (!url) return null;
  try { return new URL(url).host.replace(/^www\./, ""); } catch { return url; }
}

function Stat({ label, value, hint, accent, badge }) {
  return (
    <div className={`leadgen-kpi${accent ? ` leadgen-kpi--${accent}` : ""}`}>
      <span className="leadgen-kpi__label">
        {label}
        {badge ? <em className="leadgen-kpi__badge">{badge}</em> : null}
      </span>
      <span className="leadgen-kpi__value">{value ?? "-"}</span>
      {hint ? <span className="leadgen-kpi__hint">{hint}</span> : null}
    </div>
  );
}

function pct(part, whole) {
  const p = Number(part || 0);
  const w = Number(whole || 0);
  return w > 0 ? `${Math.round((p / w) * 100)}%` : "0%";
}

function jobCount(status, counts) {
  const row = (counts || []).find((r) => r.status === status);
  return Number(row?.count || 0);
}

function compactNumber(value) {
  const n = Number(value || 0);
  if (n >= 1000) return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  return n.toLocaleString();
}

function statusTone(status) {
  const s = String(status || "").toLowerCase();
  if (["completed", "done", "sent", "running", "active"].includes(s)) return "good";
  if (["queued", "scheduled", "draft", "pending"].includes(s)) return "wait";
  if (["failed", "cancelled", "error", "paused"].includes(s)) return "bad";
  return "neutral";
}

function nextLeadgenMove({ businesses, emailBusinesses, campaignQueue, queuedJobs }) {
  if (!Number(businesses)) {
    return {
      title: "Start with one zip code",
      detail: "Discovery is the first useful action. Queue a local zip to build the reviewable market list.",
      action: "Open Discover",
      tab: "discover",
    };
  }
  if (Number(businesses) && !Number(emailBusinesses)) {
    return {
      title: "Crawl contact paths",
      detail: "You have companies, but no deliverable contact list yet. Crawl published websites before building a campaign.",
      action: "Review records",
      tab: "discover",
    };
  }
  if (Number(queuedJobs) > 0) {
    return {
      title: "Run the worker queue",
      detail: "There are pending jobs. Run them now so the dashboard catches up with queued discovery and email crawls.",
      action: "Open Jobs",
      tab: "jobs",
    };
  }
  if (!campaignQueue?.length) {
    return {
      title: "Build the first campaign",
      detail: "Segments are usable now. Turn a reviewed list into a capped outreach campaign.",
      action: "Open Email",
      tab: "campaigns",
    };
  }
  return {
    title: "Inspect campaign performance",
    detail: "The pipeline is active. Check sends, opens, replies, and the segments producing signal.",
    action: "Open Reports",
    tab: "insights",
  };
}

function parseIso(value) {
  const t = Date.parse(value || "");
  return Number.isFinite(t) ? t : null;
}

function daysSinceIso(value) {
  const ts = parseIso(value);
  if (ts == null) return null;
  return Math.max(0, Math.floor((Date.now() - ts) / 86_400_000));
}
function fmtDuration(startIso, endIso) {
  const start = parseIso(startIso);
  const end = parseIso(endIso);
  if (start == null || end == null || end < start) return "-";
  const secs = Math.round((end - start) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  if (mins < 60) return `${mins}m ${rem}s`;
  const hrs = Math.floor(mins / 60);
  const minRem = mins % 60;
  return `${hrs}h ${minRem}m`;
}
function normalizedGeoPoints(rows, cap = 120) {
  const pts = rows
    .slice(0, cap)
    .map((r) => ({ lat: Number(r.lat), lng: Number(r.lng), row: r }))
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
  if (!pts.length) return [];
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = Math.max(0.0001, maxLat - minLat);
  const lngSpan = Math.max(0.0001, maxLng - minLng);
  return pts.map((p) => ({
    x: ((p.lng - minLng) / lngSpan) * 100,
    y: (1 - (p.lat - minLat) / latSpan) * 100,
    label: p.row?.name || "Business",
  }));
}
function freshnessLabel(value) {
  const days = daysSinceIso(value);
  if (days == null) return "never";
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function StatusChip({ status }) {
  const label = status || "unknown";
  return <span className={`leadgen-status-chip leadgen-status-chip--${statusTone(label)}`}>{label}</span>;
}

// ---------- main ----------

export default function LeadgenDashboard() {
  useSEO({
    title: "Leadgen Command Center | Simple IT SRQ",
    description: "Admin leadgen workspace for discovery, review, campaigns, and job diagnostics.",
    canonical: "https://simpleitsrq.com/portal/leadgen",
    robots: "noindex, nofollow",
  });

  const [tab, setTab] = useState("discover");
  const [status, setStatus] = useState(null);
  const [statusErr, setStatusErr] = useState(null);
  const [opsStatus, setOpsStatus] = useState(null);
  const [runtimeHealth, setRuntimeHealth] = useState(null);
  const [campaignSeed, setCampaignSeed] = useState(null);
  const selectTab = (id, source = "leadgen_sidebar", payload = null) => {
    trackEvent("select_content", {
      content_type: "leadgen_tab_nav",
      destination: id,
      source,
    });
    if (id === "campaigns" && payload?.campaignSeed) {
      setCampaignSeed(payload.campaignSeed);
    }
    setTab(id);
  };

  // Refresh the top-of-page counts. Extracted so post-action handlers
  // (queueDiscover, queueEmailCrawls) can pull fresh numbers immediately
  // without waiting for the 30s background tick.
  const loadStatus = async () => {
    try {
      const r = await getJson("/api/portal?action=leadgen-status");
      setStatus(r);
      setStatusErr(null);
    } catch (e) {
      setStatusErr(String(e.message || e));
    }
  };

  // Initial status fetch + 30s refresh while the page is open. Doubles
  // as the admin gate: a 401/403 here renders the access-denied screen.
  useEffect(() => {
    let alive = true;
    let timer;
    const tick = async () => {
      try {
        const [r, ops, health] = await Promise.all([
          getJson("/api/portal?action=leadgen-status"),
          getJson("/api/portal?action=ops-status").catch(() => null),
          getJson("/api/health").catch(() => null),
        ]);
        if (!alive) return;
        setStatus(r);
        if (ops) setOpsStatus(ops);
        if (health) setRuntimeHealth(health);
        setStatusErr(null);
      } catch (e) {
        if (!alive) return;
        setStatusErr(String(e.message || e));
      } finally {
        if (alive) timer = setTimeout(tick, 30_000);
      }
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  if (statusErr && /401|403|unauthorized|unauthenticated|forbidden|admin|leadgen_subscription_required/i.test(statusErr)) {
    return (
      <section className="section admin-affiliates">
        <div className="container">
          <h1 className="title-1">Lead generation</h1>
          <p className="admin-aff-sub">Sign in with an authorized account to open the Leadgen workspace.</p>
          <p><Link to="/portal" className="admin-aff-back">Sign in to portal</Link></p>
        </div>
      </section>
    );
  }

  const integrationExport = (target) => {
    const base = "/api/portal?action=leadgen-export&format=csv&status=active&has_email=1";
    trackEvent("select_content", {
      content_type: "leadgen_integration_export",
      destination: target,
    });
    if (target === "hubspot") window.location.href = `${base}&limit=2000`;
    if (target === "mailchimp") window.location.href = `${base}&limit=2000`;
    if (target === "klaviyo") window.location.href = `${base}&limit=2000`;
    if (target === "google_ads") window.location.href = `${base}&limit=10000`;
    if (target === "meta_ads") window.location.href = `${base}&limit=10000`;
  };
  const loadOps = async () => {
    try {
      const [ops, health] = await Promise.all([
        getJson("/api/portal?action=ops-status"),
        getJson("/api/health"),
      ]);
      setOpsStatus(ops);
      setRuntimeHealth(health);
    } catch {
      // Non-blocking: leadgen workflows should continue even if ops telemetry fails.
    }
  };

  const recentJobs = status?.recent_jobs || [];
  const statusAsOf = parseIso(status?.generated_at) || 0;
  const dayAgo = statusAsOf - 86_400_000;
  const netNewBusinesses24h = recentJobs.reduce((acc, job) => {
    const finished = parseIso(job?.finished_at || job?.created_at);
    if (!statusAsOf || !finished || finished < dayAgo || job?.kind !== "osm_zip") return acc;
    return acc + Number(job?.result?.inserted ?? 0);
  }, 0);
  const netNewEmails24h = recentJobs.reduce((acc, job) => {
    const finished = parseIso(job?.finished_at || job?.created_at);
    if (!statusAsOf || !finished || finished < dayAgo || job?.kind !== "website_emails") return acc;
    return acc + Number(job?.result?.inserted ?? 0);
  }, 0);
  const lastDiscoveryJob = recentJobs
    .filter((job) => job?.kind === "osm_zip")
    .sort((a, b) => (parseIso(b?.finished_at || b?.created_at) || 0) - (parseIso(a?.finished_at || a?.created_at) || 0))[0];
  const lastEmailJob = recentJobs
    .filter((job) => job?.kind === "website_emails")
    .sort((a, b) => (parseIso(b?.finished_at || b?.created_at) || 0) - (parseIso(a?.finished_at || a?.created_at) || 0))[0];
  const discoveryFreshness = freshnessLabel(lastDiscoveryJob?.finished_at || lastDiscoveryJob?.created_at);
  const emailFreshness = freshnessLabel(lastEmailJob?.finished_at || lastEmailJob?.created_at);
  const pipelineState = netNewBusinesses24h + netNewEmails24h > 0 ? "fresh leads added today" : "lead database ready";
  const healthClass = netNewBusinesses24h + netNewEmails24h > 0 ? "leadgen-status-chip--productive" : "leadgen-status-chip--no_signal";

  return (
    <section className="section admin-affiliates admin-leadgen">
      <div className="container">
        <header className="admin-aff-head leadgen-admin-hero">
          <Link to="/portal" className="admin-aff-back">Portal</Link>
          <div className="leadgen-admin-hero__row">
            <div>
              <span className="eyebrow">Powered by Simple IT SRQ</span>
              <h1 className="display-2">Leadgen Command Center</h1>
              <p className="leadgen-admin-hero__sub">
                Discover local businesses, crawl published contact paths, review
                records, launch capped email campaigns, and inspect every worker job.
              </p>
            </div>
            <div className="leadgen-admin-hero__actions">
              <span className="leadgen-powered-pill">Customer workspace</span>
              <Link to="/leadgen" className="btn btn-secondary btn-sm" target="_blank" rel="noopener noreferrer">
                View product page
              </Link>
            </div>
          </div>
        </header>

        {statusErr ? (
          <p className="admin-leadgen-err">
            Leadgen status could not load: {statusErr}
          </p>
        ) : null}

        <div className="leadgen-kpi-grid">
          <Stat
            accent="blue"
            label="Businesses"
            value={status?.businesses?.total?.toLocaleString?.() ?? status?.businesses?.total}
            hint={`${(status?.businesses?.with_website ?? 0).toLocaleString?.() ?? 0} with website`}
            badge={`+${netNewBusinesses24h} 24h`}
          />
          <Stat
            accent="teal"
            label="Deliverable emails"
            value={status?.emails?.deliverable?.toLocaleString?.() ?? status?.emails?.deliverable}
            hint={`across ${(status?.emails?.businesses_with_email ?? 0).toLocaleString?.() ?? 0} biz`}
            badge={`+${netNewEmails24h} 24h`}
          />
          <Stat
            accent="violet"
            label="Campaigns"
            value={status?.campaigns?.total}
            hint={`${status?.campaigns?.running ?? 0} running`}
          />
          <Stat label="Sent"    value={status?.sends?.sent?.toLocaleString?.() ?? status?.sends?.sent} />
          <Stat label="Opened"  value={status?.sends?.opened?.toLocaleString?.() ?? status?.sends?.opened} />
          <Stat label="Clicked" value={status?.sends?.clicked?.toLocaleString?.() ?? status?.sends?.clicked} />
          <Stat accent="amber" label="Replied" value={status?.sends?.replied?.toLocaleString?.() ?? status?.sends?.replied} />
        </div>
        <div className="leadgen-workspace-status" role="status" aria-live="polite">
          <span className={`leadgen-status-chip ${healthClass}`}>{pipelineState}</span>
          <span>Market scan {discoveryFreshness}</span>
          <span>Email crawl {emailFreshness}</span>
        </div>

        <div className="leadgen-workspace-shell">
          <aside className="leadgen-workspace-sidebar" aria-label="Leadgen navigation">
            <Link to="/portal" className="leadgen-side-home">Portal</Link>
            <nav className="leadgen-side-nav">
              {[
                ["discover", "Workspace"],
                ["command", "Scans"],
                ["campaigns", "Campaigns"],
                ["insights", "Reports"],
                ["jobs", "Jobs"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => selectTab(id, "leadgen_sidebar")}
                  className={`leadgen-side-nav__item${tab === id ? " is-active" : ""}`}
                >
                  {label}
                </button>
              ))}
            </nav>
            <section className="leadgen-side-integrations" aria-label="Marketing integrations">
              <h3>Destinations</h3>
              <div className="leadgen-side-integrations__links">
                <a href="https://www.hubspot.com" target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("select_content", { content_type: "leadgen_integration_link", destination: "hubspot" })}>HubSpot</a>
                <a href="https://mailchimp.com" target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("select_content", { content_type: "leadgen_integration_link", destination: "mailchimp" })}>Mailchimp</a>
                <a href="https://www.klaviyo.com" target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("select_content", { content_type: "leadgen_integration_link", destination: "klaviyo" })}>Klaviyo</a>
                <a href="https://ads.google.com" target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("select_content", { content_type: "leadgen_integration_link", destination: "google_ads" })}>Google Ads</a>
                <a href="https://www.facebook.com/business/ads" target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("select_content", { content_type: "leadgen_integration_link", destination: "meta_ads" })}>Meta Ads</a>
              </div>
              <div className="leadgen-side-integrations__actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => integrationExport("hubspot")}>Export ready CSV</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => selectTab("campaigns", "leadgen_sidebar")}>Build campaign</button>
              </div>
            </section>
            <section className="leadgen-side-revenue" aria-label="Revenue actions">
              <h3>Handoff</h3>
              <div className="leadgen-side-revenue__actions">
                <Link
                  to="/book?topic=leadgen-onboarding&promo=LEADGEN25&utm_source=leadgen_dashboard&utm_medium=sidebar&utm_campaign=onboarding"
                  className="btn btn-primary btn-sm"
                  onClick={() => trackEvent("generate_lead", { source: "leadgen_sidebar_onboarding" })}
                >
                  Book onboarding
                </Link>
                <Link
                  to="/leadgen?utm_source=leadgen_dashboard&utm_medium=sidebar&utm_campaign=product_demo"
                  className="btn btn-secondary btn-sm"
                  onClick={() => trackEvent("generate_lead", { source: "leadgen_sidebar_demo" })}
                >
                  Open product demo
                </Link>
              </div>
            </section>
          </aside>

          <div className="admin-leadgen-tab-body leadgen-workspace-main">
            {tab === "command" && <CommandTab status={status} opsStatus={opsStatus} runtimeHealth={runtimeHealth} onSelectTab={selectTab} onStatusChange={loadStatus} onOpsRefresh={loadOps} />}
            {tab === "discover" && <DiscoverTab onStatusChange={loadStatus} />}
            {tab === "campaigns" && <CampaignsTab seed={campaignSeed} onSeedApplied={() => setCampaignSeed(null)} />}
            {tab === "insights" && <InsightsTab />}
            {tab === "jobs" && <JobsTab recent={status?.recent_jobs || []} onSelectTab={selectTab} />}
          </div>
        </div>

        {statusErr && !/401|403/.test(statusErr) ? (
          <p className="admin-leadgen-err">Status: {statusErr}</p>
        ) : null}
      </div>
    </section>
  );
}

// ============================================================
// Command tab
// ============================================================

function CommandTab({ status, opsStatus, runtimeHealth, onSelectTab, onStatusChange, onOpsRefresh }) {
  const businesses = status?.businesses?.total ?? 0;
  const withWebsite = status?.businesses?.with_website ?? 0;
  const emails = status?.emails?.deliverable ?? 0;
  const emailBusinesses = status?.emails?.businesses_with_email ?? 0;
  const sent = status?.sends?.sent ?? 0;
  const replies = status?.sends?.replied ?? 0;
  const readySegments = status?.ready_segments || [];
  const reviewQueue = status?.review_queue || [];
  const campaignQueue = status?.campaign_queue || [];
  const recentJobs = status?.recent_jobs || [];
  const [zip, setZip] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const normalizedZip = String(zip || "").replace(/\D/g, "").slice(0, 5);
  const isValidZip = /^\d{5}$/.test(normalizedZip);
  const marketPresets = [
    { label: "Sarasota healthcare", zip: "34232" },
    { label: "Bradenton trades", zip: "34207" },
    { label: "Venice services", zip: "34293" },
  ];

  const runWorker = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await postJson("/api/portal?action=leadgen-run-jobs", {});
      const s = r.summary || {};
      trackEvent("select_content", {
        content_type: "leadgen_worker_run",
        picked: Number(s.picked || 0),
        completed: Number(s.completed || 0),
        failed: Number(s.failed || 0),
      });
      setMsg("Worker ran " + (s.picked || 0) + " jobs: " + (s.completed || 0) + " completed" +
        (s.failed ? ", " + s.failed + " failed" : "") +
        (s.budget_exhausted ? ". Time budget hit; run again to continue." : "."));
      if (onStatusChange) await onStatusChange();
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const queueDiscover = async () => {
    if (!isValidZip) {
      setErr("Enter a 5-digit US zip code.");
      return;
    }
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await postJson("/api/portal?action=leadgen-discover", { zip: normalizedZip });
      trackEvent("search", {
        search_term: normalizedZip,
        source: "leadgen_admin_discover",
        deduped: Boolean(r.deduped),
      });
      setMsg(r.deduped ? "Zip " + normalizedZip + " was already queued. Running worker..." : "Queued discovery job #" + r.job_id + " for " + normalizedZip + ". Running worker...");
      await runWorker();
      onSelectTab("discover");
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const queueEmailCrawls = async () => {
    if (!isValidZip) {
      setErr("Enter the zip you want to crawl for published emails.");
      return;
    }
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await postJson("/api/portal?action=leadgen-crawl-emails", { zip: normalizedZip, limit: 100 });
      trackEvent("select_content", {
        content_type: "leadgen_email_crawl",
        source: "leadgen_admin_command",
        zip: normalizedZip,
        queued: Number(r.queued || 0),
      });
      setMsg("Queued " + (r.queued || 0) + " email crawl jobs for " + normalizedZip + ". Running worker...");
      await runWorker();
      onSelectTab("discover");
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const queuedJobs = jobCount("queued", status?.job_counts);
  const runningJobs = jobCount("running", status?.job_counts);
  const nextMove = nextLeadgenMove({ businesses, emailBusinesses, campaignQueue, queuedJobs });
  const noSignalJobs = recentJobs.filter((job) => {
    const result = job?.result || {};
    if (job?.status === "failed") return false;
    if (job?.kind === "osm_zip") return Number(result?.inserted ?? 0) <= 0 && Number(result?.updated ?? 0) <= 0;
    if (job?.kind === "website_emails") return Number(result?.found ?? 0) <= 0 && Number(result?.inserted ?? 0) <= 0;
    return false;
  });
  const staleSignal = noSignalJobs.length >= 4;
  const threatFeedCount = Number(opsStatus?.osint?.feeds?.length || 0);
  const threatTotalCidrs = Number(opsStatus?.osint?.totalCidrs || 0);
  const osintOldest = opsStatus?.osint?.oldestFetch || null;
  const criticalLastHour = Number(runtimeHealth?.checks?.criticalEventsLastHour ?? 0);
  const dbHealth = runtimeHealth?.checks?.db || "unknown";
  const stages = [
    {
      icon: Search,
      label: "Discover",
      value: compactNumber(businesses),
      detail: compactNumber(withWebsite) + " with websites",
      active: Number(businesses) > 0,
    },
    {
      icon: Mail,
      label: "Verify",
      value: compactNumber(emails),
      detail: compactNumber(emailBusinesses) + " businesses with email",
      active: Number(emailBusinesses) > 0,
    },
    {
      icon: CheckCircle2,
      label: "Review",
      value: compactNumber(reviewQueue.length),
      detail: "records ready to inspect",
      active: reviewQueue.length > 0,
    },
    {
      icon: Send,
      label: "Campaign",
      value: compactNumber(campaignQueue.length),
      detail: compactNumber(sent) + " sent so far",
      active: campaignQueue.length > 0,
    },
    {
      icon: BarChart3,
      label: "Learn",
      value: compactNumber(replies),
      detail: pct(replies, sent) + " reply rate",
      active: Number(replies) > 0,
    },
  ];
  const revenueReady = {
    canReview: reviewQueue.length > 0,
    canCampaign: reviewQueue.length > 0 || campaignQueue.length > 0,
    canExport: emailBusinesses > 0,
  };
  const seedCampaignFromCommand = () => {
    if (!isValidZip) {
      setErr("Enter a valid 5-digit zip to prefill a campaign draft.");
      return;
    }
    const defaultName = `Leadgen ${normalizedZip} ${new Date().toISOString().slice(0, 10)}`;
    const seed = {
      name: defaultName,
      segment: { zip: normalizedZip, min_confidence: 0.7 },
      throttle_per_hour: 30,
      daily_cap: Math.max(50, Math.min(250, reviewQueue.length || 100)),
    };
    trackEvent("select_content", {
      content_type: "leadgen_seed_campaign",
      source: "leadgen_admin_command",
      zip: normalizedZip,
      review_ready: reviewQueue.length,
    });
    onSelectTab("campaigns", "command_seed_campaign", { campaignSeed: seed });
  };

  return (
    <div className="leadgen-command">
      <section className="leadgen-command-console">
        <div className="leadgen-console-main">
          <div className="leadgen-console-topline">
            <span className="eyebrow">Live leadgen workspace</span>
            <span className="leadgen-powered-pill">{queuedJobs} queued jobs</span>
          </div>
          <h2>Start with map + zip, then move leads to outreach.</h2>
          <p>
            Pick a local market, discover businesses, verify contact paths, and
            launch a controlled campaign from one workspace.
          </p>
          <div className="leadgen-console-health" role="status" aria-live="polite">
            <span className={`leadgen-status-chip ${dbHealth === "connected" ? "leadgen-status-chip--good" : "leadgen-status-chip--bad"}`}>
              DB {dbHealth === "connected" ? "connected" : dbHealth}
            </span>
            <span className={`leadgen-status-chip ${criticalLastHour > 0 ? "leadgen-status-chip--bad" : "leadgen-status-chip--good"}`}>
              {criticalLastHour} critical events / hour
            </span>
            <span className={`leadgen-status-chip ${threatFeedCount > 0 ? "leadgen-status-chip--good" : "leadgen-status-chip--wait"}`}>
              {threatFeedCount} threat feeds ({compactNumber(threatTotalCidrs)} CIDRs)
            </span>
            <span className="leadgen-status-chip leadgen-status-chip--other">
              Oldest feed sync {freshnessLabel(osintOldest)}
            </span>
          </div>
          <div className="leadgen-console-focus" role="status" aria-live="polite">
            <span className="leadgen-console-focus__label">
              <MapPinned size={15} aria-hidden="true" />
              Map + zip workspace
            </span>
            <strong>{zip && /^\d{5}$/.test(zip) ? `Targeting ${zip}` : "Pick a 5-digit zip to populate the map and queue jobs"}</strong>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onSelectTab("discover")}>
              Open map + filters
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>

          <div className="leadgen-console-actions" aria-label="Leadgen pipeline controls">
            <label className="leadgen-zip-field">
              <span>Target zip</span>
              <input
                value={zip}
                onChange={(e) => {
                  const next = e.target.value.replace(/\D/g, "").slice(0, 5);
                  setZip(next);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !busy && isValidZip) {
                    e.preventDefault();
                    queueDiscover();
                  }
                }}
                inputMode="numeric"
                pattern="\d{5}"
                placeholder="34237"
                className="admin-leadgen-input admin-leadgen-input--zip"
                aria-label="Zip code"
              />
            </label>
            <button type="button" className="btn btn-primary" onClick={queueDiscover} disabled={busy || !isValidZip} title={!isValidZip ? "Enter a 5-digit zip to run discovery" : ""}>
              <Search size={16} aria-hidden="true" />
              Discover
            </button>
            <button type="button" className="btn btn-secondary" onClick={queueEmailCrawls} disabled={busy || !isValidZip} title={!isValidZip ? "Enter a 5-digit zip first" : ""}>
              <Mail size={16} aria-hidden="true" />
              Crawl emails
            </button>
            <button type="button" className="btn btn-secondary" onClick={runWorker} disabled={busy}>
              <Play size={16} aria-hidden="true" />
              Run jobs
            </button>
          </div>
          {!isValidZip ? (
            <p className="admin-aff-stat-hint" aria-live="polite">Use a valid 5-digit zip. Example: 34237.</p>
          ) : null}
          <div className="leadgen-console-presets" aria-label="Quick market presets">
            <span>Quick markets</span>
            {marketPresets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="leadgen-quick-market-btn"
                onClick={() => {
                  setZip(preset.zip);
                  trackEvent("search", {
                    search_term: preset.zip,
                    source: "leadgen_admin_market_preset",
                    market: preset.label,
                  });
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="leadgen-revenue-rail" aria-label="Revenue path actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={queueDiscover}
              disabled={busy}
            >
              1. Discover market
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                trackEvent("select_content", { content_type: "leadgen_revenue_path", destination: "discover_review" });
                onSelectTab("discover");
              }}
              disabled={!revenueReady.canReview}
              title={!revenueReady.canReview ? "Run discovery and crawl emails first" : ""}
            >
              2. Review list
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                trackEvent("select_content", { content_type: "leadgen_revenue_path", destination: "campaigns" });
                onSelectTab("campaigns");
              }}
              disabled={!revenueReady.canCampaign}
              title={!revenueReady.canCampaign ? "No review-ready records yet" : ""}
            >
              3. Launch campaign
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={seedCampaignFromCommand}
              disabled={!isValidZip}
              title={!isValidZip ? "Enter a valid zip to prefill a campaign draft" : ""}
            >
              Prefill campaign
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                trackEvent("select_content", { content_type: "leadgen_revenue_path", destination: "hubspot_export" });
                window.location.href = "/api/portal?action=leadgen-export&format=csv&status=active&has_email=1&limit=2000";
              }}
              disabled={!revenueReady.canExport}
              title={!revenueReady.canExport ? "Need deliverable emails to export" : ""}
            >
              4. Export to CRM
            </button>
          </div>

          {msg ? <p className="admin-leadgen-ok">{msg}</p> : null}
          {err ? <p className="admin-leadgen-err">{err}</p> : null}

          <div className="leadgen-stage-list" aria-label="Pipeline stages">
            {stages.map((stage) => {
              const Icon = stage.icon;
              return (
                <article key={stage.label} className={"leadgen-stage" + (stage.active ? " is-active" : "")}>
                  <span className="leadgen-stage__icon"><Icon size={16} aria-hidden="true" /></span>
                  <div>
                    <strong>{stage.label}</strong>
                    <em>{stage.value}</em>
                    <span>{stage.detail}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <aside className="leadgen-next-card" aria-label="Recommended next action">
          <div className="leadgen-next-card__icon"><Activity size={18} aria-hidden="true" /></div>
          <span className="eyebrow">Next best move</span>
          <h3>{nextMove.title}</h3>
          <p>{nextMove.detail}</p>
          {staleSignal ? (
            <p className="leadgen-next-card__warn">
              Recent jobs are finishing with little or no new signal. Try a fresh zip + industry pair before launching campaigns.
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              trackEvent("select_content", {
                content_type: "leadgen_next_best_move",
                destination: nextMove.tab,
                title: nextMove.title,
              });
              onSelectTab(nextMove.tab);
            }}
          >
            {nextMove.action}
            <ArrowRight size={15} aria-hidden="true" />
          </button>
          <dl className="leadgen-console-metrics">
            <div>
              <dt>Records</dt>
              <dd>{compactNumber(businesses)}</dd>
            </div>
            <div>
              <dt>Emails</dt>
              <dd>{compactNumber(emails)}</dd>
            </div>
            <div>
              <dt>Replies</dt>
              <dd>{compactNumber(replies)}</dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className="leadgen-signal-panel">
        <div className="admin-leadgen-section-head">
          <div>
            <h2 className="title-2">Pipeline health</h2>
            <p className="admin-leadgen-muted">Coverage and activity from the real leadgen tables.</p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onStatusChange} disabled={busy}>
            <RefreshCw size={14} aria-hidden="true" />
            Refresh
          </button>
        </div>
        <div className="leadgen-signal-grid">
          <div><strong>{pct(withWebsite, businesses)}</strong><span>records with websites</span></div>
          <div><strong>{pct(emailBusinesses, businesses)}</strong><span>businesses with email</span></div>
          <div><strong>{pct(replies, sent)}</strong><span>reply rate on sent email</span></div>
          <div><strong>{runningJobs}</strong><span>worker jobs running</span></div>
        </div>
        <div className="leadgen-signal-grid leadgen-signal-grid--ops">
          <div><strong>{dbHealth}</strong><span>runtime DB status</span></div>
          <div><strong>{criticalLastHour}</strong><span>critical security events (1h)</span></div>
          <div><strong>{threatFeedCount}</strong><span>threat feeds active</span></div>
          <div><strong>{threatTotalCidrs.toLocaleString()}</strong><span>OSINT CIDR entries | oldest refresh {freshnessLabel(osintOldest)}</span></div>
        </div>
        <div className="leadgen-signal-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              trackEvent("select_content", { content_type: "leadgen_ops_refresh", source: "leadgen_command" });
              onOpsRefresh?.();
            }}
          >
            Refresh ops status
          </button>
        </div>
      </section>

      <div className="leadgen-command-grid">
        <section className="admin-aff-card leadgen-data-board">
          <div className="admin-leadgen-section-head">
            <div>
              <h2 className="title-2">Ready segments</h2>
              <p className="admin-leadgen-muted">Segments with enough contact signal to turn into a campaign.</p>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onSelectTab("discover")}>Open Discover</button>
          </div>
          {readySegments.length ? readySegments.map((segment) => (
            <article key={segment.zip + "-" + (segment.industry_group || "Other")} className="leadgen-data-row">
              <div>
                <strong>{segment.zip} - {segment.industry_group || "Other"}</strong>
                <span>{segment.city || "-"} - {segment.businesses} businesses</span>
              </div>
              <div className="leadgen-mini-metrics">
                <span>{segment.with_email} with email</span>
                <span>{segment.with_website} with website</span>
              </div>
            </article>
          )) : <p className="admin-leadgen-empty">No ready segments yet. Run discovery and email crawling first.</p>}
        </section>

        <section className="admin-aff-card leadgen-data-board">
          <div className="admin-leadgen-section-head">
            <div>
              <h2 className="title-2">Review queue</h2>
              <p className="admin-leadgen-muted">Businesses with deliverable contacts, ready for human review.</p>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onSelectTab("discover")}>Review list</button>
          </div>
          <div className="leadgen-review-list">
            {reviewQueue.length ? reviewQueue.map((row) => (
              <article key={row.id} className="leadgen-data-row">
                <div>
                  <strong>{row.name}</strong>
                  <span>{[row.city, row.zip, row.industry_group || row.sub_industry].filter(Boolean).join(" - ")}</span>
                </div>
                <div className="leadgen-mini-metrics">
                  <span>{row.deliverable_emails} email{Number(row.deliverable_emails) === 1 ? "" : "s"}</span>
                  {row.website ? <a href={row.website} target="_blank" rel="noopener noreferrer">{hostFor(row.website)}</a> : <span>No website</span>}
                </div>
              </article>
            )) : <p className="admin-leadgen-empty">No records yet. Discover a zip to populate the review queue.</p>}
          </div>
        </section>

        <section className="admin-aff-card leadgen-data-board">
          <div className="admin-leadgen-section-head">
            <div>
              <h2 className="title-2">Campaign queue</h2>
              <p className="admin-leadgen-muted">Created campaigns with current send and response status.</p>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onSelectTab("campaigns")}>Open Email</button>
          </div>
          {campaignQueue.length ? campaignQueue.map((campaign) => (
            <article key={campaign.id} className="leadgen-data-row">
              <div>
                <strong>{campaign.name}</strong>
                <span>{campaign.daily_cap}/day cap</span>
              </div>
              <div className="leadgen-mini-metrics">
                <StatusChip status={campaign.status} />
                <span>{campaign.sent} sent / {campaign.queued} queued</span>
                <span>{campaign.opened} opened - {campaign.replied} replied</span>
              </div>
            </article>
          )) : <p className="admin-leadgen-empty">No campaigns yet. Build one from the Email tab after a segment is ready.</p>}
        </section>

        <section className="admin-aff-card leadgen-data-board">
          <div className="admin-leadgen-section-head">
            <div>
              <h2 className="title-2">Worker jobs</h2>
              <p className="admin-leadgen-muted">Recent crawl and campaign jobs, with progress.</p>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onSelectTab("jobs")}>Open Jobs</button>
          </div>
          {recentJobs.length ? recentJobs.slice(0, 6).map((job) => (
            <article key={job.id} className="leadgen-data-row">
              <div>
                <strong>#{job.id} {job.kind}</strong>
                <span>{fmtTime(job.created_at)}</span>
              </div>
              <div className="leadgen-mini-metrics">
                <StatusChip status={job.status} />
                <span>{job.progress || 0}/{job.total || 0}</span>
              </div>
            </article>
          )) : <p className="admin-leadgen-empty">No crawl jobs yet.</p>}
        </section>
      </div>
    </div>
  );
}

// ============================================================
// Insights tab
// ============================================================

function InsightsTab() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await getJson("/api/portal?action=leadgen-insights");
      setData(r);
    } catch (e) { setErr(String(e.message || e)); }
    finally { setBusy(false); }
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  if (busy && !data) return <p className="admin-leadgen-ok">Loading insights...</p>;
  if (err) return <p className="admin-leadgen-err">{err}</p>;
  if (!data) return null;

  const { geography, industries, emailHealth, discoveryVelocity, campaignStats, topSegments } = data;

  return (
    <div className="admin-leadgen-insights">
      <div className="admin-leadgen-section-head">
        <h2 className="title-2">Insights</h2>
        <button type="button" className="btn btn-secondary btn-sm" onClick={load} disabled={busy}>
          {busy ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="leadgen-kpi-grid">
        <Stat label="Total businesses" value={data.totalBusinesses?.toLocaleString?.()} accent="blue" />
        <Stat label="With website" value={`${data.websiteRate ?? 0}%`} hint={`${data.withWebsite ?? 0} records`} accent="teal" />
        <Stat label="With email" value={`${data.emailRate ?? 0}%`} hint={`${data.withEmail ?? 0} records`} accent="violet" />
        <Stat label="Avg emails / biz" value={data.avgEmailsPerBiz?.toFixed?.(1)} accent="amber" />
      </div>

      <div className="admin-leadgen-insights-grid">
        {/* Geography */}
        <div className="admin-aff-card">
          <h3 className="title-3" style={{ margin: "0 0 12px" }}>Top zip codes</h3>
          {geography?.length ? (
            <table className="admin-aff-table">
              <thead><tr><th>Zip</th><th>City</th><th style={{ textAlign: "right" }}>Businesses</th><th style={{ textAlign: "right" }}>With email</th></tr></thead>
              <tbody>
                {geography.map((g) => (
                  <tr key={g.zip}>
                    <td><strong>{g.zip}</strong></td>
                    <td>{g.city || "-"}</td>
                    <td style={{ textAlign: "right" }}>{g.count}</td>
                    <td style={{ textAlign: "right" }}>{g.with_email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="admin-leadgen-empty">No data yet.</p>}
        </div>

        {/* Industries */}
        <div className="admin-aff-card">
          <h3 className="title-3" style={{ margin: "0 0 12px" }}>Industry breakdown</h3>
          {industries?.length ? (
            <table className="admin-aff-table">
              <thead><tr><th>Industry</th><th style={{ textAlign: "right" }}>Businesses</th><th style={{ textAlign: "right" }}>% of total</th></tr></thead>
              <tbody>
                {industries.map((ind) => (
                  <tr key={ind.industry_group}>
                    <td>{ind.industry_group}</td>
                    <td style={{ textAlign: "right" }}>{ind.count}</td>
                    <td style={{ textAlign: "right" }}>{ind.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="admin-leadgen-empty">No data yet.</p>}
        </div>

        {/* Email health */}
        <div className="admin-aff-card">
          <h3 className="title-3" style={{ margin: "0 0 12px" }}>Email health by industry</h3>
          {emailHealth?.length ? (
            <table className="admin-aff-table">
              <thead><tr><th>Industry</th><th style={{ textAlign: "right" }}>Emails</th><th style={{ textAlign: "right" }}>Deliverable</th><th style={{ textAlign: "right" }}>Rate</th></tr></thead>
              <tbody>
                {emailHealth.map((h) => (
                  <tr key={h.industry_group}>
                    <td>{h.industry_group}</td>
                    <td style={{ textAlign: "right" }}>{h.total_emails}</td>
                    <td style={{ textAlign: "right" }}>{h.deliverable}</td>
                    <td style={{ textAlign: "right" }}><strong>{h.rate}%</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="admin-leadgen-empty">No data yet.</p>}
        </div>

        {/* Discovery velocity */}
        <div className="admin-aff-card">
          <h3 className="title-3" style={{ margin: "0 0 12px" }}>Discovery velocity</h3>
          {discoveryVelocity?.length ? (
            <table className="admin-aff-table">
              <thead><tr><th>Period</th><th style={{ textAlign: "right" }}>Discovered</th><th style={{ textAlign: "right" }}>With email</th></tr></thead>
              <tbody>
                {discoveryVelocity.map((d) => (
                  <tr key={d.period}>
                    <td>{d.period}</td>
                    <td style={{ textAlign: "right" }}>{d.count}</td>
                    <td style={{ textAlign: "right" }}>{d.with_email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="admin-leadgen-empty">No data yet.</p>}
        </div>

        {/* Campaign stats */}
        <div className="admin-aff-card">
          <h3 className="title-3" style={{ margin: "0 0 12px" }}>Campaign performance</h3>
          {campaignStats?.length ? (
            <table className="admin-aff-table">
              <thead><tr><th>Campaign</th><th style={{ textAlign: "right" }}>Sent</th><th style={{ textAlign: "right" }}>Open</th><th style={{ textAlign: "right" }}>Reply</th></tr></thead>
              <tbody>
                {campaignStats.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td style={{ textAlign: "right" }}>{c.sent}</td>
                    <td style={{ textAlign: "right" }}>{c.open_rate}%</td>
                    <td style={{ textAlign: "right" }}>{c.reply_rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="admin-leadgen-empty">No campaigns yet.</p>}
        </div>

        {/* Top segments */}
        <div className="admin-aff-card">
          <h3 className="title-3" style={{ margin: "0 0 12px" }}>Top segments (zip + industry)</h3>
          {topSegments?.length ? (
            <table className="admin-aff-table">
              <thead><tr><th>Segment</th><th style={{ textAlign: "right" }}>Businesses</th><th style={{ textAlign: "right" }}>With email</th></tr></thead>
              <tbody>
                {topSegments.map((s) => (
                  <tr key={`${s.zip}-${s.industry_group}`}>
                    <td>{s.zip} - {s.industry_group}</td>
                    <td style={{ textAlign: "right" }}>{s.count}</td>
                    <td style={{ textAlign: "right" }}>{s.with_email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="admin-leadgen-empty">No data yet.</p>}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Discover tab
// ============================================================

function DiscoverTab({ onStatusChange }) {
  const [zip, setZip] = useState("");
  const [filter, setFilter] = useState({
    zip: "", status: "active", q: "",
    industry_group: "", sub_industry: "",
    has_website: false, has_email: false, no_email: false,
    tag: "", min_emails: "", max_emails: "",
    created_after: "", created_before: "",
  });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState({ groups: [], subs: [] });
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const limit = 50;
  const validStatuses = new Set(["", "active", "rejected", "do_not_contact"]);
  const cleanFilter = () => ({
    zip: "", status: "active", q: "",
    industry_group: "", sub_industry: "",
    has_website: false, has_email: false, no_email: false,
    tag: "", min_emails: "", max_emails: "",
    created_after: "", created_before: "",
  });
  const cleanDigits = (value, max = 5) => String(value || "").replace(/\D/g, "").slice(0, max);
  const cleanTag = (value) => {
    const raw = String(value || "");
    if (raw.includes("@")) return "";
    return raw.toLowerCase().replace(/[^a-z0-9 _-]/g, "").trim().slice(0, 48);
  };
  const normalizeListFilter = (source = filter) => {
    const hasEmail = Boolean(source.has_email);
    const noEmail = hasEmail ? false : Boolean(source.no_email);
    return {
      ...cleanFilter(),
      zip: cleanDigits(source.zip),
      status: validStatuses.has(source.status) ? source.status : "active",
      q: String(source.q || "").trim().slice(0, 120),
      industry_group: String(source.industry_group || "").trim().slice(0, 80),
      sub_industry: String(source.sub_industry || "").trim().slice(0, 80),
      has_website: Boolean(source.has_website),
      has_email: hasEmail,
      no_email: noEmail,
      tag: cleanTag(source.tag),
      min_emails: cleanDigits(source.min_emails, 4),
      max_emails: cleanDigits(source.max_emails, 4),
      created_after: /^\d{4}-\d{2}-\d{2}$/.test(source.created_after || "") ? source.created_after : "",
      created_before: /^\d{4}-\d{2}-\d{2}$/.test(source.created_before || "") ? source.created_before : "",
    };
  };
  const normalizedFilter = normalizeListFilter(filter);
  const activeFilterCount = [
    normalizedFilter.zip,
    normalizedFilter.q,
    normalizedFilter.industry_group,
    normalizedFilter.sub_industry,
    normalizedFilter.has_website,
    normalizedFilter.has_email,
    normalizedFilter.no_email,
    normalizedFilter.tag,
    normalizedFilter.min_emails,
    normalizedFilter.max_emails,
    normalizedFilter.created_after,
    normalizedFilter.created_before,
    normalizedFilter.status && normalizedFilter.status !== "active",
  ].filter(Boolean).length;
  const currentZip = normalizedFilter.zip || cleanDigits(zip);
  const resetFilters = () => {
    setFilter(cleanFilter());
    setPage(1);
    setErr(null);
  };
  const applyListPreset = (preset) => {
    const baseZip = currentZip;
    setPage(1);
    setErr(null);
    if (preset === "ready") {
      setFilter({ ...cleanFilter(), zip: baseZip, has_website: true, has_email: true });
      return;
    }
    if (preset === "needs_email") {
      setFilter({ ...cleanFilter(), zip: baseZip, has_website: true, no_email: true });
      return;
    }
    setFilter({ ...cleanFilter(), zip: baseZip });
  };
  const emptyCopy = filter.zip
    ? "No businesses match this view. Clear filters, search a business/email, or run discovery for this zip."
    : "Enter a zip and discover businesses to start the local prospect list.";

  // Build the query string used for both list-load and export so the
  // download always matches the current view exactly.
  const buildQuery = (extra = {}, sourceFilter = filter) => {
    const f = normalizeListFilter(sourceFilter);
    const url = new URL("/api/portal", window.location.origin);
    url.searchParams.set("action", extra.action || "leadgen-businesses");
    if (f.zip)            url.searchParams.set("zip", f.zip);
    if (f.status)         url.searchParams.set("status", f.status);
    if (f.q)              url.searchParams.set("q", f.q);
    if (f.industry_group) url.searchParams.set("industry_group", f.industry_group);
    if (f.sub_industry)   url.searchParams.set("sub_industry", f.sub_industry);
    if (f.has_website)    url.searchParams.set("has_website", "1");
    if (f.has_email)      url.searchParams.set("has_email", "1");
    if (f.no_email)       url.searchParams.set("no_email", "1");
    if (f.tag)            url.searchParams.set("tag", f.tag);
    if (f.min_emails)     url.searchParams.set("min_emails", f.min_emails);
    if (f.max_emails)     url.searchParams.set("max_emails", f.max_emails);
    if (f.created_after)  url.searchParams.set("created_after", f.created_after);
    if (f.created_before) url.searchParams.set("created_before", f.created_before);
    if (extra.format)          url.searchParams.set("format", extra.format);
    return url;
  };

  const loadList = async (overridePage, sourceFilter = filter) => {
    const p = overridePage ?? page;
    const url = buildQuery({}, sourceFilter);
    url.searchParams.set("page", String(p));
    url.searchParams.set("limit", String(limit));
    try {
      const r = await getJson(url.pathname + url.search);
      setRows(r.rows || []);
      setTotal(r.total || 0);
      setFacets(r.facets || { groups: [], subs: [] });
      setErr(null);
    } catch (e) {
      const message = String(e.message || e);
      setErr(message === "HTTP 500"
        ? "The lead list failed to reload. I kept the screen usable; refresh or clear filters, then run discovery again."
        : message);
    }
  };

  // Re-load whenever the filter changes. Fetch-on-mount is a legitimate
  // effect use; the lint rule is overly strict here.
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { loadList(page); }, [filter, page]);

  const queueDiscover = async () => {
    const normalizedZip = cleanDigits(zip);
    if (!/^\d{5}$/.test(normalizedZip)) {
      setErr("Enter a 5-digit US zip code.");
      return;
    }
    const nextFilter = { ...cleanFilter(), zip: normalizedZip, status: "active" };
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await postJson("/api/portal?action=leadgen-discover", { zip: normalizedZip });
      if (r.deduped) {
        setMsg(`Already queued as job #${r.job_id}. Running pending jobs...`);
      } else {
        setMsg(`Queued public business scan for ${normalizedZip}. Running now...`);
      }
      setZip(normalizedZip);
      setPage(1);
      setFilter(nextFilter);
      // Drain the queue inline so the operator sees results immediately
      // instead of waiting until the next 11:15 UTC cron tick.
      const run = await postJson("/api/portal?action=leadgen-run-jobs", {});
      const s = run.summary || {};
      setMsg(`Scan finished for ${normalizedZip}. Loading businesses and map pins...` +
             (s.failed ? ` ${s.failed} job failed.` : ""));
      await loadList(1, nextFilter);
      if (onStatusChange) await onStatusChange();
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const queueEmailCrawls = async () => {
    const targetZip = normalizeListFilter(filter).zip;
    if (!/^\d{5}$/.test(targetZip)) {
      setErr("Filter by a 5-digit zip first, then queue.");
      return;
    }
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await postJson("/api/portal?action=leadgen-crawl-emails", { zip: targetZip, limit: 100 });
      setMsg(`Queued ${r.queued} public email crawls for ${targetZip}. Running...`);
      const run = await postJson("/api/portal?action=leadgen-run-jobs", {});
      const s = run.summary || {};
      setMsg(`Email crawl finished: ${s.completed || 0}/${s.picked || 0} jobs ok` +
             (s.failed ? `, ${s.failed} failed` : "") +
             (s.budget_exhausted ? ". Budget exhausted - click Crawl again to continue." : ".") +
             " Refreshing list.");
      await loadList();
      if (onStatusChange) await onStatusChange();
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const setRowStatus = async (id, newStatus) => {
    try {
      await postJson("/api/portal?action=leadgen-business-update", { id, status: newStatus });
      await loadList();
    } catch (e) {
      setErr(String(e.message || e));
    }
  };

  // Free-form tags: prompt() is intentionally low-fi here; full editor
  // would need a per-row inline form. Comma-separated input -> text[].
  const editRowTags = async (row) => {
    const next = prompt(`Tags for "${row.name}" (comma separated, lowercase):`, (row.tags || []).join(", "));
    if (next === null) return;
    try {
      await postJson("/api/portal?action=leadgen-business-update", { id: row.id, tags: next });
      await loadList();
    } catch (e) {
      setErr(String(e.message || e));
    }
  };

  const reclassify = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await postJson("/api/portal?action=leadgen-reclassify", {});
      setMsg(`Reclassified ${r.updated} businesses with the latest taxonomy.`);
      await loadList();
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const exportData = (format) => {
    const url = buildQuery({ action: "leadgen-export", format });
    window.location.href = url.pathname + url.search;
  };

  return (
    <div className="admin-leadgen-discover">
      <div className="leadgen-discover-command">
        <div>
          <span className="leadgen-console-topline">Discovery</span>
          <h2>Map a local market by zip.</h2>
          <p>Scan public business records, review the list, then enrich only the leads worth contacting.</p>
        </div>
        <div className="leadgen-discover-actions">
          <label className="admin-leadgen-field">
            <span>Zip code</span>
            <input
              value={zip}
              onChange={(e) => setZip(cleanDigits(e.target.value))}
              inputMode="numeric"
              pattern="\d{5}"
              placeholder="34207"
              autoComplete="postal-code"
              className="admin-leadgen-input admin-leadgen-input--zip"
            />
          </label>
          <button
            type="button"
            onClick={queueDiscover}
            disabled={busy}
            className="btn btn-primary"
          >
            {busy ? "Scanning..." : "Scan zip"}
          </button>
          <button
            type="button"
            onClick={queueEmailCrawls}
            disabled={busy || !/^\d{5}$/.test(currentZip)}
            className="btn btn-secondary"
            title={!/^\d{5}$/.test(currentZip) ? "Filter by a zip first" : ""}
          >
            Find emails
          </button>
        </div>
      </div>

      {msg ? <p className="admin-leadgen-ok">{msg}</p> : null}
      {err ? <p className="admin-leadgen-err">{err}</p> : null}

      <LeadgenMap rows={rows} total={total} busy={busy} />

      <div className="leadgen-list-tools">
        <div>
          <span className="leadgen-console-topline">Lead list</span>
          <strong>{total.toLocaleString()} businesses</strong>
          <p>{currentZip ? `Filtered to ZIP ${currentZip}.` : "Scan a zip to populate the map and lead table."}</p>
        </div>
        <div className="leadgen-filter-presets" aria-label="Lead list presets">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyListPreset("all")}>All in zip</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyListPreset("ready")}>Ready contacts</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyListPreset("needs_email")}>Needs email crawl</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={resetFilters} disabled={activeFilterCount === 0}>Clear filters</button>
        </div>
      </div>

      <div className="admin-leadgen-filters leadgen-filter-panel" aria-label="Lead list filters">
        <div className="leadgen-filter-row leadgen-filter-row--primary">
          <label className="admin-leadgen-field admin-leadgen-field--search">
            <span>Search</span>
            <input
              placeholder="business, website, or email"
              value={filter.q}
              onChange={(e) => { setFilter((f) => ({ ...f, q: e.target.value })); setPage(1); }}
              autoComplete="off"
              className="admin-leadgen-input admin-leadgen-input--grow"
            />
          </label>
          <label className="admin-leadgen-field admin-leadgen-field--compact">
            <span>Zip</span>
            <input
              placeholder="34207"
              value={filter.zip}
              onChange={(e) => { setFilter((f) => ({ ...f, zip: cleanDigits(e.target.value) })); setPage(1); }}
              inputMode="numeric"
              autoComplete="postal-code"
              className="admin-leadgen-input admin-leadgen-input--zip"
            />
          </label>
          <label className="admin-leadgen-field admin-leadgen-field--select">
            <span>Industry</span>
            <select
              value={filter.industry_group}
              onChange={(e) => { setFilter((f) => ({ ...f, industry_group: e.target.value, sub_industry: "" })); setPage(1); }}
              className="admin-leadgen-input"
            >
              <option value="">All industries</option>
              {(facets.groups || []).map((g) => (
                <option key={g.industry_group} value={g.industry_group}>{g.industry_group} ({g.n})</option>
              ))}
            </select>
          </label>
          <label className="admin-leadgen-field admin-leadgen-field--select">
            <span>Status</span>
            <select
              value={filter.status}
              onChange={(e) => { setFilter((f) => ({ ...f, status: e.target.value })); setPage(1); }}
              className="admin-leadgen-input"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="rejected">Rejected</option>
              <option value="do_not_contact">Do not contact</option>
            </select>
          </label>
        </div>
        <div className="leadgen-filter-row leadgen-filter-row--secondary">
          <label className="admin-leadgen-check">
            <input type="checkbox" checked={filter.has_website}
              onChange={(e) => { setFilter((f) => ({ ...f, has_website: e.target.checked })); setPage(1); }} />
            Website
          </label>
          <label className="admin-leadgen-check">
            <input type="checkbox" checked={filter.has_email}
              onChange={(e) => { setFilter((f) => ({ ...f, has_email: e.target.checked, no_email: e.target.checked ? false : f.no_email })); setPage(1); }} />
            Email found
          </label>
          <label className="admin-leadgen-check">
            <input type="checkbox" checked={filter.no_email}
              onChange={(e) => { setFilter((f) => ({ ...f, no_email: e.target.checked, has_email: e.target.checked ? false : f.has_email })); setPage(1); }} />
            Needs crawl
          </label>
          <details className="leadgen-advanced-filters">
            <summary>Advanced</summary>
            <div className="leadgen-advanced-filters__grid">
              <label className="admin-leadgen-field">
                <span>Sub-industry</span>
                <select
                  value={filter.sub_industry}
                  onChange={(e) => { setFilter((f) => ({ ...f, sub_industry: e.target.value })); setPage(1); }}
                  className="admin-leadgen-input"
                  disabled={!filter.industry_group}
                  title={!filter.industry_group ? "Pick an industry first" : ""}
                >
                  <option value="">All sub-industries</option>
                  {(facets.subs || []).map((s) => (
                    <option key={s.sub_industry} value={s.sub_industry}>{s.sub_industry} ({s.n})</option>
                  ))}
                </select>
              </label>
              <label className="admin-leadgen-field">
                <span>Tag</span>
                <input
                  placeholder="reviewed"
                  value={filter.tag}
                  onChange={(e) => { setFilter((f) => ({ ...f, tag: cleanTag(e.target.value) })); setPage(1); }}
                  autoComplete="off"
                  className="admin-leadgen-input"
                />
              </label>
              <label className="admin-leadgen-field">
                <span>Min emails</span>
                <input
                  placeholder="0"
                  inputMode="numeric"
                  value={filter.min_emails}
                  onChange={(e) => { setFilter((f) => ({ ...f, min_emails: cleanDigits(e.target.value, 4) })); setPage(1); }}
                  autoComplete="off"
                  className="admin-leadgen-input"
                />
              </label>
              <label className="admin-leadgen-field">
                <span>Max emails</span>
                <input
                  placeholder="100"
                  inputMode="numeric"
                  value={filter.max_emails}
                  onChange={(e) => { setFilter((f) => ({ ...f, max_emails: cleanDigits(e.target.value, 4) })); setPage(1); }}
                  autoComplete="off"
                  className="admin-leadgen-input"
                />
              </label>
              <label className="admin-leadgen-field">
                <span>After</span>
                <input
                  type="date"
                  value={filter.created_after}
                  onChange={(e) => { setFilter((f) => ({ ...f, created_after: e.target.value })); setPage(1); }}
                  className="admin-leadgen-input"
                />
              </label>
              <label className="admin-leadgen-field">
                <span>Before</span>
                <input
                  type="date"
                  value={filter.created_before}
                  onChange={(e) => { setFilter((f) => ({ ...f, created_before: e.target.value })); setPage(1); }}
                  className="admin-leadgen-input"
                />
              </label>
            </div>
          </details>
          <span className="admin-leadgen-count">{activeFilterCount} active</span>
          <div className="admin-leadgen-export-group">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => exportData("csv")} disabled={total === 0}>Export CSV</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => exportData("json")} disabled={total === 0}>Export JSON</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={reclassify} disabled={busy} title="Backfill industry_group + sub_industry from raw OSM tags">Reclassify</button>
          </div>
        </div>
      </div>

      <div className="admin-aff-card">
        <table className="admin-aff-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Industry</th>
              <th>Zip</th>
              <th>Website</th>
              <th style={{ textAlign: "right" }}>Emails</th>
              <th>Tags</th>
              <th>Status</th>
              <th aria-label="actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td className="admin-leadgen-muted">
                  {r.industry_group ? <strong>{r.industry_group}</strong> : (r.industry || "-")}
                  {r.sub_industry ? <><br /><span style={{ fontSize: 11 }}>{r.sub_industry}</span></> : null}
                </td>
                <td>{r.zip || "-"}</td>
                <td>
                  {r.website ? (
                    <a href={r.website} target="_blank" rel="noopener noreferrer">
                      {hostFor(r.website)}
                    </a>
                  ) : "-"}
                </td>
                <td style={{ textAlign: "right" }}>{r.deliverable_emails}</td>
                <td>
                  <button type="button" className="admin-leadgen-tag-btn" onClick={() => editRowTags(r)} title="Edit tags">
                    {(r.tags && r.tags.length) ? r.tags.map((t) => <span key={t} className="admin-leadgen-tag">{t}</span>) : <em style={{ fontSize: 11, opacity: 0.6 }}>+ tag</em>}
                  </button>
                </td>
                <td className="admin-leadgen-muted">{r.status}</td>
                <td style={{ textAlign: "right" }}>
                  <select
                    value={r.status}
                    onChange={(e) => setRowStatus(r.id, e.target.value)}
                    className="admin-leadgen-input admin-leadgen-input--sm"
                  >
                    <option value="active">active</option>
                    <option value="rejected">rejected</option>
                    <option value="do_not_contact">do_not_contact</option>
                  </select>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="admin-leadgen-empty">{emptyCopy}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {total > limit ? (
        <div className="admin-leadgen-pager">
          <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
          <span>Page {page} of {Math.ceil(total / limit)}</span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page * limit >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      ) : null}
    </div>
  );
}

function LeadgenMap({ rows, total, busy }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const leafletRef = useRef(null);
  const [mapState, setMapState] = useState({ ready: false, error: "" });
  const fallbackLoggedRef = useRef(false);
  const geocodedRows = useMemo(
    () => rows.filter((r) => Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng))),
    [rows]
  );
  const fallbackPoints = useMemo(() => normalizedGeoPoints(geocodedRows), [geocodedRows]);
  const mapsSearchHref = useMemo(() => {
    const row = geocodedRows[0];
    if (!row) return "";
    const query = [row.name, row.address, row.city, row.state, row.zip].filter(Boolean).join(", ");
    return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
  }, [geocodedRows]);
  const mapsCenterHref = useMemo(() => {
    const row = geocodedRows[0];
    if (!row) return "";
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
    return `https://www.google.com/maps/@${lat},${lng},13z`;
  }, [geocodedRows]);

  useEffect(() => {
    let cancelled = false;

    async function setupMap() {
      if (!containerRef.current || mapRef.current) return;
      const leaflet = await import("leaflet");
      if (cancelled || !containerRef.current) return;
      const L = leaflet.default || leaflet;
      leafletRef.current = L;
      const map = L.map(containerRef.current, {
        zoomControl: true,
        scrollWheelZoom: false,
      }).setView([27.3364, -82.5307], 10);
      const providers = [
        {
          url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        },
        {
          url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO',
        },
        {
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
          attribution: "Tiles &copy; Esri",
        },
      ];
      let tileLayer = null;
      let tileFailures = 0;
      const attachLayer = (providerIndex) => {
        const p = providers[providerIndex];
        tileLayer = L.tileLayer(p.url, {
          maxZoom: 19,
          crossOrigin: true,
          attribution: p.attribution,
        }).addTo(map);
        tileLayer.on("tileerror", () => {
          tileFailures += 1;
          if (tileFailures < 4) return;
          if (cancelled || providerIndex >= providers.length - 1) {
            if (!fallbackLoggedRef.current) {
              trackEvent("exception", {
                source: "leadgen_dashboard_map_tiles",
                fatal: false,
                context: "discover_map",
              });
              fallbackLoggedRef.current = true;
            }
            setMapState({
              ready: false,
              error: "Map tiles are blocked or unavailable on this network. Discovery list, filters, and exports still work.",
            });
            return;
          }
          map.removeLayer(tileLayer);
          attachLayer(providerIndex + 1);
        });
      };
      attachLayer(0);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setMapState({ ready: true, error: "" });
      const resizeObserver = new ResizeObserver(() => map.invalidateSize());
      resizeObserver.observe(containerRef.current);
      map._leadgenResizeObserver = resizeObserver;
      setTimeout(() => map.invalidateSize(), 120);
    }

    setupMap();
    return () => {
      cancelled = true;
      const map = mapRef.current;
      if (map?._leadgenResizeObserver) map._leadgenResizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const layer = layerRef.current;
    const map = mapRef.current;
    if (!L || !layer || !map) return;

    layer.clearLayers();
    const points = geocodedRows.slice(0, 80);
    for (const row of points) {
      const marker = L.marker([Number(row.lat), Number(row.lng)], {
        icon: L.divIcon({
          className: "leadgen-map-pin",
          html: `<span></span>`,
          iconSize: [24, 24],
          iconAnchor: [12, 22],
          popupAnchor: [0, -18],
        }),
      });
      const popup = document.createElement("div");
      popup.className = "leadgen-map-popup";
      const title = document.createElement("strong");
      title.textContent = row.name || "Unnamed business";
      const meta = document.createElement("span");
      meta.textContent = [row.industry_group || row.industry, row.zip].filter(Boolean).join(" | ");
      const contact = document.createElement("span");
      contact.textContent = `${row.deliverable_emails || 0} email${Number(row.deliverable_emails) === 1 ? "" : "s"} found${row.website ? ` | ${hostFor(row.website)}` : ""}`;
      const source = document.createElement("a");
      source.href = row.source_url || "#";
      source.target = "_blank";
      source.rel = "noreferrer";
      source.textContent = row.source_url ? "Open source record" : "Source pending";
      if (!row.source_url) source.removeAttribute("href");
      popup.append(title, meta, contact, source);
      marker.bindPopup(popup);
      marker.addTo(layer);
    }

    if (points.length) {
      const bounds = L.latLngBounds(points.map((r) => [Number(r.lat), Number(r.lng)]));
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: points.length === 1 ? 14 : 15 });
    }
  }, [geocodedRows]);

  return (
    <section className="admin-aff-card leadgen-map-card" aria-label="Map of discovered businesses">
      <div className="admin-leadgen-section-head">
        <div>
          <h3>Discovery map</h3>
          <p className="admin-leadgen-muted">
            Pins show the public-source businesses in the current filtered page before email crawling or outreach.
          </p>
        </div>
        <span className="leadgen-powered-pill">{geocodedRows.length} mapped / {total} matches</span>
      </div>
      <div className="leadgen-map-shell">
        <div ref={containerRef} className="leadgen-map" />
        {mapState.error && fallbackPoints.length ? (
          <div className="leadgen-map-fallback" aria-label="Fallback map using local coordinates">
            {fallbackPoints.map((p, i) => (
              <span key={`${p.label}-${i}`} className="leadgen-map-fallback__dot" style={{ left: `${p.x}%`, top: `${p.y}%` }} title={p.label} />
            ))}
          </div>
        ) : null}
        {mapState.error ? (
          <div className="leadgen-map-empty">
            <span>{mapState.error}</span>
            <div className="leadgen-map-empty__actions">
              {mapsSearchHref ? (
                <a
                  className="btn btn-secondary btn-sm"
                  href={mapsSearchHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackEvent("select_content", { content_type: "leadgen_map_fallback", destination: "google_maps_search_admin" })}
                >
                  Open in Google Maps
                </a>
              ) : null}
              {mapsCenterHref ? (
                <a
                  className="btn btn-secondary btn-sm"
                  href={mapsCenterHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackEvent("select_content", { content_type: "leadgen_map_fallback", destination: "google_maps_center_admin" })}
                >
                  Open market center
                </a>
              ) : null}
            </div>
          </div>
        ) : !geocodedRows.length ? (
          <div className="leadgen-map-empty">
            {busy ? "Waiting for the discovery crawl to finish..." : "Discover a zip or adjust filters to show mapped businesses."}
          </div>
        ) : null}
      </div>
    </section>
  );
}

// ============================================================
// Campaigns tab
// ============================================================

const DEFAULT_TEMPLATE = `Hi {{first_name}},

I'm reaching out from Simple IT SRQ. We help small offices in {{city}}
fix the practical IT problems that interrupt work: slow WiFi, dead backups,
password chaos, office moves, and machines that keep breaking.

Would it be worth a 15-minute call next week to see what is slowing
{{business_name}} down?

[Your name]
Simple IT SRQ | https://simpleitsrq.com`;

const REQUIRED_TEMPLATE_TOKENS = ["{{business_name}}", "{{city}}"];

function campaignReadiness(campaign) {
  const seg = campaign?.segment || {};
  const name = String(campaign?.name || "").trim();
  const fromEmail = String(campaign?.from_email || "").trim();
  const subject = String(campaign?.subject_template || "").trim();
  const body = String(campaign?.body_template || "").trim();
  const zip = String(seg?.zip || "").replace(/\D/g, "").slice(0, 5);
  const dailyCap = Number(campaign?.daily_cap);
  const throttle = Number(campaign?.throttle_per_hour);
  const minConfidence = Number(seg?.min_confidence);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail);
  const missingTokens = REQUIRED_TEMPLATE_TOKENS.filter((token) => !body.includes(token) && !subject.includes(token));
  const errors = [];
  if (name.length < 3) errors.push("Campaign name should be at least 3 characters.");
  if (!emailOk) errors.push("From email must be a valid sender address.");
  if (!/^\d{5}$/.test(zip)) errors.push("Segment zip must be a valid 5-digit zip.");
  if (!subject) errors.push("Subject template is required.");
  if (subject.length > 140) errors.push("Subject should be 140 characters or less.");
  if (body.length < 60) errors.push("Body template is too short.");
  if (!Number.isFinite(dailyCap) || dailyCap < 1 || dailyCap > 5000) errors.push("Daily cap must be between 1 and 5000.");
  if (!Number.isFinite(throttle) || throttle < 1 || throttle > 500) errors.push("Throttle per hour must be between 1 and 500.");
  if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) errors.push("Min confidence must be between 0 and 1.");
  if (missingTokens.length) errors.push(`Template should include tokens for context: ${missingTokens.join(", ")}.`);
  const score =
    (name.length >= 3 ? 1 : 0) +
    (emailOk ? 1 : 0) +
    (/^\d{5}$/.test(zip) ? 1 : 0) +
    (subject.length > 0 && subject.length <= 140 ? 1 : 0) +
    (body.length >= 60 ? 1 : 0) +
    (missingTokens.length === 0 ? 1 : 0);
  return { errors, score, isReady: errors.length === 0 };
}

function CampaignsTab({ seed, onSeedApplied }) {
  const [list, setList] = useState([]);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("reply_rate");

  const makeDraft = (seedInput = {}) => ({
    name: seedInput?.name || "",
    subject_template: seedInput?.subject_template || "",
    body_template: seedInput?.body_template || DEFAULT_TEMPLATE,
    from_email: seedInput?.from_email || "",
    reply_to: seedInput?.reply_to || "",
    throttle_per_hour: Number(seedInput?.throttle_per_hour ?? 30) || 30,
    daily_cap: Number(seedInput?.daily_cap ?? 200) || 200,
    consent_basis: seedInput?.consent_basis || "legitimate_interest",
    segment: {
      zip: String(seedInput?.segment?.zip || "").replace(/\D/g, "").slice(0, 5),
      min_confidence: Number(seedInput?.segment?.min_confidence ?? 0.7),
    },
  });

  const reload = async () => {
    try {
      const r = await getJson("/api/portal?action=leadgen-campaigns");
      setList(r.rows || []);
    } catch (e) { setErr(String(e.message || e)); }
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reload(); }, []);
  useEffect(() => {
    if (!seed) return;
    const timer = window.setTimeout(() => {
      setEditing(makeDraft(seed));
      setMsg("Campaign draft prefilled from Command tab. Review copy and save.");
      onSeedApplied?.();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [seed, onSeedApplied]);

  const newCampaign = () => setEditing(makeDraft());

  const save = async () => {
    const readiness = campaignReadiness(editing);
    if (!readiness.isReady) {
      setErr(readiness.errors[0]);
      return;
    }
    setErr(null); setMsg(null);
    const payload = {
      ...editing,
      throttle_per_hour: Number(editing.throttle_per_hour) || 30,
      daily_cap: Number(editing.daily_cap) || 200,
      segment: editing.segment || {},
    };
    try {
      const r = await postJson("/api/portal?action=leadgen-campaign-save", payload);
      setMsg(`Saved campaign #${r.id}.`);
      setEditing(null);
      reload();
    } catch (e) { setErr(String(e.message || e)); }
  };

  const setStatus = async (id, status) => {
    try {
      await postJson("/api/portal?action=leadgen-campaign-status", { id, status });
      reload();
    } catch (e) { setErr(String(e.message || e)); }
  };

  const start = async (id) => {
    if (!confirm("Materialize sends and start this campaign? Cron will begin sending immediately within throttle.")) return;
    try {
      const r = await postJson("/api/portal?action=leadgen-campaign-start", { id });
      setMsg(`Queued ${r.queued} sends for campaign #${id}.`);
      reload();
    } catch (e) { setErr(String(e.message || e)); }
  };

  const sendTest = async (id) => {
    const to = prompt("Send a test of this template to which email?");
    if (!to) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to).trim())) {
      setErr("Enter a valid recipient email for test send.");
      return;
    }
    setMsg(""); setErr("");
    try {
      const r = await postJson("/api/portal?action=leadgen-campaign-test", { id, to });
      if (r.ok) setMsg(`Test sent to ${to} (message id ${r.messageId || "?"}). Check inbox + spam.`);
      else setErr(`Test failed: ${r.error}${r.permanent ? " (permanent)" : ""}`);
    } catch (e) { setErr(String(e.message || e)); }
  };
  const duplicateCampaign = (campaign) => {
    const clone = makeDraft({
      ...campaign,
      name: `${campaign.name || "Campaign"} copy`,
      status: "draft",
    });
    setEditing(clone);
    setMsg(`Cloned "${campaign.name || "campaign"}" into a new draft.`);
    setErr(null);
    trackEvent("select_content", {
      content_type: "leadgen_campaign_duplicate",
      source: "leadgen_campaigns_table",
      campaign_id: campaign.id,
    });
  };
  const filteredList = list.filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (!query.trim()) return true;
    const text = [c.name, c.status, c.from_email, c.reply_to].filter(Boolean).join(" ").toLowerCase();
    return text.includes(query.trim().toLowerCase());
  });
  const pct = (num, den) => {
    const n = Number(num || 0);
    const d = Number(den || 0);
    if (d <= 0) return "0%";
    return `${Math.round((n / d) * 100)}%`;
  };
  const ratio = (num, den) => {
    const n = Number(num || 0);
    const d = Number(den || 0);
    if (d <= 0) return 0;
    return n / d;
  };
  const sortedList = [...filteredList].sort((a, b) => {
    if (sortBy === "sent_desc") return Number(b.sent || 0) - Number(a.sent || 0);
    if (sortBy === "open_rate") return ratio(b.opened, b.sent) - ratio(a.opened, a.sent);
    if (sortBy === "name_asc") return String(a.name || "").localeCompare(String(b.name || ""));
    return ratio(b.replied, b.sent) - ratio(a.replied, a.sent);
  });
  const topReplyCampaign = [...list]
    .filter((c) => Number(c.sent || 0) > 0)
    .sort((a, b) => ratio(b.replied, b.sent) - ratio(a.replied, a.sent))[0];
  const topOpenCampaign = [...list]
    .filter((c) => Number(c.sent || 0) > 0)
    .sort((a, b) => ratio(b.opened, b.sent) - ratio(a.opened, a.sent))[0];
  const runningCount = list.filter((c) => c.status === "running").length;
  const aggregateSent = list.reduce((acc, c) => acc + Number(c.sent || 0), 0);
  const aggregateOpened = list.reduce((acc, c) => acc + Number(c.opened || 0), 0);
  const aggregateReplied = list.reduce((acc, c) => acc + Number(c.replied || 0), 0);
  const aggregateOpenRate = ratio(aggregateOpened, aggregateSent);
  const aggregateReplyRate = ratio(aggregateReplied, aggregateSent);
  const optimizationHint = aggregateSent < 50
    ? {
        text: "Need more send volume before optimization signals are stable.",
        action: "Increase sends",
        run: () => setSortBy("sent_desc"),
      }
    : aggregateOpenRate < 0.2
      ? {
          text: "Open rate is low. Prioritize subject-line iterations from the top open-rate performer.",
          action: "Clone top open winner",
          run: () => cloneTopPerformer("open"),
        }
      : aggregateReplyRate < 0.03
        ? {
            text: "Open rate is healthy but reply rate is low. Iterate body copy from the top reply performer.",
            action: "Clone top reply winner",
            run: () => cloneTopPerformer("reply"),
          }
        : {
            text: "Campaign performance is healthy. Scale winning templates and monitor deliverability.",
            action: "Sort by sent volume",
            run: () => setSortBy("sent_desc"),
          };
  const pauseAllRunning = async () => {
    if (runningCount <= 0) {
      setErr("No running campaigns to pause.");
      return;
    }
    if (!confirm(`Pause ${runningCount} running campaign${runningCount === 1 ? "" : "s"}?`)) return;
    setErr(null); setMsg(null);
    try {
      const running = list.filter((c) => c.status === "running");
      await Promise.all(running.map((c) => postJson("/api/portal?action=leadgen-campaign-status", { id: c.id, status: "paused" })));
      setMsg(`Paused ${running.length} running campaign${running.length === 1 ? "" : "s"}.`);
      reload();
    } catch (e) {
      setErr(String(e.message || e));
    }
  };
  const cloneTopPerformer = (kind = "reply") => {
    const winner = kind === "open" ? topOpenCampaign : topReplyCampaign;
    if (!winner) {
      setErr(`No ${kind}-rate winner available to clone yet.`);
      return;
    }
    duplicateCampaign(winner);
    setMsg(`Created draft from top ${kind}-rate campaign: ${winner.name}.`);
  };
  const exportCampaignSnapshot = () => {
    if (!sortedList.length) {
      setErr("No campaign rows to export for this filter.");
      return;
    }
    const rows = sortedList.map((c) => {
      const readiness = campaignReadiness(c);
      return {
        id: c.id,
        name: c.name || "",
        status: c.status || "",
        sent: Number(c.sent || 0),
        opened: Number(c.opened || 0),
        replied: Number(c.replied || 0),
        open_rate: pct(c.opened, c.sent),
        reply_rate: pct(c.replied, c.sent),
        checklist_score: readiness.score,
        checklist_ready: readiness.isReady ? "yes" : "no",
      };
    });
    const headers = Object.keys(rows[0]);
    const esc = (value) => `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `leadgen-campaigns-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
    setErr(null);
    setMsg(`Exported ${rows.length} campaign rows.`);
    trackEvent("select_content", {
      content_type: "leadgen_campaign_export_snapshot",
      source: "leadgen_campaigns_table",
      rows: rows.length,
    });
  };

  if (editing) {
    return (
      <CampaignEditor
        campaign={editing}
        onChange={setEditing}
        onSave={save}
        onCancel={() => setEditing(null)}
        err={err}
      />
    );
  }

  return (
    <div className="admin-leadgen-campaigns">
      <div className="admin-leadgen-section-head">
        <h2 className="title-2">Campaigns</h2>
        <div className="admin-leadgen-jobs__actions">
          <select className="admin-leadgen-input admin-leadgen-input--sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="draft">draft</option>
            <option value="scheduled">scheduled</option>
            <option value="running">running</option>
            <option value="paused">paused</option>
            <option value="done">done</option>
          </select>
          <input className="admin-leadgen-input admin-leadgen-input--sm" placeholder="Search campaign" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="admin-leadgen-input admin-leadgen-input--sm" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="reply_rate">Sort: Reply rate</option>
            <option value="open_rate">Sort: Open rate</option>
            <option value="sent_desc">Sort: Sent volume</option>
            <option value="name_asc">Sort: Name</option>
          </select>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={pauseAllRunning}
            disabled={runningCount <= 0}
            title={runningCount <= 0 ? "No running campaigns" : `Pause ${runningCount} running campaign${runningCount === 1 ? "" : "s"}`}
          >
            Pause all running
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={exportCampaignSnapshot}>
            Export view CSV
          </button>
          <button type="button" onClick={newCampaign} className="btn btn-primary">+ New campaign</button>
        </div>
      </div>
      {msg ? <p className="admin-leadgen-ok">{msg}</p> : null}
      {err ? <p className="admin-leadgen-err">{err}</p> : null}
      <div className="admin-leadgen-jobs__health">
        <span>
          Aggregate open rate: {pct(aggregateOpened, aggregateSent)}
        </span>
        <span>
          Aggregate reply rate: {pct(aggregateReplied, aggregateSent)}
        </span>
        <span>
          Running campaigns: {runningCount}
        </span>
        <span>
          Top reply rate: {topReplyCampaign ? `${topReplyCampaign.name} (${pct(topReplyCampaign.replied, topReplyCampaign.sent)})` : "none yet"}
        </span>
        <span>
          Top open rate: {topOpenCampaign ? `${topOpenCampaign.name} (${pct(topOpenCampaign.opened, topOpenCampaign.sent)})` : "none yet"}
        </span>
      </div>
      <div className="admin-leadgen-jobs__alert" role="status" aria-live="polite">
        <span>{optimizationHint.text}</span>
        <div className="admin-leadgen-jobs__alert-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={optimizationHint.run}>
            {optimizationHint.action}
          </button>
        </div>
      </div>
      <div className="admin-leadgen-jobs__actions" style={{ marginBottom: 10 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => cloneTopPerformer("reply")} disabled={!topReplyCampaign}>
          Clone top reply winner
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => cloneTopPerformer("open")} disabled={!topOpenCampaign}>
          Clone top open winner
        </button>
      </div>

      <div className="admin-aff-card">
        <table className="admin-aff-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th style={{ textAlign: "right" }}>Total</th>
              <th style={{ textAlign: "right" }}>Sent</th>
              <th style={{ textAlign: "right" }}>Opens</th>
              <th style={{ textAlign: "right" }}>Replies</th>
              <th style={{ textAlign: "right" }}>Open %</th>
              <th style={{ textAlign: "right" }}>Reply %</th>
              <th aria-label="actions" />
            </tr>
          </thead>
          <tbody>
            {sortedList.map((c) => (
              <tr key={c.id}>
                {(() => {
                  const readiness = campaignReadiness(c);
                  const canStart = ["draft", "paused", "scheduled"].includes(c.status) && readiness.isReady;
                  return (
                    <>
                <td>{c.name}</td>
                <td className="admin-leadgen-muted">
                  {c.status}
                  <div>
                    <span className={`leadgen-status-chip ${readiness.isReady ? "leadgen-status-chip--good" : "leadgen-status-chip--bad"}`}>
                      checklist {readiness.score}/6
                    </span>
                  </div>
                </td>
                <td style={{ textAlign: "right" }}>{c.total_sends}</td>
                <td style={{ textAlign: "right" }}>{c.sent}</td>
                <td style={{ textAlign: "right" }}>{c.opened}</td>
                <td style={{ textAlign: "right" }}>{c.replied}</td>
                <td style={{ textAlign: "right" }}>{pct(c.opened, c.sent)}</td>
                <td style={{ textAlign: "right" }}>{pct(c.replied, c.sent)}</td>
                <td className="admin-leadgen-row-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(c)}>Edit</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => duplicateCampaign(c)}>Duplicate</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => sendTest(c.id)}>Test send</button>
                  {["draft", "paused", "scheduled"].includes(c.status) ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => start(c.id)}
                      disabled={!canStart}
                      title={!canStart ? readiness.errors[0] : "Start this campaign now"}
                    >
                      Start
                    </button>
                  ) : c.status === "running" ? (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStatus(c.id, "paused")}>Pause</button>
                  ) : null}
                </td>
                    </>
                  );
                })()}
              </tr>
            ))}
            {sortedList.length === 0 ? (
              <tr><td colSpan={9} className="admin-leadgen-empty">No campaigns match this view. Clear filters or create a new campaign.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CampaignEditor({ campaign, onChange, onSave, onCancel, err }) {
  const c = campaign;
  const set = (patch) => onChange({ ...c, ...patch });
  const setSegment = (patch) => onChange({ ...c, segment: { ...(c.segment || {}), ...patch } });

  const seg = c.segment || {};
  const readiness = campaignReadiness(c);

  // ── AI panel state ──────────────────────────────────────────
  // Calls /api/portal?action=leadgen-ai which proxies Groq's free
  // Llama 3.3 70B endpoint. Three modes: write fresh, rewrite draft,
  // generate per-business opener (handled in Discover tab - this one
  // only does campaign + rewrite).
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState(null);
  const [aiNote, setAiNote] = useState(null);

  const aiCall = async (mode) => {
    setAiBusy(true); setAiErr(null); setAiNote(null);
    try {
      const r = await postJson("/api/portal?action=leadgen-ai", {
        mode,
        prompt: aiPrompt,
        draft_subject: c.subject_template || "",
        draft_body: c.body_template || "",
      });
      const out = r.result || {};
      if (out.subject) set({ subject_template: out.subject, body_template: out.body || c.body_template });
      else if (out.body) set({ body_template: out.body });
      setAiNote(`Updated by AI (${mode}). Tokens: ${r.usage?.total_tokens || "?"}`);
    } catch (e) {
      const m = String(e.message || e);
      if (m.includes("groq_not_configured")) {
        setAiErr("GROQ_API_KEY isn't set in Vercel. Get a free key from console.groq.com and run: vercel env add GROQ_API_KEY production");
      } else {
        setAiErr(m);
      }
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="admin-leadgen-editor">
      <h2 className="title-2">{c.id ? `Edit campaign #${c.id}` : "New campaign"}</h2>

      {/* AI assistant - collapsible-feeling card above the form */}
      <div className="admin-leadgen-ai-panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <strong>AI assistant (free, via Groq)</strong>
          <span style={{ fontSize: 11, opacity: 0.7 }}>Llama 3.3 70B - keeps placeholders intact</span>
        </div>
        <textarea
          className="admin-leadgen-input admin-leadgen-textarea"
          rows={3}
          placeholder="Describe the campaign. e.g. 'Write a 120-word cold email to Sarasota auto-repair shops about our flat-rate IT helpdesk and security camera install. Friendly, mention storm-season backups.'"
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary btn-sm" disabled={aiBusy || aiPrompt.trim().length < 10} onClick={() => aiCall("campaign")}>
            {aiBusy ? "Writing..." : "Write subject + body from prompt"}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={aiBusy || !c.body_template} onClick={() => aiCall("rewrite")}>
            {aiBusy ? "Rewriting..." : "Rewrite my current draft"}
          </button>
        </div>
        {aiNote ? <p className="admin-leadgen-ok" style={{ marginTop: 8 }}>{aiNote}</p> : null}
        {aiErr ? <p className="admin-leadgen-err" style={{ marginTop: 8 }}>{aiErr}</p> : null}
      </div>

      <div className="admin-leadgen-grid">
        <Field label="Name">
          <input className="admin-leadgen-input" value={c.name || ""} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="From email">
          <input className="admin-leadgen-input" value={c.from_email || ""} onChange={(e) => set({ from_email: e.target.value })} placeholder="outreach@outreach.simpleitsrq.com" />
        </Field>
        <Field label="Reply-to (optional)">
          <input className="admin-leadgen-input" value={c.reply_to || ""} onChange={(e) => set({ reply_to: e.target.value })} />
        </Field>
        <Field label="Consent basis">
          <select className="admin-leadgen-input" value={c.consent_basis || "legitimate_interest"} onChange={(e) => set({ consent_basis: e.target.value })}>
            <option value="legitimate_interest">legitimate_interest</option>
            <option value="public_record">public_record</option>
            <option value="opted_in">opted_in</option>
          </select>
        </Field>
        <Field label="Throttle / hour">
          <input className="admin-leadgen-input" type="number" min={1} max={500} value={c.throttle_per_hour ?? 30} onChange={(e) => set({ throttle_per_hour: e.target.value })} />
        </Field>
        <Field label="Daily cap">
          <input className="admin-leadgen-input" type="number" min={1} max={5000} value={c.daily_cap ?? 200} onChange={(e) => set({ daily_cap: e.target.value })} />
        </Field>
        <Field label="Segment: zip">
          <input className="admin-leadgen-input" value={seg.zip || ""} onChange={(e) => setSegment({ zip: e.target.value.replace(/\D/g, "").slice(0, 5) })} placeholder="34207" />
        </Field>
        <Field label="Segment: min email confidence">
          <input className="admin-leadgen-input" type="number" step="0.1" min={0} max={1} value={seg.min_confidence ?? 0.7} onChange={(e) => setSegment({ min_confidence: Number(e.target.value) })} />
        </Field>
      </div>

      <Field label="Subject template" full>
        <input className="admin-leadgen-input" value={c.subject_template || ""} onChange={(e) => set({ subject_template: e.target.value })} placeholder="Quick question about IT at {{business_name}}" />
      </Field>
      <Field label="Body template - placeholders: {{business_name}} {{first_name}} {{city}} {{custom_intro}}" full>
        <textarea
          className="admin-leadgen-input admin-leadgen-textarea"
          rows={14}
          value={c.body_template || ""}
          onChange={(e) => set({ body_template: e.target.value })}
        />
      </Field>

      {err ? <p className="admin-leadgen-err">{err}</p> : null}
      {!readiness.isReady ? (
        <p className="admin-leadgen-err">Campaign checklist: {readiness.errors[0]}</p>
      ) : (
        <p className="admin-leadgen-ok">Campaign checklist: ready ({readiness.score}/6).</p>
      )}

      <div className="admin-leadgen-actions">
        <button type="button" className="btn btn-primary" onClick={onSave} disabled={!readiness.isReady} title={!readiness.isReady ? "Fix checklist items before saving" : ""}>Save</button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function Field({ label, children, full }) {
  return (
    <label className={`admin-leadgen-field${full ? " admin-leadgen-field--full" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

// ============================================================
// Jobs tab
// ============================================================

function JobsTab({ recent, onSelectTab }) {
  const [rows, setRows] = useState(recent);
  const [err, setErr] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [showFailuresOnly, setShowFailuresOnly] = useState(false);
  const [kindFilter, setKindFilter] = useState("osm_zip");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const reload = async () => {
    try {
      const r = await getJson("/api/portal?action=leadgen-jobs");
      setRows(r.rows || []);
    } catch (e) { setErr(String(e.message || e)); }
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reload(); }, []);

  const progressLabel = (job) => {
    const total = Number(job?.total);
    const progress = Number(job?.progress);
    if (!Number.isFinite(total) || total <= 0) return job?.status === "done" ? "done" : "-";
    if (job?.status === "done" && job?.kind === "osm_zip" && progress === 0) return `${total} / ${total}`;
    if (!Number.isFinite(progress) || progress < 0) return `0 / ${total}`;
    return `${progress} / ${total}`;
  };

  const outputLabel = (job) => {
    const result = job?.result || {};
    if (job?.kind === "osm_zip") {
      const discovered = Number(result?.discovered ?? job?.total ?? 0);
      const inserted = Number(result?.inserted ?? 0);
      const updated = Number(result?.updated ?? 0);
      if (inserted > 0 || updated > 0) return `${inserted} net-new, ${updated} refreshed, ${discovered} discovered`;
      if (discovered > 0) return `${discovered} discovered, no net-new signal`;
    }
    if (job?.kind === "website_emails") {
      if (result?.skipped) return `Skipped: ${result.skipped}`;
      const found = Number(result?.found ?? 0);
      const inserted = Number(result?.inserted ?? 0);
      if (found > 0 || inserted > 0) return `${found} found, ${inserted} net-new`;
      return "No contact emails found";
    }
    return job?.error || "-";
  };
  const netNewLabel = (job) => {
    const result = job?.result || {};
    if (job?.kind === "osm_zip") {
      const inserted = Number(result?.inserted ?? 0);
      const updated = Number(result?.updated ?? 0);
      return `${inserted} new / ${updated} refreshed`;
    }
    if (job?.kind === "website_emails") {
      const inserted = Number(result?.inserted ?? 0);
      const found = Number(result?.found ?? 0);
      return `${inserted} new / ${found} found`;
    }
    return "-";
  };
  const kindLabel = (kind) => (kind === "osm_zip" ? "Discovery" : kind === "website_emails" ? "Email crawl" : kind);

  const classifyJob = (job) => {
    const result = job?.result || {};
    if (job?.status === "failed") return "failed";
    if (job?.kind === "osm_zip") {
      const inserted = Number(result?.inserted ?? 0);
      const updated = Number(result?.updated ?? 0);
      return inserted > 0 || updated > 0 ? "productive" : "no_signal";
    }
    if (job?.kind === "website_emails") {
      const found = Number(result?.found ?? 0);
      const inserted = Number(result?.inserted ?? 0);
      return found > 0 || inserted > 0 ? "productive" : "no_signal";
    }
    return "other";
  };

  const scopedRows = rows.filter((job) => {
    if (kindFilter === "all") return true;
    return job.kind === kindFilter;
  });

  const signalRows = showAll
    ? scopedRows
    : scopedRows.filter((job) => ["failed", "productive"].includes(classifyJob(job))).slice(0, 30);
  const filteredRows = showFailuresOnly
    ? signalRows.filter((job) => classifyJob(job) === "failed")
    : signalRows;
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const stats = rows.reduce((acc, job) => {
    const kind = classifyJob(job);
    acc.total += 1;
    acc[kind] = (acc[kind] || 0) + 1;
    return acc;
  }, { total: 0, failed: 0, productive: 0, no_signal: 0, other: 0 });
  const productiveRate = stats.total > 0 ? Math.round((stats.productive / stats.total) * 100) : 0;
  const latestJobTs = rows.reduce((latest, job) => {
    const finished = parseIso(job?.finished_at || job?.created_at) || 0;
    return Math.max(latest, finished);
  }, 0);
  const dayAgo = latestJobTs - 86_400_000;
  const netNew24h = rows.reduce((acc, job) => {
    const finished = parseIso(job?.finished_at || job?.created_at);
    if (!latestJobTs || !finished || finished < dayAgo) return acc;
    const result = job?.result || {};
    if (job?.kind === "osm_zip") return acc + Number(result?.inserted ?? 0);
    if (job?.kind === "website_emails") return acc + Number(result?.inserted ?? 0);
    return acc;
  }, 0);
  const latestProductive = rows
    .filter((job) => classifyJob(job) === "productive")
    .sort((a, b) => (parseIso(b.finished_at || b.created_at) || 0) - (parseIso(a.finished_at || a.created_at) || 0))[0];
  const latestProductiveDays = daysSinceIso(latestProductive?.finished_at || latestProductive?.created_at);
  const stalePipeline = stats.total >= 6 && stats.productive === 0;
  const staleRecentSignal = latestProductiveDays != null && latestProductiveDays >= 7;

  return (
    <div className="admin-leadgen-jobs">
      <div className="admin-leadgen-section-head">
        <h2 className="title-2">Recent jobs</h2>
        <div className="admin-leadgen-jobs__actions">
          <div className="admin-leadgen-jobs__filters" role="tablist" aria-label="Job kind filters">
            <button
              type="button"
              className={`btn btn-sm ${kindFilter === "all" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setKindFilter("all")}
            >
              All
            </button>
            <button
              type="button"
              className={`btn btn-sm ${kindFilter === "osm_zip" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setKindFilter("osm_zip")}
            >
              Discovery
            </button>
            <button
              type="button"
              className={`btn btn-sm ${kindFilter === "website_emails" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setKindFilter("website_emails")}
            >
              Email crawl
            </button>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show signal only" : "Show all"}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowFailuresOnly((v) => !v)}>
            {showFailuresOnly ? "Show all signal" : "Only failures"}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={reload}>Refresh</button>
        </div>
      </div>
      <div className="admin-leadgen-jobs__summary">
        <div><strong>{stats.failed}</strong><span>Failed</span></div>
        <div><strong>{stats.productive}</strong><span>Productive</span></div>
        <div><strong>{stats.no_signal}</strong><span>No signal</span></div>
        <div><strong>{stats.total}</strong><span>Total</span></div>
      </div>
      <p className="admin-aff-stat-hint">
        Default view prioritizes discovery runs with failed/productive outcomes so teams can act quickly.
      </p>
      <div className="admin-leadgen-jobs__health">
        <span>Signal rate: {productiveRate}%</span>
        <span>Net-new (24h): {netNew24h}</span>
        <span>
          Last productive job: {latestProductiveDays == null ? "none yet" : latestProductiveDays === 0 ? "today" : `${latestProductiveDays} day${latestProductiveDays === 1 ? "" : "s"} ago`}
        </span>
        <span>Showing {visibleRows.length} of {filteredRows.length}</span>
      </div>
      {stalePipeline || staleRecentSignal ? (
        <div className="admin-leadgen-jobs__alert" role="alert">
          <span>
            Pipeline is trending stale. Discover a new zip or market, then crawl email only on fresh websites to increase net-new leads.
          </span>
          <div className="admin-leadgen-jobs__alert-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                trackEvent("select_content", { content_type: "leadgen_stale_jobs_recovery", destination: "discover" });
                onSelectTab?.("discover", "jobs_alert");
              }}
            >
              Open Discover
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                trackEvent("select_content", { content_type: "leadgen_stale_jobs_recovery", destination: "campaigns" });
                onSelectTab?.("campaigns", "jobs_alert");
              }}
            >
              Open Campaigns
            </button>
          </div>
        </div>
      ) : null}
      {err ? <p className="admin-leadgen-err">{err}</p> : null}
      <div className="admin-aff-card admin-aff-card--jobs-table">
        <table className="admin-aff-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Kind</th>
              <th>Status</th>
              <th style={{ textAlign: "right" }}>Progress</th>
              <th style={{ textAlign: "right" }}>Net-new</th>
              <th>Started</th>
              <th>Duration</th>
              <th>Output</th>
              <th aria-label="action" />
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((j) => (
              <tr key={j.id}>
                <td>{j.id}</td>
                <td>{kindLabel(j.kind)}</td>
                <td>
                  <StatusChip status={j.status} />
                  <span className={`leadgen-status-chip leadgen-status-chip--${classifyJob(j)}`}>
                    {classifyJob(j).replace("_", " ")}
                  </span>
                </td>
                <td style={{ textAlign: "right" }}>{progressLabel(j)}</td>
                <td style={{ textAlign: "right" }}>{netNewLabel(j)}</td>
                <td className="admin-leadgen-muted">{fmtTime(j.created_at)}</td>
                <td className="admin-leadgen-muted">{fmtDuration(j.created_at, j.finished_at)}</td>
                <td
                  className={`admin-leadgen-output-cell${j.status === "failed" ? " is-failed" : ""}`}
                  title={outputLabel(j)}
                >
                  {outputLabel(j)}
                </td>
                <td className="admin-leadgen-row-actions">
                  {classifyJob(j) === "failed" ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => onSelectTab?.(j.kind === "osm_zip" ? "discover" : "command", "jobs_row_failed_action")}
                    >
                      Recover
                    </button>
                  ) : classifyJob(j) === "no_signal" ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => onSelectTab?.("discover", "jobs_row_no_signal_action")}
                    >
                      New market
                    </button>
                  ) : (
                    <span className="admin-leadgen-muted">-</span>
                  )}
                </td>
              </tr>
            ))}
            {visibleRows.length === 0 ? (
              <tr><td colSpan={9} className="admin-leadgen-empty">No matching jobs. Try another filter or toggle.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="admin-leadgen-pager">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={safePage <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Prev
        </button>
        <span>Page {safePage} of {totalPages}</span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={safePage >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        >
          Next
        </button>
      </div>
    </div>
  );
}
