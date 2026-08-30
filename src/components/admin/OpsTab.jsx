import { useEffect, useRef, useState } from "react";
import { motion, animate } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Metric, SignalPill, Table, fmtMoney, fmtNumber, fmtTime, formatJobOutput, formatJobProgress } from "./shared";

// ─────────────────────────────────────────────────────────────
// CountUp — animates a number from its previous value to the new
// target using framer-motion's `animate`. Used for revenue KPIs and
// the "What needs your attention" counts so big numbers feel alive
// without being noisy.
// ─────────────────────────────────────────────────────────────
function CountUp({ value, format = (n) => fmtNumber(n), duration = 0.8 }) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const controls = animate(fromRef.current, value, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(v),
    });
    fromRef.current = value;
    return () => controls.stop();
  }, [value, duration]);
  return <>{format(display)}</>;
}

// ─────────────────────────────────────────────────────────────
// Panel — a motion.section that fades + slides up on mount. Each
// panel takes a `delay` so sibling panels stagger in (~0.06s apart).
// ─────────────────────────────────────────────────────────────
function Panel({ children, delay = 0, wide = false }) {
  return (
    <motion.section
      className={`admin-aff-card ops-panel${wide ? " ops-panel--wide" : ""}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay, ease: "easeOut" }}
    >
      {children}
    </motion.section>
  );
}

// Motion-wrapped Link so the action buttons can lift on hover.
const MotionLink = motion(Link);

// ─────────────────────────────────────────────────────────────
// "What needs your attention" — the primary panel. Derives a
// prioritized list of concrete actions a human would take, each with
// a status icon and a button. Data-driven, not a static list.
// ─────────────────────────────────────────────────────────────
function AttentionPanel({ data }) {
  const leadsNew = Number(data["leads-inbox"]?.counts?.new || 0);
  const blogFailures = Number(data["blog-engine-health"]?.consecutiveFailures || 0);
  const unconfiguredAffiliate = (data["affiliate-setup"]?.programs || []).filter((p) => !p.configured).length;
  const certIssues = (data["opsec-data"]?.certChecks || []).filter((c) => !c.ok).length;
  const deliverable = Number(data["leadgen-status"]?.emails?.deliverable || 0);
  const campaigns = data["leadgen-campaigns"]?.rows || [];
  const duplicateGroups = (data["content-hygiene"]?.duplicateGroups || []).length;

  const items = [];
  if (leadsNew > 0) {
    items.push({
      state: "warn",
      Icon: AlertTriangle,
      color: "#b45309",
      text: (
        <>
          <CountUp value={leadsNew} /> new lead{leadsNew === 1 ? "" : "s"} need{leadsNew === 1 ? "s" : ""} a reply
        </>
      ),
      to: "/portal/ops?tab=leads",
      label: "Open Leads",
    });
  }
  if (blogFailures >= 2) {
    items.push({
      state: "bad",
      Icon: XCircle,
      color: "#dc2626",
      text: (
        <>
          Blog auto-publish failed <CountUp value={blogFailures} /> days in a row
        </>
      ),
      to: "/portal/ops?tab=blog-health",
      label: "View Blog Health",
    });
  }
  if (unconfiguredAffiliate > 0) {
    items.push({
      state: "warn",
      Icon: AlertTriangle,
      color: "#b45309",
      text: (
        <>
          <CountUp value={unconfiguredAffiliate} /> affiliate program{unconfiguredAffiliate === 1 ? "" : "s"} unconfigured
        </>
      ),
      to: "/portal/ops?tab=affiliate",
      label: "Set up Affiliate",
    });
  }
  if (certIssues > 0) {
    items.push({
      state: "bad",
      Icon: XCircle,
      color: "#dc2626",
      text: (
        <>
          <CountUp value={certIssues} /> domain{certIssues === 1 ? "" : "s"} have cert issues
        </>
      ),
      to: "/portal/opsec",
      label: "View OpSec",
    });
  }
  if (deliverable > 0 && campaigns.length === 0) {
    items.push({
      state: "warn",
      Icon: AlertTriangle,
      color: "#b45309",
      text: (
        <>
          <CountUp value={deliverable} /> emails ready — launch your first campaign
        </>
      ),
      to: "/portal/ops?tab=campaigns",
      label: "Build Campaign",
    });
  }
  if (duplicateGroups > 0) {
    items.push({
      state: "warn",
      Icon: AlertTriangle,
      color: "#b45309",
      text: (
        <>
          <CountUp value={duplicateGroups} /> duplicate-slug post{duplicateGroups === 1 ? "" : "s"} detected
        </>
      ),
      to: "/portal/ops?tab=content",
      label: "View Content",
    });
  }

  return (
    <Panel wide>
      <div className="ops-panel__head">
        <h2>What needs your attention</h2>
        <SignalPill state={items.length ? "warn" : "good"}>{items.length ? `${items.length} action${items.length === 1 ? "" : "s"}` : "all clear"}</SignalPill>
      </div>
      {items.length === 0 ? (
        <div className="ops-attention-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-2)" }}>
          <CheckCircle2 size={18} style={{ color: "#059669", flexShrink: 0 }} />
          <span style={{ flex: 1, color: "var(--text-1)", fontSize: 14 }}>All clear — nothing needs your attention right now.</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item, i) => (
            <motion.div
              key={i}
              className="ops-attention-row"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: 0.1 + i * 0.05, ease: "easeOut" }}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-2)" }}
            >
              <item.Icon size={18} style={{ color: item.color, flexShrink: 0 }} />
              <span style={{ flex: 1, color: "var(--text-1)", fontSize: 14 }}>{item.text}</span>
              <MotionLink
                to={item.to}
                className="btn btn-primary btn-sm"
                whileHover={{ y: -1 }}
                transition={{ duration: 0.15 }}
                style={{ flexShrink: 0 }}
              >
                {item.label}
              </MotionLink>
            </motion.div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────
// Revenue — the 3 revenue KPIs, count-up animated. If there is no
// revenue yet, point the operator at the campaign builder.
// ─────────────────────────────────────────────────────────────
function RevenuePanel({ data }) {
  const revenue = data["revenue-summary"];
  const configured = !!revenue?.configured;
  const paidTotal = Number(revenue?.paid_total_cents || 0);
  const mrr = Number(revenue?.mrr_cents || 0);
  const paidCount = Number(revenue?.paid_count || 0);
  const revenueZero = configured && !paidTotal && !mrr;

  return (
    <Panel>
      <div className="ops-panel__head"><h2>Revenue</h2></div>
      <div className="ops-metric-grid">
        <Metric label="30-day Stripe" value={configured ? <CountUp value={paidTotal} format={fmtMoney} /> : "Not configured"} />
        <Metric label="MRR" value={configured ? <CountUp value={mrr} format={fmtMoney} /> : "-"} />
        <Metric label="Paid invoices" value={configured ? <CountUp value={paidCount} /> : "-"} />
      </div>
      {revenueZero ? (
        <p className="ops-notice">No revenue yet — launch a campaign to start converting the 2,553-email pipeline.</p>
      ) : null}
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────
// Recent jobs — real operational data. Failed jobs sort to the top
// and are highlighted in red so the operator sees what broke first.
// ─────────────────────────────────────────────────────────────
function RecentJobsPanel({ data, errors }) {
  const jobs = [...(data["admin-status"]?.recent_jobs || [])].sort((a, b) => {
    const af = a.status === "failed" ? 0 : 1;
    const bf = b.status === "failed" ? 0 : 1;
    if (af !== bf) return af - bf;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  return (
    <Panel wide>
      <div className="ops-panel__head">
        <h2>Recent jobs</h2>
        <SignalPill state={errors["admin-status"] ? "bad" : "good"}>{errors["admin-status"] || "admin-status"}</SignalPill>
      </div>
      <Table
        columns={["ID", "Kind", "Status", "Progress", "Created", "Output"]}
        rows={jobs}
        empty="No leadgen jobs have run yet."
        renderRow={(row) => (
          <tr key={row.id || row.error} style={row.status === "failed" ? { background: "color-mix(in srgb, #dc2626 6%, transparent)" } : undefined}>
            <td>{row.id || "-"}</td>
            <td>{row.kind || "-"}</td>
            <td><SignalPill state={row.status === "failed" ? "bad" : row.status === "done" ? "good" : "neutral"}>{row.status || "-"}</SignalPill></td>
            <td>{formatJobProgress(row)}</td>
            <td>{fmtTime(row.created_at)}</td>
            <td>{formatJobOutput(row)}</td>
          </tr>
        )}
      />
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────
// Quick actions — the operator's one-click command row.
// ─────────────────────────────────────────────────────────────
function QuickActionsPanel({ busy, runAction }) {
  return (
    <Panel>
      <div className="ops-panel__head"><h2>Quick actions</h2></div>
      <div className="ops-button-stack">
        <button className="btn btn-secondary btn-sm" disabled={busy === "run-audit-migration"} onClick={() => runAction("run-audit-migration", {}, "Audit/ops migrations checked.")}>Run migrations</button>
        <button className="btn btn-secondary btn-sm" disabled={busy === "osint-refresh"} onClick={() => runAction("osint-refresh", {}, "OSINT feeds refreshed.")}>Refresh OSINT</button>
        <Link className="btn btn-primary btn-sm" to="/portal/leadgen">Open Leadgen</Link>
      </div>
    </Panel>
  );
}

export default function OpsTab({ data, errors, intel, busy, runAction }) {
  return (
    <div className="ops-grid">
      <AttentionPanel data={data} />
      <RevenuePanel data={data} />
      <QuickActionsPanel busy={busy} runAction={runAction} />
      <RecentJobsPanel data={data} errors={errors} />
    </div>
  );
}
