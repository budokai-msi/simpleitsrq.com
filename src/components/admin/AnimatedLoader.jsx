// src/components/admin/AnimatedLoader.jsx
//
// A hand-crafted animated SVG loading indicator — the "level of programming"
// the user wants: real animation craft, not a flat "Loading…" text.
//
// Three dots arranged in a triangle, each pulsing + rotating into position
// (Lottie-style). Pure SVG, no JS timers, no dependencies. Respects
// currentColor so it inherits the theme's accent color.
//
// Two hard-won fixes baked in:
//  1. GEOMETRY FITS IN PADDING. The dots + orbit ring are laid out inside a
//     padded viewBox (pad = 14% of size) so nothing clips when the loader is
//     placed in a tight container. The old version put the bottom dots at
//     y = size*0.86 with dotR = size*0.16, so the bottom edge reached
//     size*1.02 — past the viewBox, and the loader got cut off.
//  2. 144Hz-SMOOTH. Animations run as CSS keyframes on `transform`/`opacity`
//     with `will-change` + `translateZ(0)`, so the browser composites them on
//     the GPU at the display's refresh rate (up to 144Hz) instead of SMIL
//     <animateTransform>, which is CPU-driven and can look cheap/janky.
import { useId } from "react";

// CSS keyframes injected once (module scope) so every instance shares them.
const KEYFRAMES = `
@keyframes hx-dot-pulse {
  0%, 100% { transform: scale(1); opacity: 0.35; }
  50%      { transform: scale(1.28); opacity: 1; }
}
@keyframes hx-orbit-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
`;
if (typeof document !== "undefined" && !document.getElementById("hx-loader-keyframes")) {
  const style = document.createElement("style");
  style.id = "hx-loader-keyframes";
  style.textContent = KEYFRAMES;
  document.head.appendChild(style);
}

export function AnimatedLoader({ size = 28, label = "Loading…", color = "currentColor" }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  // Padded viewBox so the dots + ring never clip. pad = 14% of size.
  const pad = size * 0.14;
  const vb = size + pad * 2;
  const c = vb / 2; // center of the padded viewBox
  const dotR = size * 0.15;
  // Triangle vertices around center (c, c), pointing up, inset so the dots
  // (radius dotR) stay fully inside the padded box.
  const pts = [
    { x: c, y: c - size * 0.34 },        // top
    { x: c - size * 0.3, y: c + size * 0.3 }, // bottom-left
    { x: c + size * 0.3, y: c + size * 0.3 }, // bottom-right
  ];
  const ringR = size * 0.36;
  return (
    <span
      role="status"
      aria-label={label}
      style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 8, color }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${vb} ${vb}`}
        fill="none"
        aria-hidden="true"
        style={{ display: "block", overflow: "visible" }}
      >
        {pts.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={dotR}
              fill="currentColor"
              style={{
                transformOrigin: `${p.x}px ${p.y}px`,
                animation: `hx-dot-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                willChange: "transform, opacity",
                transform: "translateZ(0)",
              }}
            />
            {/* orbit ring: each dot sweeps a faint arc around the center */}
            <circle
              cx={c}
              cy={c}
              r={ringR}
              stroke="currentColor"
              strokeWidth={size * 0.02}
              strokeOpacity="0.12"
              fill="none"
              strokeDasharray={`${(2 * Math.PI * ringR) / 3} ${2 * Math.PI * ringR}`}
              strokeDashoffset={-((2 * Math.PI * ringR) / 3) * i}
              style={{
                transformOrigin: `${c}px ${c}px`,
                animation: `hx-orbit-spin 3.6s linear ${i * 0.4}s infinite`,
                willChange: "transform",
                transform: "translateZ(0)",
              }}
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
