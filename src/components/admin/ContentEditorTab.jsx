// src/components/admin/ContentEditorTab.jsx
//
// Admin content editor. Lets the sole admin edit the text on any page via
// the content-override store (content-list / content-save / content-delete).
// Pages render overrides through the useContent() hook and fall back to
// their hardcoded copy until an override is saved here.

import { useEffect, useMemo, useState } from "react";
import { FileText, Plus, RotateCcw, Save } from "lucide-react";
import { getJson, postJson, SignalPill } from "./shared";

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

export default function ContentEditorTab({ data, busy, runAction }) {
  const [overrides, setOverrides] = useState([]);
  const [page, setPage] = useState("home");
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const res = await getJson("content-list");
      setOverrides(res.overrides || []);
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

  const save = async (key, value) => {
    try {
      await postJson("content-save", { page, key, value });
      await load();
    } catch (e) {
      setError(String(e.message || e));
    }
  };

  const remove = async (key) => {
    try {
      await postJson("content-delete", { page, key });
      await load();
    } catch (e) {
      setError(String(e.message || e));
    }
  };

  const add = async () => {
    if (!newKey.trim()) return;
    await save(newKey.trim(), newValue);
    setNewKey("");
    setNewValue("");
  };

  return (
    <section className="admin-aff-card ops-panel ops-panel--wide">
      <div className="ops-panel__head">
        <h2><FileText size={16} /> Content Editor</h2>
        <SignalPill state={overrides.length ? "good" : "neutral"}>
          {overrides.length} overrides
        </SignalPill>
      </div>
      <p className="ops-panel__copy">
        Edit the text on any page. Pages fall back to their hardcoded copy until you save an override here.
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
            <option key={p} value={p}>{p}</option>
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
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageOverrides.length === 0 && (
              <tr>
                <td colSpan={3} style={{ color: "var(--syn-text-muted, #6b7280)" }}>
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
          style={{ flex: "1 1 200px" }}
        />
        <input
          className="ops-input"
          placeholder="Value"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          style={{ flex: "2 1 300px" }}
        />
        <button
          className="btn btn-primary btn-sm"
          type="button"
          onClick={add}
          disabled={busy === "content-save" || !newKey.trim()}
        >
          <Plus size={14} /> Add
        </button>
      </div>
    </section>
  );
}

function OverrideRow({ row, busy, onSave, onDelete }) {
  const [value, setValue] = useState(row.value);
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
      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        <button
          className="btn btn-primary btn-sm"
          type="button"
          onClick={() => onSave(row.key, value)}
          disabled={busy === "content-save"}
        >
          <Save size={14} /> Save
        </button>
        <button
          className="btn btn-secondary btn-sm"
          type="button"
          onClick={() => onDelete(row.key)}
          disabled={busy === "content-delete"}
          style={{ marginLeft: 6 }}
        >
          <RotateCcw size={14} /> Reset
        </button>
      </td>
    </tr>
  );
}
