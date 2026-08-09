# Simple IT SRQ — Core Project Invariants & Lookup Memory

> [!IMPORTANT]
> MUST BE READ AND STRICTLY OBEYED BY ALL AGENTS ON EVERY TURN.

---

## 1. Non-Negotiable Core Rules

| Invariant | Strict Mandate | Correct Pattern | Violation (FAIL) |
| :--- | :--- | :--- | :--- |
| **No Emojis** | **STRICTLY ZERO EMOJIS EVER** | Pure Lucide vector SVGs (`<Sparkles />`, `<Phone />`) | Emojis in UI, buttons, MDX, or text responses |
| **Official Phone** | **`(813) 434-3230`** | `tel:+18134343230`, `(813) 434-3230` | Personal cell `407-242-1456` or placeholder numbers |
| **Privacy / Email** | **Mask Personal Email** | `Signed in to Client Portal` | Exposing raw email (`***REMOVED***`) in forms |
| **Admin Owner** | `***REMOVED***` | Hardcoded sole owner in `api/_lib/admin.js` | Env var fallback for admin access |
| **Navbar Selector** | `.nav-link` & `.nav-group-btn` | `.nav-link` & `.nav-group-btn` in `src/App.css` | Styling `.nav-top-link` exclusively |

---

## 2. Component & CSS Selector Map

### Navigation Bar
- **Component File**: [Navbar.jsx](file:///c:/dev/SimpleITSRQ/simpleitsrq-web/src/components/Navbar.jsx)
- **Primary Selector**: `.nav-link`, `.nav-group-btn`
- **Active State**: `.nav-link.is-active::after` renders brand-blue (`#2563EB`) bottom indicator pill.

### Buttons
- **Global Base**: `.btn` (min-height `44px`, radius `var(--r-sm)`, font-weight `650`)
- **Primary Action**: `.btn-primary` (brand blue fill, top specular highlight, active press scale `0.98`)
- **Secondary Action**: `.btn-secondary` (surface-2 background, border-strong border)

### Automated Test Scripts
- **Visual Capture**: `node scripts/capture-all-buttons.mjs` (renders artifacts in `brain/`)
- **Click & Error Audit**: `node scripts/test-all-buttons.mjs` (clicks all 92 interactive buttons)

---

## 3. SEO & Schema Invariants
- **Domain**: `https://simpleitsrq.com`
- **Brand Name**: `Simple IT SRQ`
- **Telephone**: `+1-813-434-3230`
- **Markets Covered**: Sarasota, Bradenton, Lakewood Ranch, Venice, Nokomis.
