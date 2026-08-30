// src/components/admin/Toast.jsx
//
// Tiny self-contained toast notification system for the admin dashboard.
// No external dependency. Provides a <ToastProvider> that renders a fixed
// top-right stack of toasts and a useToast() hook to fire them.
//
//   const { toast } = useToast();
//   toast("Saved", "success");
//   toast("Something failed", "error");
//
// Toasts auto-dismiss after 4s (success/info) or 8s (error) and each has a
// close button. Styling uses inline styles + existing CSS variables so it
// respects the current light/dark theme without adding new CSS.
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { X } from "lucide-react";

const ToastContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a <ToastProvider>");
  return ctx;
}

let nextId = 0;

const STACK_STYLE = {
  position: "fixed",
  top: 16,
  right: 16,
  zIndex: 9999,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  maxWidth: 360,
  width: "calc(100vw - 32px)",
};

function toastStyle(type) {
  const base = {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 1.4,
    boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
    border: "1px solid var(--border, #cbd5e1)",
    background: "var(--surface, #fff)",
    color: "var(--text-1, #0f172a)",
  };
  if (type === "success") return { ...base, borderLeft: "3px solid #10b981" };
  if (type === "error") return { ...base, borderLeft: "3px solid #ef4444" };
  return { ...base, borderLeft: "3px solid #3b82f6" };
}

const CLOSE_STYLE = {
  flex: "0 0 auto",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 20,
  height: 20,
  padding: 0,
  border: "none",
  borderRadius: 6,
  background: "transparent",
  color: "var(--text-2, #64748b)",
  cursor: "pointer",
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const toast = useCallback(
    (message, type = "info") => {
      const id = ++nextId;
      const t = {
        id,
        type: type === "success" || type === "error" ? type : "info",
        message: String(message),
      };
      setToasts((prev) => [...prev, t]);
      const ms = t.type === "error" ? 8000 : 4000;
      timers.current[id] = setTimeout(() => dismiss(id), ms);
    },
    [dismiss]
  );

  const value = { toast };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div style={STACK_STYLE} role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} style={toastStyle(t.type)}>
            <span style={{ flex: 1 }}>{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              style={CLOSE_STYLE}
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
