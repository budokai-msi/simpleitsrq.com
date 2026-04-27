// Industry-vertical data. Combined with src/data/cities.js by
// src/pages/IndustryLanding.jsx to produce N×M long-tail landing pages
// (one per city × industry that's actually served there).
//
// Each entry mirrors the "shape" of cities.js so the LocalLanding-style
// page can render either kind of vertical with the same components.
//
// matchPattern: regex run against each city.localPatterns entry — when it
// matches, that pattern's `body` becomes the city-specific paragraph on
// the industry page. This lets us cross-reference 6 cities × 8 industries
// without rewriting the core copy.

export const industries = {
  medical: {
    slug: "medical-it",
    displayName: "Medical & Dental Practices",
    h1Prefix: "IT Support for Medical & Dental Practices",
    titleSuffix: "Medical & Dental IT Support | HIPAA-ready | Simple IT SRQ",
    serviceType: "Healthcare IT",
    matchPattern: /medical|dental|practice|imaging|physical therapy|chiropract/i,
    cities: ["sarasota", "bradenton", "lakewood-ranch", "nokomis", "venice", "bradenton-34207"],
    intro:
      "Medical and dental practices on the Florida Gulf Coast carry three layers of IT obligation that every other small business avoids: HIPAA technical and administrative safeguards, an EHR vendor whose uptime defines your day, and a cyber-insurance renewal questionnaire that gets longer every year. Simple IT SRQ specializes in independent practices — 4 to 60 providers — that need real HIPAA paperwork, real backups, and a tech who shows up the day a workstation locks up before morning huddle.",
    emphasis: [
      "Written HIPAA Risk Assessment + Safeguards documentation refreshed annually",
      "EHR vendor coordination — we book the integration calls so you don't",
      "Cyber-insurance evidence binder ready before your renewal questionnaire arrives",
      "Encrypted, off-site, quarterly-tested backups (most regulators ask for this)",
      "Two-factor authentication on every account that touches PHI",
      "Business Associate Agreements (BAAs) with every vendor that touches your data",
    ],
    faqs: [
      {
        q: "Do you sign a BAA?",
        a: "Yes. We're a Business Associate under HIPAA and sign a BAA with every medical client before any work begins. We can also help you collect BAAs from your other vendors (EHR, billing, secure-messaging, document storage) — most practices we onboard discover at least one missing BAA in the first 60 days.",
      },
      {
        q: "We use [EHR vendor] — do you know it?",
        a: "Probably. We've worked alongside Dentrix, Eaglesoft, Open Dental, eClinicalWorks, Athenahealth, Practice Fusion, NextGen, Curve, and most of the imaging suites used in Sarasota and Manatee County. If your EHR is one we haven't touched, we'll be upfront and bill our learning hours at half rate.",
      },
      {
        q: "What does HIPAA paperwork actually include?",
        a: "A written Risk Assessment listing every system that touches PHI; the three Safeguards documents (Administrative, Physical, Technical); a Workforce Sanction Policy; an Incident Response runbook; an annual Workforce Training Acknowledgement log; signed BAAs with every applicable vendor. Most practices we audit have one or two of these — we deliver the full set.",
      },
      {
        q: "How does ransomware risk affect a small practice?",
        a: "A 5-provider practice that pays a ransom averages $48k–$120k all-in (ransom + downtime + breach reporting + insurance retention). We've never had a client pay a ransom because the path to ransomware in a typical practice — phished credentials + no MFA + flat network + missing backups — is closeable in a 2-week onboarding.",
      },
      {
        q: "Can you sit through a state HIPAA audit with us?",
        a: "Yes — for active managed-IT clients, audit-day attendance is included. We bring the binder, walk the surveyor through what's where, and answer the technical questions so your office manager doesn't have to.",
      },
    ],
  },

  "law-firm": {
    slug: "law-firm-it",
    displayName: "Law Firms",
    h1Prefix: "IT Support for Law Firms",
    titleSuffix: "Law Firm IT Support | Florida Bar-aligned | Simple IT SRQ",
    serviceType: "Legal IT",
    matchPattern: /law firm|legal|matter|clio|practice ?panther/i,
    cities: ["sarasota", "venice"],
    intro:
      "Solo practitioners and 4-to-30-attorney firms on the Florida Gulf Coast face the same compliance + risk-management posture as a Tampa firm five times their size — without the IT budget. Simple IT SRQ runs IT for boutique law firms across Sarasota County: matter-level document security, encrypted email workflows that don't break Outlook, audit-ready phishing-simulation evidence the Florida Bar's risk-management CLE quietly expects, and a tech who actually understands what 'attorney-client privilege' means for a backup retention policy.",
    emphasis: [
      "Matter-based document security with audit trails per file",
      "Clio, PracticePanther, MyCase, or LEAP integration support",
      "Encrypted client portal + secure file exchange (no more Dropbox links)",
      "Florida Bar-aligned phishing-simulation evidence (3+ rounds per year)",
      "Cyber-insurance renewal questionnaire pre-answered — most firms cut their renewal premium",
      "Sanitized incident-response runbook the senior partner can read in 5 minutes",
    ],
    faqs: [
      {
        q: "Are you familiar with Clio / PracticePanther / MyCase?",
        a: "Yes — we run all three at active law-firm clients. We handle Microsoft 365 + practice-management integration, document-storage governance, and the SSO setup that lets attorneys sign into the practice tool with their firm credentials.",
      },
      {
        q: "How do you handle attorney-client privileged data?",
        a: "Encrypted at rest on every device, encrypted in transit on every network, access scoped per matter when the practice tool supports it, audit logs preserved for the lifetime of the matter + 7 years. Backup retention is configured to match your firm's records-retention policy, not a generic 30-day default.",
      },
      {
        q: "Can you help us answer our cyber-insurance renewal questionnaire?",
        a: "Yes — that's one of our most-requested deliverables. We walk through every question on the carrier's 2026 form, fix anything that's missing in your environment, and hand you a written attestation packet. Several Sarasota-county firms have cut their renewal premium 15-30% after switching to us and re-submitting with a complete answer set.",
      },
      {
        q: "What happens if a partner's laptop is stolen?",
        a: "Every laptop is full-disk encrypted, MDM-enrolled, and remotely wipeable. We have a written incident-response runbook for stolen-device events that covers Florida Bar notification thresholds (depending on whether privileged data was on the device) and your insurance carrier's first-notice-of-loss requirements.",
      },
      {
        q: "Do you support hybrid workflows — courthouse, home, office?",
        a: "Yes. Every device gets the same hardened configuration whether it's in your downtown Sarasota office, the partner's home, or a hotel near a deposition. VPN to the firm's documents is unnecessary because we run everything through SharePoint or your practice tool's native cloud.",
      },
    ],
  },

  "financial-advisor": {
    slug: "financial-advisor-it",
    displayName: "Financial Advisory Firms",
    h1Prefix: "IT Support for Financial Advisors",
    titleSuffix: "Financial Advisor IT Support | SEC + GLBA aligned | Simple IT SRQ",
    serviceType: "Financial Services IT",
    matchPattern: /financial|advisor|wealth|sec |glba|registered investment/i,
    cities: ["lakewood-ranch"],
    intro:
      "Registered investment advisors and independent financial-advisory firms in Lakewood Ranch face an enforcement environment that hasn't gotten gentler in 2026. SEC examiners now expect documented MFA on every admin account, a written Information Security Program (WISP), and evidence of vendor-risk reviews. Simple IT SRQ runs the IT and the documentation side-by-side — quarterly phishing tests with reports packaged for the compliance binder, encrypted email workflows that don't break Outlook, and the GLBA Safeguards Rule paperwork your examiner will read first.",
    emphasis: [
      "SEC + GLBA-aligned Written Information Security Program (WISP)",
      "Hardware MFA keys (YubiKey 5C) on every admin and reviewer account",
      "Encrypted email workflows that don't break Outlook desktop",
      "Vendor-risk register kept current between exam cycles",
      "Quarterly phishing simulations with results packaged for compliance",
      "Annual Risk Assessment refresh aligned to SEC examination priorities",
    ],
    faqs: [
      {
        q: "Do you understand SEC examination priorities?",
        a: "Yes — we track the SEC's Division of Examinations annual priorities letter and update our compliance deliverables accordingly. The 2026 priorities are still: cybersecurity (especially MFA + identity), vendor risk, books-and-records preservation, and fee-and-expense disclosures. We cover the first three.",
      },
      {
        q: "Can you help us pass a regulatory exam?",
        a: "We've supported active clients through SEC + state-level adviser exams. We don't represent you to the regulator — that's your compliance officer's role — but we sit in the back, hand-deliver the technical evidence the examiner asks for, and follow up on anything they want clarified.",
      },
      {
        q: "What MFA do you require?",
        a: "Hardware keys (YubiKey 5C NFC) on every account that has admin or client-data access — not SMS, not push-notification authenticator apps. SMS is no longer accepted by the SEC's preferred guidance and is explicitly excluded from most 2026 cyber-insurance carrier questionnaires for advisor firms. We issue 2 keys per advisor.",
      },
      {
        q: "Do you write the WISP?",
        a: "Yes — we deliver a fully-customized Written Information Security Program covering all four GLBA Safeguards categories (Access Controls, Encryption, Monitoring, Disposal) plus the Information Security Risk Assessment that SEC examiners now ask for. Refreshed annually.",
      },
      {
        q: "Can you handle our outside-vendor due diligence?",
        a: "Yes. We maintain a vendor-risk register listing every third-party tool that touches client data (your CRM, planning software, custodian portal, e-signature provider, etc.), the SOC 2 status of each, the BAA/DPA signed (if applicable), and the last review date. Refreshed before every exam cycle.",
      },
    ],
  },

  marine: {
    slug: "marine-it",
    displayName: "Marine Services & Waterfront Businesses",
    h1Prefix: "IT Support for Marine Services & Waterfront Businesses",
    titleSuffix: "Marine IT Support | Waterfront-ready | Simple IT SRQ",
    serviceType: "Marine industry IT",
    matchPattern: /marine|waterfront|dock|lift|yacht|boat|fishing/i,
    cities: ["bradenton", "nokomis", "bradenton-34207"],
    intro:
      "Marine services, boatyards, charter operations, and waterfront repair shops along Bradenton, Cortez, and the Casey Key corridor share a problem most IT vendors don't think about: your tools have to work where the salt air kills consumer hardware in two seasons, where Wi-Fi has to reach across a lift and a slip, and where a tropical storm is part of the operating budget. Simple IT SRQ supports marine clients with ruggedized fleet tablets, dock-and-lift Wi-Fi that actually reaches the water, and offsite backups that don't assume the mainland is online.",
    emphasis: [
      "Dock + lift Wi-Fi that survives salt air and reaches across the slips",
      "Ruggedized fleet tablets for captains and field techs",
      "Invoicing systems that work from a phone when the office is down",
      "Pre-storm IT continuity checklist and tested generator-safe networking",
      "Offsite backups stored far enough inland to survive a Gulf landfall",
      "Inventory + parts-tracking that ride out multi-day power outages",
    ],
    faqs: [
      {
        q: "Can your Wi-Fi actually reach the dock?",
        a: "Yes — outdoor-rated business APs with directional antennas can reliably cover 150–300 ft of slip and lift area depending on layout. We've installed this exact setup at active marine clients in Cortez and on the Manatee River. Initial site survey is free.",
      },
      {
        q: "What happens to our IT in a hurricane?",
        a: "Pre-storm: we run a 24-hour shutdown checklist (servers powered off properly, generators fueled, backups verified, phones forwarded to cellular). During: nothing on-site is running but your data is safe in two offsite copies. Post-storm: we bring the systems back up in priority order — invoicing first, then customer-facing tools, then back-office. Most clients are operational within 48 hours of utilities returning.",
      },
      {
        q: "We use Marina/Marine-specific software (Total Marina Concept, etc.) — do you know it?",
        a: "We don't run TMC at every marine client, but we run alongside it. Backup, integration, and secure remote access for the application database is the same regardless of vendor. We coordinate with the software vendor's support team for anything inside the application.",
      },
      {
        q: "Our laptops keep dying in the salt air — what's the fix?",
        a: "Standardize on enterprise laptops rated for harsher environments (Lenovo ThinkPad T-series, Dell Latitude Rugged, or Panasonic Toughbook for the truly waterfront roles). Avoid consumer laptops in slip / dock / boatyard areas — the lifecycle is 12-18 months instead of 4-5 years.",
      },
      {
        q: "Can you support our fleet of captains' phones?",
        a: "Yes. MDM-enrolled iPhones or Androids with company email, document access, and remote-wipe capability. We write the BYOD policy that distinguishes 'work data' from 'personal data' so a fired captain's personal photos don't get wiped along with the company email.",
      },
    ],
  },

  construction: {
    slug: "construction-it",
    displayName: "Construction Firms",
    h1Prefix: "IT Support for Construction Firms",
    titleSuffix: "Construction Firm IT Support | Job-site ready | Simple IT SRQ",
    serviceType: "Construction industry IT",
    matchPattern: /construction|contractor|job ?site|builder/i,
    cities: ["bradenton"],
    intro:
      "General contractors, sub-trades, and design-build firms across the SR-64 corridor and Manatee County run an IT environment most vendors fundamentally don't understand: half your devices live in the office, half live in a truck cab, and the trailer Wi-Fi at a job site is the difference between concrete poured on schedule and concrete poured next week. Simple IT SRQ runs IT for Bradenton-area construction firms with rugged field laptops, cellular-backup networks at the trailer, MDM for foreman tablets, and a tested plan for the days your office loses power but the job site keeps running.",
    emphasis: [
      "Rugged field laptops sized for the truck cab + outdoor environment",
      "Cellular-backup networking at the job-site trailer (no more relying on builder Wi-Fi)",
      "MDM for foreman tablets — Procore, Buildertrend, or whatever you run",
      "Office IT that survives a SR-64 power outage during a pour day",
      "Document security for plans, change orders, and insurance certificates",
      "Quarterly review of which job-site setups actually need permanent infrastructure",
    ],
    faqs: [
      {
        q: "Do you support Procore / Buildertrend / Sage 100 Contractor?",
        a: "Yes. We don't write change orders for you, but we handle the IT side: SSO with the firm's Microsoft 365, MDM for tablets running the apps, and integration troubleshooting when the practice tool talks to your accounting system. Direct partnerships with the publishers' support teams when issues escalate.",
      },
      {
        q: "What's the right Wi-Fi setup for a long-running job site?",
        a: "For a job site running more than ~8 weeks, a permanent cellular-router-with-mesh-AP setup is usually cheaper than relying on the builder's Wi-Fi or paying month-by-month for a temporary line. We've designed this for active GC clients on multi-month builds. Initial site walk is free.",
      },
      {
        q: "Our trucks have laptops that don't last more than a year. Why?",
        a: "Almost always: consumer-grade laptops in environments designed for ruggedized hardware (truck-cab vibration + heat + dust). Standardize on the Dell Latitude Rugged, Panasonic Toughbook, or Lenovo ThinkPad T-series with the rugged service plan. The 5-year cost of ownership is lower than 3 cycles of consumer laptops.",
      },
      {
        q: "Can you help us answer our project-owner's cybersecurity questionnaire?",
        a: "Yes. Major commercial owners (hospitals, school districts, government clients) increasingly attach IT-security riders to their construction contracts. We answer the questionnaire, attest to the controls, and update annually. Several active clients won bids partly on the strength of the answers we provided.",
      },
      {
        q: "Do you support job-site security cameras?",
        a: "We can — we've installed cellular-backed perimeter camera systems on multi-month sites for theft deterrence. Direct integration into the office's central security system or a standalone cellular system depending on the project's footprint.",
      },
    ],
  },

  "vacation-rental": {
    slug: "vacation-rental-it",
    displayName: "Vacation Rental Management",
    h1Prefix: "IT Support for Vacation Rental Management",
    titleSuffix: "Vacation Rental Management IT | Casey Key & Anna Maria | Simple IT SRQ",
    serviceType: "Hospitality IT",
    matchPattern: /vacation rental|short.?term rental|airbnb|vrbo|smart.?lock/i,
    cities: ["nokomis"],
    intro:
      "Vacation rental management companies along Casey Key, Anna Maria, and the Nokomis-Venice corridor handle a rolling roster of 30 to 300 properties — each with its own smart locks, Wi-Fi, and check-in flow that has to work at 4pm on a Saturday when the front desk is empty. Simple IT SRQ supports VRMs with smart-lock-to-PMS integration, per-property guest Wi-Fi separated from the owner network, and the booking-system uptime your January-through-March peak demands.",
    emphasis: [
      "Smart-lock integration with your PMS (Streamline, Track, Hostfully, OwnerRez, etc.)",
      "Per-property guest Wi-Fi separated from the owner's home network",
      "Booking-system uptime sized for the Jan–Mar peak (not the summer baseline)",
      "Off-island backups that don't assume Casey Key has power",
      "Door-code lifecycle management synced to checkout times",
      "PCI compliance for the credit-card processing side of bookings",
    ],
    faqs: [
      {
        q: "Do you integrate smart locks with our PMS?",
        a: "Yes — we've integrated August, Schlage Encode, Yale Assure, and igloohome locks with active vacation-rental clients running Streamline, Hostfully, and OwnerRez. The lock auto-receives a per-stay code from the PMS at booking confirmation; the code expires at checkout. No staff intervention.",
      },
      {
        q: "What about Wi-Fi at remote properties?",
        a: "Each property gets a business-grade router with two SSIDs: one for the guest (heavily-throttled, isolated, branded with the rental company name), one for owner / owner's contractors. The guest network never sees the owner's smart home, security cameras, or owner devices.",
      },
      {
        q: "Our booking system slows down in February — can you fix it?",
        a: "Almost always: an undersized internet plan at the office or unpatched server software. We do a free site review during off-peak (May or Sept) and tell you which of the three usual suspects is your bottleneck. Most VRMs we onboard see 30-60% improvement in PMS responsiveness in the first 90 days.",
      },
      {
        q: "Are you PCI compliant for our payment processing?",
        a: "Your processor (Stripe, Affinipay, etc.) handles the PCI Level 1 compliance. We deliver PCI SAQ-A documentation for the merchant — meaning we attest that no card data ever touches your local network or staff devices. Required by your processor at annual renewal.",
      },
      {
        q: "What happens to bookings during a hurricane?",
        a: "Pre-storm: the PMS continues operating from the cloud regardless of local conditions; we forward office phones to a cell number. During: even if Casey Key loses power, your PMS, your bookings, and your guest communication continue to function. Post-storm: standard 24-48 hour recovery for any local infrastructure.",
      },
    ],
  },
};

