// src/components/admin/ContentEditorTab.jsx
//
// Admin content editor. Lets the sole admin edit the text on any page via
// the content-override store (content-list / content-save / content-delete).
// Pages render overrides through the useContent() hook and fall back to
// their hardcoded copy until an override is saved here.
//
// Every save is dual-written: it lands in Neon (authoritative) AND is pushed
// to content/overrides.json on GitHub (best-effort), which triggers Vercel's
// auto-deploy. This tab surfaces the last GitHub sync time, lets the admin
// attach an editor note per save, and lists the audit/history trail.

import { useEffect, useMemo, useState } from "react";
import { FileText, History, Plus, RotateCcw, Save, Send } from "lucide-react";
import { getJson, postJson, SignalPill, fmtTime } from "./shared";
import { getManifest } from "../../lib/useContent";

const KNOWN_PAGES = [
  "home",
  "services",
  "book",
  "support",
  "leadgen",
  "stack",
  "tools",
  "exposure-scan",
  "compare",
  "glossary",
  "legal",
  "about",
  "contact",
];

// Mask an admin email so we never surface the raw owner address in the UI.
function maskEmail(email) {
  if (!email) return "Owner";
  const s = String(email);
  const at = s.indexOf("@");
  if (at <= 1) return s.replace(/(.).+(@.+)/, "$1***$2");
  const local = s.slice(0, at);
  const domain = s.slice(at);
  return `${local[0]}${local.length > 2 ? "*".repeat(Math.min(3, local.length - 2)) : ""}${local[local.length - 1]}${domain}`;
}

