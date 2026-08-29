
import { Metric, SignalPill, Table, fmtNumber } from "./shared";

export default function AdsenseTab({ health }) {
  return (
    <div className="ops-grid">
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>AdSense health</h2><SignalPill state={health?.noData ? "warn" : "good"}>{health?.range || "7d"}</SignalPill></div>
        <p className="ops-panel__copy">{health?.headline || health?.hint || "No AdSense health response yet."}</p>
        <div className="ops-metric-grid">
          <Metric label="Sessions" value={fmtNumber(health?.summary?.sessions)} />
          <Metric label="Slots" value={fmtNumber(health?.summary?.totalSlots)} />
          <Metric label="Filled" value={`${health?.summary?.fillPct ?? 0}%`} />
          <Metric label="Blocked" value={`${health?.summary?.blockedPct ?? 0}%`} />
        </div>
      </section>
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Pages</h2></div>
        <Table
          columns={["Path", "Sessions", "Slots", "Filled", "Blocked", "Timeout"]}
          rows={health?.byPath || []}
          empty="No page-level AdSense beacons yet."
          renderRow={(row) => (
            <tr key={row.path}>
              <td>{row.path}</td>
              <td>{fmtNumber(row.sessions)}</td>
              <td>{fmtNumber(row.slots)}</td>
              <td>{fmtNumber(row.filled)}</td>
              <td>{fmtNumber(row.blocked)}</td>
              <td>{fmtNumber(row.timeout)}</td>
            </tr>
          )}
        />
      </section>
    </div>
  );
}

