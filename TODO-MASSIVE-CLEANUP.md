# Simple IT SRQ — Massive Site Cleanup & Growth Plan

## Context
- **Goal**: Rank #1 in Bradenton, Sarasota, Venice for everything IT-related.
- **Current Problem**: Site has AI slop, half-baked pages (cyber insurance, compliance audit referrals), broken links, empty product catalog, auto-generated blog drafts, and no active affiliate revenue.
- **Team**: 2 AI LLMs (Kimi + ChatGPT).

---

## DIVISION OF LABOR

### 🤖 KIMI (Me) — Technical Execution, Architecture, Code
**What I do best**: Delete code, restructure routes, fix SEO plumbing, set up integrations, build features, deploy.

### 🤖 CHATGPT — Content Strategy, Writing, Research
**What GPT does best**: Voice, storytelling, competitive analysis, ad copy, humanizing prose.

---

## PHASE 1: DEMOLITION (Remove What You Don't Offer)

### 1.1 Remove Compliance Audit Referral Page
- **Owner**: Kimi
- **Files**: `src/pages/ComplianceAuditReferral.jsx`, `src/components/ComplianceAuditCTA.jsx`
- **Actions**:
  - Delete route from `App.jsx`
  - Remove from `src/data/navigation.js`
  - Remove from sitemap generation
  - Add 301 redirect (or let it 404 gracefully)

### 1.2 Strip Cyber-Insurance Language (You Don't Sell It)
- **Owner**: Kimi
- **Scope**: 22 files reference cyber-insurance
- **Actions**:
  - Keep: "We help you gather IT documentation for your cyber-insurance renewal" (this IS your service)
  - Remove: Any implication you SELL insurance or have broker partnerships
  - Remove: `/compliance-audit-referral` and any audit handoff flow
  - Remove: `VITE_CYBER_INSURANCE_PARTNER_URL` from `.env.example`
  - Clean `src/data/glossary.js` — remove insurance-centric framing where it overpromises
  - Clean `src/data/industries.js`, `src/data/cities.js`, `src/data/why-vs.js`, `src/data/stack.js`, `src/data/comparisons.js`
  - Clean `src/pages/Home.jsx`, `src/pages/LocalLanding.jsx`, `src/pages/IndustryLanding.jsx`, `src/pages/Partners.jsx`, `src/pages/Stack.jsx`, `src/pages/PasswordCheck.jsx`, `src/pages/Advertise.jsx`
  - Clean `src/components/ExitIntentModal.jsx`

### 1.3 Kill the Auto-Generated Blog Pipeline
- **Owner**: Kimi
- **Files**: `api/cron/agent.js` (daily blog draft generator)
- **Actions**:
  - Disable the cron job in `vercel.json`
  - Remove the blog draft generation logic from the cron handler
  - Keep: HN news aggregation if useful for YOU to read, but stop auto-publishing
  - Remove orphaned drafts from `src/data/posts.js` and `posts-meta.json`

### 1.4 Delete AI-Slop Blog Posts
- **Owner**: Kimi (deletion) + ChatGPT (rewrite decision)
- **Actions**:
  - Delete 7 orphaned auto-generated drafts (no MDX files)
  - Delete these generic/low-local-value posts:
    - `sarasota-biggest-cyber-risk-2024`
    - `sarasota-employee-password-sharing-security-risk`
    - `sarasota-employee-security-risk-training`
    - `sarasota-business-security-threats-2024`
    - `windows-11-update-breaking-computers-sarasota`
    - `florida-data-privacy-law-sarasota-small-business`
    - `cyber-insurance-rates-bradenton-sarasota-2024`
    - `employee-ai-policy-sarasota-small-business`
  - **GPT Task**: Flag any others that feel generic — Kimi will delete them.

### 1.5 Fix Broken Links
- **Owner**: Kimi
- **Actions**:
  - Remove all `/store` links from `Legal.jsx`, `GlossaryEntry.jsx`, `PasswordCheck.jsx`, `ClientPortal.jsx`, `NotFound.jsx`
  - Update `NotFound.jsx` suggestions to real, existing pages only

---

## PHASE 2: CONTENT HUMANIZATION (Make It Real)

