# Simple IT SRQ — Core Project Invariants & Lookup Memory

> [!IMPORTANT]
> MUST BE READ AND STRICTLY OBEYED BY ALL AGENTS ON EVERY TURN.

---

## 1. Non-Negotiable Core Rules

| Invariant | Strict Mandate | Correct Pattern | Violation (FAIL) |
| :--- | :--- | :--- | :--- |
| **No Emojis** | **STRICTLY ZERO EMOJIS EVER** | Pure Lucide vector SVGs (`<Sparkles />`, `<Phone />`) | Emojis in UI, buttons, MDX, or text responses |
| **Official Phone** | **`(813) 434-3230`** | Import from `src/config/business.js` | Personal cell `407-242-1456`, `941-217-0050`, placeholders, or new hardcoded copies |
| **Canonical Business Data** | Public identity/contact facts have one source of truth | `src/config/business.js` | Duplicating phone/email/site identity in new components |
| **Privacy / Email** | **Mask Personal Email** | `Signed in to Client Portal` | Exposing raw owner email in public forms/UI |
| **Admin Boundary** | Internal ops routes are never linked, advertised, indexed, included in sitemaps, or described in public content | Authenticated `/portal/ops` access only; `noindex, nofollow, noarchive` | Public nav/footer links, crawlable admin labels, public route promotion |
| **Admin Owner** | Sole owner identity stays server-side | `api/_lib/admin.js` | Client-side owner identity or public metadata |
| **Content Claims** | Specific statistics, breach amounts, customer incidents, named scenarios, and performance claims require a verifiable source or explicit confirmed first-party case record | Cite a reputable source or label generic examples as hypothetical | AI-invented customer stories, uncited precise statistics, fabricated field notes |
| **Architecture First** | Before adding a feature, find and extend the existing domain/config/component | Reuse canonical modules and shared primitives | Parallel implementations, duplicate constants, one-off business rules |
| **Navbar Selector** | `.nav-link` & `.nav-group-btn` | `.nav-link` & `.nav-group-btn` in `src/App.css` | Styling `.nav-top-link` exclusively |

---

## 2. Component & CSS Selector Map

### Navigation Bar
- **Component File**: `src/components/Navbar.jsx`
- **Primary Selector**: `.nav-link`, `.nav-group-btn`
- **Active State**: `.nav-link.is-active::after` renders the brand-blue bottom indicator pill.

### Public Business Identity
- **Canonical module**: `src/config/business.js`
- Components, SEO schema, contact CTAs, and future templates must import from this module instead of hardcoding identity/contact values.

### Buttons
- **Global Base**: `.btn` (min-height `44px`, radius `var(--r-sm)`, font-weight `650`)
- **Primary Action**: `.btn-primary`
- **Secondary Action**: `.btn-secondary`

### Automated Test Scripts
- **Visual Capture**: `node scripts/capture-all-buttons.mjs`
- **Click & Error Audit**: `node scripts/test-all-buttons.mjs`

---

## 3. SEO & Schema Invariants
- **Domain**: `https://simpleitsrq.com`
- **Brand Name**: `Simple IT SRQ`
- **Telephone**: import the canonical value from `src/config/business.js` in application code.
- **Markets Covered**: Sarasota, Bradenton, Lakewood Ranch, Venice, Nokomis.
- Internal/admin URLs must never be emitted into sitemap, structured data, public navigation, marketing copy, or generated blog content.

## 4. Change Discipline
- Prefer consolidation and deletion over adding another abstraction.
- A business fact or rule must have one authoritative owner.
- Do not rewrite the application wholesale to fix local drift.
- Any new public-content automation must fail closed when a factual claim cannot be verified.
- Preserve existing URLs and redirects unless there is an explicit migration plan; indexed URLs are production assets.
