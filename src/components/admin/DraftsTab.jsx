import {
  FileText,
} from "lucide-react";
import { EmptyState, SignalPill, Table, fmtTime } from "./shared";

function DraftsTab({ drafts, errors, busy, runAction }) {
  const pending = drafts.filter((d) => d.status === "draft");
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
    </div>
  );
}

