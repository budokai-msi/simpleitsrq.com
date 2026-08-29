import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Metric, SignalPill, Table, fmtMoney, fmtNumber, fmtTime, formatJobOutput, formatJobProgress } from "./shared";

export default function OpsTab({ data, errors, intel, busy, runAction }) {
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

