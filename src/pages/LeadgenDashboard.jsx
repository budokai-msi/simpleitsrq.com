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

function Stat({ label, value, hint, accent }) {
  return (
    <div className={`leadgen-kpi${accent ? ` leadgen-kpi--${accent}` : ""}`}>
      <span className="leadgen-kpi__label">{label}</span>
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

function StatusChip({ status }) {
  const label = status || "unknown";
  return <span className={`leadgen-status-chip leadgen-status-chip--${statusTone(label)}`}>{label}</span>;
}

// ---------- main ----------

export default function LeadgenDashboard() {
  const [tab, setTab] = useState("discover");
  const [status, setStatus] = useState(null);
  const [statusErr, setStatusErr] = useState(null);

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
        const r = await getJson("/api/portal?action=leadgen-status");
        if (!alive) return;
        setStatus(r);
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
              <Link to="/leadgen" className="btn btn-secondary btn-sm" target="_blank" rel="noopener">
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
          />
          <Stat
            accent="teal"
            label="Deliverable emails"
            value={status?.emails?.deliverable?.toLocaleString?.() ?? status?.emails?.deliverable}
            hint={`across ${(status?.emails?.businesses_with_email ?? 0).toLocaleString?.() ?? 0} biz`}
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

        <div className="leadgen-workspace-shell">
          <aside className="leadgen-workspace-sidebar" aria-label="Leadgen navigation">
            <Link to="/portal" className="leadgen-side-home">Home</Link>
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
                  onClick={() => setTab(id)}
                  className={`leadgen-side-nav__item${tab === id ? " is-active" : ""}`}
                >
                  {label}
                </button>
              ))}
            </nav>
            <section className="leadgen-side-integrations" aria-label="Marketing integrations">
              <h3>Integrations</h3>
              <p>Push reviewed leads into the tools your team already uses.</p>
              <div className="leadgen-side-integrations__links">
                <a href="https://www.hubspot.com" target="_blank" rel="noreferrer" onClick={() => trackEvent("select_content", { content_type: "leadgen_integration_link", destination: "hubspot" })}>HubSpot</a>
                <a href="https://mailchimp.com" target="_blank" rel="noreferrer" onClick={() => trackEvent("select_content", { content_type: "leadgen_integration_link", destination: "mailchimp" })}>Mailchimp</a>
                <a href="https://www.klaviyo.com" target="_blank" rel="noreferrer" onClick={() => trackEvent("select_content", { content_type: "leadgen_integration_link", destination: "klaviyo" })}>Klaviyo</a>
                <a href="https://ads.google.com" target="_blank" rel="noreferrer" onClick={() => trackEvent("select_content", { content_type: "leadgen_integration_link", destination: "google_ads" })}>Google Ads</a>
                <a href="https://www.facebook.com/business/ads" target="_blank" rel="noreferrer" onClick={() => trackEvent("select_content", { content_type: "leadgen_integration_link", destination: "meta_ads" })}>Meta Ads</a>
              </div>
              <div className="leadgen-side-integrations__actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => integrationExport("hubspot")}>Export HubSpot CSV</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => integrationExport("mailchimp")}>Export Mailchimp CSV</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => integrationExport("klaviyo")}>Export Klaviyo CSV</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => integrationExport("google_ads")}>Export Google Ads CSV</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => integrationExport("meta_ads")}>Export Meta Ads CSV</button>
              </div>
            </section>
            <section className="leadgen-side-revenue" aria-label="Revenue actions">
              <h3>Next step</h3>
              <p>Move this list into a live campaign with onboarding and copy support.</p>
              <div className="leadgen-side-revenue__actions">
                <Link
                  to="/book?topic=leadgen-onboarding"
                  className="btn btn-primary btn-sm"
                  onClick={() => trackEvent("generate_lead", { source: "leadgen_sidebar_onboarding" })}
                >
                  Book onboarding
                </Link>
                <Link
                  to="/leadgen"
                  className="btn btn-secondary btn-sm"
                  onClick={() => trackEvent("generate_lead", { source: "leadgen_sidebar_demo" })}
                >
                  Open product demo
                </Link>
              </div>
            </section>
          </aside>

          <div className="admin-leadgen-tab-body leadgen-workspace-main">
            {tab === "command" && <CommandTab status={status} onSelectTab={setTab} onStatusChange={loadStatus} />}
            {tab === "discover" && <DiscoverTab onStatusChange={loadStatus} />}
            {tab === "campaigns" && <CampaignsTab />}
            {tab === "insights" && <InsightsTab />}
            {tab === "jobs" && <JobsTab recent={status?.recent_jobs || []} />}
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

