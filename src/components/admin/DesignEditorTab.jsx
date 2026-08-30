// src/components/admin/DesignEditorTab.jsx
//
// Admin design-system editor. Lets the sole admin edit the site's design
// tokens (CSS custom properties from src/index.css) at runtime via the
// design-token-override store (design-token-list / design-token-save /
// design-token-delete). Overrides are injected site-wide by the
// useDesignTokens() hook and fall back to the hardcoded token until an
// override is saved here.

import { useEffect, useMemo, useState } from "react";
import { Palette, RotateCcw, Save } from "lucide-react";
import { getJson, postJson, SignalPill } from "./shared";

const CATEGORIES = [
  ["all", "All"],
  ["color", "Color"],
  ["spacing", "Spacing"],
  ["radius", "Radius"],
  ["shadow", "Shadow"],
  ["easing", "Easing"],
  ["font", "Font"],
  ["effect", "Effect"],
];

const THEMES = [
  ["both", "Both"],
  ["light", "Light"],
  ["dark", "Dark"],
];

export default function DesignEditorTab({ data, busy, runAction }) {
  const [known, setKnown] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [category, setCategory] = useState("all");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const res = await getJson("design-token-list");
      setKnown(res.known || []);
      setOverrides(res.tokens || []);
      setError("");
    } catch (e) {
      setError(String(e.message || e));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const overrideMap = useMemo(() => {
    const map = {};
    for (const o of overrides) map[o.token] = o;
    return map;
  }, [overrides]);

  const rows = useMemo(() => {
    const list = known.map((k) => ({
      ...k,
      value: overrideMap[k.token]?.value ?? "",
      theme: overrideMap[k.token]?.theme ?? "both",
      hasOverride: Boolean(overrideMap[k.token]),
    }));
    if (category === "all") return list;
    return list.filter((r) => r.category === category);
  }, [known, overrideMap, category]);

  const save = async (token, value, theme) => {
    try {
      await postJson("design-token-save", { token, value, theme });
      await load();
    } catch (e) {
      setError(String(e.message || e));
    }
  };

  const remove = async (token) => {
    try {
      await postJson("design-token-delete", { token });
      await load();
    } catch (e) {
      setError(String(e.message || e));
    }
  };

  return (
    <section className="admin-aff-card ops-panel ops-panel--wide">
      <div className="ops-panel__head">
        <h2><Palette size={16} /> Design Editor</h2>
        <SignalPill state={overrides.length ? "good" : "neutral"}>
          {overrides.length} token overrides
        </SignalPill>
      </div>
      <p className="ops-panel__copy">
        Edit the site's design tokens (colors, spacing, radius, shadows, easing, fonts, effects). Overrides are injected site-wide and fall back to the defaults until you save one here.
      </p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <label className="ops-field-label" htmlFor="de-category" style={{ margin: 0 }}>
          Category
        </label>
        <select
          id="de-category"
          className="ops-input"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{ maxWidth: 200 }}
        >
          {CATEGORIES.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
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
              <th>Token</th>
              <th>Value</th>
              <th>Theme</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} style={{ color: "var(--syn-text-muted, #6b7280)" }}>
                  No tokens in this category.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <TokenRow
                key={row.token}
                row={row}
                busy={busy}
                onSave={save}
                onDelete={remove}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TokenRow({ row, busy, onSave, onDelete }) {
  const [value, setValue] = useState(row.value);
  const [theme, setTheme] = useState(row.theme);
  useEffect(() => setValue(row.value), [row.value]);
  useEffect(() => setTheme(row.theme), [row.theme]);

  const isColor = row.category === "color";
  const swatch = isColor && value ? (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: 18,
        height: 18,
        borderRadius: 5,
        border: "1px solid var(--border)",
        background: value,
        marginRight: 8,
        verticalAlign: "middle",
        flexShrink: 0,
      }}
    />
  ) : null;

  return (
    <tr>
      <td>
        <div style={{ display: "flex", alignItems: "center" }}>
          {swatch}
          <div>
            <code style={{ fontFamily: "var(--font-mono, ui-monospace, Menlo, monospace)" }}>{row.token}</code>
            <div style={{ fontSize: 12, color: "var(--syn-text-muted, #6b7280)" }}>{row.label}</div>
          </div>
        </div>
      </td>
      <td>
        <input
          className="ops-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={{ width: "100%" }}
        />
      </td>
      <td>
        <select
          className="ops-input"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          style={{ minWidth: 90 }}
        >
          {THEMES.map(([t, label]) => (
            <option key={t} value={t}>{label}</option>
          ))}
        </select>
      </td>
      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        <button
          className="btn btn-primary btn-sm"
          type="button"
          onClick={() => onSave(row.token, value, theme)}
          disabled={busy === "design-token-save"}
        >
          <Save size={14} /> Save
        </button>
        <button
          className="btn btn-secondary btn-sm"
          type="button"
          onClick={() => onDelete(row.token)}
          disabled={busy === "design-token-delete" || !row.hasOverride}
          style={{ marginLeft: 6 }}
        >
          <RotateCcw size={14} /> Reset
        </button>
      </td>
    </tr>
  );
}
