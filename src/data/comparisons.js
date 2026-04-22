// Source of truth for /compare/<slug> vendor-vs-vendor pages.
//
// These pages target high-intent "X vs Y" Google queries ("1Password vs
// Bitwarden", "M365 Business Premium vs Google Workspace Business Plus").
// The searcher is near-buying — a good page converts several multiples
// higher than a general blog post on the same topic.
//
// Opinions here are grounded in publicly documented feature differences or
// hands-on Florida-SMB deployment experience. If we can't verify an
// attribute (e.g. exact SOC 2 Type II report date for a given vendor),
// omit that row rather than guess — a fabricated row is worse than a
// missing one for a page Google will eventually rank.
//
// Schema:
//   slug              URL segment. Also the canonical key.
//   title             <title> tag.
//   metaDescription   <meta name="description">.
//   h1                Page H1. Usually a trimmed version of title.
//   subhead           One-line tension statement rendered under the H1.
//   date              ISO date of last editorial pass — used by sitemap
//                     lastmod and shown to readers.
//   products[]        Exactly two products, side-by-side. Each entry:
//                       - name           display name
//                       - stackToolId    (optional) matches STACK tools
//                                        in src/data/stack.js; resolves
//                                        to the configured affiliate.
//                       - affiliateKey   (optional) direct affiliates.js
//                                        key; wins over stackToolId if
//                                        both set.
//                       - fallbackUrl    vendor homepage used when no
//                                        affiliate is configured.
//                       - priceHint      short price string.
//                       - pros[]         4–6 bullets.
//                       - cons[]         2–4 bullets.
//                       - bestFor        one line on which SMB profile
//                                        should pick this option.
//   attributes[]      Table rows. Each { label, values: [A, B] }. Leave
//                     a row off entirely when one side is unknown.
//   verdict           Opinion paragraph.
//   relatedComparisons[]  Optional cross-links to sibling slugs.

/** @typedef {Object} ComparisonProduct
 *  @property {string} name
 *  @property {string} [stackToolId]
 *  @property {string} [affiliateKey]
 *  @property {string} fallbackUrl
 *  @property {string} priceHint
 *  @property {string[]} pros
 *  @property {string[]} cons
 *  @property {string} bestFor
 */

/** @typedef {Object} Comparison
 *  @property {string} slug
 *  @property {string} title
 *  @property {string} metaDescription
 *  @property {string} h1
 *  @property {string} subhead
 *  @property {string} date
 *  @property {[ComparisonProduct, ComparisonProduct]} products
 *  @property {{label: string, values: [string, string]}[]} attributes
 *  @property {string} verdict
 *  @property {string[]} [relatedComparisons]
 */

