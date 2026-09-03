import { useEffect, useRef, useState } from "react";
import { motion, animate } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  DollarSign,
  Inbox,
  FileText,
  Shield,
  Link2,
  Activity,
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
// DaisyUI-style dropdown (brand-finetuned). A button that toggles a
// menu of options; the selected value is shown on the button. Uses
// the brand accent (#0F6CBD) for the active state and focus ring.
// ─────────────────────────────────────────────────────────────
function BrandDropdown({ value, options, onChange, label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onEsc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, [open]);

  return (
    <div className="ops-dropdown" ref={ref}>
      <button
        type="button"
        className="ops-dropdown__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="ops-dropdown__label">{label}</span>
        <span className="ops-dropdown__value">{value}</span>
        <ChevronDown size={14} className={`ops-dropdown__chevron${open ? " is-open" : ""}`} />
      </button>
      {open ? (
        <ul className="ops-dropdown__menu" role="listbox">
          {options.map((opt) => (
            <li key={opt}>
              <button
                type="button"
                role="option"
                aria-selected={opt === value}
                className={`ops-dropdown__item${opt === value ? " is-selected" : ""}`}
                onClick={() => { onChange(opt); setOpen(false); }}
              >
                {opt}
                {opt === value ? <CheckCircle2 size={14} className="ops-dropdown__check" /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// "What needs your attention" — the primary panel. Derives a
// prioritized list of concrete actions a human would take, grouped
// by category (Revenue / Leads / Content / Security / Affiliate)
// so the operator can scan by area. Each action has a status icon
// and a button. Data-driven, not a static list.
// ─────────────────────────────────────────────────────────────
const CATEGORY_META = {
  revenue: { label: "Revenue", Icon: DollarSign, color: "#0F6CBD" },
  leads: { label: "Leads", Icon: Inbox, color: "#059669" },
  content: { label: "Content", Icon: FileText, color: "#7c3aed" },
  security: { label: "Security", Icon: Shield, color: "#dc2626" },
  affiliate: { label: "Affiliate", Icon: Link2, color: "#b45309" },
};

function AttentionPanel({ data }) {
  const leadsNew = Number(data["leads-inbox"]?.counts?.new || 0);
  const blogFailures = Number(data["blog-engine-health"]?.consecutiveFailures || 0);
  const unconfiguredAffiliate = (data["affiliate-setup"]?.programs || []).filter((p) => !p.configured).length;
  const certIssues = (data["opsec-data"]?.certChecks || []).filter((c) => !c.ok).length;
  const deliverable = Number(data["leadgen-status"]?.emails?.deliverable || 0);
  const campaigns = data["leadgen-campaigns"]?.rows || [];
  const duplicateGroups = (data["content-hygiene"]?.duplicateGroups || []).length;

  // Build categorized actions. Each: { cat, state, Icon, color, text, to, label }
  const items = [];
  if (deliverable > 0 && campaigns.length === 0) {
    items.push({
      cat: "revenue", state: "warn", Icon: AlertTriangle, color: "#0F6CBD",
      text: <><CountUp value={deliverable} /> emails ready — launch your first campaign</>,
      to: "/portal/ops?tab=campaigns", label: "Build Campaign",
    });
  }
  if (leadsNew > 0) {
    items.push({
      cat: "leads", state: "warn", Icon: AlertTriangle, color: "#059669",
      text: <><CountUp value={leadsNew} /> new lead{leadsNew === 1 ? "" : "s"} need{leadsNew === 1 ? "s" : ""} a reply</>,
      to: "/portal/ops?tab=leads", label: "Open Leads",
    });
  }
  if (blogFailures >= 2) {
    items.push({
      cat: "content", state: "bad", Icon: XCircle, color: "#dc2626",
      text: <>Blog auto-publish failed <CountUp value={blogFailures} /> days in a row</>,
      to: "/portal/ops?tab=blog-health", label: "View Blog Health",
    });
  }
  if (duplicateGroups > 0) {
    items.push({
      cat: "content", state: "warn", Icon: AlertTriangle, color: "#7c3aed",
      text: <><CountUp value={duplicateGroups} /> duplicate-slug post{duplicateGroups === 1 ? "" : "s"} detected</>,
      to: "/portal/ops?tab=content", label: "View Content",
    });
  }
  if (certIssues > 0) {
    items.push({
      cat: "security", state: "bad", Icon: XCircle, color: "#dc2626",
      text: <><CountUp value={certIssues} /> domain{certIssues === 1 ? "" : "s"} have cert issues</>,
      to: "/portal/opsec", label: "View OpSec",
    });
  }
  if (unconfiguredAffiliate > 0) {
    items.push({
      cat: "affiliate", state: "warn", Icon: AlertTriangle, color: "#b45309",
      text: <><CountUp value={unconfiguredAffiliate} /> affiliate program{unconfiguredAffiliate === 1 ? "" : "s"} unconfigured</>,
      to: "/portal/ops?tab=affiliate", label: "Set up Affiliate",
    });
  }

  // Group by category, preserving a stable order.
  const order = ["revenue", "leads", "content", "security", "affiliate"];
  const groups = order
    .map((cat) => ({ cat, meta: CATEGORY_META[cat], rows: items.filter((i) => i.cat === cat) }))
    .filter((g) => g.rows.length > 0);

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
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {groups.map((group, gi) => (
            <div key={group.cat} className="ops-attention-group">
              <div className="ops-attention-group__head">
                <group.meta.Icon size={14} style={{ color: group.meta.color }} />
                <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: "0.04em", textTransform: "uppercase", color: group.meta.color }}>
                  {group.meta.label}
                </span>
                <span style={{ fontSize: 12, opacity: 0.6 }}>{group.rows.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {group.rows.map((item, i) => (
                  <motion.div
                    key={`${group.cat}-${i}`}
                    className="ops-attention-row"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, delay: 0.1 + gi * 0.05 + i * 0.03, ease: "easeOut" }}
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
            </div>
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
// Recent jobs — real operational data, made scannable. Shows
// summary chips (total / done / failed / running), a DaisyUI-style
// dropdown to filter by kind, and a clean table. Failed jobs sort
// to the top and are highlighted in red.
// ─────────────────────────────────────────────────────────────
const KIND_LABELS = {
  osm_zip: "ZIP crawl",
  website_emails: "Email finder",
  leadgen_crawl: "Leadgen crawl",
  email_enrich: "Email enrich",
  default: "Job",
};

function RecentJobsPanel({ data, errors }) {
  const allJobs = [...(data["admin-status"]?.recent_jobs || [])];
  const [kindFilter, setKindFilter] = useState("All kinds");

  const kinds = ["All kinds", ...Array.from(new Set(allJobs.map((j) => j.kind).filter(Boolean)))];
  const jobs = allJobs
    .filter((j) => kindFilter === "All kinds" || j.kind === kindFilter)
    .sort((a, b) => {
      const af = a.status === "failed" ? 0 : 1;
      const bf = b.status === "failed" ? 0 : 1;
      if (af !== bf) return af - bf;
      return new Date(b.created_at) - new Date(a.created_at);
    });

  const total = allJobs.length;
  const done = allJobs.filter((j) => j.status === "done").length;
  const failed = allJobs.filter((j) => j.status === "failed").length;
  const running = allJobs.filter((j) => j.status === "running" || j.status === "queued").length;

  return (
    <Panel wide>
      <div className="ops-panel__head">
        <h2>Recent jobs</h2>
        <SignalPill state={errors["admin-status"] ? "bad" : "good"}>{errors["admin-status"] || "admin-status"}</SignalPill>
      </div>

      {/* Summary chips */}
      <div className="ops-job-summary" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <span className="ops-job-chip"><Activity size={13} /> {fmtNumber(total)} total</span>
        <span className="ops-job-chip ops-job-chip--good"><CheckCircle2 size={13} /> {fmtNumber(done)} done</span>
        {failed > 0 ? <span className="ops-job-chip ops-job-chip--bad"><XCircle size={13} /> {fmtNumber(failed)} failed</span> : null}
        {running > 0 ? <span className="ops-job-chip ops-job-chip--warn"><AlertTriangle size={13} /> {fmtNumber(running)} running</span> : null}
      </div>

      {/* DaisyUI-style kind filter */}
      <div style={{ marginBottom: 12 }}>
        <BrandDropdown
          label="Filter"
          value={kindFilter}
          options={kinds}
          onChange={setKindFilter}
        />
      </div>

      <Table
        columns={["ID", "Kind", "Status", "Progress", "Created", "Output"]}
        rows={jobs}
        empty="No leadgen jobs have run yet."
        renderRow={(row) => (
          <tr key={row.id || row.error} style={row.status === "failed" ? { background: "color-mix(in srgb, #dc2626 6%, transparent)" } : undefined}>
            <td>{row.id || "-"}</td>
            <td>
              <span className="ops-kind-badge">{KIND_LABELS[row.kind] || row.kind || "-"}</span>
            </td>
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
