import { Metric, SignalPill, Table, fmtNumber, fmtTime } from "./shared";

// ─────────────────────────────────────────────────────────────
// Ops Matrix — a single, functional operations overview.
//
// Composes the data already loaded by AdminOps (admin-status,
// ops-status, opsec-data, drafts, affiliate-stats, adsense-health,
// revenue-summary, leadgen-status) into one scrollable panel of
// real, useful views: metric grids, a cross-tabulated matrix, a
// chronological event stream, and the secret/threat posture.
// ─────────────────────────────────────────────────────────────

function MatrixPanel({ title, children, wide }) {
  return (
    <section className={`admin-aff-card ops-panel${wide ? " ops-panel--wide" : ""}`}>
      <div className="ops-panel__head"><h2>{title}</h2></div>
      <div className="ops-panel__body">{children}</div>
    </section>
  );
}

function OverviewView({ data }) {
  const admin = data["admin-status"];
  const ops = data["ops-status"];
  const opsec = data["opsec-data"];
  const drafts = data.drafts?.drafts || [];
  const affiliate = data["affiliate-stats"];
  const revenue = data["revenue-summary"];
  const counts = admin?.counts || {};
  const env = admin?.env || {};
  const envSet = Object.entries(env).filter(([, v]) => v).length;
  const envTotal = Object.keys(env).length;

  return (
    <div className="ops-grid">
      <MatrixPanel title="Operations" wide>
        <div className="ops-metric-grid">
          <Metric label="Lead businesses" value={fmtNumber(counts.lead_businesses?.n)} hint={`${fmtNumber(counts.lead_businesses?.active)} active`} />
          <Metric label="Email contacts" value={fmtNumber(counts.lead_emails?.n)} hint={`${fmtNumber(counts.lead_emails?.deliverable)} deliverable`} />
          <Metric label="Security events" value={fmtNumber(counts.security_events?.n)} />
          <Metric label="Engagement events" value={fmtNumber(counts.engagement_events?.n)} />
          <Metric label="Draft posts" value={fmtNumber(drafts.length)} />
          <Metric label="MRR" value={revenue?.configured ? `$${fmtNumber(revenue.mrr_cents / 100)}` : "—"} />
        </div>
      </MatrixPanel>
      <MatrixPanel title="OpSec posture">
        <div className="ops-metric-grid">
          <Metric label="Threat feeds" value={fmtNumber(opsec?.threatTotal)} />
          <Metric label="Active IOCs" value={fmtNumber(opsec?.iocs?.filter(i => i.is_active)?.length)} />
          <Metric label="Watched domains" value={fmtNumber(opsec?.domains?.length)} />
          <Metric label="Env secrets set" value={`${envSet}/${envTotal}`} />
        </div>
      </MatrixPanel>
      <MatrixPanel title="Pipeline & functions">
        <div className="ops-metric-grid">
          <Metric label="Affiliate clicks" value={fmtNumber(affiliate?.clicks)} />
          <Metric label="Affiliate revenue" value={affiliate?.revenue ? `$${fmtNumber(affiliate.revenue)}` : "—"} />
          <Metric label="Portal actions" value={fmtNumber(ops?.actions?.length)} />
        </div>
      </MatrixPanel>
    </div>
  );
}

