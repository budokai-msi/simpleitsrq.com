import {
  Activity,
  Eye,
  RadioTower,
  Search,
  Target,
} from "lucide-react";
import { EmptyState, HotLeadsPanel, LeadIntelPanels, Metric, SignalPill, Table, fmtDuration, fmtNumber, fmtTime } from "./shared";

export default function VisitorsTab({ data, hotLeads, leadIntel, errors }) {
  const totals = data?.totals || {};
  const situationFunnel = data?.situationFunnel || {};
  const engagedRate = totals.sessions14d
    ? Math.round((Number(totals.engaged14d || 0) / Number(totals.sessions14d || 1)) * 100)
    : 0;
  return (
    <div className="ops-grid">
      <HotLeadsPanel hotLeads={hotLeads} error={errors["hot-leads"]} />
      <LeadIntelPanels leadIntel={leadIntel} error={errors["lead-intel"]} />
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head">
          <h2>Live visitor intent</h2>
          <SignalPill state={totals.liveSessions ? "good" : "neutral"}>{fmtNumber(totals.liveSessions)} live</SignalPill>
        </div>
        <p className="ops-panel__copy">
          {data?.privacy?.note || "Field telemetry stores intent signals, not raw private form contents."}
        </p>
        {errors["behavior-insights"] ? <EmptyState>{errors["behavior-insights"]}</EmptyState> : null}
        <div className="ops-metric-grid">
          <Metric label="Live sessions" value={fmtNumber(totals.liveSessions)} hint="active in 30 min" />
          <Metric label="14d sessions" value={fmtNumber(totals.sessions14d)} />
          <Metric label="14d visitors" value={fmtNumber(totals.visitors14d)} />
          <Metric label="Engaged rate" value={`${engagedRate}%`} hint={`${fmtNumber(totals.engaged14d)} engaged`} />
        </div>
      </section>

      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Active sessions</h2><RadioTower size={16} /></div>
        <Table
          columns={["Last", "Interest", "Current page", "Pages", "Dwell", "Scroll", "Location", "Last action"]}
          rows={data?.liveSessions || []}
          empty="No active sessions in the last 30 minutes."
          renderRow={(row) => (
            <tr key={row.id}>
              <td>{fmtTime(row.lastActivity)}</td>
              <td><SignalPill state={row.engaged ? "good" : "neutral"}>{row.interest || "General site"}</SignalPill></td>
              <td className="ops-path-cell">{row.exitPath || row.landingPath || "-"}</td>
              <td>{fmtNumber(row.pageCount)}</td>
              <td>{fmtDuration(row.totalDwellMs)}</td>
              <td>{fmtNumber(row.maxScrollPct)}%</td>
              <td>{[row.city, row.region, row.country].filter(Boolean).join(", ") || "-"}</td>
              <td>{row.lastEventKind || "-"}</td>
            </tr>
          )}
        />
      </section>

      <section className="admin-aff-card ops-panel">
        <div className="ops-panel__head"><h2>Product interest</h2></div>
        <Table
          columns={["Area", "Views", "Visitors", "Sessions"]}
          rows={data?.interests || []}
          empty="No interest data yet."
          renderRow={(row) => (
            <tr key={row.interest}>
              <td><strong>{row.interest}</strong></td>
              <td>{fmtNumber(row.views)}</td>
              <td>{fmtNumber(row.visitors)}</td>
              <td>{fmtNumber(row.sessions)}</td>
            </tr>
          )}
        />
      </section>

      <section className="admin-aff-card ops-panel">
        <div className="ops-panel__head"><h2>Retention</h2></div>
        <Table
          columns={["Day", "Sessions", "Visitors", "Engaged", "Avg pages", "Avg dwell"]}
          rows={data?.retention || []}
          empty="No retention data yet."
          renderRow={(row) => (
            <tr key={row.day}>
              <td>{row.day}</td>
              <td>{fmtNumber(row.sessions)}</td>
              <td>{fmtNumber(row.visitors)}</td>
              <td>{fmtNumber(row.engaged_sessions)}</td>
              <td>{row.avg_pages || "-"}</td>
              <td>{row.avg_dwell_sec ? `${row.avg_dwell_sec}s` : "-"}</td>
            </tr>
          )}
        />
      </section>

      <section className="admin-aff-card ops-panel">
        <div className="ops-panel__head"><h2>Core Web Vitals (14d)</h2><Activity size={16} /></div>
        <p className="ops-panel__copy">Real-user performance from the web-vitals library. P75 thresholds: LCP 2500ms, INP 200ms, CLS 0.1.</p>
        <Table
          columns={["Metric", "Samples", "Avg", "P75", "Good", "Needs work", "Poor"]}
          rows={data?.vitals || []}
          empty="No vitals data yet — collects once visitors opt in to analytics."
          renderRow={(row) => {
            const poor = Number(row.poor || 0);
            const total = Math.max(Number(row.samples || 1), 1);
            return (
              <tr key={row.metric}>
                <td><strong>{row.metric}</strong></td>
                <td>{fmtNumber(row.samples)}</td>
                <td>{fmtNumber(row.avg_value)}{row.metric === "CLS" ? "" : "ms"}</td>
                <td>{fmtNumber(row.p75)}{row.metric === "CLS" ? "" : "ms"}</td>
                <td><SignalPill state={poor / total > 0.15 ? "warn" : "good"}>{fmtNumber(row.good)}</SignalPill></td>
                <td>{fmtNumber(row.ni)}</td>
                <td><SignalPill state={poor / total > 0.15 ? "bad" : "neutral"}>{fmtNumber(poor)}</SignalPill></td>
              </tr>
            );
          }}
        />
      </section>

      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Homepage situation funnel (14d)</h2><Target size={16} /></div>
        <div className="ops-metric-grid">
          <Metric label="First interactions" value={fmtNumber(situationFunnel.first_interactions)} />
          <Metric label="Scenario switches" value={fmtNumber(situationFunnel.switches)} />
          <Metric label="CTA clicks" value={fmtNumber(situationFunnel.cta_clicks)} />
          <Metric label="Primary CTA" value={fmtNumber(situationFunnel.primary_cta_clicks)} hint="Book support" />
          <Metric label="Secondary CTA" value={fmtNumber(situationFunnel.secondary_cta_clicks)} hint="See services" />
        </div>
      </section>

      <section className="admin-aff-card ops-panel">
        <div className="ops-panel__head"><h2>Scenario performance</h2></div>
        <Table
          columns={["Scenario", "Switches", "CTA clicks", "Primary", "Secondary"]}
          rows={data?.situationByScenario || []}
          empty="No scenario interaction data yet."
          renderRow={(row) => (
            <tr key={row.scenario_id}>
              <td><strong>{row.scenario_id || "unknown"}</strong></td>
              <td>{fmtNumber(row.switches)}</td>
              <td>{fmtNumber(row.cta_clicks)}</td>
              <td>{fmtNumber(row.primary_clicks)}</td>
              <td>{fmtNumber(row.secondary_clicks)}</td>
            </tr>
          )}
        />
      </section>

      <section className="admin-aff-card ops-panel">
        <div className="ops-panel__head"><h2>Recent funnel events</h2></div>
        <Table
          columns={["Time", "Event", "Scenario", "Detail"]}
          rows={data?.situationRecent || []}
          empty="No recent funnel events yet."
          renderRow={(row, index) => (
            <tr key={`${row.ts}-${index}`}>
              <td>{fmtTime(row.ts)}</td>
              <td>{row.kind || "-"}</td>
              <td>{row.meta?.scenario_id || row.meta?.selected_scenario || row.value_text || "-"}</td>
              <td>{row.meta?.cta_kind || (row.meta?.from_scenario && row.meta?.to_scenario ? `${row.meta.from_scenario} → ${row.meta.to_scenario}` : "-")}</td>
            </tr>
          )}
        />
      </section>

      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>On-site searches</h2><Search size={16} /></div>
        <Table
          columns={["Time", "Query", "Results", "Page", "Interest", "Location"]}
          rows={data?.searchTerms || []}
          empty="No site searches recorded yet."
          renderRow={(row, index) => (
            <tr key={`${row.ts}-${row.query}-${index}`}>
              <td>{fmtTime(row.ts)}</td>
              <td><strong>{row.query || "-"}</strong></td>
              <td>{row.result_count != null ? fmtNumber(row.result_count) : "-"}</td>
              <td className="ops-path-cell">{row.path || "-"}</td>
              <td>{row.interest || "-"}</td>
              <td>{[row.city, row.region, row.country].filter(Boolean).join(", ") || "-"}</td>
            </tr>
          )}
        />
      </section>

      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Typing and form intent</h2><Eye size={16} /></div>
        <Table
          columns={["Time", "Interest", "Page", "Form", "Field", "Length"]}
          rows={data?.typedSignals || []}
          empty="No form focus or typing-intent events yet."
          renderRow={(row, index) => (
            <tr key={`${row.ts}-${index}`}>
              <td>{fmtTime(row.ts)}</td>
              <td>{row.interest || "-"}</td>
              <td className="ops-path-cell">{row.path || "-"}</td>
              <td>{row.meta?.form || "-"}</td>
              <td><strong>{row.meta?.field || row.value_text || "-"}</strong></td>
              <td>{row.value_num != null ? fmtNumber(row.value_num) : "-"}</td>
            </tr>
          )}
        />
      </section>

      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Top forms</h2></div>
        <Table
          columns={["Form", "Field", "Events", "Sessions", "Last seen"]}
          rows={data?.topForms || []}
          empty="No form-level activity yet."
          renderRow={(row) => (
            <tr key={`${row.form}-${row.field}`}>
              <td>{row.form}</td>
              <td><strong>{row.field}</strong></td>
              <td>{fmtNumber(row.events)}</td>
              <td>{fmtNumber(row.sessions)}</td>
              <td>{fmtTime(row.last_seen)}</td>
            </tr>
          )}
        />
      </section>

      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Page depth</h2></div>
        <Table
          columns={["Path", "Exits", "Avg dwell", "Avg scroll", "Clicks"]}
          rows={data?.contentDepth || []}
          empty="No page-depth events yet."
          renderRow={(row) => (
            <tr key={row.path}>
              <td className="ops-path-cell">{row.path}</td>
              <td>{fmtNumber(row.exits)}</td>
              <td>{row.avg_dwell_sec ? `${row.avg_dwell_sec}s` : "-"}</td>
              <td>{row.avg_scroll ? `${row.avg_scroll}%` : "-"}</td>
              <td>{fmtNumber(row.clicks)}</td>
            </tr>
          )}
        />
      </section>
    </div>
  );
}

