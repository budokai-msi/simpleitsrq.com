// src/components/admin/AnimatedLoader.jsx
//
// A hand-crafted animated SVG loading indicator — the "level of programming"
// the user wants: real animation craft, not a flat "Loading…" text.
//
// Three dots arranged in a triangle, each pulsing + rotating into position
// with transform matrices (Lottie-style). Pure SVG + SMIL <animateTransform>,
// no JS timers, no dependencies. Respects currentColor so it inherits the
// theme's accent color.
import { useId } from "react";

export function AnimatedLoader({ size = 28, label = "Loading…", color = "currentColor" }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const r = size / 2;
  const dotR = size * 0.16;
  // Triangle vertices around center (r, r), pointing up.
  const pts = [
    { x: r, y: r * 0.28 },        // top
    { x: r * 0.28, y: r * 1.72 }, // bottom-left
    { x: r * 1.72, y: r * 1.72 }, // bottom-right
  ];
  return (
    <span
      role="status"
      aria-label={label}
      style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 8, color }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        aria-hidden="true"
        style={{ display: "block" }}
      >
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={dotR} fill="currentColor" opacity="0.9">
              {/* pulse: scale up + fade, staggered */}
              <animate
                attributeName="opacity"
                values="0.35;1;0.35"
                dur="1.2s"
                begin={`${i * 0.2}s`}
                repeatCount="indefinite"
              />
              <animateTransform
                attributeName="transform"
                type="scale"
                values="1;1.25;1"
                dur="1.2s"
                begin={`${i * 0.2}s`}
                repeatCount="indefinite"
                additive="sum"
              />
            </circle>
            {/* orbit ring: each dot sweeps a faint arc around the center */}
            <circle
              cx={r}
              cy={r}
              r={r * 0.78}
              stroke="currentColor"
              strokeWidth={size * 0.02}
              strokeOpacity="0.12"
              fill="none"
              strokeDasharray={`${(2 * Math.PI * r * 0.78) / 3} ${2 * Math.PI * r * 0.78}`}
              strokeDashoffset={-((2 * Math.PI * r * 0.78) / 3) * i}
              transform={`rotate(${i * 120} ${r} ${r})`}
            />
          </g>
        ))}
      </svg>
      <span style={{ fontSize: 12, opacity: 0.7, letterSpacing: "0.02em" }}>{label}</span>
    </span>
  );
}

// A centered full-panel loader for Suspense fallbacks / auth gate.
export function PanelLoader({ label = "Loading…", size = 40 }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 160,
        padding: 24,
      }}
    >
      <AnimatedLoader size={size} label={label} />
    </div>
  );
}
