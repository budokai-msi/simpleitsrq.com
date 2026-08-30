import { useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Boxes,
  Database,
  Eye,
  FileText,
  Grid3X3,
  Layers,
  RefreshCcw,
  Shield,
  Table2,
  Target,
  Terminal,
  Timer,
} from "lucide-react";
import { Metric, SignalPill, Table, fmtNumber, fmtTime, fmtDuration } from "./shared";

// ─────────────────────────────────────────────────────────────
// Ops Matrix — a y-axis (domain) × x-axis (view) command canvas.
//
// Composes the data already loaded by AdminOps (admin-status,
// ops-status, opsec-data, drafts, affiliate-stats, adsense-health,
// revenue-summary, leadgen-status) into a cross-tabulated matrix.
// Left sidebar = y-axis domains; top navbar = x-axis views; the
// bottom-right region is the output workspace where the selected
// y×x combination renders.
// ─────────────────────────────────────────────────────────────

// Y-axis: operations domains (left sidebar, top→bottom)
const Y_AXIS = [
  { id: "operations", label: "Operations", icon: Activity, desc: "Cron, pipeline, deploy, revenue" },
  { id: "opsec", label: "OpSec", icon: Shield, desc: "Threats, IOCs, cert health, exposure" },
  { id: "functions", label: "Functions", icon: Terminal, desc: "Portal actions & endpoints" },
  { id: "capture", label: "Data Capture", icon: Database, desc: "Snapshot live state" },
  { id: "retain", label: "Retain", icon: Layers, desc: "Replay retained snapshots" },
];

// X-axis: view modes (top navbar, left→right)
const X_AXIS = [
  { id: "overview", label: "Overview", icon: Grid3X3, desc: "Aggregate all sources" },
  { id: "matrix", label: "Matrix", icon: Table2, desc: "Cross-tabulated grid" },
  { id: "timeline", label: "Timeline", icon: Timer, desc: "Chronological events" },
  { id: "terraform", label: "Terraform", icon: Boxes, desc: "Transformed data views" },
  { id: "raw", label: "Raw", icon: FileText, desc: "Unprocessed payloads" },
];

// ---------- small presentational helpers ----------
function MatrixBar({ label, value, max, color }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="ops-matrix-bar">
      <span className="ops-matrix-bar__label">{label}</span>
      <div className="ops-matrix-bar__track">
        <div className="ops-matrix-bar__fill" style={{ width: `${pct}%`, background: color || "var(--aura-accent)" }} />
      </div>
      <span className="ops-matrix-bar__value">{fmtNumber(value)}</span>
    </div>
  );
}

function MatrixPanel({ title, children, wide }) {
  return (
    <section className={`admin-aff-card ops-panel${wide ? " ops-panel--wide" : ""}`}>
      <div className="ops-panel__head"><h2>{title}</h2></div>
      <div className="ops-panel__body">{children}</div>
    </section>
  );
}

// ---------- x-axis renderers (compose the loaded `data`) ----------
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
      <p className="ops-panel__copy">Each cell = intersection of a y-axis domain and an x-axis metric.</p>
    </MatrixPanel>
  );
}