### 2.1 Rewrite Top Blog Posts with First-Person Voice
- **Owner**: ChatGPT
- **Actions**:
  - Pick the 15 best-performing or most-strategic posts
  - Rewrite each with "I/we" voice, specific client names/scenarios, real prices, real timelines
  - Add a "Field Report" section to each: "Last Tuesday, a 12-person law firm in downtown Sarasota called us because..."
  - Remove generic stats like "80% of breaches" unless citing a specific source with date

### 2.2 Write New Original Content (Local SEO Gold)
- **Owner**: ChatGPT
- **Actions**:
  - Write 6 new posts — one per city (Sarasota, Bradenton, Lakewood Ranch, Venice, Nokomis, + 1 regional round-up)
  - Each post is a REAL field report: "What we fixed at 3 Sarasota offices this month"
  - Include: business type, problem, exact cost, time to fix, photo description
  - Target: "[city] IT support", "[city] computer repair", "[city] network setup"

### 2.3 Rewrite Service Descriptions
- **Owner**: ChatGPT
- **Actions**:
  - Rewrite `src/data/services.js` descriptions to remove AI filler
  - Lead with the pain point, not the feature list
  - Include real price ranges and real turnaround times
  - Add one client quote per service (can be composite)

### 2.4 Rewrite City Landing Pages
- **Owner**: ChatGPT
- **Actions**:
  - `src/data/cities.js` — rewrite all city intros and case studies
  - Each city page needs a UNIQUE story, not copy-paste with find-replace
  - Sarasota: medical/law focus
  - Bradenton: construction/manufacturing focus
  - Venice: snowbird/seasonal focus
  - Lakewood Ranch: professional services focus
  - Nokomis: small retail/family office focus

---

## PHASE 3: MONETIZATION (Affiliate Revenue)

### 3.1 Set Up Amazon Associates Infrastructure
- **Owner**: Kimi
- **Actions**:
  - Update `VITE_AFF_AMAZON_TAG` env var in Vercel
  - Convert all 28 `toolCatalog.js` search links to deep ASIN links
  - Add Amazon affiliate disclosure to `/tools` page and blog posts

### 3.2 Research & Add High-Converting IT Products
- **Owner**: ChatGPT (research) → Kimi (implementation)
- **Actions**:
  - GPT: Research top 20 Amazon products in these categories:
    - UPS units (APC, CyberPower)
    - NAS drives (Synology, QNAP)
    - YubiKey models
    - UniFi gear (UDM Pro, APs)
    - Reolink cameras
    - Docking stations (CalDigit, Plugable)
    - Shredders (Fellowes)
    - Network racks
  - GPT: For each, write a 2-sentence "why we install this" blurb
  - Kimi: Add to `toolCatalog.js` with ASINs and GPT blurbs

### 3.3 Activate Other Affiliate Programs
- **Owner**: Kimi (config) + ChatGPT (copy)
- **Actions**:
  - Kimi: Set env vars for Gusto, 1Password, Backblaze, HoneyBook if you have accounts
  - GPT: Write comparison posts that naturally include affiliate links:
    - "1Password vs Bitwarden for Florida Small Business"
    - "Gusto vs QuickBooks Payroll: What We See in the Field"
    - "Backblaze vs Dropbox: Backup for Sarasota Offices"

---

## PHASE 4: LEADGEN DOMINANCE (Exceed Competitors)

### 4.1 Competitive Analysis
- **Owner**: ChatGPT
- **Actions**:
  - Research top 5 leadgen competitors in SWFL (not just IT — any B2B lead gen)
  - Document their pricing, features, and UX pain points
  - Write a 1-page gap analysis: "What they do vs what we should do"

### 4.2 Leadgen Feature Upgrades
- **Owner**: Kimi
- **Actions**:
  - Add real-time demo video to `/leadgen` (even a 60-second Loom)
  - Add a live chat widget (Tawk.to) configured for leadgen
  - Add trust signals: Google review count, client logos (with permission), case study snippets
  - Add exit-intent modal with a lead magnet: "Free IT Health Checklist for Sarasota Businesses"
  - Add retargeting pixel setup (Meta + Google Ads)

### 4.3 Accurate Data & Campaigns
- **Owner**: Kimi (tech) + ChatGPT (copy)
- **Actions**:
  - Kimi: Ensure leadgen uses real OSM data, not mock data
  - GPT: Write 5 email nurture sequences for leadgen signups
  - GPT: Write 3 Google Ads headlines + descriptions for "Sarasota IT support"
  - GPT: Write 3 Meta ad sets targeting business owners in 34201-34243 zip codes

