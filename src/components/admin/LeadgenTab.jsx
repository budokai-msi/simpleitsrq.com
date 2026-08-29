import { Link } from "react-router-dom";
import { Metric, SignalPill, Table, fmtNumber, fmtTime, formatJobOutput, formatJobProgress } from "./shared";

export default function LeadgenTab({ status }) {
  return (
    <div className="ops-grid">
      <section className="admin-aff-card ops-panel">
        <div className="ops-panel__head"><h2>Pipeline</h2><Link className="btn btn-primary btn-sm" to="/portal/leadgen">Open workspace</Link></div>
        <div className="ops-metric-grid">
          <Metric label="Businesses" value={fmtNumber(status?.businesses?.total)} hint={`${fmtNumber(status?.businesses?.with_website)} with website`} />
          <Metric label="Deliverable emails" value={fmtNumber(status?.emails?.deliverable)} />
          <Metric label="Campaigns" value={fmtNumber(status?.campaigns?.total)} hint={`${fmtNumber(status?.campaigns?.running)} running`} />
          <Metric label="Replies" value={fmtNumber(status?.sends?.replied)} />
        </div>
      </section>
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Recent crawl jobs</h2></div>
        <Table
          columns={["ID", "Kind", "Status", "Progress", "Created", "Output"]}
          rows={status?.recent_jobs || []}
          empty="No leadgen jobs yet."
          renderRow={(row) => (
            <tr key={row.id}>
              <td>{row.id}</td>
              <td>{row.kind}</td>
              <td><SignalPill state={row.status === "failed" ? "bad" : row.status === "done" ? "good" : "neutral"}>{row.status}</SignalPill></td>
              <td>{formatJobProgress(row)}</td>
              <td>{fmtTime(row.created_at)}</td>
              <td>{formatJobOutput(row)}</td>
            </tr>
          )}
        />
      </section>
    </div>
  );
}

