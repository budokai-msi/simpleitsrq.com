// Cybersecurity + compliance glossary — drives long-tail SEO traffic to
// /glossary/<slug>. Each entry is ~250-400 words structured for Google
// featured snippets:
//   • short  — one-sentence answer, used as the meta description and the
//              first paragraph (high featured-snippet hit rate)
//   • full   — array of body paragraphs (rendered as <p> tags)
//   • why    — 1-2 sentence "why it matters for Florida SMBs" grounding
//   • action — 1-3 line "what to do" actionable next step
//   • related — slugs of other glossary terms (drives multi-pageview
//               sessions; AdSense impressions compound)
//   • product — optional slug from src/data/products.js for an in-context
//               sales CTA at the bottom of the entry
//
// Adding a new term: append to GLOSSARY. The /glossary index lists every
// entry alphabetically; sitemap regen picks it up via prebuild.

/**
 * @typedef {Object} GlossaryEntry
 * @property {string} slug
 * @property {string} term         Display name
 * @property {string} short        One-sentence definition
 * @property {string[]} full       Body paragraphs
 * @property {string} why          Florida-SMB relevance
 * @property {string} action       Actionable next step
 * @property {string[]} [related]  Slugs of other glossary entries
 * @property {string} [product]    Slug from src/data/products.js
 */

