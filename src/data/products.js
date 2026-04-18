// Digital products catalog for /store.
//
// Sales channel: Stripe Payment Links (zero serverless-function cost) OR
// Gumroad embed URLs — both are configured per-product from the vendor
// dashboard, pasted into the matching field here, and go live on the
// next deploy. No webhook, no database, no DB migration required.
//
// Status flags:
//   "live"      — buyLink is set, full buy CTA rendered
//   "waitlist"  — no buyLink yet; email-capture CTA rendered so we can
//                 measure demand before finishing the content
//
// Adding a product: drop a new entry here. /store renders everything
// in `priority` order. Lower number = shown first.

const env = import.meta.env;

export const products = [
  {
    slug: "hipaa-starter-kit",
    title: "Florida Small-Business HIPAA Starter Kit",
    tagline: "Pass your first HIPAA audit without paying a consultant $2,500.",
    price: 79,
    featured: true,
    audience: "Dental, medical, physical therapy, and specialty-practice offices in Florida.",
    description:
      "Everything a 2-20 person Florida practice needs to document HIPAA compliance — written in plain English, pre-filled with Florida-specific defaults, and already formatted for your cyber-insurance renewal.",
    contents: [
      "HIPAA Administrative Safeguards checklist (all 9 required areas)",
      "HIPAA Physical Safeguards checklist (4 required areas + Florida hurricane provisions)",
      "HIPAA Technical Safeguards checklist (5 required areas + MFA guidance)",
      "Business Associate Agreement (BAA) template — signature-ready",
      "Written Risk Assessment questionnaire (42 questions insurers actually ask)",
      "Notice of Privacy Practices — Florida-compliant version",
      "Required patient-facing signage, print-ready",
      "Password Policy + Acceptable Use Policy templates",
      "Incident Response one-pager for the front desk",
      "Annual Compliance Review checklist",
    ],
    buyLink: env.VITE_PRODUCT_HIPAA_KIT_BUY_URL || null,
    previewUrl: "/products/hipaa-starter-kit-preview.md",
    priority: 1,
  },
  {
    slug: "wisp-template",
    title: "Written Information Security Program (WISP)",
    tagline: "The document your cyber-insurance carrier keeps asking for.",
    price: 149,
    audience: "Any Florida small business renewing cyber insurance or going through a vendor risk assessment.",
    description:
      "A fully-drafted Written Information Security Program tailored to 5-50 person offices. Answers every question on the standard cyber-insurance renewal questionnaire so you do not spend three weekends piecing one together from Google results.",
    contents: [
      "Executive summary (the page the insurer actually reads)",
      "Risk assessment methodology section",
      "Administrative, physical, and technical control matrices",
      "Incident response plan with notification timelines",
      "Third-party / vendor risk management appendix",
      "Annual review schedule + version control log",
      "Fillable fields for your company name, roles, and locations",
    ],
    buyLink: env.VITE_PRODUCT_WISP_BUY_URL || null,
    priority: 2,
  },
  {
    slug: "cyber-insurance-answers",
    title: "Cyber-Insurance Questionnaire Answer Kit",
    tagline: "Pre-written answers to the 40 questions insurers keep asking.",
    price: 99,
    audience: "Any business renewing cyber insurance in 2026 — rates are up 30% if you answer wrong.",
    description:
      "Every question from the three biggest cyber-insurance carriers' 2026 renewal questionnaires, with pre-written answers that demonstrate 'good posture' without overpromising. Copy-paste, edit for accuracy, submit.",
    contents: [
      "40 most-asked questions across Chubb, Travelers, and Beazley 2026 forms",
      "Model answer for each, rated 'good' / 'better' / 'best' by expected premium impact",
      "Red-flag answers to avoid (the ones that trigger a policy decline)",
      "Evidence checklist — what to have ready if the insurer audits",
    ],
    buyLink: env.VITE_PRODUCT_INSURANCE_KIT_BUY_URL || null,
    priority: 3,
  },
  {
    slug: "hurricane-it-playbook",
    title: "Hurricane-Season IT Continuity Playbook",
    tagline: "For Gulf Coast offices. Tested in the 2024 season.",
    price: 49,
    audience: "Every small business on the Florida Gulf Coast, Sarasota-Bradenton-Venice-Naples corridor.",
    description:
      "The exact playbook we run for our Sarasota and Bradenton clients every June 1st. What to back up, what to unplug, what to photograph for insurance, and how to get your phones answering again from a laptop in Atlanta before the eye even passes.",
    contents: [
      "June 1st pre-season checklist (14 items)",
      "72-hour pre-landfall runbook",
      "During-storm decision tree: stay open? close? partial?",
      "Day-1 / Day-3 / Day-7 recovery checklists",
      "Insurance-claim photo checklist (what adjusters actually need)",
      "Communication templates for staff and clients",
      "List of the 6 things that actually survived the last three storms (and what did not)",
    ],
    buyLink: env.VITE_PRODUCT_HURRICANE_KIT_BUY_URL || null,
    priority: 4,
  },
  {
    slug: "onboarding-runbook",
    title: "Employee Onboarding + Offboarding IT Runbook",
    tagline: "Stop forgetting to revoke the fired employee's email.",
    price: 39,
    audience: "Growing offices (10+ people) where HR adds and removes people monthly.",
    description:
      "The Day-0 and Day-365 checklists you can hand to an office manager. Every account, badge, credential, device, and SaaS seat that needs to be set up or torn down, in the order that actually prevents security gaps.",
    contents: [
      "Day-0 new-hire IT checklist (22 items)",
      "Day-0 offboarding checklist — 90-minute version for involuntary terminations",
      "Standard offboarding checklist — 5-day version for planned departures",
      "SaaS seat inventory template",
      "Hardware return log",
      "Email forwarding / auto-reply templates",
    ],
    buyLink: env.VITE_PRODUCT_ONBOARDING_KIT_BUY_URL || null,
    priority: 5,
  },
];