export default function ContentEditorTab({ data, busy, runAction }) {
  const [overrides, setOverrides] = useState([]);
  const [page, setPage] = useState("home");
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newNote, setNewNote] = useState("");
  const [stats, setStats] = useState({ total: 0, countsByPage: {} });
  const [lastSync, setLastSync] = useState(null);
  const [revisions, setRevisions] = useState([]);
  const [error, setError] = useState("");
  const [publishMsg, setPublishMsg] = useState("");

  const load = async () => {
    try {
      const [listRes, manifest, revRes] = await Promise.all([
        getJson("content-list"),
        getManifest(),
        getJson("content-revisions"),
      ]);
      setOverrides(listRes.overrides || []);
      setStats({ total: listRes.total || 0, countsByPage: listRes.countsByPage || {} });
      setLastSync(manifest?.updated_at || null);
      setRevisions(revRes.revisions || []);
      setError("");
    } catch (e) {
      setError(String(e.message || e));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const pageOverrides = useMemo(
    () => overrides.filter((o) => o.page === page),
    [overrides, page],
  );

  const save = async (key, value, note = "", publish = false) => {
    try {
      await postJson("content-save", { page, key, value, editor_note: note, publish });
      await load();
    } catch (e) {
      setError(String(e.message || e));
    }
  };

  const remove = async (key, publish = false) => {
    try {
      await postJson("content-delete", { page, key, publish });
      await load();
    } catch (e) {
      setError(String(e.message || e));
    }
  };

  const add = async (publish = false) => {
    if (!newKey.trim()) return;
    await save(newKey.trim(), newValue, newNote, publish);
    setNewKey("");
    setNewValue("");
    setNewNote("");
  };

  const publishAll = async () => {
    try {
      await postJson("content-publish", {});
      setPublishMsg("Published — all changes committed to GitHub and Vercel deploy triggered.");
      setError("");
      await load();
    } catch (e) {
      setPublishMsg("");
      setError(String(e.message || e));
    }
  };

  return (
    <section className="admin-aff-card ops-panel ops-panel--wide">
      <div className="ops-panel__head">
        <h2><FileText size={16} /> Content Editor</h2>
        <SignalPill state={overrides.length ? "good" : "neutral"}>
          {stats.total} overrides across {Object.keys(stats.countsByPage).length} pages
        </SignalPill>
      </div>
      <p className="ops-panel__copy">
        Edit the text on any page. Pages fall back to their hardcoded copy until you save an override here.
        Saving is draft-only by default — changes are live on page load but not deployed. Click <strong>Publish
        all pending</strong> to commit every draft to GitHub and trigger a Vercel deploy.
      </p>

      <div
        className="ops-panel__copy"
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          margin: "0 0 12px",
          padding: 12,
          border: "1px solid var(--syn-border, #e5e7eb)",
          borderRadius: 8,
          flexWrap: "wrap",
        }}
      >
        <button
          className="btn btn-primary btn-sm"
          type="button"
          onClick={publishAll}
          disabled={busy === "content-publish"}
        >
          <Send size={14} /> Publish all pending
        </button>
        <SignalPill state={publishMsg ? "good" : "neutral"}>
          {publishMsg ? "Published" : "Draft mode"}
        </SignalPill>
        <span style={{ fontSize: 13 }}>
          {publishMsg
            ? publishMsg
            : "Changes deploy when you click Publish — they are saved to the database now without touching GitHub or Vercel."}
        </span>
      </div>

      <p className="ops-panel__copy" style={{ display: "flex", gap: 8, alignItems: "center", margin: "0 0 12px" }}>
        <SignalPill state={lastSync ? "good" : "neutral"}>Last publish</SignalPill>
        <span style={{ fontSize: 13 }}>
          {lastSync ? `Last published ${fmtTime(lastSync)} (content/overrides.json → Vercel auto-deploy)` : "Nothing published yet — drafts only."}
        </span>
      </p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <label className="ops-field-label" htmlFor="ce-page" style={{ margin: 0 }}>
          Page
        </label>
        <select
          id="ce-page"
          className="ops-input"
          value={page}
          onChange={(e) => setPage(e.target.value)}
          style={{ maxWidth: 220 }}
        >
          {KNOWN_PAGES.map((p) => (
            <option key={p} value={p}>{p} ({stats.countsByPage[p] || 0})</option>
          ))}
        </select>
      </div>

      {error && (
        <p role="alert" style={{ color: "#dc2626", fontSize: 13, margin: "0 0 12px" }}>
          {error}
        </p>
      )}

      <div className="ops-table-wrap">
        <table className="admin-aff-table ops-table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Value</th>
              <th>Editor note</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageOverrides.length === 0 && (
              <tr>
                <td colSpan={4} style={{ color: "var(--syn-text-muted, #6b7280)" }}>
                  No overrides for this page yet. Add one below.
                </td>
              </tr>
            )}
            {pageOverrides.map((o) => (
              <OverrideRow
                key={o.key}
                row={o}
                busy={busy}
                onSave={save}
                onDelete={remove}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>
        <input
          className="ops-input"
          placeholder="New key (e.g. hero_title)"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          style={{ flex: "1 1 160px" }}
        />
        <input
          className="ops-input"
          placeholder="Value"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          style={{ flex: "2 1 280px" }}
        />
        <input
          className="ops-input"
          placeholder="Editor note (optional)"
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          style={{ flex: "2 1 200px" }}
        />
        <button
          className="btn btn-primary btn-sm"
          type="button"
          onClick={() => add(false)}
          disabled={busy === "content-save" || !newKey.trim()}
        >
          <Plus size={14} /> Save draft
        </button>
        <button
          className="btn btn-secondary btn-sm"
          type="button"
          onClick={() => add(true)}
          disabled={busy === "content-save" || !newKey.trim()}
        >
          <Send size={14} /> Save & publish
        </button>
      </div>

      {revisions.length > 0 && (
        <>
          <div className="ops-panel__head" style={{ marginTop: 24 }}>
            <h2><History size={16} /> History</h2>
            <SignalPill state="neutral">{revisions.length} recent</SignalPill>
          </div>
          <div className="ops-table-wrap">
            <table className="admin-aff-table ops-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Kind</th>
                  <th>Key</th>
                  <th>Old → New</th>
                  <th>Editor</th>
                </tr>
              </thead>
              <tbody>
                {revisions.map((r) => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtTime(r.created_at)}</td>
                    <td><code>{r.kind === "design_token" ? "token" : r.kind}</code></td>
                    <td><code>{r.ref_key}</code></td>
                    <td style={{ maxWidth: 360, wordBreak: "break-word" }}>
                      {r.old_value || ""} → {r.new_value || ""}
                      {r.editor_note ? <span style={{ display: "block", color: "var(--syn-text-muted, #6b7280)" }}>{r.editor_note}</span> : null}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{maskEmail(r.created_by)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function OverrideRow({ row, busy, onSave, onDelete }) {
  const [value, setValue] = useState(row.value);
  const [note, setNote] = useState("");
  useEffect(() => setValue(row.value), [row.value]);

  return (
    <tr>
      <td><code>{row.key}</code></td>
      <td>
        <input
          className="ops-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={{ width: "100%" }}
        />
      </td>
      <td>
        <input
          className="ops-input"
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ width: "100%" }}
        />
      </td>
      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        <button
          className="btn btn-primary btn-sm"
          type="button"
          onClick={() => onSave(row.key, value, note, false)}
          disabled={busy === "content-save"}
        >
          <Save size={14} /> Save draft
        </button>
        <button
          className="btn btn-primary btn-sm"
          type="button"
          onClick={() => onSave(row.key, value, note, true)}
          disabled={busy === "content-save"}
          style={{ marginLeft: 6 }}
        >
          <Send size={14} /> Save & publish
        </button>
        <button
          className="btn btn-secondary btn-sm"
          type="button"
          onClick={() => onDelete(row.key, false)}
          disabled={busy === "content-delete"}
          style={{ marginLeft: 6 }}
        >
          <RotateCcw size={14} /> Reset
        </button>
        <button
          className="btn btn-secondary btn-sm"
          type="button"
          onClick={() => onDelete(row.key, true)}
          disabled={busy === "content-delete"}
          style={{ marginLeft: 6 }}
        >
          <RotateCcw size={14} /> Reset & publish
        </button>
      </td>
    </tr>
  );
}
