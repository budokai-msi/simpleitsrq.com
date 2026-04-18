# Passive-Income Roadmap — simpleitsrq.com

A prioritized plan for growing recurring affiliate/ad/product revenue on top of the existing MSP business, without diluting the "local IT support for Sarasota and Bradenton" positioning.

Last updated: 2026-04-18.

---

## Where we are today

| Channel | Status | Surface |
|---|---|---|
| Amazon Associates (tag `simpleitsrq20-20`) | **Live** | `/tools`, blog posts via `[[amazon:...]]` tokens, homepage teaser, every location page teaser |
| Gusto referral | **Live** | Blog posts via `[[gusto]]` token |
| 1Password (PartnerStack) | **Wired, dormant** | env var `VITE_AFF_1PASSWORD_REF` ready |
| HoneyBook | **Wired, dormant** | env var `VITE_AFF_HONEYBOOK_REF` ready |
| Acronis MSP | **Wired, dormant** | env var `VITE_AFF_ACRONIS_REF` ready |
| Google AdSense | **Wired, dormant** | env var `VITE_ADSENSE_CLIENT` unset |
| Stripe invoicing | **Live** | admin-only in portal |
| Stripe Checkout (digital products) | **Not built** | no `/api/checkout`, no product catalog |
| Newsletter backend | **Not wired** | UI-only placeholder on every blog post |

Infrastructure gap, not a strategy gap: every dormant row is a few hours of work from producing revenue.

---

## Recommended affiliate aggregators (pick TWO, not all)

The fastest way to get dozens of SaaS affiliate programs at once is to sign up for an aggregator network, then activate individual merchants from inside their dashboard. Signing up for one program at a time is slow and each merchant has a different W-9 / payout / tracking flow. Aggregators standardize all of that.

### PartnerStack — **sign up first**
- **Why:** Built specifically for SaaS. Best catalog for MSP-adjacent tools: 1Password (already waiting on you), Intercom, Proof, LivePlan, Freshbooks, Monday, Pipedrive, Close, Jira, and ~300 more.
- **Commission structure:** Typically 20–40% of first-year subscription; some programs are recurring for the lifetime of the customer.
- **Payout:** Monthly, $50 minimum.
- **Signup:** https://partnerstack.com/partners

### Impact (impact.com) — **sign up second**
- **Why:** The biggest SaaS + e-commerce affiliate network. Has NordLayer, NordVPN, Fastmail, Dropbox, Microsoft, ClickUp, Shopify, Typeform, Calendly, Adobe, and many more that PartnerStack doesn't.
- **Commission structure:** Highly variable per merchant — NordVPN is 100% first-month + 30% recurring, Microsoft is 7% one-time, etc.
- **Payout:** Twice monthly, $50 minimum.
- **Signup:** https://app.impact.com/secure/login/signup

### Skip for now
- **ShareASale** — older, mostly e-commerce, little SaaS overlap
- **CJ Affiliate** — requires traffic proof before approval, overkill at this traffic level
- **Rakuten** — consumer-focused, wrong audience

### Rule of thumb
Join PartnerStack + Impact, ignore the rest until one of them stops meeting a need.

---

## High-ROI SaaS programs to activate (after signing up)

Ranked by conversion likelihood for an MSP-audience blog.