export const industryList = Object.values(industries);

/**
 * Find the city.localPatterns entry that best matches a given industry.
 * Returns the matched body string, or null if no pattern in this city
 * matches the industry. Used to render the city-specific paragraph on
 * an industry × city landing page.
 *
 * @param {object} industry - entry from industries
 * @param {object} city     - entry from cities
 * @returns {string|null}
 */
export function matchIndustryPattern(industry, city) {
  if (!industry?.matchPattern || !Array.isArray(city?.localPatterns)) return null;
  const hit = city.localPatterns.find(
    (p) => industry.matchPattern.test(p.title) || industry.matchPattern.test(p.body),
  );
  return hit ? { title: hit.title, body: hit.body } : null;
}

/** Yields every (industry, city) URL slug pair we should generate. */
export function* industryCityPairs(citiesObj) {
  for (const industry of Object.values(industries)) {
    for (const cityKey of industry.cities) {
      const city = citiesObj[cityKey];
      if (!city) continue;
      // Sanity-check: don't generate the page if no localPattern matches
      // — that means the page would be thin / generic.
      if (!matchIndustryPattern(industry, city)) continue;
      yield {
        industrySlug: industry.slug,
        cityKey,
        citySlug: city.slug.replace(/-it-support$/, ""),
        // Final URL: /medical-it-sarasota, /law-firm-it-venice, etc.
        url: `/${industry.slug}-${cityKey}`,
        industry,
        city,
      };
    }
  }
}
