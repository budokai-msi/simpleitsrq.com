import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err, errorInfo) {
    console.error("[ErrorBoundary]", err);
    // Sentry is additive and lazy — the dynamic import keeps @sentry/react
    // off the critical-path bundle. It's a no-op if VITE_SENTRY_DSN is unset.
    import("../lib/sentry.js")
      .then(({ captureException, initSentry }) => {
        // Make sure init has happened (main.jsx kicks this off idle, but an
        // error could beat it to the punch).
        initSentry();
        captureException(err, {
          contexts: {
            react: { componentStack: errorInfo?.componentStack },
          },
        });
      })
      .catch(() => {
        // Swallow — reporting must never break the error UI.
      });
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