| # | Program | Network | Why it converts here |
|---|---|---|---|
| 1 | **1Password Teams** | PartnerStack | You have env var wired. MSP clients get asked about password managers weekly. |
| 2 | **NordLayer** / **NordVPN Teams** | Impact | Every "remote work security" post can link to this. Commissions are top-tier (100% first month). |
| 3 | **Fastmail** | Impact | Privacy-focused alternative to Google Workspace. Natural fit for Florida law/dental practices worried about HIPAA email. |
| 4 | **ClickUp** / **Monday.com** | PartnerStack/Impact | Every "small business productivity" post. Recurring commission on paid plans. |
| 5 | **Freshbooks** or **Xero** | PartnerStack/Impact | Replaces/extends Gusto — accounting recs pair well on payroll posts. |
| 6 | **Calendly** / **SavvyCal** | PartnerStack | Already using Cal.com ourselves, so recommending for clients is organic. |
| 7 | **Zoho One** | Direct (https://zoho.com/refer) | All-in-one SMB suite, high commissions, zero-overlap with Microsoft 365 crowd. |
| 8 | **Tailscale** | Direct (partner program) | Rapidly-growing mesh VPN. Any post about remote access or site-to-site can link. |
| 9 | **HoneyBook** | Already wired | Photographers/real estate/coaches — several Sarasota industries. |
| 10 | **Acronis** | Already wired | Direct MSP-tier referrals, higher ticket than consumer backup. |

### Do NOT bother with
- **ExpressVPN / Surfshark** — consumer, off-brand for our audience
- **NinjaOne / ConnectWise** — B2B MSP platforms, their referral programs are closed/invite-only; not a blog-traffic play
- **Norton / McAfee** — consumer security; devalues our "real IT support" positioning

---

## Self-developed digital products — tier 1 (real margin, realistic effort)

Each of these is a written deliverable sold once, delivered as a PDF via Stripe Checkout. Stripe Checkout + product delivery needs to be built first (see implementation section).

| Product | Price | Time to author | Audience |
|---|---|---|---|
| **Florida Small-Business HIPAA Starter Kit** (checklist, risk-assessment template, BAA wording, signage PDF) | $79 | 4–6h | Dental/medical offices (~50% of local client base) |
| **Written Information Security Program (WISP) template** — Florida cyber-insurance-ready | $149 | 6–8h | Any regulated small business |
| **Employee Onboarding/Offboarding IT Runbook** | $39 | 2–3h | Growing offices, HR-driven purchase |
| **Hurricane-Season IT Continuity Playbook** (Florida-specific, unique angle) | $49 | 3–4h | Every Gulf Coast SMB, seasonal demand Jun–Oct |
| **Cyber-Insurance Questionnaire Answer Kit** (pre-written answers to the 40 questions insurers keep asking) | $99 | 4–6h | High-intent, price-insensitive buyers |

All five ≈ **$415 total retail**, realistic conversion even at 1% of blog traffic = meaningful MRR once Checkout is wired.

### Format
- Branded PDF (Canva or Google Docs export)
- Stripe Checkout Session → webhook → Resend delivers PDF via signed S3/R2 URL
- One `products` table in the existing Neon Postgres

### Why sell these (vs. giving them away as lead magnets)
- Paid customers are higher-intent leads than email subscribers
- Every purchase is a receipt that builds legitimacy
- Pricing anchors our MSP services — "he sells a $149 WISP template, how much is the full service?" → better quote conversions

---

## Tier 2 — bigger bets, after tier 1 proves demand

- **Paid course:** "Running IT for a 10-person office without losing your mind" — $197–$297
- **Monthly paid newsletter** (security briefing for non-technical owners) — $12/mo, ConvertKit Commerce
- **Gumroad / Payhip mirror** of the digital products above — slightly higher take rate, zero extra dev work
- **Sponsored blog posts** — once traffic clears ~10k visits/mo, direct outreach to listed affiliate partners for sponsored content rates ($300–$1500/post)

---

## Implementation plan — what I can do from here

All of the below are code tasks that don't need any external approval:

1. **Digital product infrastructure** (`/api/checkout` + Stripe Webhook + `products` table + `/store` page)
   — biggest single lift, ~4–6 hours, unlocks every tier-1 product sale
2. **Newsletter backend** (ConvertKit or Buttondown integration in existing `<Newsletter />` component)
   — ~30 min once you pick the provider and paste an API key
3. **AdSense activation** (code is already in place — flip `VITE_ADSENSE_CLIENT` in Vercel once approved)
   — zero code, waiting on Google
4. **Wire dormant affiliate env vars** (1Password / HoneyBook / Acronis — already in code, just paste ref URLs)
   — zero code, waiting on you

All of the below need YOU:

1. **Sign up for PartnerStack + Impact** (2× account creation, ~30 min each)
2. **Apply to programs in those dashboards** (individual merchants — each can take 1–5 days to approve)
3. **Write the first digital product** (the HIPAA starter kit is the highest-conversion, lowest-effort opener)
4. **Submit for AdSense approval** (you have 40+ posts, should pass easily)

### Order of operations I'd pick in your shoes

1. Paste any existing ref URLs you have (1Password / HoneyBook / Acronis) into Vercel env vars → I activate them in commits that same day.
2. Submit AdSense application (no code, takes 1–3 days).
3. Sign up PartnerStack. While approvals come in, tell me and I'll wire each token as you get approved.
4. Write HIPAA starter kit over a weekend. I build the Stripe Checkout pipeline in parallel. Ship together in one release.
5. Impact signup and Newsletter provider pick — whichever you feel like tackling next.

---

## What's already shipped that supports all of the above

- `/tools` page — 30+ Amazon-affiliate products across 7 categories
- `RecommendedTools` teaser — shows the top 3 picks on the homepage AND every location page (5 cities)
- Blog post affiliate tokens (`[[amazon:...]]`, `[[gusto]]`, etc.) — new programs auto-surface on every post that mentions them
- `AffiliateDisclosure` — FTC-compliant, auto-detected from `[[token]]` usage, dark-mode safe
- Honeypot-captured attacker credentials (not revenue, but saves future incident costs)
- `api/portal.js` Stripe invoice creation — the plumbing for Checkout is half-there already

Nothing in this doc requires ripping up existing code.
