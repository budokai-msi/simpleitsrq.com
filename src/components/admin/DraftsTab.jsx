import { useEffect, useState } from "react";
import {
  FileText,
} from "lucide-react";
import { EmptyState, SignalPill, Table, fmtTime, getJson } from "./shared";

export default function DraftsTab({ drafts, errors, busy, runAction }) {
  const pending = drafts.filter((d) => d.status === "draft");

  // Content hygiene: duplicate-slug detection. Fetched on mount (GET action).
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
        {errors.drafts ? <EmptyState>{errors.drafts}</EmptyState> : null}
        <Table
          columns={["Title", "Status", "Category", "Created", "Actions"]}
          rows={drafts}
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
