// src/components/EditableText.jsx
//
// WordPress-style inline content editor. When the owner admin is signed in,
// every string rendered through `t()` becomes this editable span: a subtle
// dashed outline appears on hover (the "edit mode" affordance) and clicking
// (or pressing Enter/F2 on a focused span) swaps it for an inline input
// (short text) or a small inline textarea (long text).
//
// Edits are DB-only drafts by default: a save posts `content-save` with
// publish:false, so a change lands in Neon + the revision audit history but
// does NOT auto-deploy to production. The admin can still publish later via
// the Content Editor tab's publish action.
//
// Note on the key prop: React reserves `key` (and `ref`) and does not forward
// them to the component's props, so useContent passes the string key through
// a real, non-reserved prop named `refKey`. The `key: refKey` alias in the
// destructure is kept as a harmless fallback in case a caller supplies a key
// as a plain prop.
//
// All styling is inline — no CSS files are touched, and visitors (non-admin)
// never render this component at all.

import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { postJson } from "./admin/shared";

// Short text (< this many chars) edits inline with a single-line input;
// longer text gets a small auto-sizing textarea.
const MAX_INLINE = 60;

const EDIT_STYLE = {
  outline: "1px dashed rgba(99, 102, 241, 0.5)",
  outlineOffset: "2px",
  borderRadius: "2px",
  cursor: "text",
};

const PENCIL_STYLE = {
  display: "inline-block",
  marginLeft: "4px",
  fontSize: "0.8em",
  lineHeight: 1,
  opacity: 0.6,
  verticalAlign: "middle",
};

export default function EditableText({ page, key: keyAlias, refKey, fallback, value, onSave }) {
  // The string key uniquely identifying this text in the content store. See
  // the header note: React's reserved `key` prop is NOT forwarded to props,
  // so we rely on the explicit `refKey` prop supplied by useContent.
  const ref = refKey ?? keyAlias;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [display, setDisplay] = useState(value ?? fallback ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [hovered, setHovered] = useState(false);

  // Guards against blur-triggered double-saves (e.g. Enter fires save, then
  // the unmounting input emits a blur that would otherwise save again).
  const closedRef = useRef(false);

  const current = value ?? fallback ?? "";
  const isLong = String(current).length >= MAX_INLINE;

  // Follow external refreshes/re-fetches when the source value changes.
  useEffect(() => {
    if (!editing) setDisplay(value ?? fallback ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, fallback]);

  const startEdit = () => {
    closedRef.current = false;
    setDraft(current);
    setError("");
    setEditing(true);
  };

  const cancel = () => {
    closedRef.current = true;
    setEditing(false);
    setDraft("");
    setError("");
  };

  const save = async () => {
    if (closedRef.current) return;
    closedRef.current = true;
    setSaving(true);
    setError("");
    try {
      await postJson("content-save", { page, key: ref, value: draft, publish: false });
      setDisplay(draft);
      setEditing(false);
      if (typeof onSave === "function") {
        try { onSave(page, ref, draft); } catch { /* never throw on cache sync */ }
      }
    } catch (e) {
      setError("Couldn't save");
      setSaving(false);
      closedRef.current = false;
    }
  };

  const handleSpanKey = (e) => {
    if (e.key === "Enter" || e.key === "F2" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      startEdit();
    }
  };

  // ── inline editor rendering ────────────────────────────────────────────
  const editorStyle = isLong
    ? {
        fontSize: "inherit",
        fontFamily: "inherit",
        color: "inherit",
        width: "100%",
        minWidth: "16ch",
        boxSizing: "border-box",
        padding: "4px 6px",
      }
    : {
        fontSize: "inherit",
        fontFamily: "inherit",
        color: "inherit",
        width: "auto",
        minWidth: "10ch",
        boxSizing: "border-box",
        padding: "2px 4px",
        borderRadius: "4px",
      };

  if (editing) {
    if (isLong) {
      return (
        <span style={{ display: "inline-block", maxWidth: "min(90vw, 480px)", verticalAlign: "baseline" }}>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                save();
              }
            }}
            rows={Math.max(2, Math.min(6, Math.ceil(String(draft || "").length / 60)))}
            style={editorStyle}
            aria-label="Edit text"
          />
          <span style={{ display: "flex", gap: "6px", marginTop: "4px", alignItems: "center" }}>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              style={{ padding: "2px 8px", cursor: "pointer", fontSize: "12px" }}
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              style={{ padding: "2px 8px", cursor: "pointer", fontSize: "12px" }}
            >
              Cancel
            </button>
            {error ? <span style={{ color: "#dc2626", fontSize: "12px" }}>{error}</span> : null}
          </span>
        </span>
      );
    }
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        onBlur={() => {
          if (!closedRef.current) save();
        }}
        style={editorStyle}
        aria-label="Edit text"
      />
    );
  }

  // ── read/display mode (admin) ──────────────────────────────────────────
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label="Edit text"
      title="Click to edit"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        startEdit();
      }}
      onKeyDown={handleSpanKey}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={hovered ? EDIT_STYLE : undefined}
    >
      {display}
      {hovered ? (
        <span style={PENCIL_STYLE} aria-hidden="true">
          <Pencil size={12} />
        </span>
      ) : null}
    </span>
  );
}
