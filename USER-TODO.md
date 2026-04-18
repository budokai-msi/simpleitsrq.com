# Pending Actions — simpleitsrq.com

Everything the website is currently waiting on from you. Ordered by expected revenue + security impact, not by effort.

Last refreshed: 2026-04-18.

---

## Tier 1 — revenue blocked until these are done (highest ROI)

### ☐ 1.1 — Create Stripe Payment Links for the 6 store products

**Time:** ~15 min total (2 min per product).
**Where:** Stripe Dashboard → Products → Add product → Payment Link.
**Revenue:** every day these are dark, zero $. First day they're live, every waitlist signup gets emailed.

For each product: create the product in Stripe, set the price, enable "Collect customer information," attach the PDF as an "after-payment delivery file," then copy the Payment Link URL and paste into the matching Vercel env var.

| Product | Price | Vercel env var | Waitlist file |
|---|---:|---|---|
| HIPAA Starter Kit | $79 | `VITE_PRODUCT_HIPAA_KIT_BUY_URL` | `public/products/hipaa-starter-kit-preview.md` |
| Written Information Security Program | $149 | `VITE_PRODUCT_WISP_BUY_URL` | `public/products/wisp-template-preview.md` |
| Cyber-Insurance Answer Kit | $99 | `VITE_PRODUCT_INSURANCE_KIT_BUY_URL` | `public/products/cyber-insurance-answers-preview.md` |
| Hurricane IT Continuity Playbook | $49 | `VITE_PRODUCT_HURRICANE_KIT_BUY_URL` | `public/products/hurricane-it-playbook-preview.md` |
| Onboarding/Offboarding Runbook | $39 | `VITE_PRODUCT_ONBOARDING_KIT_BUY_URL` | `public/products/onboarding-runbook-preview.md` |
| Complete Compliance Library (bundle) | $299 | `VITE_PRODUCT_BUNDLE_BUY_URL` | bundle of all 5 above |

Each preview file is already substantive enough to ship as-is at its current price. If you want to ship a longer version later, the Payment Link can deliver any updated PDF without touching the site.

After pasting each env var, run `vercel --prod` (or redeploy from GitHub) and the product card flips from "Notify me" to "Buy — $X".

---

### ☐ 1.2 — Activate the 3 dormant affiliate programs (30 min)

Code is already wired. Each one ships revenue the moment the env var is set.

| Program | Sign-up URL | Vercel env var |
|---|---|---|
| 1Password Teams | partnerstack.com (see 2.1 below) | `VITE_AFF_1PASSWORD_REF` |
| HoneyBook | honeybook.com/refer | `VITE_AFF_HONEYBOOK_REF` |
| Acronis MSP | acronis.com/partners/programs/msp | `VITE_AFF_ACRONIS_REF` |

Each affiliate token is already referenced across the blog posts and `/tools` via the `[[partnername]]` pattern in markdown — activating the env var auto-surfaces the correct link on every mention.

---

## Tier 2 — major upside, needs a sign-up then paste

### ☐ 2.1 — PartnerStack + Impact affiliate aggregators (1 hour total)

**Why:** 300+ SaaS programs in one place. Single tax form, single payout flow, single dashboard.

