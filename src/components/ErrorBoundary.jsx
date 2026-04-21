import { Component } from "react";

function reportError(err) {
  if (typeof window === "undefined") return;
  try {
    const payload = JSON.stringify({
      kind: "client_error",
      message: err?.message || String(err),
      stack: err?.stack || null,
      path: window.location.pathname + window.location.search,
    });
    // Prefer sendBeacon so the report survives a page-unload triggered by
    // the user hitting Refresh. Fall back to fetch when the beacon API is
    // unavailable (old Safari private mode).
    const blob = new Blob([payload], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/track", blob)) {
      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch { /* telemetry must never throw */ }
}

export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err) {
    console.error("[ErrorBoundary]", err);
    reportError(err);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 40, textAlign: "center" }}>
          <div>
            <h1 style={{ fontSize: "1.5rem", marginBottom: 8 }}>Something went wrong</h1>
            <p style={{ color: "#666", marginBottom: 16 }}>Try refreshing the page.</p>
            <button
              onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
              style={{ padding: "8px 20px", borderRadius: 6, border: "1px solid #ccc", cursor: "pointer" }}
            >
              Refresh
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
