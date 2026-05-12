# Agent Context — Simple IT SRQ Web

## Project
Vite + React SPA deployed to Vercel. Single-tenant admin via `ADMIN_EMAIL` env var.

## Key Architecture
- **Theme**: `data-theme="light"|"dark"` on `<html>`, persisted in localStorage
- **Admin gate**: `resolveAdmin()` checks only `ADMIN_EMAIL` env var (no DB fallback)
- **Blog auto-publish**: HN cron drafts commit to `src/data/posts.js` via GitHub Contents API
- **Leadgen backend**: `api/portal.js` handlers for discover, campaigns, jobs, insights
- **Stripe links**: `VITE_LEADGEN_GROWTH_MONTHLY_URL`, `VITE_LEADGEN_GROWTH_ANNUAL_URL`, `VITE_LEADGEN_PRO_MONTHLY_URL`, `VITE_LEADGEN_PRO_ANNUAL_URL`

## Mobile Standards (enforced)
- All touch targets minimum 44×44px
- No readable text below 12px
- No horizontal overflow at 375px
- Billing toggles use `flex-wrap: wrap`
- Range slider thumbs minimum 28px

## Recent Commits
- `1141183` — Mobile polish: touch targets, fonts, layout across all surfaces
- `d4f6e15` — Pricing: dynamic "Save up to 21%" badge, monthly default
- `69089a8` — Light mode contrast rebuild + leadgen pricing overhaul + insights dashboard
