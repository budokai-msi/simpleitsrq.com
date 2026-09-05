// Shared helpers and small presentational components for AdminOps tabs.
// Extracted from src/pages/AdminOps.jsx.
import {
  AlertTriangle,
} from "lucide-react";
import { csrfFetch } from "../../lib/csrf";

export function fmtNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toLocaleString() : "-";
}

export function fmtMoney(cents) {
  const n = Number(cents || 0) / 100;
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function fmtTime(value) {
  if (!value) return "-";
  try { return new Date(value).toLocaleString(); } catch { return String(value); }
}

export function fmtDuration(ms) {
  const sec = Math.round(Number(ms || 0) / 1000);
  if (!Number.isFinite(sec) || sec <= 0) return "0s";
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem ? `${min}m ${rem}s` : `${min}m`;
}

export function formatJobProgress(row) {
  const total = Number(row?.total);
  const progress = Number(row?.progress);
  if (!Number.isFinite(total) || total <= 0) return row?.status === "done" ? "done" : "-";
  if (row?.status === "done" && row?.kind === "osm_zip" && progress === 0) return `${fmtNumber(total)} / ${fmtNumber(total)}`;
  if (!Number.isFinite(progress) || progress < 0) return `0 / ${fmtNumber(total)}`;
  return `${fmtNumber(progress)} / ${fmtNumber(total)}`;
}

export function formatJobOutput(row) {
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

export async function getJson(action, params = {}) {
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

export async function postJson(action, body = {}) {
  const res = await csrfFetch(`/api/portal?action=${encodeURIComponent(action)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export function SignalPill({ state, children }) {
  const cls = state === "good" ? "badge-success" : state === "warn" ? "badge-warning" : state === "bad" ? "badge-error" : "badge-ghost";
  return <span className={`badge badge-sm ${cls}`}>{children}</span>;
}

export function Metric({ label, value, hint, state }) {
  return (
    <div className="stat">
      <div className="stat-title">{label}</div>
      <div className="stat-value text-2xl">{value ?? "-"}</div>
      {hint ? <div className={`stat-desc${state ? ` text-${state}` : ""}`}>{hint}</div> : null}
    </div>
  );
}

export function EmptyState({ children }) {
  return (
    <div className="alert alert-soft" role="status">
      <AlertTriangle size={16} />
      <span>{children}</span>
    </div>
  );
}

export function Table({ columns, rows, empty, emptyNode, renderRow }) {
  if (!rows?.length) return emptyNode || <EmptyState>{empty || "No records yet."}</EmptyState>;
  return (
    <div className="overflow-x-auto">
      <table className="table table-zebra">
        <thead>
          <tr>{columns.map((col) => <th key={col}>{col}</th>)}</tr>
        </thead>
        <tbody>{rows.map(renderRow)}</tbody>
      </table>
    </div>
  );
}

export function deriveIntel(data) {
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

export function analyzeMicrosoftDocs(msg = "") {
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

export function StatusChip({ status }) {
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

export function HotLeadsPanel({ hotLeads, error }) {
  const leads = hotLeads?.leads || [];
  return (
    <section className="card card-border bg-base-100 col-span-full p-4">
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
      {error ? <div className="alert alert-error" role="alert"><span>{error}</span></div> : null}
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

export function fmtDwell(sec) {
  const s = Number(sec) || 0;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

export function FunnelBar({ label, value, pct, green }) {
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

export function LeadIntelPanels({ leadIntel, error }) {
  const funnel = leadIntel?.funnel || {};
  const returning = leadIntel?.returning || [];
  const sources = leadIntel?.sources || [];
  return (
    <>
      <section className="card card-border bg-base-100 p-4">
        <div className="ops-panel__head"><h2>Conversion funnel</h2><SignalPill state={funnel.sessions ? "good" : "neutral"}>14 days</SignalPill></div>
        {error ? <div className="alert alert-error" role="alert"><span>{error}</span></div> : null}
        <FunnelBar label="Visitors (sessions)" value={funnel.sessions} pct={100} />
        <FunnelBar label="Engaged" value={funnel.engaged} pct={funnel.engaged_pct} />
        <FunnelBar label="High-intent pages" value={funnel.high_intent} pct={funnel.high_intent_pct} />
        <FunnelBar label="Reached booking / contact" value={funnel.reached_booking} pct={funnel.reached_booking_pct} green />
      </section>

      <section className="card card-border bg-base-100 p-4">
        <div className="ops-panel__head"><h2>Traffic sources</h2><SignalPill state={sources.length ? "good" : "neutral"}>14 days</SignalPill></div>
        {error ? <div className="alert alert-error" role="alert"><span>{error}</span></div> : null}
        {!error && sources.length === 0 ? <EmptyState>No source data yet.</EmptyState> : null}
        {sources.length ? (
          <div className="overflow-x-auto">
            <table className="table table-zebra">
              <thead><tr><th>Source</th><th className="text-right">Sessions</th><th className="text-right">Engaged</th></tr></thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.source}><td>{s.source}</td><td className="text-right">{fmtNumber(s.sessions)}</td><td className="text-right">{s.engaged_pct}%</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="card card-border bg-base-100 col-span-full p-4">
        <div className="ops-panel__head"><h2>Returning visitors</h2><SignalPill state={returning.length ? "good" : "neutral"}>{fmtNumber(returning.length)} watching · 30d</SignalPill></div>
        {error ? <div className="alert alert-error" role="alert"><span>{error}</span></div> : null}
        {!error && returning.length === 0 ? <EmptyState>No repeat visitors yet - they show up here after a second visit.</EmptyState> : null}
        {returning.length ? (
          <div className="overflow-x-auto">
            <table className="table table-zebra">
              <thead><tr><th>Location</th><th className="text-right">Visits</th><th className="text-right">Days</th><th className="text-right">Pages</th><th>Engaged</th></tr></thead>
              <tbody>
                {returning.map((r) => (
                  <tr key={r.anon_id}>
                    <td>{r.location}</td>
                    <td className="text-right">{fmtNumber(r.sessions)}</td>
                    <td className="text-right">{fmtNumber(r.days)}</td>
                    <td className="text-right">{fmtNumber(r.total_pages)}</td>
                    <td>{r.ever_engaged ? "✓" : " - "}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  );
}

// Content tab — which posts attract, hold, and convert readers.
