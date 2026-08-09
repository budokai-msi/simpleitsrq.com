# Agent Context & Lookup Database — Simple IT SRQ

> [!IMPORTANT]
> AUTOMATICALLY LOADED ON EVERY AGENT TURN. OBEY ALL INVARIANTS WITHOUT EXCEPTION.

---

## 1. Non-Negotiable Directives

- **NO EMOJIS EVER**: Never use emojis in UI, buttons, MDX posts, commits, or responses. All icons must be pure Lucide SVG vector graphics.
- **OFFICIAL PHONE NUMBER**: **`(813) 434-3230`** (`tel:+18134343230`, `sms:+18134343230`, `+1-813-434-3230` in SEO schema). NEVER expose personal cell `(407) 242-1456` or placeholder numbers anywhere.
- **PRIVACY & EMAIL MASKING**: Never print raw email addresses (e.g. `***REMOVED***`) on public form headers or banners. Always use masked role text (e.g. `Signed in to Client Portal`).
- **SOLE ADMIN OWNER**: `OWNER_EMAIL = "***REMOVED***"` in `api/_lib/admin.js`.
- **CSS SELECTORS**:
  - Top header navbar links use `.nav-link` and `.nav-group-btn` in `src/components/Navbar.jsx`.
  - Never style `.nav-top-link` exclusively without including `.nav-link` and `.nav-group-btn`.

---

## 2. Key Architecture & File Map

- **Theme**: `data-theme="light"|"dark"` on `<html>`, persisted in localStorage
- **Navbar Component**: `src/components/Navbar.jsx`
- **Global CSS**: `src/App.css`
- **Leadgen CSS**: `src/styles/leadgen.css`
- **Admin Dashboard**: `src/pages/AdminOps.jsx`
- **SEO & Schema**: `src/lib/seo.js`
- **Support Form**: `src/pages/Support.jsx`
- **Blog Posts**: `content/posts/*.mdx` & `src/data/posts.js`
- **Leadgen API Backend**: `api/portal.js`

---

## 3. Mobile Standards (Enforced)
- Touch targets minimum `44×44px`
- No readable text below `12px`
- No horizontal overflow at `375px` viewport width
- Range sliders minimum `28px` thumb size

---

## 4. Verification Protocol
Before declaring any task complete:
1. Run `npm run build` to verify clean compilation.
2. Run `node scripts/test-all-buttons.mjs` to verify zero broken links or console errors across all 92 interactive buttons.
