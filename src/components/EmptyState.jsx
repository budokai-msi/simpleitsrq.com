// Shared empty-state component for portal/dashboard surfaces.
//
// Renders a small illustrated SVG, a single-line title, and an optional
// helper paragraph. Used by OpsecPortal, BlogIndex (no-results), and any
// future admin dashboard tab that needs to fail to a friendly state
// instead of a bare "No items." string.

const ICONS = {
  // Stack of cards / documents
  inbox: (
    <svg viewBox="0 0 96 96" width="96" height="96" aria-hidden="true">
      <defs>
        <linearGradient id="empty-card" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E8EEF6" />
          <stop offset="1" stopColor="#C9D6E6" />
        </linearGradient>
      </defs>
      <rect x="14" y="22" width="68" height="48" rx="6" fill="#0F6CBD" opacity="0.10" />
      <rect x="18" y="28" width="60" height="44" rx="6" fill="url(#empty-card)" stroke="#0F6CBD" strokeOpacity="0.25" />
      <rect x="26" y="38" width="34" height="3" rx="1.5" fill="#0F6CBD" opacity="0.35" />
      <rect x="26" y="46" width="44" height="3" rx="1.5" fill="#0F6CBD" opacity="0.20" />
      <rect x="26" y="54" width="28" height="3" rx="1.5" fill="#0F6CBD" opacity="0.20" />
      <circle cx="74" cy="22" r="6" fill="#F0B429" />
      <circle cx="74" cy="22" r="10" fill="#F0B429" opacity="0.18" />
    </svg>
  ),
  // Globe / domain
  globe: (
    <svg viewBox="0 0 96 96" width="96" height="96" aria-hidden="true">
      <circle cx="48" cy="48" r="30" fill="none" stroke="#0F6CBD" strokeOpacity="0.45" strokeWidth="1.5" />
      <ellipse cx="48" cy="48" rx="14" ry="30" fill="none" stroke="#0F6CBD" strokeOpacity="0.3" strokeWidth="1.5" />
      <line x1="18" y1="48" x2="78" y2="48" stroke="#0F6CBD" strokeOpacity="0.3" strokeWidth="1.5" />
      <circle cx="48" cy="48" r="30" fill="#0F6CBD" opacity="0.06" />
      <circle cx="62" cy="34" r="3" fill="#0E9C95" />
      <circle cx="34" cy="58" r="2.5" fill="#7C5CD8" />
      <circle cx="48" cy="20" r="2.5" fill="#F0B429" />
    </svg>
  ),
  // Shield / IOC
  shield: (
    <svg viewBox="0 0 96 96" width="96" height="96" aria-hidden="true">
      <path d="M48 14 L74 24 V48 C74 64 60 76 48 82 C36 76 22 64 22 48 V24 Z"
            fill="#0F6CBD" fillOpacity="0.10" stroke="#0F6CBD" strokeOpacity="0.45" strokeWidth="1.5" />
      <path d="M38 50 L46 58 L60 42" fill="none" stroke="#0E9C95" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  // Notebook
  notes: (
    <svg viewBox="0 0 96 96" width="96" height="96" aria-hidden="true">
      <rect x="22" y="16" width="52" height="64" rx="4" fill="#E8EEF6" stroke="#0F6CBD" strokeOpacity="0.30" />
      <line x1="30" y1="14" x2="30" y2="82" stroke="#F0B429" strokeWidth="2" />
      <rect x="38" y="28" width="28" height="2.5" rx="1.25" fill="#0F6CBD" opacity="0.35" />
      <rect x="38" y="36" width="34" height="2.5" rx="1.25" fill="#0F6CBD" opacity="0.20" />
      <rect x="38" y="44" width="22" height="2.5" rx="1.25" fill="#0F6CBD" opacity="0.20" />
      <rect x="38" y="52" width="30" height="2.5" rx="1.25" fill="#0F6CBD" opacity="0.20" />
    </svg>
  ),
  // Search / no-results
  search: (
    <svg viewBox="0 0 96 96" width="96" height="96" aria-hidden="true">
      <circle cx="42" cy="42" r="22" fill="#0F6CBD" fillOpacity="0.08" stroke="#0F6CBD" strokeOpacity="0.45" strokeWidth="2" />
      <line x1="58" y1="58" x2="76" y2="76" stroke="#0F6CBD" strokeOpacity="0.55" strokeWidth="3" strokeLinecap="round" />
      <circle cx="42" cy="42" r="6" fill="#F0B429" opacity="0.5" />
    </svg>
  ),
};

export default function EmptyState({
  icon = "inbox",
  title,
  body,
  action,
}) {
  return (
    <div className="empty-state" role="status">
      <div className="empty-state__art">{ICONS[icon] || ICONS.inbox}</div>
      <h3 className="empty-state__title">{title}</h3>
      {body && <p className="empty-state__body">{body}</p>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  );
}