---

## PHASE 5: SEO PERFECTION (Every Page)

### 5.1 Technical SEO
- **Owner**: Kimi
- **Actions**:
  - Ensure every page has unique `<title>`, `<meta name="description">`, canonical URL
  - Add `structured data` (JSON-LD) to every page type:
    - Home: LocalBusiness + Service
    - City pages: LocalBusiness + AreaServed
    - Blog posts: Article + Author
    - Services: Service
  - Fix any pages missing `useSEO()` hook
  - Generate XML sitemap with all valid URLs (exclude /portal, /admin)
  - Add `robots.txt` with sitemap reference

### 5.2 Local SEO
- **Owner**: Kimi (schema) + ChatGPT (copy)
- **Actions**:
  - Kimi: Add `GeoCoordinates` and `OpeningHoursSpecification` to LocalBusiness schema
  - GPT: Write unique meta descriptions for every city landing page (no templates)
  - Kimi: Add `hreflang` if needed (probably not, but check)
  - Kimi: Ensure NAP (Name, Address, Phone) is identical across site, schema, and Google Business Profile

### 5.3 Content SEO
- **Owner**: ChatGPT
- **Actions**:
  - Internal linking strategy: every blog post links to 2-3 other posts + 1 service page
  - Add FAQ schema to city pages and service pages
  - Write compelling H2s that match search intent (not just "Features")

---

## PHASE 6: ADSENSE APPROVAL & OPTIMIZATION

### 6.1 AdSense Compliance
- **Owner**: Kimi
- **Actions**:
  - Ensure `ads.txt` is correct and live
  - Verify `index.html` has correct `google-adsense-account` meta tag
  - Ensure cookie consent banner gates ad loading (already done — verify)
  - Add more content to thin pages (Home, Services, Blog index already have enough)
  - Check that no page has excessive ads above the fold

### 6.2 Ad Unit Placement
- **Owner**: Kimi
- **Actions**:
  - Add in-article ad unit to blog posts (after paragraph 3 and near end)
  - Add in-feed ad unit to blog index
  - Ensure ads don't break mobile layout

---

## EXECUTION ORDER

### Week 1 (This Session)
1. Kimi: Phase 1.1–1.5 (Demolition) + deploy
2. GPT: Phase 2.1 (Rewrite top 5 blog posts) — deliver as .mdx files
3. GPT: Phase 4.1 (Competitive analysis)

### Week 2
4. Kimi: Phase 3.1–3.2 (Amazon affiliates + products) + deploy
5. GPT: Phase 2.2 (6 new city field reports)
6. GPT: Phase 2.3 (Service descriptions)

### Week 3
7. Kimi: Phase 4.2–4.3 (Leadgen upgrades + retargeting) + deploy
8. GPT: Phase 2.4 (City landing rewrites)
9. Kimi: Phase 5.1–5.2 (Technical SEO + schema)

### Week 4
10. Kimi: Phase 5.3 + 6.1–6.2 (Content SEO + AdSense)
11. GPT: Phase 3.3 (Affiliate comparison posts)
12. GPT: Phase 4.3 (Email sequences + ad copy)

---

## DELIVERABLES EXPECTED FROM CHATGPT

1. **5 rewritten blog posts** as `.mdx` files with frontmatter
2. **6 new city field reports** as `.mdx` files
3. **1 competitive analysis doc** (leadgen gap analysis)
4. **20 Amazon product blurbs** (2 sentences each, "why we install this")
5. **3 comparison posts** (1Password vs Bitwarden, Gusto vs QB, Backblaze vs Dropbox)
6. **5 email nurture sequences** (5 emails each)
7. **3 Google Ads + 3 Meta Ads** headline/description sets
8. **Rewritten `src/data/services.js`** descriptions
9. **Rewritten `src/data/cities.js`** intros and case studies

## DELIVERABLES EXPECTED FROM KIMI

1. All deletions, redirects, and broken-link fixes
2. Updated routes and navigation
3. Disabled cron job
4. Cleaned env vars
5. Amazon affiliate ASIN links in `toolCatalog.js`
6. Leadgen UX upgrades (chat, exit intent, trust signals)
7. Technical SEO schema implementation
8. XML sitemap and robots.txt
9. AdSense compliance verification
10. All builds and deployments
