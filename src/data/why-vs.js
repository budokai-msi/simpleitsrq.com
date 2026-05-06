// Marketing comparison pages: "Simple IT SRQ vs <competitor category>"
// Powers /why/:slug routes. Distinct from src/data/comparisons.js which is
// vendor-vs-vendor (1Password vs Bitwarden, etc.).
//
// Voice: enterprise B2B, no hyperbole, no fabricated claims. Differences
// must be ones we'd defend in a sales call. Competitor names that map to
// real businesses (Geek Squad) carry only public-record statements.

export const WHY_VS = {
  "vs-tampa-msps": {
    slug: "vs-tampa-msps",
    title: "Simple IT SRQ vs Tampa MSPs | Local Sarasota IT vs I-75 Drive-Down",
    metaDescription:
      "Why a Sarasota-Bradenton business is better served by a regional managed-services partner than by a Tampa MSP running this market on a per-trip drive-down. Response time, dispatch model, and onsite economics compared.",
    competitor: "Tampa-based MSPs",
    eyebrow: "Why Simple IT SRQ · vs Tampa MSPs",
    h1: "Local engineering, dispatched locally.",
    subhead:
      "Most of the MSPs marketing into Sarasota and Bradenton are headquartered in Tampa or St. Pete. That changes the unit economics of every onsite visit, every after-hours escalation, and every hurricane-week scramble. Here's what that actually means in 2026.",
    cta: { primary: "Request an IT assessment", primaryHref: "/book", secondary: "See capabilities", secondaryHref: "/#solutions" },
    rows: [
      {
        attribute: "Engineering dispatch",
        sirq: "Sarasota and Bradenton (HQ inside ZIP 34207). Same-day onsite is the standard contract, not a per-mile premium.",
        them: "I-75 from Tampa or St. Pete. 60–90 minutes one-way before the engineer is in your office. Onsite often billed per visit or carries a regional surcharge.",
      },
      {
        attribute: "Hurricane-week response",
        sirq: "Engineers ride out the same storm you do. Local generator coverage. Three documented post-hurricane account restorations in the last five years, all inside our dispatch radius.",
        them: "Tampa-based dispatch may itself be evacuated or without power. Sarasota County loses I-75 access during major storm tracks; remote-only support becomes the only option.",
      },
      {
        attribute: "Account ownership",
        sirq: "Named primary engineer per account. Knows your environment, your staff, and the controls your insurance carrier asks about.",
        them: "Tier-1 ticket queue first. Senior engineer assigned only after escalation. Account ownership rotates with staff turnover at the MSP.",
      },
      {
        attribute: "After-hours phone",
        sirq: "On-call engineer answers on the first ring during business hours; documented escalation tree after hours. No outsourced overflow desk.",
        them: "Often routed to a national after-hours NOC unfamiliar with your stack. Triage adds 15–40 minutes before a senior engineer is on the line.",
      },
      {
        attribute: "Pricing model",
        sirq: "Flat monthly contract. Public per-seat pricing. No hourly surprises, no break/fix invoicing on contracted work.",
        them: "Often hybrid: a base MRR plus hourly billing for anything outside a narrowly-scoped MSA. Onsite trips frequently billed separately.",
      },
      {
        attribute: "Compliance documentation",
        sirq: "HIPAA risk assessments, GLBA evidence packages, and cyber-insurance renewal artifacts included on every engagement. Audit-ready binders refreshed annually.",
        them: "Compliance documentation typically scoped as a paid project on top of MRR. Renewal-cycle artifacts not always included.",
      },
      {
        attribute: "Healthcare-vertical depth",
        sirq: "EHR vendor coordination, BAAs, and Safeguards documentation purpose-built for the dozens of independent practices in Sarasota and Manatee counties.",
        them: "Healthcare often a small share of the book. EHR vendor calls treated as a billable scope expansion.",
      },
      {
        attribute: "Strategic IT review",
        sirq: "Quarterly Strategic IT Reviews with a senior engineer. Plain-English roadmap of what's working, what's about to fail, and what belongs in next year's budget.",
        them: "Annual or semi-annual review common; depth varies. Strategic IT advisory often a separately-billed vCIO line item.",
      },
    ],
    closer: {
      h2: "When does picking the Tampa MSP actually make sense?",
      body:
        "When the buying organization has a corporate footprint already standardized on a Tampa-headquartered vendor — typically a regional bank, hospital system, or franchise with central procurement — the Tampa MSP relationship may already be in place at the parent level. For independent Sarasota and Bradenton businesses operating on their own contract, the regional dispatch model is a structural disadvantage that doesn't get better with a bigger MSA.",
    },
  },

  "vs-geek-squad": {
    slug: "vs-geek-squad",
    title: "Simple IT SRQ vs Geek Squad | Managed IT vs In-Store Computer Repair",
    metaDescription:
      "Geek Squad is a consumer-electronics retail service. Simple IT SRQ is a managed-services provider operating business IT for Sarasota and Bradenton. Here's where the two actually overlap, and where they don't.",
    competitor: "Geek Squad",
    eyebrow: "Why Simple IT SRQ · vs Geek Squad",
    h1: "Business IT operations vs. retail computer repair.",
    subhead:
      "Geek Squad is the in-store consumer-electronics service desk at Best Buy. It's a strong product for what it is. It is not a managed-services provider, and a small business running on it accumulates risk every quarter. Here's the honest comparison — including the cases where Geek Squad is genuinely the right call.",
    cta: { primary: "Request an IT assessment", primaryHref: "/book", secondary: "See capabilities", secondaryHref: "/#solutions" },
    rows: [
      {
        attribute: "Engagement model",
        sirq: "Managed services. Flat monthly contract covering identity, security, network, endpoint, backup, continuity, and compliance — operated as a single program.",
        them: "Per-incident retail service. Walk-in or scheduled appointment. Each ticket is a one-shot transaction.",
      },
      {
        attribute: "Onsite for businesses",
        sirq: "Engineers dispatched to your office. Same-day onsite standard. Cabling, network buildouts, server work, conference rooms, and security cameras are part of the practice.",
        them: "In-home / in-office service is available, but the engineer is a generalist consumer technician, not a senior network or M365 engineer. No structured cabling, no firewall management, no enterprise Wi-Fi design.",
      },
      {
        attribute: "Microsoft 365 / Google Workspace",
        sirq: "Tenant-level operations: conditional access, MFA enforcement, license rightsizing, exchange transport rules, DLP, retention policies, identity governance.",
        them: "Email account setup at the consumer level. No tenant-level security baseline, no conditional access policy, no audit-log monitoring.",
      },
      {
        attribute: "Cybersecurity",
        sirq: "EDR, MDR, phishing-resistant MFA, conditional access, written incident-response plan, quarterly tabletop exercises. SOC-monitored controls where applicable.",
        them: "Antivirus install and basic malware removal. No monitoring, no incident-response plan, no compliance evidence.",
      },
      {
        attribute: "Backup & continuity",
        sirq: "Replicated off-site backups with documented RTO/RPO. Quarterly restore testing. Hurricane-season continuity runbook.",
        them: "Optional consumer cloud backup product. Not designed for business RTO/RPO and not tested as part of a continuity plan.",
      },
      {
        attribute: "Compliance",
        sirq: "HIPAA, GLBA, and cyber-insurance evidence packages. Written risk assessments, BAAs, and Safeguards documentation. Audit-ready binders refreshed annually.",
        them: "No compliance program. Geek Squad does not produce HIPAA, GLBA, or cyber-insurance evidence artifacts.",
      },
      {
        attribute: "Account ownership",
        sirq: "Named primary engineer who knows your environment, your staff, and the controls your insurance carrier asks about.",
        them: "Whichever Geek Squad agent is on shift the day you walk in. No persistent account relationship.",
      },
      {
        attribute: "When the right call is the other one",
        sirq: "If your need is a single out-of-warranty laptop repair, a one-time data recovery, or a home TV mount, a retail service desk is faster and cheaper than booking a managed-services engagement.",
        them: "Genuinely the right answer for one-off consumer repair, in-home installs of consumer electronics, and protection plans on retail purchases. Use it accordingly.",
      },
    ],
    closer: {
      h2: "Where the line actually sits",
      body:
        "Geek Squad is excellent at what Best Buy designed it to be: a retail service desk for consumer electronics. The mismatch starts when a 15-person dental practice or a 30-person law firm tries to operate on it. There's no managed-services contract underneath — no monitoring, no compliance documentation, no continuity plan, no named engineer. A single ransomware incident in a regulated practice with no incident-response plan isn't a $300 service ticket; it's a reportable breach. Pick the model that matches the risk you actually carry.",
    },
  },
};

export function getWhyVs(slug) {
  return WHY_VS[slug] || null;
}

export const WHY_VS_LIST = Object.values(WHY_VS);
