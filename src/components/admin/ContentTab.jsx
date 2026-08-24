import {
  AlertTriangle,
  BookOpen,
} from "lucide-react";
import { EmptyState, SignalPill, Table, fmtNumber } from "./shared";

function ContentTab({ data, error }) {
  const topPosts = data?.topPosts || [];
  const entryPosts = data?.entryPosts || [];
  const converters = data?.exitToBook || [];
  const searches = data?.searchTerms || [];
  const stale = data?.stalePosts || [];

  return (
    <div className="ops-grid">
      {error ? <EmptyState>{error}</EmptyState> : null}

      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Top posts (30d)</h2><BookOpen size={16} /></div>
        <Table
          columns={["Post", "Views", "Unique", "Avg dwell", "Max scroll"]}
          rows={topPosts}
          empty="No blog engagement recorded in the last 30 days."
          renderRow={(row) => (
            <tr key={row.slug}>
              <td className="ops-path-cell"><a href={`/blog/${row.slug}`} target="_blank" rel="noreferrer">{row.slug}</a></td>
              <td>{fmtNumber(row.views)}</td>
              <td>{fmtNumber(row.unique_visitors)}</td>
              <td>{row.avg_dwell_sec != null ? `${row.avg_dwell_sec}s` : "-"}</td>
              <td>{row.max_scroll_pct != null ? `${row.max_scroll_pct}%` : "-"}</td>
            </tr>
          )}
        />
      </section>

      <section className="admin-aff-card ops-panel">
        <div className="ops-panel__head"><h2>Blog → booking paths</h2></div>
        <p className="ops-panel__copy">Posts read before a /book or /contact visit. These are your money posts — keep them fresh and interlinked.</p>
        <Table
          columns={["Post", "Visitors who booked"]}
          rows={converters}
          empty="No blog-to-booking journeys recorded yet."
          renderRow={(row) => (
            <tr key={row.path}>
              <td className="ops-path-cell">{row.path}</td>
              <td><SignalPill state={Number(row.visitors_who_booked) > 0 ? "good" : "neutral"}>{fmtNumber(row.visitors_who_booked)}</SignalPill></td>
            </tr>
          )}
        />
      </section>

      <section className="admin-aff-card ops-panel">
        <div className="ops-panel__head"><h2>Blog entry pages (30d)</h2></div>
        <Table
          columns={["Landing post", "Entries", "Bounce rate", "Avg dwell"]}
          rows={entryPosts}
          empty="No blog entries recorded yet."
          renderRow={(row) => {
            const bounceRate = row.total_sessions > 0 ? Math.round((row.bounces / row.total_sessions) * 100) : 0;
            return (
              <tr key={row.landing_path}>
                <td className="ops-path-cell">{row.landing_path}</td>
                <td>{fmtNumber(row.entries)}</td>
                <td><SignalPill state={bounceRate > 60 ? "warn" : "good"}>{bounceRate}%</SignalPill></td>
                <td>{row.avg_dwell_sec != null ? `${row.avg_dwell_sec}s` : "-"}</td>
              </tr>
            );
          }}
        />
      </section>

      <section className="admin-aff-card ops-panel">
        <div className="ops-panel__head"><h2>On-site searches (30d)</h2></div>
        <p className="ops-panel__copy">What visitors look for that they can't find by browsing. Unanswered searches are content ideas.</p>
        <Table
          columns={["Query", "Searches"]}
          rows={searches}
          empty="No site searches recorded yet."
          renderRow={(row) => (
            <tr key={row.query}>
              <td>{row.query}</td>
              <td>{fmtNumber(row.searches)}</td>
            </tr>
          )}
        />
      </section>

      {stale.length ? (
        <section className="admin-aff-card ops-panel ops-panel--wide">
          <div className="ops-panel__head"><h2>Traffic dropping — refresh candidates</h2><AlertTriangle size={16} /></div>
          <p className="ops-panel__copy">These posts lost 50%+ of their views vs the prior 30 days. Updating them (new info, internal links to new posts) is the cheapest SEO win available.</p>
          <Table
            columns={["Post", "Last 30d views", "Prior 30d", "Change"]}
            rows={stale}
            renderRow={(row) => {
              const change = row.prior_views > 0 ? Math.round(((row.recent_views - row.prior_views) / row.prior_views) * 100) : 0;
              return (
                <tr key={row.slug}>
                  <td className="ops-path-cell"><a href={`/blog/${row.slug}`} target="_blank" rel="noreferrer">{row.slug}</a></td>
                  <td>{fmtNumber(row.recent_views)}</td>
                  <td>{fmtNumber(row.prior_views)}</td>
                  <td><SignalPill state="bad">{change}%</SignalPill></td>
                </tr>
              );
            }}
          />
        </section>
      ) : null}
    </div>
  );
}