/** @type {Comparison[]} */
export const COMPARISONS = [
  {
    slug: "1password-vs-bitwarden",
    title: "1Password Business vs Bitwarden Business (2026 Florida SMB Comparison)",
    metaDescription:
      "1Password Business vs Bitwarden Business for Sarasota-Bradenton offices. Price, UX, directory sync, SSO, self-host — and which one your staff will actually use.",
    h1: "1Password Business vs Bitwarden Business",
    subhead:
      "Both pass your cyber-insurance renewal. Here's which one your staff will actually use.",
    date: "2026-04-22",
    products: [
      {
        name: "1Password Business",
        stackToolId: "1password-business",
        affiliateKey: "onepassword",
        fallbackUrl: "https://1password.com/business",
        priceHint: "$7.99/user/mo",
        pros: [
          "Browser and mobile UX is the one where staff actually adopt it — the single biggest variable for a password manager rollout.",
          "Directory sync with M365 Entra ID and Google Workspace included in Business tier, so onboarding/offboarding is one checkbox.",
          "Watchtower surfaces breached, reused, and weak passwords inline — not in a separate report nobody reads.",
          "Travel Mode removes selected vaults from devices before a border crossing, which a handful of our clients actually use.",
          "Best-in-class secret-scanning in shared developer/admin vaults.",
        ],
        cons: [
          "More expensive per seat at $7.99/user/mo.",
          "Closed-source — no community audit option.",
          "No self-hosted deployment path.",
        ],
        bestFor:
          "Offices that prioritize staff adoption and minimal IT handholding over per-seat cost.",
      },
      {
        name: "Bitwarden Business",
        fallbackUrl: "https://bitwarden.com/products/business/",
        priceHint: "$6/user/mo",
        pros: [
          "Roughly 25% cheaper per seat than 1Password Business.",
          "Open-source codebase — independently audited and community-inspectable.",
          "Self-hosted deployment path (Docker/Helm) if you have a hard data-residency requirement.",
          "SSO with SAML 2.0 included in the Business (Enterprise) tier.",
          "Directory Connector syncs users from Entra ID, Google Workspace, Okta, or LDAP.",
        ],
        cons: [
          "Browser extension and desktop UX are visibly rougher than 1Password — more clicks, less polish, and our onboarding data shows higher abandonment.",
          "Admin console is functional but spartan compared to 1Password's.",
          "Mobile autofill works, but with more edge cases that end up in a support ticket.",
        ],
        bestFor:
          "Cost-sensitive or technical offices where staff won't abandon a rougher UX.",
      },
    ],
    attributes: [
      { label: "Business-tier price", values: ["$7.99/user/mo", "$6/user/mo"] },
      {
        label: "Directory sync (Entra ID / Google Workspace)",
        values: ["Yes (native)", "Yes (Directory Connector)"],
      },
      { label: "SSO (SAML 2.0)", values: ["Yes", "Yes"] },
      { label: "Hardware key support (WebAuthn / FIDO2)", values: ["Yes", "Yes"] },
      { label: "Open-source codebase", values: ["No", "Yes"] },
      { label: "Self-host option", values: ["No", "Yes (Docker/Helm)"] },
      { label: "SOC 2 Type II", values: ["Yes", "Yes"] },
      { label: "Staff-adoption UX (our field data)", values: ["A", "B"] },
      { label: "Admin console polish", values: ["A", "B-"] },
      { label: "Secret-scanning (shared vaults)", values: ["Yes", "Limited"] },
      { label: "Cyber-insurance questionnaire: satisfies MFA + PM box", values: ["Yes", "Yes"] },
    ],
    verdict:
      "For most Sarasota-Bradenton small offices, pick 1Password. The $2/user/mo delta is real, but we've watched too many Bitwarden rollouts quietly fail because half the staff gave up on the browser extension and went back to a sticky note. Bitwarden is the right answer when IT is cost-obsessed and the team is technical (engineering shops, MSP internal use, offices where most of the staff already live in the CLI). For everyone else, the UX gap ends up more expensive than the license delta.",
    relatedComparisons: [],
  },

  {
    slug: "m365-business-premium-vs-google-workspace-business-plus",
    title:
      "M365 Business Premium vs Google Workspace Business Plus (2026 Florida SMB Comparison)",
    metaDescription:
      "Microsoft 365 Business Premium vs Google Workspace Business Plus for Florida small offices. Security, HIPAA, cyber-insurance readiness, per-seat math, and which one to pick.",
    h1: "M365 Business Premium vs Google Workspace Business Plus",
    subhead:
      "Both tiers pass a 2026 cyber-insurance renewal. Picking the wrong one costs more in staff retraining than in licenses.",
    date: "2026-04-22",
    products: [
      {
        name: "Microsoft 365 Business Premium",
        stackToolId: "m365-business-premium",
        fallbackUrl:
          "https://www.microsoft.com/en-us/microsoft-365/business/microsoft-365-business-premium",
        priceHint: "$22/user/mo",
        pros: [
          "Desktop Office apps (Word, Excel, Outlook, PowerPoint) installed locally — the version most Florida CPAs, attorneys, and insurance agents are trained on.",
          "Intune endpoint management covers Windows laptops, iPads, and iPhones from one console.",
          "Defender for Business adds EDR-class protection at no extra seat cost — on Google's side you bring your own.",
          "Conditional Access policies let you block sign-in from outside the US, enforce compliant devices, and gate privileged actions.",
          "Email-archiving and eDiscovery built in — the specific line a HIPAA or FTC Safeguards auditor points at.",
        ],
        cons: [
          "Licensing labyrinth: Business Basic, Standard, Premium, Apps for Business, and the Copilot add-ons are not easy to tell apart.",
          "Teams meetings and file-sharing UX are heavier than Google's.",
          "Admin console is split across portal.office.com, admin.microsoft.com, security.microsoft.com, Entra — every vendor's least-favorite thing.",
        ],
        bestFor:
          "Offices already running Windows laptops and Office desktop apps, especially HIPAA-covered practices and insurance/accounting firms.",
      },
      {
        name: "Google Workspace Business Plus",
        stackToolId: "google-workspace",
        fallbackUrl: "https://workspace.google.com/pricing.html",
        priceHint: "$22/user/mo",
        pros: [
          "Gmail, Drive, Docs, Meet UX is simpler and faster for staff not trained on Office.",
          "Vault covers retention + eDiscovery — the exact pair a HIPAA or audit review asks about.",
          "Advanced endpoint management with enforced screen lock, device encryption checks, and remote wipe.",
          "One admin console — admin.google.com — instead of Microsoft's four.",
          "Realtime collaboration in Docs/Sheets/Slides is visibly smoother than the equivalent flow in Office.",
        ],
        cons: [
          "No local desktop apps — offices with heavy Excel macro or Outlook workflow will feel it.",
          "No included EDR-class endpoint protection; you'll bring SentinelOne, Huntress, or equivalent separately.",
          "Less flexible conditional-access controls than Microsoft Entra ID.",
          "Third-party integrations around GovCon, legal practice management, and tax software skew Microsoft-first.",
        ],
        bestFor:
          "Service-business offices (marketing, design, photography, consulting) where most work lives in a browser and staff was never trained on Office.",
      },
    ],
    attributes: [
      { label: "List price (2026)", values: ["$22/user/mo", "$22/user/mo"] },
      { label: "Desktop Office apps included", values: ["Yes", "No"] },
      { label: "Included EDR / endpoint protection", values: ["Yes (Defender for Business)", "No"] },
      { label: "Endpoint management (MDM)", values: ["Intune", "Google Endpoint Mgmt (advanced)"] },
      { label: "Email archive + eDiscovery", values: ["Yes (Exchange Online Archiving + Purview)", "Yes (Vault)"] },
      { label: "BAA available (HIPAA)", values: ["Yes", "Yes"] },
      { label: "Meeting platform", values: ["Microsoft Teams", "Google Meet"] },
      { label: "Admin-console count", values: ["4+", "1"] },
      { label: "Conditional access / context-aware access", values: ["Yes (Entra ID)", "Yes (Context-Aware Access)"] },
      { label: "Satisfies 2026 cyber-insurance MFA + endpoint box", values: ["Yes", "Yes"] },
    ],
    verdict:
      "Pick Microsoft 365 Business Premium if your office is already Windows-first, runs desktop Office apps, or operates in HIPAA/insurance/accounting/legal — you'll save the cost of a separate EDR and match the software your clients send you. Pick Google Workspace Business Plus if staff is browser-native, works heavily in realtime docs, and doesn't need the Office desktop fidelity. Most Florida small offices we see end up on M365 Business Premium specifically because Defender for Business is bundled — that's a $3-7/user/mo bill you skip.",
    relatedComparisons: ["1password-vs-bitwarden"],
  },

  {
    slug: "acronis-vs-datto",
    title: "Acronis Cyber Protect vs Datto (2026 Florida SMB Backup Comparison)",
    metaDescription:
      "Acronis Cyber Protect vs Datto for Florida small-business backup and disaster recovery. Price, hurricane readiness, MSP vs direct buying, and which to pick.",
    h1: "Acronis Cyber Protect vs Datto",
    subhead:
      "Which backup tool actually restores your files the Monday after a hurricane.",
    date: "2026-04-22",
    products: [
      {
        name: "Acronis Cyber Protect",
        stackToolId: "acronis-cyber-protect",
        affiliateKey: "acronis",
        fallbackUrl: "https://www.acronis.com/en-us/business/cyber-protect/",
        priceHint: "$80–$200/mo per 10 devices",
        pros: [
          "Single agent covers backup, anti-ransomware, and endpoint protection — meaningful for a 10-person office that can't run three separate tools.",
          "Direct-buy option is viable; you don't have to go through an MSP reseller to get a license.",
          "Cloud + local hybrid storage, so a Gulf Coast office keeps a local copy but also survives losing the office to flooding.",
          "30-day retention default lines up with what most cyber-insurance carriers want to see.",
          "Restore UX is fast enough that we've recovered three clients' data inside a business day post-storm.",
        ],
        cons: [
          "Less depth on BCDR-specific appliances than Datto.",
          "Reporting and audit trails are functional but not as polished for a formal compliance review.",
          "Anti-ransomware rollback works well on Windows; Mac support is thinner.",
        ],
        bestFor:
          "5–50 person Florida offices without a dedicated IT team — one tool, direct-buy, local + cloud.",
      },
      {
        name: "Datto",
        fallbackUrl: "https://www.datto.com/",
        priceHint: "MSP-quoted (varies; $150–$500/mo typical for a small office)",
        pros: [
          "Purpose-built BCDR appliances with image-level failover — a dead server can spin up as a local VM on the Datto appliance in minutes.",
          "Instant virtualization (local and cloud) is the gold standard for RTO; for an office that can't tolerate an hour offline this is meaningful.",
          "Extensive MSP channel tooling — reporting, SLAs, billing — if you buy through an MSP.",
          "SIRIS and ALTO product families cover a wide range of environments, from a single server to multi-site.",
        ],
        cons: [
          "Effectively MSP-only: buying direct is not the normal flow. You'll go through a reseller.",
          "Price is usually 1.5–3x Acronis on a comparable workload, especially including the appliance.",
          "Appliance-based architecture means a piece of hardware you have to site, power, and maintain — something to think about in a small FL office with limited rack space.",
          "Pricing is opaque — you won't get a public per-seat number without a conversation.",
        ],
        bestFor:
          "Offices with a dedicated MSP relationship and a hard recovery-time objective under an hour.",
      },
    ],
    attributes: [
      { label: "Sales model", values: ["Direct or MSP", "MSP channel"] },
      { label: "Local + cloud backup", values: ["Yes", "Yes"] },
      { label: "Anti-ransomware rollback", values: ["Yes (integrated)", "Yes (integrated)"] },
      { label: "Image-level instant virtualization", values: ["Limited", "Yes (core feature)"] },
      { label: "Hardware appliance required", values: ["No", "Typically yes"] },
      { label: "Endpoint protection bundled", values: ["Yes", "Add-on"] },
      { label: "BAA available (HIPAA)", values: ["Yes", "Yes"] },
      { label: "Public per-seat pricing", values: ["Published tiers", "Quote-only"] },
      { label: "Fit for 5–25 person Florida office", values: ["A", "B"] },
      { label: "Fit for sub-1-hour RTO requirement", values: ["B+", "A"] },
    ],
    verdict:
      "For the typical Sarasota-Bradenton small office — 5–25 seats, a file server, one or two line-of-business apps — Acronis is the right answer. Direct purchasing, one agent, local + cloud, and a price point that doesn't require a conversation. Datto is the right answer when you have an MSP partner, a real sub-hour RTO requirement, and the budget that goes with it. If you find yourself being quoted Datto without a clear RTO justification, that's usually a sign your MSP is optimizing for their margin instead of your use case.",
    relatedComparisons: [],
  },

  {
    slug: "gusto-vs-adp-run",
    title: "Gusto vs ADP RUN (2026 Florida Small-Business Payroll Comparison)",
    metaDescription:
      "Gusto vs ADP RUN for Florida small businesses. Price, usability, benefits, Florida unemployment filing, and which payroll service to pick for a 1–50 person office.",
    h1: "Gusto vs ADP RUN",
    subhead:
      "Which payroll service you can run yourself, and which one charges you for calling support.",
    date: "2026-04-22",
    products: [
      {
        name: "Gusto",
        stackToolId: "gusto",
        affiliateKey: "gusto",
        fallbackUrl: "https://gusto.com/",
        priceHint: "$40/mo base + $6/person (Core) up to $80 + $12 (Plus)",
        pros: [
          "Onboarding and payroll run UI is genuinely usable by a non-accountant office manager — which is the entire sales pitch for SMB payroll.",
          "Florida unemployment filing is automatic and we've yet to see a mis-file in our client base.",
          "Flat, published pricing on the website. The number you quote is the number you pay.",
          "Benefits (health, dental, vision, 401k) integrate cleanly — no separate broker login.",
          "SOC 2 Type II and BAAs available — clears the cyber-insurance vendor-risk questionnaire row.",
          "I-9 and W-4 e-signing built in; no separate DocuSign.",
        ],
        cons: [
          "Customer support is chat/email-first; phone support exists but isn't instant.",
          "Less depth for multi-state complex scenarios than ADP or Rippling.",
          "Reports are good but not as customizable as an enterprise-grade tool.",
        ],
        bestFor:
          "1–50 person Florida offices that want to run their own payroll, not outsource it.",
      },
      {
        name: "ADP RUN",
        fallbackUrl: "https://www.adp.com/what-we-offer/payroll/run-powered-by-adp.aspx",
        priceHint: "Quote-only; typically $60–$180/mo base + $4–$10/person",
        pros: [
          "Deep bench: every tax form, state, and edge case has been filed by ADP a million times. Low blast radius on weird-payroll situations.",
          "Named dedicated support available on the paid tiers — the selling point for offices that want a phone number.",
          "Integrates with a broad set of 401k providers and legacy HRIS systems.",
          "Scales upmarket without a re-platform if you grow.",
        ],
        cons: [
          "Opaque pricing. Every office we've helped onboard was quoted a different per-person number, sometimes with unexpected setup fees.",
          "UX is dated and built around a payroll specialist, not a non-accountant office manager.",
          "Feature unbundling: HR, time tracking, benefits each add a line item.",
          "Contract terms are more rigid; mid-year cancellation is harder than with Gusto.",
          "Upsells are frequent and have occasionally caught clients by surprise.",
        ],
        bestFor:
          "Offices that prefer a named specialist on the phone, or anticipate complex multi-state expansion.",
      },
    ],
    attributes: [
      { label: "Published flat pricing", values: ["Yes", "No (quote)"] },
      { label: "Runs a Florida unemployment filing automatically", values: ["Yes", "Yes"] },
      { label: "UI a non-accountant can run unassisted", values: ["Yes", "Partial"] },
      { label: "Built-in health benefits brokerage", values: ["Yes", "Add-on / separate"] },
      { label: "BAA available (HIPAA)", values: ["Yes", "Yes"] },
      { label: "SOC 2 Type II", values: ["Yes", "Yes"] },
      { label: "I-9 / W-4 e-signing", values: ["Yes", "Yes"] },
      { label: "Dedicated named support rep", values: ["Higher tiers", "Yes (paid tiers)"] },
      { label: "Cancel / switch friction", values: ["Low", "Higher"] },
      { label: "Fit for 1–25 person Florida office", values: ["A", "B"] },
    ],
    verdict:
      "For 95% of the Sarasota-Bradenton offices we work with — 1–25 people, one state, a mix of W-2 and 1099 — Gusto is the right answer. Transparent pricing, a UI a non-accountant can drive, and Florida unemployment filing that just works. ADP RUN is the right answer when you already have a payroll specialist, span multiple states, or want a dedicated phone rep handling questions. If you're on ADP today paying $150+/mo for a 5-person office, it's worth at least getting a Gusto quote — the delta usually pays for a year of your password manager.",
    relatedComparisons: [],
  },
];

/** Look up a comparison by slug. Returns undefined when not found. */
export function getComparison(slug) {
  if (!slug) return undefined;
  return COMPARISONS.find((c) => c.slug === slug);
}