function TimelineView({ data }) {
  const events = [];
  const drafts = data.drafts?.drafts || [];
  const opsec = data["opsec-data"];
  const admin = data["admin-status"];

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

function TerraformView({ data }) {
  const admin = data["admin-status"];
  const opsec = data["opsec-data"];
  const drafts = data.drafts?.drafts || [];
  const counts = admin?.counts || {};
  const published = drafts.filter(d => d.status === "published").length;
  const rejected = drafts.filter(d => d.status === "rejected").length;
  const total = published + rejected;
  const maxLeads = Math.max(counts.lead_businesses?.n || 1, 1);
  const maxEmails = Math.max(counts.lead_emails?.n || 1, 1);

  return (
    <div className="ops-grid">
      <MatrixPanel title="Terraformed — distribution" wide>
        <div className="ops-matrix-donut-wrap">
          <div
            className="ops-matrix-donut"
            style={{ background: total ? `conic-gradient(#2e7d32 0 ${(published / total) * 100}%, #c0392b ${(published / total) * 100}% 100%)` : "var(--aura-surface)" }}
          >
            <div className="ops-matrix-donut__hole">
              <strong>{fmtNumber(total)}</strong>
              <span>posts</span>
            </div>
          </div>
          <div className="ops-matrix-legend">
            <div><span className="ops-matrix-swatch" style={{ background: "#2e7d32" }} /> published {fmtNumber(published)}</div>
            <div><span className="ops-matrix-swatch" style={{ background: "#c0392b" }} /> rejected {fmtNumber(rejected)}</div>
          </div>
        </div>
      </MatrixPanel>
      <MatrixPanel title="Terraformed — activity bars">
        <MatrixBar label="Lead businesses" value={counts.lead_businesses?.n || 0} max={maxLeads} color="#2e7d32" />
        <MatrixBar label="Email contacts" value={counts.lead_emails?.n || 0} max={maxEmails} color="var(--aura-accent)" />
        <MatrixBar label="Security events" value={counts.security_events?.n || 0} max={Math.max(counts.security_events?.n || 1, 1)} color="#c0392b" />
        <MatrixBar label="Active IOCs" value={opsec?.iocs?.filter(i => i.is_active)?.length || 0} max={Math.max(opsec?.iocs?.length || 1, 1)} color="#6a1b9a" />
      </MatrixPanel>
      <MatrixPanel title="Terraformed — health score" wide>
        <div className="ops-matrix-health">
          <div className="ops-matrix-health__ring">
            <strong>{deriveHealth(data)}</strong><span>/100</span>
          </div>
          <div className="ops-matrix-health__label">{healthLabel(data)}</div>
        </div>
      </MatrixPanel>
    </div>
  );
}

function deriveHealth(data) {
  let s = 0;
  const admin = data["admin-status"];
  const opsec = data["opsec-data"];
  const drafts = data.drafts?.drafts || [];
  if (admin?.counts?.lead_businesses?.n > 0) s += 20;
  if (admin?.counts?.lead_emails?.n > 0) s += 20;
  if (drafts.some(d => d.status === "published")) s += 20;
  if (opsec?.threatTotal > 0) s += 20;
  if (Object.values(admin?.env || {}).some(Boolean)) s += 20;
  return s;
}
function healthLabel(data) {
  const s = deriveHealth(data);
  return s >= 80 ? "Healthy" : s >= 50 ? "Degraded" : "Critical";
}

function RawView({ data }) {
  return (
    <MatrixPanel title="Raw payloads — unprocessed" wide>
      <pre className="ops-matrix-raw">{JSON.stringify(data, null, 2)}</pre>
    </MatrixPanel>
  );
}

// ---------- y-axis specific views ----------
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

function FunctionsView({ data }) {
  const ops = data["ops-status"];
  const actions = ops?.actions || [];
  return (
    <MatrixPanel title="Portal function registry" wide>
      <Table
        columns={["Action", "Purpose"]}
        rows={actions}
        empty="No portal actions reported."
        renderRow={(row) => (
          <tr key={row}>
            <td className="ops-mono">{row}</td>
            <td className="ops-panel__copy">—</td>
          </tr>
        )}
      />
    </MatrixPanel>
  );
}

function CaptureView({ onCapture, capturing, lastCapture }) {
  return (
    <MatrixPanel title="Data capture loop" wide>
      <p className="ops-panel__copy">Snapshot the current live state of every source into the retain store. Each capture is immutable and replayable.</p>
      <button className="btn btn-primary btn-sm" onClick={onCapture} disabled={capturing}>
        <Database size={14} style={{ marginRight: 6 }} />
        {capturing ? "Capturing…" : "Capture snapshot"}
      </button>
      {lastCapture && (
        <div className="ops-matrix-capture-note">
          <SignalPill state="good">saved</SignalPill>
          <span className="ops-mono">{lastCapture.id}</span>
          <span>{fmtTime(lastCapture.ts)}</span>
        </div>
      )}
    </MatrixPanel>
  );
}

function RetainView({ retained, onReplay, replaying, replayData }) {
  return (
    <div className="ops-grid">
      <MatrixPanel title="Retained snapshots" wide>
        {!retained?.length && <p className="ops-panel__copy">No snapshots yet — capture one first.</p>}
        <div className="ops-matrix-retain-list">
          {retained?.map(s => (
            <div className="ops-matrix-retain-row" key={s.id}>
              <button className="btn btn-secondary btn-sm" onClick={() => onReplay(s.id)} disabled={replaying}>replay</button>
              <span className="ops-mono">{s.id}</span>
              <span>{fmtTime(s.ts)}</span>
            </div>
          ))}
        </div>
      </MatrixPanel>
      <MatrixPanel title="Replayed snapshot">
        {!replayData && <p className="ops-panel__copy">Select a snapshot to replay its terraformed state.</p>}
        {replayData && (
          <div>
            <div className="ops-matrix-capture-note">
              <SignalPill state="good">{replayData.id}</SignalPill>
              <span>{fmtTime(replayData.ts)}</span>
            </div>
            <div className="ops-metric-grid">
              <Metric label="Jobs" value={fmtNumber(replayData.cron?.jobs?.length)} />
              <Metric label="Published" value={fmtNumber(replayData.blog?.posts?.byStatus?.find(s => s.status === "published")?.n)} />
              <Metric label="Memory sections" value={fmtNumber(replayData.memory?.memorySections?.length)} />
              <Metric label="Branch" value={replayData.deploy?.branch || "—"} />
            </div>
          </div>
        )}
      </MatrixPanel>
    </div>
  );
}

// ---------- main matrix component ----------
export default function OpsMatrixTab({ data, busy, runAction }) {
  const [y, setY] = useState("operations");
  const [x, setX] = useState("overview");
  const [retained, setRetained] = useState([]);
  const [capturing, setCapturing] = useState(false);
  const [lastCapture, setLastCapture] = useState(null);
  const [replaying, setReplaying] = useState(false);
  const [replayData, setReplayData] = useState(null);

  const yMeta = Y_AXIS.find(a => a.id === y);
  const xMeta = X_AXIS.find(a => a.id === x);

  const loadRetained = async () => {
    try {
      const r = await fetch("/api/portal?action=matrix-retain", { credentials: "same-origin" });
      const j = await r.json();
      if (j.ok !== false) setRetained(j.retained || []);
    } catch { /* ignore */ }
  };

  const handleCapture = async () => {
    setCapturing(true);
    try {
      const r = await fetch("/api/portal?action=matrix-capture", { method: "POST", credentials: "same-origin" });
      const j = await r.json();
      if (j.ok) { setLastCapture(j); await loadRetained(); }
    } finally { setCapturing(false); }
  };

  const handleReplay = async (id) => {
    setReplaying(true);
    try {
      const r = await fetch(`/api/portal?action=matrix-retain&id=${encodeURIComponent(id)}`, { credentials: "same-origin" });
      const j = await r.json();
      if (j.ok) setReplayData(j.snapshot);
    } finally { setReplaying(false); }
  };

  const ySpecific = {
    opsec: <OpSecView data={data} />,
    functions: <FunctionsView data={data} />,
    capture: <CaptureView onCapture={handleCapture} capturing={capturing} lastCapture={lastCapture} />,
    retain: <RetainView retained={retained} onReplay={handleReplay} replaying={replaying} replayData={replayData} />,
  };
  const xRenderers = {
    overview: <OverviewView data={data} />,
    matrix: <MatrixView data={data} />,
    timeline: <TimelineView data={data} />,
    terraform: <TerraformView data={data} />,
    raw: <RawView data={data} />,
  };
  const output = ySpecific[y] || xRenderers[x];

  return (
    <div className="ops-matrix admin-aff-card ops-panel">
      {/* top navbar = x-axis */}
      <div className="ops-matrix__navbar">
        <div className="ops-matrix__brand">
          <span className="ops-matrix__brand-mark"><Boxes size={15} /></span>
          <strong>Ops Matrix</strong>
          <span className="ops-matrix__brand-sub">command canvas</span>
        </div>
        <nav className="ops-matrix__x">
          {X_AXIS.map(a => {
            const Icon = a.icon;
            return (
              <button key={a.id} className={`ops-matrix__xbtn${x === a.id ? " is-active" : ""}`} onClick={() => setX(a.id)} title={a.desc}>
                <Icon size={13} /><span>{a.label}</span>
              </button>
            );
          })}
        </nav>
        <button className="btn btn-secondary btn-sm" onClick={() => runAction("admin-status", {}, "Refreshed.")} disabled={busy === "admin-status"}>
          <RefreshCcw size={13} style={{ marginRight: 6 }} />refresh
        </button>
      </div>

      <div className="ops-matrix__body">
        {/* left sidebar = y-axis */}
        <aside className="ops-matrix__y">
          <div className="ops-matrix__y-label">Y-AXIS · DOMAIN</div>
          {Y_AXIS.map(a => {
            const Icon = a.icon;
            return (
              <button key={a.id} className={`ops-matrix__ybtn${y === a.id ? " is-active" : ""}`} onClick={() => setY(a.id)}>
                <Icon size={15} /><span className="ops-matrix__ybtn-label">{a.label}</span>
                <span className="ops-matrix__ybtn-desc">{a.desc}</span>
              </button>
            );
          })}
          <div className="ops-matrix__yfoot">
            <div>X: {xMeta.label}</div>
            <div>Y: {yMeta.label}</div>
          </div>
        </aside>

        {/* output workspace = bottom-right canvas */}
        <main className="ops-matrix__canvas">
          <div className="ops-matrix__canvas-head">
            <span className="ops-matrix__canvas-title">{yMeta.label} <span className="ops-matrix__dim">×</span> {xMeta.label}</span>
            <span className="ops-matrix__canvas-desc">{yMeta.desc} · {xMeta.desc}</span>
          </div>
          <div className="ops-matrix__canvas-body">{output}</div>
        </main>
      </div>
    </div>
  );
}
