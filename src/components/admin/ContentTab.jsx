import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  FileText,
} from "lucide-react";
import { EmptyState, SignalPill, Table, fmtNumber, fmtTime, getJson } from "./shared";

export default function ContentTab({ data, error, drafts, errors, busy, runAction }) {
  const topPosts = data?.topPosts || [];
  const entryPosts = data?.entryPosts || [];
  const converters = data?.exitToBook || [];
  const searches = data?.searchTerms || [];
  const stale = data?.stalePosts || [];

  // Drafts + content hygiene (merged from the former Drafts tab).
  const pending = (drafts || []).filter((d) => d.status === "draft");
  const [hygiene, setHygiene] = useState(null);
  const [hygieneError, setHygieneError] = useState(null);
  useEffect(() => {
    let alive = true;
    getJson("content-hygiene")
      .then((res) => { if (alive) setHygiene(res); })
      .catch((e) => { if (alive) setHygieneError(String(e.message || e)); });
    return () => { alive = false; };
  }, []);
  const duplicateGroups = hygiene?.duplicateGroups || [];

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

      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2>Blog drafts</h2>
            <SignalPill state={pending.length ? "warn" : "good"}>{pending.length} pending</SignalPill>
          </div>
          <button
            className="btn btn-primary btn-sm"
            type="button"
            disabled={busy === "generate-blog-draft"}
            onClick={() => runAction("generate-blog-draft", {}, "New local blog draft generated!")}
          >
            <FileText size={14} /> Generate Local SEO Post
          </button>
        </div>
        {errors?.drafts ? <EmptyState>{errors.drafts}</EmptyState> : null}
        <Table
          columns={["Title", "Status", "Category", "Created", "Actions"]}
          rows={drafts || []}
          empty="No HN/local blog drafts yet."
          renderRow={(draft) => (
            <tr key={draft.id}>
              <td>
                <strong>{draft.title}</strong>
                <div className="admin-aff-slug">{draft.slug}</div>
              </td>
              <td><SignalPill state={draft.status === "published" ? "good" : draft.status === "rejected" ? "bad" : "warn"}>{draft.status}</SignalPill></td>
              <td>{draft.category || "-"}</td>
              <td>{fmtTime(draft.createdAt)}</td>
              <td className="ops-row-actions">
                {draft.status === "draft" ? (
                  <>
                    <button className="btn btn-secondary btn-sm" disabled={busy === "reject-draft"} onClick={() => runAction("reject-draft", { id: draft.id }, "Draft rejected.")}>Reject</button>
                    <button className="btn btn-primary btn-sm" disabled={busy === "publish-draft"} onClick={() => runAction("publish-draft", { id: draft.id }, "Draft published to GitHub.")}>Publish</button>
                  </>
                ) : null}
              </td>
            </tr>
          )}
        />
      </section>

      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head">
          <h2>Content hygiene</h2>
          <SignalPill state={duplicateGroups.length ? "bad" : "good"}>{duplicateGroups.length} duplicate groups</SignalPill>
        </div>
        <p className="ops-panel__copy">
          Posts whose slugs collide after stripping a trailing <span className="ops-mono">-NNNN</span> suffix. Duplicate slugs
          hurt SEO and confuse the publish pipeline — reject or rename the extras.
        </p>
        {hygieneError ? <EmptyState>{hygieneError}</EmptyState> : null}
        {!hygieneError && duplicateGroups.length === 0 ? <EmptyState>No duplicate-slug groups found.</EmptyState> : null}
        {duplicateGroups.length ? (
          <div className="ops-table-wrap">
            <table className="admin-aff-table ops-table">
              <thead>
                <tr><th>Base slug</th><th>Colliding slugs</th></tr>
              </thead>
              <tbody>
                {duplicateGroups.map((g) => (
                  <tr key={g.baseSlug}>
                    <td className="ops-mono">{g.baseSlug}</td>
                    <td>
                      {g.posts.map((p) => (
                        <div key={p.id} className="admin-aff-slug">
                          {p.slug} <SignalPill state={p.status === "published" ? "good" : p.status === "rejected" ? "bad" : "warn"}>{p.status}</SignalPill>
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}