/** @type {GlossaryEntry[]} */
export const GLOSSARY = [
  {
    slug: "hipaa",
    term: "HIPAA",
    short:
      "HIPAA is the federal law requiring US healthcare providers and their business associates to protect patient health information through administrative, physical, and technical safeguards.",
    full: [
      "The Health Insurance Portability and Accountability Act of 1996 sets the federal floor for how Protected Health Information (PHI) must be handled inside any organization that creates, receives, maintains, or transmits it. The Office for Civil Rights (OCR) at HHS enforces it through investigations, fines, and corrective-action plans. Penalties scale by negligence tier and can run into millions of dollars per violation category per year.",
      "HIPAA is split into the Privacy Rule (who can see PHI), the Security Rule (how PHI must be protected technically), and the Breach Notification Rule (who you tell if it leaks). Most enforcement actions hit on the Security Rule — specifically the requirement to have a current written Risk Assessment and documented Administrative, Physical, and Technical Safeguards.",
      "Practically, that means an annual Risk Assessment, a written security policy, MFA on every account that touches PHI, encrypted devices, vendor BAAs, and a documented Incident Response Plan. Cyber-insurance carriers in 2026 ask to see all of this at renewal.",
    ],
    why: "Every Florida medical, dental, and physical-therapy practice is HIPAA-covered. Your cyber-insurance carrier won't quote you without seeing the Risk Assessment.",
    action:
      "Run a written Risk Assessment within 12 months of any change to your systems, your staff, or your vendors. The Florida HIPAA Starter Kit walks you through it.",
    related: ["baa", "phi", "mfa", "risk-assessment", "wisp"],
    product: "hipaa-starter-kit",
  },
  {
    slug: "soc-2",
    term: "SOC 2",
    short:
      "SOC 2 is an independent audit report from a licensed CPA firm that attests to how a service organization protects customer data across five Trust Service Criteria.",
    full: [
      "SOC 2 (Service Organization Control 2) reports come in two flavors: Type I attests to controls existing on a single date; Type II attests that those controls operated effectively over a 6-12 month observation window. Customers — especially enterprise customers — increasingly require a current SOC 2 Type II report before signing.",
      "The five Trust Service Criteria are Security (mandatory), Availability, Confidentiality, Processing Integrity, and Privacy. Most small-SaaS reports cover Security only; enterprise customers may demand Availability and Confidentiality too.",
      "First-run SOC 2 Type II for a 10-50 person SaaS typically costs $15,000-$40,000 and takes 6-12 months including the observation window. Renewal years drop to 3-6 months and $10,000-$25,000.",
    ],
    why: "Florida SaaS startups can't sell up-market without a SOC 2 in hand. Increasingly required by 2026 cyber-insurance renewals too.",
    action:
      "If a SOC 2 is on the horizon, get the documentation foundation in place first — the WISP Template covers about 60% of the controls auditors will ask about.",
    related: ["wisp", "risk-assessment", "vendor-risk", "encryption", "audit"],
    product: "wisp-template",
  },
  {
    slug: "pci-dss",
    term: "PCI DSS",
    short:
      "PCI DSS is the Payment Card Industry Data Security Standard — the contractual security framework that any business storing, processing, or transmitting cardholder data must follow.",
    full: [
      "PCI DSS isn't a law — it's a set of security requirements imposed by Visa, Mastercard, American Express, Discover, and JCB on every merchant accepting their cards. Compliance is verified annually through a Self-Assessment Questionnaire (SAQ) for small merchants, or a full Report on Compliance (ROC) audit for larger ones.",
      "Most Florida small merchants qualify for SAQ-A — the simplest tier — because they outsource card handling to a payment processor (Stripe, Square, PayPal) that's PCI-validated itself. SAQ-A is roughly 22 questions and can be completed in an afternoon.",
      "Bigger operations that touch cardholder data directly need SAQ-D, which is hundreds of controls, or a ROC audit costing $8,000-$50,000+ depending on scope.",
    ],
    why: "Florida retailers, restaurants, medical practices accepting cards, and any e-commerce business is on the hook. Your card processor will email you the questionnaire annually.",
    action:
      "If you outsource card handling to Stripe / Square / PayPal you're almost certainly SAQ-A — fill it out as soon as you receive the prompt; ignoring it can result in higher transaction fees.",
    related: ["risk-assessment", "encryption", "vendor-risk", "audit"],
    product: "compliance-library",
  },
  {
    slug: "ftc-safeguards",
    term: "FTC Safeguards Rule",
    short:
      "The FTC Safeguards Rule is a federal regulation requiring 'financial institutions' (broadly defined to include tax preparers, mortgage brokers, wealth managers, auto dealers, and many others) to maintain a written Information Security Program.",
    full: [
      "The original Safeguards Rule dates to 1999, but the December 2022 amendment massively expanded both the scope and the specific controls required. As of June 2023 every covered business must have a written Information Security Program, an MFA-backed access control system, encryption for customer information at rest and in transit, a Qualified Individual responsible for the program, regular Risk Assessments, and an annual report to the board.",
      "The 'financial institution' definition is famously broad: tax preparers, mortgage brokers, motor-vehicle dealers, payday lenders, investment advisors, real-estate appraisers, debt collectors, and check-cashing services are all in scope. Many small businesses don't realize they're covered until an enforcement action hits.",
      "Penalties for non-compliance can include consent orders, injunctions, and civil penalties — enforcement actions in 2024-2026 have resulted in 6- and 7-figure judgments against small operators.",
    ],
    why: "If you're a Florida CPA, mortgage broker, wealth manager, or auto dealer, this is mandatory — not optional. The IRS now requires Section 6713 disclosure of compliance status on Schedule G.",
    action:
      "Stand up a written Information Security Program, name a Qualified Individual, and run an initial Risk Assessment. The WISP Template gets you 80% of the way there.",
    related: ["wisp", "risk-assessment", "mfa", "encryption", "audit"],
    product: "wisp-template",
  },
  {
    slug: "wisp",
    term: "WISP (Written Information Security Program)",
    short:
      "A WISP is a single written document describing how your organization protects sensitive information — required by FTC Safeguards, often by cyber insurers, and the foundational document SOC 2 + HIPAA audits expect to see first.",
    full: [
      "A WISP isn't a specific format mandated by law — it's a document that demonstrates the existence of your security program. Auditors and insurers want to see administrative, physical, and technical controls; a designated security officer; an incident response plan; vendor risk management; and an annual review schedule.",
      "Most cyber-insurance renewal questionnaires in 2026 ask whether you have a WISP and request a copy. Coalition's Q1-2026 sample showed a 14% median premium bump for accounts answering 'no' or providing nothing in writing.",
      "A small-office WISP typically runs 12-25 pages including policy snapshots and a control matrix.",
    ],
    why: "Without a WISP your insurance premium goes up; with one you can answer the standard renewal questionnaire in 10 minutes.",
    action:
      "Adopt a WISP template, fill in your specifics, sign and date it, schedule annual reviews. Buy the WISP Template ($149) or build one with your IT advisor.",
    related: ["ftc-safeguards", "soc-2", "risk-assessment", "incident-response", "cyber-insurance"],
    product: "wisp-template",
  },
  {
    slug: "mfa",
    term: "MFA (Multi-Factor Authentication)",
    short:
      "MFA requires at least two independent factors to sign in: something you know (password), something you have (phone or hardware key), or something you are (biometric).",
    full: [
      "MFA is the single highest-leverage control most small businesses can deploy. A Microsoft study found MFA blocks over 99.2% of automated account-compromise attacks. Cyber-insurance carriers in 2026 won't write a policy without MFA on at least email, financial systems, and admin accounts.",
      "Not all MFA factors are equal. SMS codes are cheap but vulnerable to SIM-swap attacks, and most 2026 cyber-insurance forms no longer accept SMS as MFA. Authenticator apps (Microsoft Authenticator, Google Authenticator, Authy) are the floor; FIDO2/WebAuthn hardware keys (YubiKey) are the ceiling.",
      "Enforcement matters more than availability — many breached organizations had MFA available but only enforced on a subset of accounts.",
    ],
    why: "If your insurance renewal asks 'do you have MFA on every account?' the wrong answer raises premium 14-30%. Hardware keys for admins is the 2026 baseline.",
    action:
      "Roll out hardware keys (YubiKey 5C NFC) for every admin account this month. Authenticator app for everyone else. Disable SMS as a fallback on every system that allows it.",
    related: ["sso", "phishing", "cyber-insurance", "ftc-safeguards", "hipaa"],
    product: "cyber-insurance-evidence-binder",
  },
  {
    slug: "phishing",
    term: "Phishing",
    short:
      "Phishing is a social-engineering attack that tricks an employee into clicking a malicious link, opening an infected attachment, or handing over credentials by impersonating a trusted sender.",
    full: [
      "Phishing remains the #1 entry vector for cyber incidents at small businesses in 2026. Variants include spear-phishing (targeted at specific individuals using research), whaling (targeted at executives), business email compromise / BEC (impersonates a known vendor or executive to redirect payments), and SMS phishing (smishing).",
      "Modern phishing uses lookalike domains, AI-generated copy that matches the impersonated sender's style, and sometimes valid HTTPS certificates on the lookalike domain. The 'check the URL' advice from 2018 isn't sufficient.",
      "Defenses are layered: email-gateway filtering, DMARC/SPF/DKIM on your sending domain, MFA so credential theft alone isn't enough, security awareness training, and phishing simulations to identify staff who need extra help.",
    ],
    why: "BEC scams targeting Florida small businesses average $50,000+ per incident in 2026. Most start with a single phishing email to bookkeeping or HR.",
    action:
      "Run a phishing simulation this quarter, identify the staff who clicked, and route them through targeted training. Security Academy handles both ($12/user/mo).",
    related: ["mfa", "ransomware", "incident-response", "encryption"],
    product: "security-academy",
  },
  {
    slug: "ransomware",
    term: "Ransomware",
    short:
      "Ransomware is malware that encrypts your files and demands payment (usually in cryptocurrency) to decrypt them — modern variants also exfiltrate data and threaten to publish it.",
    full: [
      "Ransomware attacks against US small businesses peaked in 2024-2026 with average ransom demands climbing into six figures and recovery costs averaging $1.5-2.5M when business interruption is included. Florida has been disproportionately targeted because of its concentration of small medical, legal, and real-estate offices.",
      "Modern ransomware operates as a double-extortion model: encrypt the data and exfiltrate a copy. Even if you restore from backup and refuse to pay, the attacker threatens to publish stolen client records — particularly damaging for HIPAA-covered practices.",
      "Defense layers: endpoint protection (CrowdStrike, SentinelOne, Microsoft Defender for Business), backups stored offline or immutable, MFA on every account, principle of least privilege, regular tabletop exercises, and an incident response plan that includes legal and PR coordination.",
    ],
    why: "Ransomware is the single most-feared scenario in every cyber-insurance underwriter's mind in 2026. Premiums skyrocket if your defenses don't show.",
    action:
      "Run a tabletop exercise this quarter using a real ransomware scenario. Verify your backups by attempting an actual restore — most businesses discover their backups are unusable only after they need them.",
    related: ["backup", "tabletop", "incident-response", "endpoint-protection", "cyber-insurance"],
    product: "ransomware-tabletop-kit",
  },
  {
    slug: "cyber-insurance",
    term: "Cyber Insurance",
    short:
      "Cyber insurance transfers the financial risk of a cyber incident — first-party losses (your downtime, recovery costs, ransom) and third-party losses (lawsuits, regulatory fines) — to an insurance carrier in exchange for an annual premium.",
    full: [
      "Standalone cyber insurance is now table-stakes for any business holding client data, processing payments, or running critical operations on technology. 2026 renewal questionnaires are 40-60 questions covering MFA, backups, training, vendor risk, and AI governance — answers directly determine premium.",
      "Coverage typically includes: business interruption, data restoration, ransom negotiation, breach notification costs, regulatory defense, and third-party liability. Sub-limits often apply to ransomware payments, social-engineering fraud, and reputational harm.",
      "First-time buyers are surprised to learn that the policy explicitly excludes losses from common scenarios — including losses from a known vulnerability you didn't patch in time, social engineering when MFA wasn't enabled, and acts of war (which carriers have used to deny ransomware claims attributed to nation-state actors).",
    ],
    why: "If you're a Florida small business and you don't have cyber insurance, you're betting your operations against the next phishing email. Premiums for unprepared offices doubled in 2025-2026.",
    action:
      "Get a free comparative quote — competing brokers will save you 15-30% even if you stay with your current carrier. We'll intro you to a Florida broker who quotes small business every week.",
    related: ["wisp", "ftc-safeguards", "mfa", "ransomware", "incident-response", "tabletop"],
    product: "cyber-insurance-answers",
  },
  {
    slug: "baa",
    term: "BAA (Business Associate Agreement)",
    short:
      "A BAA is the contract HIPAA requires between a covered entity (e.g. a medical practice) and any vendor that handles PHI on its behalf — defining responsibilities, breach notification timelines, and termination rights.",
    full: [
      "Under HIPAA, a Covered Entity remains liable for PHI even when a third party processes it on their behalf. A signed BAA shifts certain obligations to the Business Associate and is required by 45 CFR § 164.504(e) before the Business Associate can lawfully receive PHI.",
      "Common Business Associates include cloud-storage providers, IT MSPs, billing services, transcription vendors, EHR vendors, and email-hosting providers. Many vendors offer BAAs only on enterprise tiers — for example Microsoft 365 Business Premium qualifies but Business Basic does not.",
      "A BAA must include specific elements: the permitted uses of PHI, the safeguards the Business Associate will apply, breach reporting timelines (generally within 60 days of discovery), subcontractor flow-down requirements, and return / destruction of PHI on termination.",
    ],
    why: "If your medical practice uses a vendor without a signed BAA, an OCR audit will find it and impose a fine. The fix is reaching out and getting one signed — many vendors have a self-serve BAA portal.",
    action:
      "Audit your vendor list this month. For every vendor that touches PHI, confirm a signed BAA on file. Microsoft 365 + Google Workspace both offer BAAs at the Business tier and above.",
    related: ["hipaa", "vendor-risk", "wisp", "audit"],
    product: "hipaa-starter-kit",
  },
  {
    slug: "phi",
    term: "PHI (Protected Health Information)",
    short:
      "PHI is any individually identifiable health information held or transmitted by a HIPAA-covered entity, including demographic data, billing records, and treatment notes.",
    full: [
      "PHI includes the 18 'Identifiers' defined by HIPAA: name, address, dates relating to the individual, phone numbers, fax numbers, email, SSN, MRN, account numbers, certificate/license numbers, vehicle identifiers, device identifiers, URLs, IP addresses, biometric identifiers, full-face photos, and any other unique identifying number, characteristic, or code.",
      "Removing all 18 makes data 'de-identified' and outside HIPAA — but auditors apply this strictly; a partial removal still counts as PHI.",
      "Storing PHI on personal devices, in personal email, or in any tool without a BAA is a HIPAA violation regardless of intent.",
    ],
    why: "Any document that names a patient and mentions a diagnosis is PHI — including a sticky note left at the front desk.",
    action:
      "Audit your data-handling practices: where is PHI stored, who can access it, is each storage location covered by a BAA. The HIPAA Starter Kit walks you through it.",
    related: ["hipaa", "baa", "encryption", "pii"],
    product: "hipaa-starter-kit",
  },
  {
    slug: "pii",
    term: "PII (Personally Identifiable Information)",
    short:
      "PII is any data that can identify a specific individual — directly (name, SSN) or indirectly when combined with other data (date of birth + ZIP + gender).",
    full: [
      "PII is a US legal concept defined slightly differently across jurisdictions. The strictest definition (NIST SP 800-122) includes any information that can identify a person, even if multiple data points need to be combined.",
      "'Sensitive PII' includes SSN, financial account numbers, biometrics, health information, immigration status, and similar high-impact identifiers — these warrant stronger protection than name + email.",
      "Florida's FIPA (Florida Information Protection Act, 2014) requires breach notification when PII is exposed, with specific timelines and content requirements.",
    ],
    why: "A breach of PII triggers Florida FIPA notification obligations — failing to notify within 30 days of discovery results in penalties up to $500,000 per breach.",
    action:
      "Map where you store PII (CRM, accounting, HR), confirm encryption at rest and in transit, and document who can access each store.",
    related: ["phi", "encryption", "ftc-safeguards", "incident-response"],
    product: "wisp-template",
  },
  {
    slug: "endpoint-protection",
    term: "Endpoint Detection and Response (EDR)",
    short:
      "EDR is modern endpoint security software that detects, investigates, and responds to threats on every laptop, desktop, and server in real time — replacing traditional signature-based antivirus.",
    full: [
      "Traditional antivirus relied on signatures of known malware. EDR adds behavioral monitoring, automatic isolation of compromised endpoints, forensic logging, and centralized response tooling. Major products include Microsoft Defender for Business, SentinelOne, CrowdStrike Falcon, and Sophos Intercept X.",
      "EDR is now expected by every cyber-insurance carrier — Norton, McAfee, and other consumer-grade products specifically don't qualify.",
      "Microsoft Defender for Business is included with Microsoft 365 Business Premium ($22/user/mo) and is sufficient for most small offices. SentinelOne or CrowdStrike for organizations >50 endpoints or with elevated threat profile.",
    ],
    why: "Your insurance carrier will ask 'what EDR do you run' on the renewal questionnaire. The answer 'Norton 360' will trigger a rate increase.",
    action:
      "Inventory every endpoint and confirm an enterprise EDR product is installed and reporting to a central console. Microsoft Defender for Business is the default for offices on M365.",
    related: ["ransomware", "mfa", "cyber-insurance", "incident-response", "siem"],
    product: "wisp-template",
  },
  {
    slug: "zero-trust",
    term: "Zero Trust",
    short:
      "Zero Trust is a security model that assumes every request — even from inside the corporate network — is potentially hostile until proven otherwise via identity, device posture, and context.",
    full: [
      "The model replaces the old 'castle and moat' approach (trust everything inside the firewall, distrust everything outside) with continuous verification: every request must prove identity (MFA), device health (managed + patched), and authorization (least privilege).",
      "Implementation typically involves an Identity Provider (Microsoft Entra, Okta, Auth0), a device-management layer (Intune, Jamf), and conditional-access policies that gate access based on real-time signals.",
      "Zero Trust is increasingly required by federal contractors and is on most 2026 cyber-insurance questionnaires as a maturity indicator.",
    ],
    why: "Zero Trust isn't a product you buy — it's a posture you adopt. For Florida small offices, it usually starts with M365 Business Premium + Conditional Access policies.",
    action:
      "If you're on M365 Business Premium, turn on Conditional Access policies that require MFA + compliant device for every sign-in.",
    related: ["mfa", "sso", "endpoint-protection", "encryption"],
    product: "compliance-library",
  },
  {
    slug: "siem",
    term: "SIEM (Security Information and Event Management)",
    short:
      "A SIEM aggregates security logs from every system in your environment, correlates them in real time, and alerts on suspicious patterns that no single log source could detect alone.",
    full: [
      "Modern SIEM products (Microsoft Sentinel, Splunk, Datadog Security, LimaCharlie) ingest logs from endpoints, identity providers, firewalls, cloud services, and applications. They apply detection rules, machine-learning baselines, and correlation logic to surface real incidents from the noise.",
      "For most small Florida offices, full SIEM is overkill — Microsoft Defender + Microsoft 365 Audit Logs cover the basics. SIEM is most relevant for organizations with >100 endpoints, regulated data at scale, or active threat-hunting requirements.",
    ],
    why: "If your cyber-insurance questionnaire asks about 'centralized log monitoring,' your answer needs to demonstrate something — even M365 audit log review counts as a starting point.",
    action:
      "Confirm M365 Audit Logs are enabled and someone reviews them at least weekly. For larger organizations, evaluate Microsoft Sentinel.",
    related: ["endpoint-protection", "incident-response", "audit"],
    product: "wisp-template",
  },
  {
    slug: "vendor-risk",
    term: "Vendor Risk Management",
    short:
      "Vendor risk management is the process of assessing and monitoring the security posture of every third-party vendor you depend on, because their breach becomes your breach.",
    full: [
      "Modern small businesses run on dozens of SaaS vendors — M365, Google Workspace, QuickBooks, Stripe, HubSpot, Slack, Zoom, etc. A breach at any one of them can expose your client data.",
      "A typical vendor-risk program tracks: SOC 2 / SOC 3 status, data residency, contract terms, what data the vendor holds, and the impact rating (red / yellow / green) of a breach. Cyber-insurance carriers increasingly ask for the inventory at renewal.",
      "Doesn't have to be sophisticated — a spreadsheet with 30-50 vendors and a quarterly review cadence beats no program at all.",
    ],
    why: "If a vendor like Notion or Vercel has a security incident (and they do), you need to know within hours whether your operations are exposed — not days.",
    action:
      "Build a Vendor Risk Register inventory this month. The Vendor Risk Register kit ($19) gives you a pre-populated spreadsheet for the 40 most-common SaaS vendors.",
    related: ["soc-2", "baa", "wisp", "incident-response"],
    product: "vendor-risk-register",
  },
  {
    slug: "risk-assessment",
    term: "Risk Assessment",
    short:
      "A Risk Assessment is a written analysis of the threats, vulnerabilities, and likely impacts to your organization's systems and data — the foundational document HIPAA, FTC Safeguards, SOC 2, and most cyber insurers require annually.",
    full: [
      "A Risk Assessment isn't a one-time event — it's an ongoing process that's documented at least annually. The output is a written document that lists identified risks, their likelihood, their impact, the controls in place, and the gaps.",
      "Auditors review the Risk Assessment as the 'starting point' for any compliance evaluation. The absence of a current Risk Assessment is the single most common HIPAA finding by OCR.",
      "The HIPAA Risk Assessment specifically requires identifying risks to PHI, evaluating the effectiveness of safeguards, and documenting decisions about accepting / mitigating / transferring risk.",
    ],
    why: "Without a current Risk Assessment, you fail the first question of any compliance audit. Your cyber-insurance carrier wants a copy too.",
    action:
      "Adopt a template (the HIPAA Starter Kit + WISP Template both include one), fill it in, and schedule next year's review on the calendar today.",
    related: ["hipaa", "wisp", "ftc-safeguards", "vendor-risk", "audit"],
    product: "compliance-library",
  },
  {
    slug: "incident-response",
    term: "Incident Response Plan",
    short:
      "An Incident Response Plan is a written playbook that defines who does what when a security incident is detected — preventing the chaotic, expensive scramble that turns small incidents into big ones.",
    full: [
      "A typical Incident Response Plan covers six phases: Preparation, Identification, Containment, Eradication, Recovery, and Lessons Learned. It names the Incident Response Team (typically the IT lead, a leadership decision-maker, an external counsel contact, an IT vendor contact, and an insurance broker contact) and specifies escalation criteria.",
      "Cyber-insurance carriers increasingly require an IRP as a prerequisite for coverage. The 2026 renewal questionnaires ask whether you have one and whether it's been tested via tabletop exercise in the last 12 months.",
      "The plan needs to be physical (printed copy in the office) AND digital — many incidents take down email and chat, so a Slack-only plan is unreachable when you need it most.",
    ],
    why: "When ransomware hits at 2am, you don't want to be googling 'what do I do' — you want to follow a checklist that names the people to call.",
    action:
      "Adopt a 1-page Incident Response Plan, print it, and tape it inside the front-office cabinet. The SaaS Incident Response Playbook is $29 and walks you through the full setup.",
    related: ["tabletop", "ransomware", "phishing", "wisp"],
    product: "saas-incident-response-playbook",
  },
  {
    slug: "tabletop",
    term: "Tabletop Exercise",
    short:
      "A tabletop exercise is a 60-90 minute discussion-based scenario walk-through where your team practices responding to a simulated security incident — without the cost or risk of an actual disruption.",
    full: [
      "The exercise puts your team in the room (physical or virtual), reads a prepared scenario aloud, and walks through how each role would respond at each phase. A facilitator injects complications ('the email server is down, how do you communicate?') and scores the response against a rubric.",
      "Most cyber-insurance carriers in 2026 ask whether you've run a tabletop in the last 12 months and require a sign-in sheet + summary document as evidence.",
      "Done well, tabletops surface gaps in your Incident Response Plan, identify training needs, and build confidence in the team. Done poorly, they're a meeting nobody takes seriously.",
    ],
    why: "A tabletop is the cheapest test of your Incident Response Plan you can run — and the evidence binder it produces is what insurers want to see.",
    action:
      "Schedule a 90-minute tabletop this quarter using a real ransomware or BEC scenario. The Ransomware Tabletop Kit gives you the scenarios + facilitator guide ($49).",
    related: ["incident-response", "ransomware", "phishing", "cyber-insurance"],
    product: "ransomware-tabletop-kit",
  },
  {
    slug: "encryption",
    term: "Encryption",
    short:
      "Encryption is the mathematical process of scrambling data so that only someone with the correct key can read it — required at rest (stored data) and in transit (data moving across networks) by HIPAA, FTC Safeguards, PCI DSS, and most cyber-insurance carriers.",
    full: [
      "Two contexts: encryption-at-rest protects stored data (full-disk encryption on laptops via BitLocker / FileVault, encrypted databases, encrypted backups); encryption-in-transit protects data moving over networks (HTTPS / TLS for web traffic, SMTP TLS for email, encrypted VPN tunnels for remote access).",
      "Modern operating systems make at-rest encryption easy — BitLocker is built into Windows 10/11 Pro, FileVault into macOS, and LUKS into Linux. Enabling and verifying it across the fleet is the operational work.",
      "Email-in-transit (SMTP TLS) is opportunistic — it works only when both sender and receiver support it. For sensitive content, use a secure-message platform or PGP/S/MIME.",
    ],
    why: "Lost laptops and unencrypted backups are the #1 cause of HIPAA breach notifications by volume in Florida. BitLocker reduces a $50k breach to a non-event.",
    action:
      "Verify BitLocker / FileVault is enforced on every device via MDM. Verify backup destinations encrypt at rest. Verify your email server enforces TLS for outbound delivery.",
    related: ["hipaa", "phi", "pii", "ftc-safeguards"],
    product: "wisp-template",
  },
  {
    slug: "sso",
    term: "SSO (Single Sign-On)",
    short:
      "SSO lets users sign in once with a single identity provider (e.g. Microsoft, Google, Okta) and automatically authenticate to every connected application — replacing the password-per-app sprawl that drives credential reuse and breach risk.",
    full: [
      "Modern SSO uses OAuth 2.0 + OpenID Connect or SAML 2.0 protocols. The big three identity providers for Florida small businesses are Microsoft Entra (formerly Azure AD), Google Workspace, and Okta.",
      "Benefits: easier onboarding (one account vs. dozens), easier offboarding (disable one account, lose access to everything), centralized MFA enforcement, and reduced password reuse.",
      "Most modern SaaS apps support SSO on enterprise tiers; some require an upgrade ('SSO tax'). For HIPAA + FTC Safeguards-bound businesses, SSO is increasingly the cleanest path to compliant access control.",
    ],
    why: "If you fire someone at 4pm, you want to disable one account, not 25.",
    action:
      "If you're on M365 or Google Workspace, you have SSO built in — connect every business app you use to it. For non-M365 stacks, evaluate Okta or Auth0.",
    related: ["mfa", "zero-trust", "vendor-risk"],
    product: "onboarding-runbook",
  },
  {
    slug: "backup",
    term: "Backup (3-2-1)",
    short:
      "A 3-2-1 backup strategy keeps 3 copies of every file, on 2 different media types, with 1 copy stored off-site — the minimum a Florida business needs to survive a ransomware attack, hurricane, or hardware failure.",
    full: [
      "The 3-2-1 rule predates modern cloud storage but the principle holds: never have a single point of failure. Modern interpretations include immutable backups (can't be modified or deleted by an attacker who compromises your network) and air-gapped backups (physically disconnected from the network).",
      "Cyber-insurance carriers in 2026 ask 'have you tested a restore from backup in the last 12 months' — having backups isn't enough; testing them is required. Most businesses discover their backups are unusable only after they need them.",
      "For Florida specifically, a copy needs to be stored outside the hurricane zone — preferably in a different region — so a Cat-5 storm hitting your office doesn't take both copies.",
    ],
    why: "When ransomware hits or a hurricane floods the office, your backups are the difference between 4 hours of pain and 4 weeks of business interruption.",
    action:
      "Document your backup architecture (what's backed up, where, how often, by whom), schedule a quarterly restore test, and store at least one copy in a different geographic region.",
    related: ["ransomware", "incident-response", "tabletop", "hurricane-prep"],
    product: "hurricane-it-playbook",
  },
  {
    slug: "audit",
    term: "Audit (security / compliance)",
    short:
      "A security or compliance audit is an independent review by a licensed third party (usually a CPA firm) that verifies your stated security controls actually exist and operate effectively — required for SOC 2, HIPAA reciprocity, PCI DSS Levels 1-3, and increasingly by enterprise customers and insurers.",
    full: [
      "Different audit types serve different purposes: SOC 2 (Trust Service Criteria), SOC 3 (public-facing version of SOC 2), HIPAA Risk Assessment (annual self-assessment, not a formal audit), PCI DSS ROC (formal audit by a Qualified Security Assessor), HITRUST (HIPAA-specific certification), and FedRAMP (federal cloud authorization).",
      "Audit firms typically engage in three phases: scoping, fieldwork (testing controls), and reporting. Engagements run from a few weeks (small SAQ-A validation) to 6-12 months (SOC 2 Type II first run).",
      "The single biggest cost driver is the absence of documentation when the audit starts — auditors bill hourly while you scramble to write policies. Going in with a complete WISP, Risk Assessment, and Evidence Binder reduces audit cost 40-60%.",
    ],
    why: "Most Florida small businesses don't realize how much an audit costs until the firm sends the engagement letter — having documentation in place beforehand cuts the bill in half.",
    action:
      "Before engaging an audit firm, get your documentation foundation in place: WISP, HIPAA Starter Kit (if applicable), and the Cyber-Insurance Evidence Binder.",
    related: ["soc-2", "hipaa", "pci-dss", "wisp", "risk-assessment"],
    product: "compliance-library",
  },
  {
    slug: "hurricane-prep",
    term: "Hurricane IT Preparation",
    short:
      "Hurricane IT preparation is the seasonal process every Florida Gulf-Coast business runs each summer to ensure systems, data, and communications survive a Cat-3+ landfall and the multi-day power and internet outages that follow.",
    full: [
      "A hurricane plan covers four phases: pre-season (June 1 readiness checklist), pre-landfall (72-hour runbook activated when a storm becomes named), during-storm (decision tree: stay open / close / partial), and recovery (Day-1, Day-3, Day-7 checklists).",
      "Specific tasks include: verify off-site backups, test the UPS at every server rack, photograph IT equipment for insurance claims, reroute phones to mobile, secure or relocate PHI-bearing devices, and document the pre-storm state for after-action review.",
      "Florida business interruption from hurricanes averages 3-7 days of full closure — not all of which is power-related; staff dispersal, supply-chain disruption, and customer absence add days.",
    ],
    why: "A 5-day business interruption costs the average Florida small business $25-100k. Most of that is preventable with a 4-hour pre-season checklist.",
    action:
      "By June 1 each year: verify backups, test UPS units, photograph equipment, document the IT inventory. The Hurricane IT Continuity Playbook ($49) is the exact runbook we use for our Sarasota and Bradenton clients.",
    related: ["backup", "incident-response", "tabletop"],
    product: "hurricane-it-playbook",
  },
  {
    slug: "ai-policy",
    term: "AI Acceptable Use Policy",
    short:
      "An AI Acceptable Use Policy is a written document defining which AI tools your staff may use, what data they may put into them, and what controls govern AI-assisted decisions affecting clients — newly required by 2026 cyber-insurance renewals.",
    full: [
      "Every major cyber carrier added an AI-governance block to their 2026 renewal questionnaire: do you have a written AI policy, does it cover generative-AI tools, is it signed annually, do you log AI-assisted decisions affecting clients.",
      "The policy typically includes: approved tools and their data tiers, prohibited use cases (e.g. never paste PHI into ChatGPT Free), prompt logging requirements, an incident response addendum for AI-related events (prompt injection, data leak, deepfake impersonation), and HIPAA-specific addenda for medical practices.",
      "Coalition's Q1-2026 sample showed a median 14% premium bump for accounts answering 'no' to the written-AI-policy question.",
    ],
    why: "If your staff uses Copilot, ChatGPT, Claude, or Gemini at work and you don't have a written policy, your cyber-insurance renewal premium goes up.",
    action:
      "Adopt a written AI Acceptable Use Policy in the next 30 days. The AI Acceptable Use Policy Kit ($59) gets you a fillable policy + tool inventory + insurance answer pack.",
    related: ["wisp", "cyber-insurance", "ftc-safeguards", "hipaa"],
    product: "ai-acceptable-use-policy",
  },
];

/** Resolve a slug to its entry, or null. */
export function findGlossaryEntry(slug) {
  if (!slug) return null;
  return GLOSSARY.find((g) => g.slug === slug) || null;
}

/** Alphabetical sort for the index page. */
export function glossaryAlphabetical() {
  return [...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term));
}