function MatrixView({ data }) {
  const admin = data["admin-status"];
  const opsec = data["opsec-data"];
  const drafts = data.drafts?.drafts || [];
  const counts = admin?.counts || {};

  const rows = [
    { domain: "Operations", cells: [fmtNumber(counts.lead_businesses?.n), fmtNumber(counts.lead_emails?.n), fmtNumber(counts.security_events?.n), fmtNumber(drafts.length)] },
    { domain: "OpSec", cells: [fmtNumber(opsec?.threatTotal), fmtNumber(opsec?.iocs?.length), fmtNumber(opsec?.domains?.length), fmtNumber(opsec?.certChecks?.length)] },
    { domain: "Content", cells: [fmtNumber(drafts.filter(d => d.status === "published")?.length), fmtNumber(drafts.filter(d => d.status === "draft")?.length), fmtNumber(drafts.filter(d => d.status === "rejected")?.length), fmtNumber(drafts.length)] },
  ];
  const cols = ["Leads", "Emails", "Events", "Drafts"];

  return (
    <MatrixPanel title="Cross-tabulated matrix — domain × metric" wide>
      <div className="ops-table-wrap">
        <table className="admin-aff-table ops-table">
          <thead>
            <tr><th>Domain</th>{cols.map(c => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="ops-mono">{r.domain}</td>
                {r.cells.map((c, j) => <td key={j} className="ops-mono">{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ops-panel__copy">Each cell = intersection of a domain and a metric.</p>
    </MatrixPanel>
  );
}

function TimelineView({ data }) {
  const events = [];
  const drafts = data.drafts?.drafts || [];
  const opsec = data["opsec-data"];

  for (const d of drafts) {
    if (d.updated_at) events.push({ ts: d.updated_at, kind: "draft", label: `Draft ${d.status}: ${d.title || d.slug}`, detail: d.status });
  }
  for (const ioc of opsec?.iocs || []) {
    if (ioc.last_seen_at) events.push({ ts: ioc.last_seen_at, kind: "ioc", label: `IOC seen: ${ioc.value}`, detail: `${ioc.ioc_type} · ${ioc.severity}` });
  }
  for (const c of opsec?.certChecks || []) {
    if (c.ts) events.push({ ts: c.ts, kind: "cert", label: `Cert check: ${c.domain}`, detail: c.ok ? "ok" : "alert" });
  }
  events.sort((a, b) => new Date(b.ts) - new Date(a.ts));

  return (
    <MatrixPanel title="Chronological event stream" wide>
      {!events.length && <p className="ops-panel__copy">No recent events.</p>}
      <div className="ops-timeline">
        {events.slice(0, 20).map((e, i) => (
          <div className="ops-timeline__item" key={i}>
            <span className={`ops-timeline__dot is-${e.kind}`} />
            <div className="ops-timeline__body">
              <div className="ops-timeline__label">{e.label}</div>
              <div className="ops-timeline__detail">{e.detail}</div>
            </div>
            <span className="ops-timeline__ts">{fmtTime(e.ts)}</span>
          </div>
        ))}
      </div>
    </MatrixPanel>
  );
}

function OpSecView({ data }) {
  const opsec = data["opsec-data"];
  const admin = data["admin-status"];
  const env = admin?.env || {};
  const envRows = Object.entries(env).map(([k, v]) => ({ name: k, present: !!v }));
  return (
    <div className="ops-grid">
      <MatrixPanel title="Secret exposure surface" wide>
        <Table
          columns={["Secret", "Status"]}
          rows={envRows}
          empty="No env secrets probed."
          renderRow={(row) => (
            <tr key={row.name}>
              <td className="ops-mono">{row.name}</td>
              <td><SignalPill state={row.present ? "good" : "bad"}>{row.present ? "SET" : "MISSING"}</SignalPill></td>
            </tr>
          )}
        />
        <p className="ops-panel__copy">Presence only — values never leave the host.</p>
      </MatrixPanel>
      <MatrixPanel title="Threat posture">
        <div className="ops-metric-grid">
          <Metric label="Threat feeds" value={fmtNumber(opsec?.threatTotal)} />
          <Metric label="Active IOCs" value={fmtNumber(opsec?.iocs?.filter(i => i.is_active)?.length)} />
          <Metric label="Watched domains" value={fmtNumber(opsec?.domains?.length)} />
          <Metric label="Cert checks" value={fmtNumber(opsec?.certChecks?.length)} />
        </div>
      </MatrixPanel>
    </div>
  );
}

// ---------- main component ----------
export default function OpsMatrixTab({ data, busy, runAction }) {
  return (
    <div className="ops-matrix admin-aff-card ops-panel">
      <div className="ops-matrix__navbar">
        <div className="ops-matrix__brand">
          <span className="ops-matrix__brand-mark" />
          <strong>Ops Matrix</strong>
          <span className="ops-matrix__brand-sub">Operations overview</span>
        </div>
      </div>
      <div className="ops-matrix__body">
        <main className="ops-matrix__canvas">
          <div className="ops-matrix__canvas-head">
            <span className="ops-matrix__canvas-title">Operations overview</span>
            <span className="ops-matrix__canvas-desc">Live posture across operations, content, and security</span>
          </div>
          <div className="ops-matrix__canvas-body">
            <OverviewView data={data} />
            <MatrixView data={data} />
            <TimelineView data={data} />
            <OpSecView data={data} />
          </div>
        </main>
      </div>
    </div>
  );
}
