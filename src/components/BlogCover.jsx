// Category → Synapse favicon (copied from /synapse/dist/favicons/). PNGs sit
// in /public/icons/synapse/ and get served from the same origin. Each card
// renders a gradient background + a large centered icon + a category label.
// No external photos, no third-party image hosts.

const ICON_SRC = {
  "Cybersecurity":     "/icons/synapse/swords.png",
  "AI & Productivity": "/icons/synapse/brain.png",
  "Cloud":             "/icons/synapse/globe.png",
  "Compliance":        "/icons/synapse/clipboardlist.png",
  "Privacy":           "/icons/synapse/scale.png",
  "Business Tech":     "/icons/synapse/barchart3.png",
  "Industry News":     "/icons/synapse/bookopen.png",
};
const FALLBACK_ICON = "/icons/synapse/sparkles.png";

const PALETTES = {
  "Cybersecurity":     { base: "#0F172A", accent: "#DC2626", mid: "#7F1D1D" },
  "AI & Productivity": { base: "#1E1B4B", accent: "#8B5CF6", mid: "#4C1D95" },
  "Cloud":             { base: "#0C4A6E", accent: "#38BDF8", mid: "#075985" },
  "Compliance":        { base: "#14532D", accent: "#22C55E", mid: "#166534" },
  "Privacy":           { base: "#1F2937", accent: "#06B6D4", mid: "#164E63" },
  "Business Tech":     { base: "#0F6CBD", accent: "#60A5FA", mid: "#1E40AF" },
  "Industry News":     { base: "#422006", accent: "#F59E0B", mid: "#92400E" },
};

function hashSlug(slug = "") {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export default function BlogCover({ post, variant = "card" }) {
  const category = post?.category || "Business Tech";
  const iconSrc = ICON_SRC[category] || FALLBACK_ICON;
  const palette = PALETTES[category] || PALETTES["Business Tech"];
  const h = hashSlug(post?.slug);
  const angle = 110 + (h % 70);
  const blobX = 60 + ((h >> 4) % 30);
  const blobY = 25 + ((h >> 8) % 50);
  const blobR = 30 + ((h >> 12) % 20);
  const dotSeed = (h >> 16) % 7;
  const id = `bg-${h % 1000000}`;
  const iconSize = variant === "hero" ? 160 : 96;

  return (
    <div className={`blog-cover blog-cover-${variant}`} aria-hidden="true">
      <svg viewBox="0 0 1200 630" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`${id}-g`} gradientTransform={`rotate(${angle})`}>
            <stop offset="0%"   stopColor={palette.base} />
            <stop offset="55%"  stopColor={palette.mid} />
            <stop offset="100%" stopColor={palette.accent} stopOpacity="0.85" />
          </linearGradient>
          <radialGradient id={`${id}-r`} cx={`${blobX}%`} cy={`${blobY}%`} r={`${blobR}%`}>
            <stop offset="0%"   stopColor={palette.accent} stopOpacity="0.55" />
            <stop offset="100%" stopColor={palette.accent} stopOpacity="0" />
          </radialGradient>
          <pattern id={`${id}-p`} width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="20" cy="20" r="1" fill="#fff" fillOpacity={0.06 + (dotSeed % 3) * 0.02} />
          </pattern>
        </defs>
        <rect width="1200" height="630" fill={`url(#${id}-g)`} />
        <rect width="1200" height="630" fill={`url(#${id}-p)`} />
        <rect width="1200" height="630" fill={`url(#${id}-r)`} />
      </svg>
      <div className="blog-cover-icon">
        <img
          src={iconSrc}
          alt=""
          width={iconSize}
          height={iconSize}
          loading={variant === "hero" ? "eager" : "lazy"}
          decoding="async"
        />
      </div>
      <div className="blog-cover-label">{category.toUpperCase()}</div>
    </div>
  );
}