- **PartnerStack signup:** [partnerstack.com/partners](https://partnerstack.com/partners) — 10 min to sign up, approvals roll in over 24–48 h
- **Impact signup:** [app.impact.com/secure/login/signup](https://app.impact.com/secure/login/signup) — same pattern

Once approved, apply to individual programs from inside each dashboard. My top-10 ranking is in `PASSIVE-INCOME-ROADMAP.md`. Highest priority: 1Password, NordLayer, Fastmail, ClickUp, Calendly, Freshbooks.

When you get approved for any individual program, paste the ref URL into Vercel env vars. If it's a known program (1Password, HoneyBook, Acronis) the env var already exists. If it's new, let me know and I'll add the token handling in 5 min.

---

### ☐ 2.2 — Submit for Google AdSense (10 min)

**Why:** site has 40+ posts; should pass the review. Once active, every blog page view earns a few cents.

- Go to [google.com/adsense](https://www.google.com/adsense)
- Add `simpleitsrq.com` as your site
- Review takes 1–3 days
- Once approved, copy the `ca-pub-XXXX` ID and paste into `VITE_ADSENSE_CLIENT` in Vercel → redeploy

Ads then auto-appear mid-post and end-of-post on every blog entry (already wired in `src/pages/BlogPost.jsx:197–199`).

---

### ☐ 2.3 — Launch the $50 Google Ads campaign (30 min)

The full campaign spec was in an earlier session. Summary:

- Campaign type: Search
- Budget: $5/day, ~10 days
- Locations: Sarasota, Bradenton, Nokomis, Venice, Lakewood Ranch (FL)
- Schedule: Mon–Fri 7am–6pm ET
- Ad groups: one per city, keywords in phrase-match
- Negative keywords: free, jobs, career, tutorial, reddit, diy, youtube
- Landing pages: the matching `/[city]-it-support` page

The exact keyword lists + ad copy are in the session history. If you need them re-typed out, tell me.

---

## Tier 3 — security posture improvements (no revenue, real protection)

### ☐ 3.1 — Run the audit-chain migration in Neon (30 seconds)

**Why:** turns on tamper-evident logging. Until this migration runs, the code path degrades to plain inserts (still works, no chain).

1. Neon dashboard → SQL editor
2. Paste the contents of `db/migrations/001_audit_chain.sql`
3. Run
4. Verify at `/api/portal?action=audit-verify` (admin-only) — should return `{ok: true, totalRows, chainedRows, breaks: []}`

### ☐ 3.2 — Cloudflare Zero Trust for /portal (20 min)

**Why:** single highest-leverage security move available. Removes portal from public internet entirely.

Step-by-step in `CLOUDFLARE-ZERO-TRUST-SETUP.md`. Requires moving DNS from GoDaddy to Cloudflare (free) then setting up an Access application with an email allowlist. Zero code changes.

### ☐ 3.3 — Rotate the HP_PW_PEPPER env var annually

Currently set (random 256-bit). Rotate annually so old honeypot credential hashes age out of correlation space. Calendar reminder for April 2027.

---

## Tier 4 — content + SEO (slow-burn, compounding)

### ☐ 4.1 — Expand HIPAA Starter Kit to full 62-page deliverable

The preview at `public/products/hipaa-starter-kit-preview.md` is ~6 pages of real content. Full kit in the ad copy says 62 pages. You can either:

- **Ship as-is at a lower price** — preview quality is legit $39–$49 territory
- **Expand to full** — 4–6 hours of writing. Use the preview's outline as the skeleton; fill in the remaining safeguard sections, the full BAA, the other 35 risk-assessment questions, the Notice of Privacy Practices, and the signage PDFs

Same call to make for the other four products. Current preview depth:

| Product | Current | Claimed | Decision |
|---|:---:|:---:|---|
| HIPAA Starter Kit | 6 pages | 62 | expand or reprice |
| WISP Template | 7 pages | 48 | expand or reprice |
| Insurance Answer Kit | 12/40 questions | 40 | finish all 40 |
| Hurricane Playbook | 8 pages | 34 | expand or reprice |
| Onboarding Runbook | 6 pages | 22 | expand or reprice |

Honest take: the previews are already detailed enough to sell. Finish them when demand signal (waitlist signups) justifies.

### ☐ 4.2 — Local citations / backlinks (1 hour)

For local SEO ranking, get these listings (in order of impact):

- Sarasota Chamber of Commerce member listing
- Manatee Chamber of Commerce (Bradenton)
- Venice Area Chamber of Commerce
- Yelp business profile (NAP-consistent with GBP)
- Apple Maps business listing
- Bing Places
- YellowPages

Key rule: NAP (Name, Address, Phone) must be *identical* across every listing. Any deviation splits your ranking signal.

### ☐ 4.3 — Post weekly to Google Business Profile

GBP posts rank in the Map Pack. Take any weekly blog post, paraphrase 2 sentences, link back, post to GBP. 2 minutes of work per week; meaningful Map Pack signal over 6 months.

---

## Tier 5 — optional / if interested

### ☐ 5.1 — Pick a newsletter provider

Newsletter signup form on every blog post currently routes to `/api/contact` (lands in your inbox tagged `source: newsletter`). For real newsletter functionality pick one:

- **Buttondown** — free up to 100 subs, cleanest API
- **ConvertKit** — better automation, $15/mo
- **Beehiiv** — free, built-in paid-newsletter option

Tell me which and I'll wire the API (~30 min).

### ☐ 5.2 — WebAuthn for admin login

Full implementation plan in `WEBAUTHN-IMPLEMENTATION-PLAN.md`. Recommended order: do Cloudflare Zero Trust (3.2) first, live with it for a month, decide if you still want a second factor *inside* the locker.

### ☐ 5.3 — Review-request automation on ticket close

When a support ticket closes, auto-email the client asking for a Google review. Boosts Map Pack ranking faster than organic. ~1 hour to build. Say go and I'll scaffold it.

---

## Quick-reference — every env var mentioned above

Already set (verify in `vercel env ls`):
- `HP_PW_PEPPER` — honeypot password pepper (set last session)
- `GITHUB_TOKEN` — publish-to-GitHub PAT (set + rotated last session)
- `VITE_AFF_AMAZON_TAG` — Amazon Associates tag (active)
- `VITE_AFF_GUSTO_REF` — Gusto referral (active)
- `STRIPE_SECRET_KEY` — Stripe live mode (active, used for invoicing)

Waiting for you to set:
- `VITE_PRODUCT_HIPAA_KIT_BUY_URL`
- `VITE_PRODUCT_WISP_BUY_URL`
- `VITE_PRODUCT_INSURANCE_KIT_BUY_URL`
- `VITE_PRODUCT_HURRICANE_KIT_BUY_URL`
- `VITE_PRODUCT_ONBOARDING_KIT_BUY_URL`
- `VITE_PRODUCT_BUNDLE_BUY_URL`
- `VITE_AFF_1PASSWORD_REF`
- `VITE_AFF_HONEYBOOK_REF`
- `VITE_AFF_ACRONIS_REF`
- `VITE_ADSENSE_CLIENT`

---

## Ordered-cheapest-first daily plan if you want one

**This week (30 min):**
1. Apply to Google AdSense
2. Sign up for PartnerStack + Impact
3. Run the audit-chain SQL migration

**Next week (2 hours):**
1. Create a Stripe Payment Link for the HIPAA Kit (even if you don't expand the content — ship it at $49)
2. Paste the URL into Vercel, redeploy
3. Celebrate the first sale
4. Do the same for the next product in whichever order feels easiest

**Ongoing (15 min/week):**
- One GBP post per week
- Check the portal waitlist signups — which products have demand? Write those first.
- Check AdSense / affiliate dashboards for revenue trend

**When you're ready (4 hours in one sitting):**
- Cloudflare Zero Trust migration
- Launch $50 Google Ads campaign
