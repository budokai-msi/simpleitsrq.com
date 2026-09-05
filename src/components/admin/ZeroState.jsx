// Polished zero-state + human-review disclosure system for AdminOps tabs.
// Replaces the flat "No records yet" + triangle empty state with a considered,
// product-grade empty state that carries its own human-review disclosures.
// Self-contained: uses only existing CSS classes (card, ops-panel__copy,
// SignalPill) plus inline styles for the icon circle. No new
// CSS, no new dependencies (lucide-react is already present).
import { Info, Inbox } from "lucide-react";
import { SignalPill } from "./shared";

// A subtle, bordered disclosure strip — a considered product disclosure, not a
// loud alert. `context` customizes the body (e.g. "AI-generated draft",
// "automatically collected lead", "automated security scan").
export function HumanReviewDisclosure({ context }) {
  return (
    <div
      className="card card-border bg-base-100 p-4"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 14px",
        border: "1px solid var(--border, #cbd5e1)",
        borderRadius: 10,
        background: "color-mix(in srgb, var(--brand, #6366f1) 4%, var(--surface, #fff))",
        maxWidth: 520,
        margin: "0 auto",
        textAlign: "left",
      }}
    >
      <Info size={15} style={{ color: "var(--brand, #6366f1)", flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span
            style={{
              fontWeight: 700,
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--text-muted, #64748b)",
            }}
          >
            Human review required
          </span>
          <SignalPill state="warn">review</SignalPill>
        </div>
        <p
          className="ops-panel__copy"
          style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--text-2, #64748b)" }}
        >
          {context}
        </p>
      </div>
    </div>
  );
}

// The polished empty state. Centered, well-spaced card with the icon in a soft
// circle, a title, a helpful description, an optional action, and optional
// human-review disclosure banners below the description.
export function ZeroState({ title, description, icon: Icon = Inbox, action, disclosures }) {
  return (
    <div
      className="card card-border bg-base-100 p-4"
      style={{ textAlign: "center", padding: "40px 24px" }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 16px",
          background: "color-mix(in srgb, var(--brand, #6366f1) 10%, var(--surface, #fff))",
          color: "var(--brand, #6366f1)",
        }}
      >
        <Icon size={28} />
      </div>
      <h3 style={{ margin: "0 0 6px", fontSize: "1.05rem", color: "var(--text-1, #0f172a)" }}>
        {title}
      </h3>
      {description ? (
        <p
          className="ops-panel__copy"
          style={{
            margin: "0 auto 16px",
            maxWidth: 460,
            fontSize: 13.5,
            lineHeight: 1.55,
            color: "var(--text-2, #64748b)",
          }}
        >
          {description}
        </p>
      ) : null}
      {action ? (
        <div style={{ marginBottom: disclosures?.length ? 18 : 0 }}>{action}</div>
      ) : null}
      {disclosures?.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {disclosures.map((d, i) => <HumanReviewDisclosure key={i} context={d} />)}
        </div>
      ) : null}
    </div>
  );
}