function CommandTab({ status, onSelectTab, onStatusChange }) {
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
    if (!/^\d{5}$/.test(zip)) {
      setErr("Enter a 5-digit US zip code.");
      return;
    }
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await postJson("/api/portal?action=leadgen-discover", { zip });
      trackEvent("search", {
        search_term: zip,
        source: "leadgen_admin_discover",
        deduped: Boolean(r.deduped),
      });
      setMsg(r.deduped ? "Zip " + zip + " was already queued. Running worker..." : "Queued discovery job #" + r.job_id + " for " + zip + ". Running worker...");
      await runWorker();
      onSelectTab("discover");
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const queueEmailCrawls = async () => {
    if (!/^\d{5}$/.test(zip)) {
      setErr("Enter the zip you want to crawl for published emails.");
      return;
    }
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await postJson("/api/portal?action=leadgen-crawl-emails", { zip, limit: 100 });
      trackEvent("select_content", {
        content_type: "leadgen_email_crawl",
        source: "leadgen_admin_command",
        zip,
        queued: Number(r.queued || 0),
      });
      setMsg("Queued " + (r.queued || 0) + " email crawl jobs for " + zip + ". Running worker...");
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

  return (
    <div className="leadgen-command">
      <section className="leadgen-command-console">
        <div className="leadgen-console-main">
          <div className="leadgen-console-topline">
            <span className="eyebrow">Live leadgen workspace</span>
            <span className="leadgen-powered-pill">{queuedJobs} queued jobs</span>
          </div>
          <h2>Operate the local prospect pipeline from one screen.</h2>
          <p>
            Enter a zip, discover public business records, crawl published
            contact paths, review the list, then launch a capped campaign.
          </p>
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
                onChange={(e) => setZip(e.target.value)}
                inputMode="numeric"
                pattern="\d{5}"
                placeholder="34237"
                className="admin-leadgen-input admin-leadgen-input--zip"
                aria-label="Zip code"
              />
            </label>
            <button type="button" className="btn btn-primary" onClick={queueDiscover} disabled={busy}>
              <Search size={16} aria-hidden="true" />
              Discover
            </button>
            <button type="button" className="btn btn-secondary" onClick={queueEmailCrawls} disabled={busy}>
              <Mail size={16} aria-hidden="true" />
              Crawl emails
            </button>
            <button type="button" className="btn btn-secondary" onClick={runWorker} disabled={busy}>
              <Play size={16} aria-hidden="true" />
              Run jobs
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
                  {row.website ? <a href={row.website} target="_blank" rel="noreferrer">{hostFor(row.website)}</a> : <span>No website</span>}
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
  const cleanFilter = () => ({
    zip: "", status: "active", q: "",
    industry_group: "", sub_industry: "",
    has_website: false, has_email: false, no_email: false,
    tag: "", min_emails: "", max_emails: "",
    created_after: "", created_before: "",
  });
  const activeFilterCount = [
    filter.zip,
    filter.q,
    filter.industry_group,
    filter.sub_industry,
    filter.has_website,
    filter.has_email,
    filter.no_email,
    filter.tag,
    filter.min_emails,
    filter.max_emails,
    filter.created_after,
    filter.created_before,
    filter.status && filter.status !== "active",
  ].filter(Boolean).length;
  const currentZip = filter.zip || zip;
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
  const buildQuery = (extra = {}) => {
    const url = new URL("/api/portal", window.location.origin);
    url.searchParams.set("action", extra.action || "leadgen-businesses");
    if (filter.zip)            url.searchParams.set("zip", filter.zip);
    if (filter.status)         url.searchParams.set("status", filter.status);
    if (filter.q)              url.searchParams.set("q", filter.q);
    if (filter.industry_group) url.searchParams.set("industry_group", filter.industry_group);
    if (filter.sub_industry)   url.searchParams.set("sub_industry", filter.sub_industry);
    if (filter.has_website)    url.searchParams.set("has_website", "1");
    if (filter.has_email)      url.searchParams.set("has_email", "1");
    if (filter.no_email)       url.searchParams.set("no_email", "1");
    if (filter.tag)            url.searchParams.set("tag", filter.tag);
    if (filter.min_emails)     url.searchParams.set("min_emails", filter.min_emails);
    if (filter.max_emails)     url.searchParams.set("max_emails", filter.max_emails);
    if (filter.created_after)  url.searchParams.set("created_after", filter.created_after);
    if (filter.created_before) url.searchParams.set("created_before", filter.created_before);
    if (extra.format)          url.searchParams.set("format", extra.format);
    return url;
  };

  const loadList = async (overridePage) => {
    const p = overridePage ?? page;
    const url = buildQuery();
    url.searchParams.set("page", String(p));
    url.searchParams.set("limit", String(limit));
    try {
      const r = await getJson(url.pathname + url.search);
      setRows(r.rows || []);
      setTotal(r.total || 0);
      setFacets(r.facets || { groups: [], subs: [] });
    } catch (e) {
      setErr(String(e.message || e));
    }
  };

  // Re-load whenever the filter changes. Fetch-on-mount is a legitimate
  // effect use; the lint rule is overly strict here.
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { loadList(page); }, [filter, page]);

  const queueDiscover = async () => {
    if (!/^\d{5}$/.test(zip)) {
      setErr("Enter a 5-digit US zip code.");
      return;
    }
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await postJson("/api/portal?action=leadgen-discover", { zip });
      if (r.deduped) {
        setMsg(`Already queued as job #${r.job_id}. Running pending jobs...`);
      } else {
        setMsg(`Queued OSM crawl for ${zip} (job #${r.job_id}). Running...`);
      }
      setFilter((f) => ({ ...f, zip }));
      // Drain the queue inline so the operator sees results immediately
      // instead of waiting until the next 11:15 UTC cron tick.
      const run = await postJson("/api/portal?action=leadgen-run-jobs", {});
      const s = run.summary || {};
      setMsg(`OSM crawl finished: ${s.completed || 0}/${s.picked || 0} jobs ok` +
             (s.failed ? `, ${s.failed} failed` : "") + ". Refreshing list.");
      await loadList();
      if (onStatusChange) await onStatusChange();
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const queueEmailCrawls = async () => {
    if (!/^\d{5}$/.test(filter.zip)) {
      setErr("Filter by a 5-digit zip first, then queue.");
      return;
    }
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await postJson("/api/portal?action=leadgen-crawl-emails", { zip: filter.zip, limit: 100 });
      setMsg(`Queued ${r.queued} email-crawl jobs for ${filter.zip}. Running...`);
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
          <span className="leadgen-console-topline">Discovery pipeline</span>
          <h2>Start with a zip code and map the market</h2>
          <p>
            Pick one local zip, pull public business records, then crawl public contact
            paths only for the records you can review and export.
          </p>
        </div>
        <div className="leadgen-discover-actions">
          <label className="admin-leadgen-field">
            <span>Zip code</span>
            <input
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              inputMode="numeric"
              pattern="\d{5}"
              placeholder="34207"
              className="admin-leadgen-input admin-leadgen-input--zip"
            />
          </label>
          <button
            type="button"
            onClick={queueDiscover}
            disabled={busy}
            className="btn btn-primary"
          >
            {busy ? "Working..." : "Discover"}
          </button>
          <button
            type="button"
            onClick={queueEmailCrawls}
            disabled={busy || !/^\d{5}$/.test(filter.zip)}
            className="btn btn-secondary"
            title={!/^\d{5}$/.test(filter.zip) ? "Filter by a zip first" : ""}
          >
            Find public emails
          </button>
        </div>
      </div>

      {msg ? <p className="admin-leadgen-ok">{msg}</p> : null}
      {err ? <p className="admin-leadgen-err">{err}</p> : null}

      <LeadgenMap rows={rows} total={total} busy={busy} />

      <div className="leadgen-list-tools">
        <div>
          <span className="leadgen-console-topline">Current view</span>
          <strong>{total.toLocaleString()} matches</strong>
          <p>Search covers business names, websites, and deliverable emails.</p>
        </div>
        <div className="leadgen-filter-presets" aria-label="Lead list presets">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyListPreset("all")}>All in zip</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyListPreset("ready")}>Ready contacts</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyListPreset("needs_email")}>Needs email crawl</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={resetFilters} disabled={activeFilterCount === 0}>Clear filters</button>
        </div>
      </div>

      <div className="admin-leadgen-filters" aria-label="Lead list filters">
        <input
          placeholder="filter zip"
          value={filter.zip}
          onChange={(e) => { setFilter((f) => ({ ...f, zip: e.target.value })); setPage(1); }}
          className="admin-leadgen-input admin-leadgen-input--zip"
        />
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
        <label className="admin-leadgen-check">
          <input type="checkbox" checked={filter.has_website}
            onChange={(e) => { setFilter((f) => ({ ...f, has_website: e.target.checked })); setPage(1); }} />
          Has website
        </label>
        <label className="admin-leadgen-check">
          <input type="checkbox" checked={filter.has_email}
            onChange={(e) => { setFilter((f) => ({ ...f, has_email: e.target.checked, no_email: e.target.checked ? false : f.no_email })); setPage(1); }} />
          Has email
        </label>
        <label className="admin-leadgen-check">
          <input type="checkbox" checked={filter.no_email}
            onChange={(e) => { setFilter((f) => ({ ...f, no_email: e.target.checked, has_email: e.target.checked ? false : f.has_email })); setPage(1); }} />
          Needs email
        </label>
        <input
          placeholder="tag"
          value={filter.tag}
          onChange={(e) => { setFilter((f) => ({ ...f, tag: e.target.value })); setPage(1); }}
          className="admin-leadgen-input admin-leadgen-input--zip"
          title="Filter by tag"
        />
        <input
          placeholder="min emails"
          type="number"
          min={0}
          value={filter.min_emails}
          onChange={(e) => { setFilter((f) => ({ ...f, min_emails: e.target.value })); setPage(1); }}
          className="admin-leadgen-input admin-leadgen-input--zip"
          title="Minimum deliverable emails"
        />
        <input
          placeholder="max emails"
          type="number"
          min={0}
          value={filter.max_emails}
          onChange={(e) => { setFilter((f) => ({ ...f, max_emails: e.target.value })); setPage(1); }}
          className="admin-leadgen-input admin-leadgen-input--zip"
          title="Maximum deliverable emails"
        />
        <input
          type="date"
          value={filter.created_after}
          onChange={(e) => { setFilter((f) => ({ ...f, created_after: e.target.value })); setPage(1); }}
          className="admin-leadgen-input"
          title="Created after"
        />
        <input
          type="date"
          value={filter.created_before}
          onChange={(e) => { setFilter((f) => ({ ...f, created_before: e.target.value })); setPage(1); }}
          className="admin-leadgen-input"
          title="Created before"
        />
        <input
          placeholder="search business, website, or email"
          value={filter.q}
          onChange={(e) => { setFilter((f) => ({ ...f, q: e.target.value })); setPage(1); }}
          className="admin-leadgen-input admin-leadgen-input--grow"
        />
        <span className="admin-leadgen-count">{activeFilterCount} filters</span>
        <div className="admin-leadgen-export-group">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => exportData("csv")} disabled={total === 0}>Export CSV</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => exportData("json")} disabled={total === 0}>Export JSON</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={reclassify} disabled={busy} title="Backfill industry_group + sub_industry from raw OSM tags">Reclassify</button>
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
                    <a href={r.website} target="_blank" rel="noreferrer">
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
  const geocodedRows = useMemo(
    () => rows.filter((r) => Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng))),
    [rows]
  );

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
      ];
      let tileLayer = null;
      const attachLayer = (providerIndex) => {
        const p = providers[providerIndex];
        tileLayer = L.tileLayer(p.url, {
          maxZoom: 19,
          crossOrigin: true,
          attribution: p.attribution,
        }).addTo(map);
        tileLayer.once("tileerror", () => {
          if (cancelled || providerIndex >= providers.length - 1) {
            setMapState({ ready: false, error: "Map tiles are temporarily unavailable. Retry in a minute." });
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
        {mapState.error ? (
          <div className="leadgen-map-empty">{mapState.error}</div>
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

function CampaignsTab() {
  const [list, setList] = useState([]);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  const reload = async () => {
    try {
      const r = await getJson("/api/portal?action=leadgen-campaigns");
      setList(r.rows || []);
    } catch (e) { setErr(String(e.message || e)); }
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reload(); }, []);

  const newCampaign = () => setEditing({
    name: "",
    subject_template: "",
    body_template: DEFAULT_TEMPLATE,
    from_email: "",
    reply_to: "",
    throttle_per_hour: 30,
    daily_cap: 200,
    consent_basis: "legitimate_interest",
    segment: { zip: "", min_confidence: 0.7 },
  });

  const save = async () => {
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
    setMsg(""); setErr("");
    try {
      const r = await postJson("/api/portal?action=leadgen-campaign-test", { id, to });
      if (r.ok) setMsg(`Test sent to ${to} (message id ${r.messageId || "?"}). Check inbox + spam.`);
      else setErr(`Test failed: ${r.error}${r.permanent ? " (permanent)" : ""}`);
    } catch (e) { setErr(String(e.message || e)); }
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
        <button type="button" onClick={newCampaign} className="btn btn-primary">+ New campaign</button>
      </div>
      {msg ? <p className="admin-leadgen-ok">{msg}</p> : null}
      {err ? <p className="admin-leadgen-err">{err}</p> : null}

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
              <th aria-label="actions" />
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td className="admin-leadgen-muted">{c.status}</td>
                <td style={{ textAlign: "right" }}>{c.total_sends}</td>
                <td style={{ textAlign: "right" }}>{c.sent}</td>
                <td style={{ textAlign: "right" }}>{c.opened}</td>
                <td style={{ textAlign: "right" }}>{c.replied}</td>
                <td className="admin-leadgen-row-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(c)}>Edit</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => sendTest(c.id)}>Test send</button>
                  {["draft", "paused", "scheduled"].includes(c.status) ? (
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => start(c.id)}>Start</button>
                  ) : c.status === "running" ? (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStatus(c.id, "paused")}>Pause</button>
                  ) : null}
                </td>
              </tr>
            ))}
            {list.length === 0 ? (
              <tr><td colSpan={7} className="admin-leadgen-empty">No campaigns yet - click <strong>+ New campaign</strong>.</td></tr>
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
          <input className="admin-leadgen-input" value={seg.zip || ""} onChange={(e) => setSegment({ zip: e.target.value })} placeholder="34207" />
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

      <div className="admin-leadgen-actions">
        <button type="button" className="btn btn-primary" onClick={onSave}>Save</button>
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

function JobsTab({ recent }) {
  const [rows, setRows] = useState(recent);
  const [err, setErr] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [kindFilter, setKindFilter] = useState("all");

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
      if (discovered > 0) return `${discovered} discovered | ${inserted} new | ${updated} refreshed`;
    }
    if (job?.kind === "website_emails") {
      if (result?.skipped) return `Skipped: ${result.skipped}`;
      const found = Number(result?.found ?? 0);
      const inserted = Number(result?.inserted ?? 0);
      return `${found} found | ${inserted} new`;
    }
    return job?.error || "-";
  };

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

  const visibleRows = showAll
    ? scopedRows
    : scopedRows.filter((job) => ["failed", "productive"].includes(classifyJob(job))).slice(0, 30);

  const stats = rows.reduce((acc, job) => {
    const kind = classifyJob(job);
    acc.total += 1;
    acc[kind] = (acc[kind] || 0) + 1;
    return acc;
  }, { total: 0, failed: 0, productive: 0, no_signal: 0, other: 0 });
  const productiveRate = stats.total > 0 ? Math.round((stats.productive / stats.total) * 100) : 0;
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
          <button type="button" className="btn btn-secondary btn-sm" onClick={reload}>Refresh</button>
        </div>
      </div>
      <div className="admin-leadgen-jobs__summary">
        <div><strong>{stats.failed}</strong><span>Failed</span></div>
        <div><strong>{stats.productive}</strong><span>Productive</span></div>
        <div><strong>{stats.no_signal}</strong><span>No signal</span></div>
        <div><strong>{stats.total}</strong><span>Total</span></div>
      </div>
      <div className="admin-leadgen-jobs__health">
        <span>Signal rate: {productiveRate}%</span>
        <span>
          Last productive job: {latestProductiveDays == null ? "none yet" : latestProductiveDays === 0 ? "today" : `${latestProductiveDays} day${latestProductiveDays === 1 ? "" : "s"} ago`}
        </span>
      </div>
      {stalePipeline || staleRecentSignal ? (
        <p className="admin-leadgen-jobs__alert">
          Pipeline is trending stale. Discover a new zip/industry combo, then run email crawl only on fresh websites to increase net-new leads.
        </p>
      ) : null}
      {err ? <p className="admin-leadgen-err">{err}</p> : null}
      <div className="admin-aff-card">
        <table className="admin-aff-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Kind</th>
              <th>Status</th>
              <th style={{ textAlign: "right" }}>Progress</th>
              <th>Created</th>
              <th>Finished</th>
              <th>Output</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((j) => (
              <tr key={j.id}>
                <td>{j.id}</td>
                <td>{j.kind}</td>
                <td><StatusChip status={j.status} /></td>
                <td style={{ textAlign: "right" }}>{progressLabel(j)}</td>
                <td className="admin-leadgen-muted">{fmtTime(j.created_at)}</td>
                <td className="admin-leadgen-muted">{fmtTime(j.finished_at)}</td>
                <td className={`admin-leadgen-output-cell${j.status === "failed" ? " is-failed" : ""}`}>{outputLabel(j)}</td>
              </tr>
            ))}
            {visibleRows.length === 0 ? (
              <tr><td colSpan={7} className="admin-leadgen-empty">No matching jobs. Try another kind filter or show all.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
