// City-specific data for local landing pages.
// Each entry feeds src/pages/LocalLanding.jsx and the sitemap generator.
// Copy is intentionally written in plain English — a small business owner
// searching for "IT help in Sarasota" shouldn't need to know what EDR,
// MDR, or QBR mean to understand what we do.

export const cities = {
  sarasota: {
    slug: "sarasota-it-support",
    city: "Sarasota",
    cityFull: "Sarasota, FL",
    // Sarasota centroid; 12mi radius covers downtown, Lido/Siesta/Longboat,
    // Fruitville corridor, and the UTC/Lakewood Ranch overlap.
    lat: 27.3364,
    lng: -82.5307,
    radiusMiles: 12,
    h1: "IT Support in Sarasota, FL",
    title: "Sarasota IT Support | Local IT Help and Cybersecurity | Simple IT SRQ",
    metaDescription: "Local IT support, computer repair, copiers and fax, migrations, and Windows Enterprise for Sarasota businesses. Flat monthly pricing, HIPAA paperwork, and a real team that picks up the phone. Free IT check-up.",
    intro: "From the galleries on Main Street to the medical offices off Fruitville Road, Sarasota businesses depend on infrastructure that simply has to work. Simple IT SRQ is the regional managed-services partner for dental groups, law firms, real-estate brokerages, and professional-services firms across the city — with depth in Windows Enterprise environments, Microsoft 365 migrations, and the office hardware (copiers, fax, conference rooms) most MSPs quietly subcontract. Networks monitored 24x7. On-site engineers when remote remediation isn’t enough.",
    servicesIntro: "We operate full-stack IT for Sarasota organizations — from endpoint repair and cloud migrations through complex Windows Enterprise environments and integrated office hardware. The accounts we run typically map to one of three operating profiles:",
    localPatterns: [
      { title: "Medical practice, Fruitville corridor", body: "EHR uptime on whatever platform the practice uses, HIPAA paperwork built for security renewals, and a Wi-Fi plan that handles 10 providers plus chair-side tablets on the same network without dropping the imaging software." },
      { title: "Law firm, downtown Sarasota", body: "Microsoft 365 security tuned for law firms, Clio or PracticePanther integrations, encrypted client-document sharing with audit trails, and the security documentation package reviewers ask for at renewal — ready to hand over on day one." },
      { title: "Boutique retailer, St. Armands / Main Street", body: "Point-of-sale uptime during peak tourist weekends, guest Wi-Fi that's isolated from the register network, security cameras that actually get reviewed after an incident, and back-office systems that survive a hurricane-season power dip." },
    ],
    landmarks: ["Main Street Sarasota", "St. Armands Circle", "Lido Key", "Fruitville Road medical corridor", "Downtown Sarasota"],
    neighborhoods: "downtown Sarasota, St. Armands, Lido Key, Siesta Key, Osprey, the Rosemary District, and the Fruitville medical corridor",
    whyLocal: [
      "On-site engineering coverage from Lido Key to Osprey — dispatched out of Sarasota, not handed off to a Tampa subcontractor.",
      "A named primary engineer on every account who actually knows your environment, your staff, and the controls your insurance carrier keeps asking about.",
      "Healthcare-vertical depth: HIPAA risk assessments, Safeguards documentation, and BAAs purpose-built for the dozens of independent practices that make Sarasota one of Florida’s busiest healthcare markets.",
    ],
    faqs: [
      {
        q: "How do you handle on-site visits in Sarasota?",
        a: "We schedule on-site visits across downtown Sarasota, Lido Key, and the Fruitville corridor as quickly as our calendar allows. Most issues we can start working on remotely first, and we'll be straight with you about when a tech can actually be there — no fake response-time promises."
      },
      {
        q: "Do you support medical practices and handle HIPAA paperwork?",
        a: "Yes. A big chunk of our Sarasota clients are independent medical, dental, and physical-therapy practices. We run the written HIPAA security check, put the protections in place, and hand you the documents you need the day an auditor shows up."
      },
      {
        q: "What does IT support cost for a small Sarasota business?",
        a: "Our flat-rate plans start around $95 per person per month for fully managed IT — covering antivirus, security monitoring, help desk, and on-site support. We give every business a specific quote after a free 30-minute call so you're never surprised."
      },
      {
        q: "Do you replace our in-house IT person or work alongside them?",
        a: "Both. We run IT end-to-end for teams of 5 to 80 people, and we also co-manage alongside in-house IT at larger firms — usually taking on security, email, and after-hours coverage while your internal person handles day-to-day apps."
      },
      {
        q: "Are you really local, or a national company with a Sarasota phone number?",
        a: "We're based right here in Sarasota and Bradenton with techs who live in town. When you call, you get a Bradenton or Sarasota engineer — not an overseas call center."
      },
    ],
  },
  bradenton: {
    slug: "bradenton-it-support",
    city: "Bradenton",
    cityFull: "Bradenton, FL",
    // Bradenton centroid; 12mi covers Manatee Avenue corridor, SR-64,
    // Palmetto, Ellenton, Anna Maria Bridge, and Bayshore Gardens.
    lat: 27.4989,
    lng: -82.5748,
    radiusMiles: 12,
    h1: "IT Support in Bradenton, FL",
    title: "Bradenton IT Support | Local Tech Team | Simple IT SRQ",
    metaDescription: "Local IT support, computer repair, copiers and fax, migrations, and Windows Enterprise for Bradenton, FL businesses. Flat monthly pricing, HIPAA paperwork, and a local Manatee County team. Free IT check-up.",
    intro: "Bradenton is our home market. Simple IT SRQ supports the operators that keep Manatee County running — from medical offices on Manatee Avenue to industrial accounts near the Port. We bring depth in Microsoft 365 migrations, Windows Enterprise management, and integrated office hardware (copiers, fax, conference rooms). Construction firms, marine and waterfront operations, and professional-services companies across Bradenton, Palmetto, and Ellenton run on infrastructure we operate every day.",
    servicesIntro: "Our Bradenton engagements span the full stack — endpoint repair, Windows Enterprise migrations, integrated office hardware, and continuity planning. Accounts split roughly into three operating profiles:",
    localPatterns: [
      { title: "Construction firm, SR-64 corridor", body: "Rugged field laptops that survive the truck cab, cellular-backup networks at the job-site trailer, MDM for the foreman tablets, and a plan for the days when the office loses power but a concrete pour is still on the schedule." },
      { title: "Marine business, Bradenton / Palmetto waterfront", body: "Reliable Wi-Fi that reaches the dock and the lift, mobile-device management for fleet iPads, invoicing systems that survive a hurricane-season power outage, and offsite backups that don't assume the mainland is online." },
      { title: "Medical practice, Manatee Avenue", body: "EHR integration with the imaging or lab vendor the practice actually uses, quarterly tabletop exercises documented for the insurance binder, and the audit-ready HIPAA documentation the state surveyor opens first." },
    ],
    landmarks: ["Bradenton Riverwalk", "Old Main Street", "Manatee Avenue medical corridor", "SR-64 business parks", "Downtown Bradenton"],
    neighborhoods: "downtown Bradenton, the Riverwalk and Old Main Street, West Bradenton, Palma Sola, Bayshore Gardens, and the Manatee Avenue medical corridor",
    whyLocal: [
      "Headquartered in Manatee County. Engineers dispatched locally — not driving down I-75 from a Tampa office on a per-trip charge.",
      "Hurricane-season continuity engineered for the Gulf Coast: replicated off-site backups, generator-rated network gear, and a tested DR runbook with documented RTO/RPO.",
      "A named primary engineer on every account, a phone number that’s answered on the first ring, and a flat monthly contract that doesn’t balloon when something breaks.",
    ],
    faqs: [
      {
        q: "Do you support businesses in Palmetto and Ellenton too?",
        a: "Yes. We cover all of Manatee County and north into Parrish. Most of our Bradenton clients have at least one location in Palmetto or Ellenton, and it's all one flat rate."
      },
      {
        q: "How do you handle hurricane season?",
        a: "Every client gets an off-site backup stored in another part of the country, a simple written recovery plan, and a pre-storm checklist. We test the backups every quarter and walk through the plan with your leadership team once a year."
      },
      {
        q: "Can you help our Bradenton medical practice with HIPAA?",
        a: "Absolutely. We run the written security review, turn on two-step sign-in, install antivirus, back everything up, and give you the paperwork your auditors and insurance carrier expect — all in plain English."
      },
      {
        q: "How long does it take to switch IT companies?",
        a: "Most Bradenton clients are fully moved over in about 14 business days: day one is gathering account info, week one is installing our tools on every computer and turning on two-step sign-in, and week two is verifying backups and a first check-in meeting."
      },
      {
        q: "Do you work with construction and marine businesses?",
        a: "Yes — we support several SRQ-area construction firms and marine businesses. Rugged laptops for the job site, reliable Wi-Fi on the water, company phone systems, and remote tracking for company devices are all things we do every day."
      },
    ],
  },
  "lakewood-ranch": {
    slug: "lakewood-ranch-it-support",
    city: "Lakewood Ranch",
    cityFull: "Lakewood Ranch, FL",
    // LWR centroid; 8mi covers Main Street, UTC, Waterside Place,
    // Center Point, and SR-70 business parks.
    lat: 27.4181,
    lng: -82.4364,
    radiusMiles: 8,
    h1: "IT Support in Lakewood Ranch, FL",
    title: "Lakewood Ranch IT Support | Local IT Help | Simple IT SRQ",
    metaDescription: "Local IT support, computer repair, security cameras, and enterprise IT for Lakewood Ranch professional offices and residential clients. Flat monthly pricing, HIPAA paperwork, and a real team that picks up the phone.",
    intro: "Lakewood Ranch is one of the fastest-growing planned communities in the country, and the professional offices clustered around Main Street, Lakewood Ranch Medical Center, and the UTC corridor demand IT operations that scale with them. Simple IT SRQ runs managed services for the law firms, financial advisors, medical specialists, and real-estate brokerages building their businesses across LWR — from Waterside Place through University Town Center.",
    servicesIntro: "Lakewood Ranch is a professional-services market: law, finance, medical, insurance, real estate. Most LWR engagements run 15-to-50 seats, framed by a security renewal cycle or a buildout at Center Point or Waterside Place. The capabilities below ship on every engagement — only the prioritization changes.",
    localPatterns: [
      { title: "Financial advisory firm, LWR Main Street", body: "SEC + GLBA documentation written to what examiners actually ask in 2026, MFA hardware keys on every admin account, encrypted email workflows that don't break Outlook, and quarterly phishing tests with results packaged for the compliance binder." },
      { title: "Real estate brokerage, UTC corridor", body: "Agent account churn without the lost-email drama, shared-drive governance per team, MLS and transaction-management integrations, and commission-software uptime the day before every closing." },
      { title: "Medical specialist, LWR Medical Center area", body: "HIPAA, security documentation, and the EHR-vendor coordination nobody wants to do themselves — we book the vendor calls, document the integrations, and keep the audit file current between renewal cycles." },
    ],
    landmarks: ["Lakewood Ranch Main Street", "University Town Center (UTC) mall", "Waterside Place", "Lakewood Ranch Medical Center", "Center Point corporate park"],
    neighborhoods: "Lakewood Ranch Main Street, Waterside Place, Country Club East, Central Park, the UTC corridor, and the business parks along SR-70",
    whyLocal: [
      "Vertical fit for the 10- to 80-seat professional offices that define Lakewood Ranch — law, finance, medical, insurance, and real estate — with the controls and documentation each regulator expects.",
      "security renewal evidence aligned to what carriers actually score in 2026: phishing-resistant MFA on every account, modern EDR, tested off-site backups, and a written incident-response plan.",
      "Quarterly Strategic IT Reviews — a senior engineer walks leadership through what’s working, what’s about to fail, and what belongs in next year’s budget. Plain English, no consulting theater.",
    ],
    faqs: [
      {
        q: "Do you support businesses around UTC and Lakewood Ranch Main Street?",
        a: "Yes — a big share of our clients are right there. We work directly with offices around UTC and Main Street, and remote help is the norm with on-site visits scheduled into the same week when possible."
      },
      {
        q: "We're a financial advisory firm. Can you help with the security rules we're held to?",
        a: "Yes. We set up the two-step sign-in, antivirus, encrypted backups, and written policies that SEC examiners and GLBA reviewers expect, and we put it all in writing so you're ready on audit day."
      },
      {
        q: "Our security renewal questionnaire keeps getting harder. Can you help?",
        a: "That's one of our specialties. We walk through every question on your insurance carrier's form, fix anything that's missing, and give you written proof. Several Lakewood Ranch clients have cut their renewal review after switching to us."
      },
      {
        q: "How do you handle Microsoft 365 for a growing firm?",
        a: "We take care of the whole thing: email, shared drives, company devices, secure sign-in, license cleanup every few months, and quick training when you roll out new tools."
      },
      {
        q: "Can you help us move into a new Lakewood Ranch office?",
        a: "Yes. We run network cables, install and tune the firewall and Wi-Fi, move your phones over, and stay on-site on opening day. We've done it for several Lakewood Ranch tenants moving into Center Point and the UTC corridor."
      },
    ],
  },
  nokomis: {
    slug: "nokomis-it-support",
    city: "Nokomis",
    cityFull: "Nokomis, FL",
    // Nokomis centroid; 8mi covers Casey Key, Laurel, south Osprey,
    // and the US-41 corridor up to Sarasota.
    lat: 27.1192,
    lng: -82.4445,
    radiusMiles: 8,
    h1: "IT Support in Nokomis, FL",
    title: "Nokomis IT Support | Local IT Help and Cybersecurity | Simple IT SRQ",
    metaDescription: "Local IT support, computer repair, security cameras, and enterprise IT for Nokomis and Casey Key businesses and residential clients. Flat monthly pricing, HIPAA paperwork, and a real team based in Sarasota County. Free IT check-up.",
    intro: "Nokomis sits at the quiet south end of Sarasota County where Casey Key meets the mainland — and the operators here deserve a managed-services partner that actually shows up. Simple IT SRQ supports vacation-rental management companies, marine services, medical offices, real-estate firms, and professional-services practices along US-41 and Albee Road — plus residential clients across Casey Key. Engineering is dispatched out of Sarasota County, not two hours away in Tampa.",
    servicesIntro: "Nokomis accounts cluster in 5-to-30-seat offices along US-41 and Casey Key — weighted toward vacation rental, marine services, and independent medical, each carrying its own seasonal load curve. Capacity is sized for the November-through-April surge, not the summer baseline.",
    localPatterns: [
      { title: "Vacation rental management, Casey Key", body: "Smart-lock integrations that stay synced with the booking calendar, guest Wi-Fi per property separated from the owner network, booking-system uptime during Jan-Mar peak, and an off-island data backup nobody in the Casey Key rental world is actually doing." },
      { title: "Marine services, US-41 corridor", body: "Shop-floor Wi-Fi that reaches past the lift, invoicing systems that work from a captain's phone when the tech is at the dock, inventory for parts that ride out the SR-681 gap during a storm, and hurricane plans written for a week without power." },
      { title: "Independent medical, Laurel / south Osprey", body: "HIPAA-ready documentation, phone coverage that survives barrier-island weather (cellular backup + call-forwarding to personal devices), and an incident response that assumes the EHR vendor hotline has a 90-minute hold time." },
    ],
    landmarks: ["Nokomis Beach", "Casey Key", "US-41 corridor", "Albee Road", "North Jetty Park"],
    neighborhoods: "Nokomis, Casey Key, Laurel, south Osprey, and the US-41 business corridor between Venice and Sarasota",
    whyLocal: [
      "Sarasota County engineering team — dispatched locally, not driven in from Tampa or Orlando under a per-mile clause.",
      "Sized for 5- to 30-seat operators and residential accounts: vacation-rental managers, marine service companies, medical practices, professional firms, and the homes and condos in between.",
      "Hurricane-season backup and recovery engineered for the barrier-island reality: replicated off-site backups, generator-rated networks, and a tested runbook that doesn’t assume mainland power.",
    ],
    faqs: [
      {
        q: "Do you cover Nokomis from your Sarasota office?",
        a: "Yes — Nokomis is right inside our regular service area. We're based in Sarasota and Bradenton, so we cover Nokomis, Casey Key, and Laurel as part of our normal route. Most issues we start on remotely first, and we'll be straight with you about when a tech can be on-site."
      },
      {
        q: "Do you support vacation rental management companies?",
        a: "Yes. Several of our clients manage short-term rental properties across Casey Key and Nokomis. We handle their booking system uptime, guest Wi-Fi networks, smart-lock integrations, and the security cameras that property managers rely on."
      },
      {
        q: "We're a small office with only 5 people. Is that too small?",
        a: "Not at all. Our flat-rate plans start around $95 per person per month, so a 5-person office runs about $475 a month for fully managed IT including help desk, antivirus, backups, and on-site support. Most of our Nokomis clients are between 3 and 20 people."
      },
      {
        q: "Can you help a Nokomis medical office with HIPAA?",
        a: "Yes. We run the same written HIPAA security review, install the required protections, and hand over audit-ready documentation for medical practices in Nokomis, Laurel, and south Osprey."
      },
      {
        q: "Do you cover Venice too?",
        a: "Yes. We serve all of south Sarasota County including Venice, Nokomis, Laurel, Osprey, and Casey Key. It's all one service area with the same flat pricing."
      },
    ],
  },
  venice: {
    slug: "venice-it-support",
    city: "Venice",
    cityFull: "Venice, FL",
    // Venice centroid; 10mi covers downtown, Jacaranda, ShoreView Hospital,
    // Englewood, and the Venice airport business district.
    lat: 27.0998,
    lng: -82.4543,
    radiusMiles: 10,
    h1: "IT Support in Venice, FL",
    title: "Venice IT Support | Local IT Help and HIPAA Compliance | Simple IT SRQ",
    metaDescription: "Local IT support, computer repair, security cameras, and enterprise IT for Venice, FL — businesses and residential. Helpdesk for medical, legal, and professional offices along Venice Avenue, Jacaranda, and the airport corridor. Flat monthly pricing and HIPAA-ready compliance work.",
    intro: "Venice carries a business mix you don’t see anywhere else on the Gulf Coast: a healthcare cluster around the hospital, a historic downtown of long-running professional practices, and a wave of newer offices along the Jacaranda and airport corridors. Layered on top is something the rest of the region doesn’t carry — a real snowbird season that doubles network load November through April. Simple IT SRQ operates managed IT for the Venice medical groups, law firms, accounting practices, dental offices, and real-estate brokerages that need an engineering team across both the seasonal surge and the year-round compliance load.",
    servicesIntro: "Venice operates as two markets at once — a downtown of long-running professional practices, and a healthcare cluster around ShoreView Hospital. Both roughly double in network load November through April. Capacity is engineered against the seasonal peak, not the summer baseline.",
    localPatterns: [
      { title: "Dental or medical specialist, Venice Avenue / near ShoreView", body: "Snowbird-season network sizing (firewalls, APs, and ISP plans spec'd for the peak), HIPAA paperwork aligned to 2026 security renewal forms, and an EHR vendor point-of-contact log that saves an hour on every support call." },
      { title: "Law firm, historic downtown Venice", body: "Document security with matter-level access, client portal uptime, matter-based backups that ignore the rest of the drive, and the three-times-a-year phishing-simulation evidence the Florida Bar's risk-management CLEs now quietly expect." },
      { title: "Imaging or physical therapy, Jacaranda corridor", body: "DICOM uptime with cross-site replication to a second suite, badge-reader access control that ties into the practice's HR onboarding, and an incident-response runbook the front desk can actually read at 7:45am when things go sideways." },
    ],
    landmarks: ["Historic Venice Avenue", "Shamrock Park business corridor", "ShoreView Hospital (formerly Venice Regional Bayfront Health)", "Venice Municipal Airport", "Jacaranda Plaza", "The Legacy Trail"],
    neighborhoods: "Historic downtown Venice, Venice Island, the Jacaranda corridor, East Venice, the Venice airport business district, South Venice, and Englewood-adjacent offices off River Road",
    whyLocal: [
      "Seasonal-load capacity planning: firewalls, Wi-Fi, and ISP capacity sized for the Nov–Apr snowbird surge so the network doesn’t saturate when every exam room, reception desk, and guest device is online at peak.",
      "Healthcare and HIPAA depth — Venice has one of the highest concentrations of medical practices per capita in the state. We deliver written HIPAA risk assessments, Safeguards documentation, BAAs, and audit-ready evidence packages, not just endpoint security.",
      "Sarasota County engineering team — Venice is part of our regular dispatch zone, not a contracted-out trip from a Tampa MSP.",
    ],
    faqs: [
      {
        q: "Do you cover Venice from your Sarasota office?",
        a: "Yes — Venice is part of our regular service area, not a special trip. We're based in Sarasota and Bradenton, and Venice is part of our normal weekly run. Most issues we start on remotely first; on-site visits get scheduled as quickly as our calendar allows. Several Venice medical and legal clients have pre-scheduled weekly slots for predictable on-site coverage."
      },
      {
        q: "Do you specialize in medical practice IT around the hospital?",
        a: "Yes. A big share of our Venice work is dental offices, physical therapy groups, imaging centers, and specialty practices clustered near ShoreView Hospital and along Venice Avenue. We run written HIPAA risk assessments, sign BAAs, manage EHR uptime, and hand over audit-ready documentation for state and insurance renewals."
      },
      {
        q: "Our office is dead slow during snowbird season — can you fix that?",
        a: "That's one of the most common calls we get from November to April. It's almost always one of three things: an undersized firewall, Wi-Fi access points mounted for a half-empty office, or an ISP plan that hasn't been revisited since 2019. We do a free site survey, tell you which of the three is actually the bottleneck, and size the fix to the seasonal peak — not the summer lull."
      },
      {
        q: "We're a 4-person Venice law firm. Is that too small for a managed IT plan?",
        a: "Not at all — several of our clients are exactly that size. A 4-person firm runs about $380 a month for fully managed IT, which covers help desk, antivirus, backups, Microsoft 365 security, and onsite support. No long-term contract, no per-ticket billing, and you get the same written security documentation a 40-person firm would."
      },
      {
        q: "Can you help us move into a new Venice office?",
        a: "Yes. We run network cabling, install and tune the firewall and Wi-Fi, move phones and printers over, set up the security cameras, and stay onsite on opening day. We've done it for Venice offices in Jacaranda Plaza, along Venice Avenue, and out by the airport business district."
      },
      {
        q: "Do you also cover Englewood and North Port?",
        a: "We cover Englewood from our Venice service area — same flat pricing. North Port is on the edge of our range; we do support a handful of North Port offices, but we'll be upfront during the intake call about scheduling for any onsite work."
      },
    ],
  },
  "bradenton-34207": {
    slug: "bradenton-34207-it-support",
    city: "Bayshore Gardens / West Bradenton (34207)",
    cityFull: "Bayshore Gardens — West Bradenton, FL 34207",
    h1: "IT Support for West Bradenton and Bayshore Gardens (ZIP 34207)",
    // Geo + radius for LocalBusiness schema. 34207 centroid is roughly
    // 27.455°N, 82.588°W; a 10-mile radius covers every ZIP listed in the
    // FAQ below. This tells Google our explicit service zone rather than
    // letting it guess from the city string alone.
    postalCode: "34207",
    lat: 27.455,
    lng: -82.588,
    radiusMiles: 10,
    title: "Bradenton 34207 IT Support | Bayshore Gardens, West Bradenton | Simple IT SRQ",
    metaDescription: "Local IT support, computer repair, security cameras, and enterprise IT for businesses and residential clients in West Bradenton, Bayshore Gardens, Samoset, Oneco, and every address inside a 10-mile radius of ZIP 34207. Local Manatee County team, flat monthly pricing for businesses, no-contract repair for residential.",
    intro: "34207 is where Simple IT SRQ is headquartered. We operate managed IT for businesses and residential clients across West Bradenton, Bayshore Gardens, Samoset, and Oneco — plus every account inside roughly a 10-mile dispatch radius of the 34207 core, covering downtown Bradenton, Palmetto, Ellenton, Holmes Beach and Bradenton Beach on the barrier islands, Cortez, Longboat Key (north), and the northern edge of Sarasota.",
    servicesIntro: "Accounts inside this dispatch radius split across three operating profiles: medical and dental practices along Cortez Road and 14th Street West; construction, marine, and trades operations near the Port and along SR-64; and retail + hospitality across the barrier-island tourist corridor. The capabilities ship on every engagement — only the emphasis shifts.",
    localPatterns: [
      { title: "Medical or dental practice, Cortez Road / 14th Street West", body: "EHR and imaging vendor uptime, HIPAA Risk Assessment + Safeguards paperwork, security documentation binder your carrier asks for at renewal, and two-step sign-in on every account so the one staff click that would otherwise cost you $40,000 in ransomware doesn't." },
      { title: "Marine or waterfront business, Bayshore Gardens / Cortez / Palma Sola", body: "Dock and lift Wi-Fi that actually reaches the waterfront, ruggedized fleet tablets for the captains, invoicing that survives a summer power outage, and off-site backups stored far enough inland that a tropical storm hitting Anna Maria doesn't take both copies offline." },
      { title: "Retail or hospitality, Anna Maria / Bradenton Beach / Holmes Beach", body: "Point-of-sale uptime through spring break and peak tourist weekends, guest Wi-Fi isolated from the register network, credit-card processing that passes PCI SAQ-A, and security cameras that actually get reviewed after an incident." },
      { title: "Professional services, downtown Bradenton / Old Main Street", body: "Microsoft 365 Business Premium tuned for law, accounting, or consulting; encrypted client-document sharing; security renewal questionnaire answers ready for renewal; and the written WISP many reviewers ask for." },
    ],
    landmarks: ["Bayshore Gardens Park", "Cortez Road", "14th Street West medical corridor", "SR-64 construction corridor", "Manatee River Riverwalk", "Anna Maria Island Bridge", "Port Manatee"],
    neighborhoods: "Bayshore Gardens, West Bradenton, Samoset, Oneco, Palma Sola, downtown Bradenton, Cortez, Palmetto, Ellenton, Holmes Beach, Bradenton Beach, Anna Maria, northern Longboat Key, Tallevast, and the SR-64 business corridor",
    whyLocal: [
      "Headquartered inside 34207 — not a Tampa or Lakewood Ranch satellite running this market on a per-trip surcharge. On-site engineering across the 10-mile dispatch radius is part of the standard contract.",
      "Three post-hurricane account restorations in the last five years, every one inside this radius. The runbooks are battle-tested. Backups are restored on a documented quarterly cadence — not just ‘checked.’",
      "Every Bradenton account carries a named primary engineer who knows the office by name, the equipment by serial, and the two staff who always escalate first.",
    ],
    faqs: [
      {
        q: "I'm in 34207 — do you cover my address?",
        a: "Yes — we're inside 34207, so the inner ZIPs (34209, 34205, 34208, 34203) are part of our daily run. Anna Maria Island (34216 / 34217) and Palmetto / Ellenton (34221 / 34222) are also in our regular service area. We schedule on-site visits as quickly as our calendar allows and we'll be straight with you about timing — no fake response-window promises."
      },
      {
        q: "What ZIP codes are inside your 10-mile Bradenton radius?",
        a: "Inside 10 miles of 34207: 34203, 34205, 34206, 34207, 34208, 34209, 34210, 34215 (Cortez), 34216 (Anna Maria), 34217 (Holmes Beach / Bradenton Beach), 34221 (Palmetto), 34222 (Ellenton), 34228 (north Longboat Key), and the northern edge of 34236 (Sarasota downtown). Outside 10 miles we still cover you — we just schedule rather than scramble."
      },
      {
        q: "Do you handle HIPAA for medical and dental practices on Cortez Road?",
        a: "Yes — a big chunk of our 34207-radius clients are independent medical, dental, physical-therapy, and chiropractic practices. We run the written HIPAA Risk Assessment, put the Administrative / Physical / Technical Safeguards in place, issue the BAAs you need for every vendor, and hand you a binder the state surveyor or your security reviewer opens first."
      },
      {
        q: "Can you support my restaurant or boutique on Anna Maria Island during tourist season?",
        a: "Yes. Point-of-sale uptime, PCI SAQ-A support, guest Wi-Fi that's isolated from the register network, and hurricane-season IT continuity are table stakes. We schedule our island visits during off-peak hours so we're not in the dining room during the rush."
      },
      {
        q: "How much does managed IT cost for a 10-person office in 34207?",
        a: "Flat rates start around $95 per person per month for fully managed IT — antivirus, security monitoring, help desk, and onsite support. Every 34207-area business gets a specific quote after a free 30-minute intake call so you're never surprised. Book a call and we'll run the numbers for your exact headcount and tools."
      },
    ],
  },
  palmetto: {
    slug: "palmetto-it-support",
    city: "Palmetto",
    cityFull: "Palmetto, FL",
    // Palmetto centroid; 10mi covers the US-41/US-301 split, the historic
    // riverfront, Snead Island/Regatta Pointe, Terra Ceia, and Port Manatee.
    lat: 27.5214,
    lng: -82.5723,
    radiusMiles: 10,
    h1: "IT Support in Palmetto, FL",
    title: "Palmetto IT Support | Local IT Help for Manatee County | Simple IT SRQ",
    metaDescription: "Local IT support, computer repair, networking, and HIPAA documentation for Palmetto, FL businesses — from the US-301 produce corridor to the Regatta Pointe waterfront. Flat monthly pricing and a Manatee County team that answers the phone.",
    intro: "Palmetto runs on industries most IT vendors never learn: produce packing and agribusiness along US-301, marine and boatyard operations out at Snead Island and Regatta Pointe, and the light manufacturing and distribution clustered toward Port Manatee. Simple IT SRQ is headquartered minutes away across the river, and we operate managed IT for the operators that keep north Manatee County moving — cold-storage and logistics networks that cannot go dark mid-shipment, dock Wi-Fi that survives salt air, and the small professional offices along Riverside Drive that just need email, backups, and a tech who picks up.",
    servicesIntro: "Palmetto accounts cluster into three operating profiles — agribusiness and distribution along the US-301 corridor, marine and waterfront operations on the river, and professional and medical offices downtown. The capabilities below ship on every engagement; only the emphasis changes.",
    localPatterns: [
      { title: "Produce or agribusiness, US-301 corridor", body: "Packing-house and cold-storage networks that have to stay online through a harvest shift, ruggedized scanners and fleet tablets that survive a loading dock, seasonal-labor device and account turnover handled without a security hole, and an off-site backup that does not assume the building has power after a summer storm." },
      { title: "Marine business, Regatta Pointe / Snead Island", body: "Outdoor-rated Wi-Fi that actually reaches the slips and the lift, ruggedized laptops and tablets standardized for the salt-air lifecycle, invoicing that works from a captain's phone when the office is down, and off-site backups stored far enough inland to survive a Gulf landfall." },
      { title: "Medical or dental practice, downtown Palmetto", body: "EHR and imaging-vendor uptime, a written HIPAA Risk Assessment and Safeguards binder built for the security-renewal questionnaire, two-step sign-in on every account that touches PHI, and a tech who can be on-site across the bridge instead of driving down from Tampa." },
    ],
    landmarks: ["Regatta Pointe Marina", "Historic Palmetto / Riverside Drive", "US-301 produce corridor", "Snead Island", "Port Manatee", "Sutton Park"],
    neighborhoods: "downtown Palmetto, Riverside Drive, Snead Island, Terra Ceia, Rubonia, the US-301 agribusiness corridor, and the industrial district toward Port Manatee",
    whyLocal: [
      "Headquartered across the Manatee River in 34207 — Palmetto is part of our daily dispatch run, not a per-trip surcharge from a Tampa office.",
      "Real depth in the industries Palmetto actually runs on: agribusiness and cold-storage logistics, marine and waterfront operations, and light manufacturing near Port Manatee.",
      "Hurricane-season continuity engineered for the Gulf Coast: replicated off-site backups, generator-rated network gear, and a tested recovery runbook with documented RTO/RPO.",
    ],
    faqs: [
      {
        q: "Are you actually local to Palmetto, or driving in from Tampa?",
        a: "We're headquartered in Bradenton (34207), just across the Manatee River, so Palmetto is part of our regular daily route — not a special trip. When you call, you get a Manatee County engineer, not an overseas call center or a Tampa subcontractor."
      },
      {
        q: "Do you support agribusiness, packing houses, and cold-storage operations?",
        a: "Yes. We handle the parts of those operations that are pure IT: keeping the packing-house and cold-storage networks online, ruggedized scanners and tablets that survive a loading dock, fleet device management, and off-site backups that don't assume the building has power. We coordinate with your line-of-business and logistics software vendors for anything inside their application."
      },
      {
        q: "Can your Wi-Fi reach the docks at Regatta Pointe or Snead Island?",
        a: "Yes — outdoor-rated business access points with directional antennas reliably cover slip and lift areas. We've installed this exact setup at marine clients in Cortez and on the Manatee River. The initial site survey is free."
      },
      {
        q: "Can you handle HIPAA for a Palmetto medical or dental office?",
        a: "Yes. We run the written HIPAA Risk Assessment, put the Administrative, Physical, and Technical Safeguards in place, sign a BAA, and hand you the audit-ready binder your state surveyor or insurance reviewer opens first."
      },
      {
        q: "What does managed IT cost for a small Palmetto business?",
        a: "Flat-rate plans start around $95 per person per month for fully managed IT — antivirus, security monitoring, help desk, and on-site support. Every business gets a specific quote after a free 30-minute call so you're never surprised."
      },
    ],
  },
  ellenton: {
    slug: "ellenton-it-support",
    city: "Ellenton",
    cityFull: "Ellenton, FL",
    // Ellenton centroid; 10mi covers the I-75 exit 224 logistics corridor,
    // the Premium Outlets, the US-301 Gateway business parks, and Parrish.
    lat: 27.5217,
    lng: -82.5276,
    radiusMiles: 10,
    h1: "IT Support in Ellenton, FL",
    title: "Ellenton IT Support | Local IT for Retail & Logistics | Simple IT SRQ",
    metaDescription: "Local IT support, computer repair, networking, and PCI-ready point-of-sale help for Ellenton, FL — from the Premium Outlets to the I-75 logistics corridor. Flat monthly pricing and a local Manatee County team.",
    intro: "Ellenton is a retail-and-logistics town: the Premium Outlets pull traffic off I-75 exit 224, the Gateway and US-301 business parks run distribution and warehousing, and a steady layer of professional and medical offices serves the growing rooftops toward Parrish. Simple IT SRQ runs managed IT for the operators here — point-of-sale uptime that holds through a holiday weekend, warehouse Wi-Fi that reaches every rack and scanner, and the security paperwork your processor or insurer asks for at renewal — all from a team based in Manatee County, not down I-75 in Tampa.",
    servicesIntro: "Ellenton accounts split across retail and hospitality near the outlets, distribution and logistics along the I-75 / Gateway corridor, and professional and medical offices on US-301. The capabilities below ship on every engagement; only the emphasis changes.",
    localPatterns: [
      { title: "Retailer or outlet tenant, Ellenton Premium Outlets", body: "Point-of-sale uptime through holiday and tax-free weekends, guest Wi-Fi isolated from the register network, credit-card processing documented for PCI SAQ-A, and security cameras that actually get reviewed after an incident instead of just blinking on the wall." },
      { title: "Distribution or logistics, I-75 / Gateway corridor", body: "Warehouse Wi-Fi engineered to reach every rack and handheld scanner, warehouse-management and inventory uptime through a full shift, ruggedized devices that survive the floor, and cellular-backup networking so a single ISP outage doesn't stop shipping." },
      { title: "Medical or dental practice, US-301 / Gateway", body: "EHR and imaging-vendor uptime, a written HIPAA Risk Assessment and Safeguards binder ready for the security-renewal questionnaire, two-step sign-in on every account that touches PHI, and a local tech who can be on-site the same day when a workstation locks up." },
    ],
    landmarks: ["Ellenton Premium Outlets", "I-75 Exit 224", "Gamble Plantation Historic State Park", "US-301 Gateway business parks", "Manatee River"],
    neighborhoods: "Ellenton, the Premium Outlets district, the I-75 Gateway logistics corridor, Memphis, Rubonia, and the US-301 business parks toward Palmetto and Parrish",
    whyLocal: [
      "A Manatee County team based minutes away — Ellenton is part of our daily run, not a billable trip down I-75 from a Tampa MSP.",
      "Retail and logistics depth: PCI-ready point-of-sale, register-isolated guest Wi-Fi, warehouse-grade wireless, and cellular-backup networking sized for a corridor that ships seven days a week.",
      "A named primary engineer on every account, flat monthly pricing that doesn't balloon when something breaks, and a phone that's answered by a local tech.",
    ],
    faqs: [
      {
        q: "Do you support retailers and restaurants at the Ellenton Premium Outlets?",
        a: "Yes. Point-of-sale uptime through peak weekends, guest Wi-Fi that's isolated from the register network, PCI SAQ-A documentation for your processor, and security cameras that get reviewed after an incident are all things we do every day. We schedule on-site visits during off-peak hours so we're not in the store during the rush."
      },
      {
        q: "Can you handle warehouse and distribution Wi-Fi along the I-75 corridor?",
        a: "Yes — warehouse Wi-Fi that reaches every rack and handheld, ruggedized scanners, warehouse-management uptime, and cellular-backup networking so one ISP outage doesn't stop shipping. The initial site walk is free."
      },
      {
        q: "Are you really local, or a national company with an Ellenton number?",
        a: "We're based in Bradenton and Sarasota with techs who live here. Ellenton is part of our regular Manatee County service area, so you get a local engineer — not a Tampa subcontractor on a per-trip charge."
      },
      {
        q: "Do you cover Parrish and Palmetto from Ellenton too?",
        a: "Yes. Ellenton, Palmetto, and Parrish are all inside our north-Manatee service area on the same flat pricing. Most of our clients in this corridor have a location or two within a few exits of each other."
      },
      {
        q: "What does managed IT cost for a small Ellenton business?",
        a: "Flat-rate plans start around $95 per person per month for fully managed IT — antivirus, security monitoring, help desk, and on-site support. Every business gets a specific quote after a free 30-minute call so there are no surprises."
      },
    ],
  },
  parrish: {
    slug: "parrish-it-support",
    city: "Parrish",
    cityFull: "Parrish, FL",
    // Parrish centroid; 10mi covers North River Ranch, the Fort Hamer Bridge,
    // the US-301 growth corridor, Ellenton, and the new hospital district.
    lat: 27.5786,
    lng: -82.4226,
    radiusMiles: 10,
    h1: "IT Support in Parrish, FL",
    title: "Parrish IT Support | Local IT for a Growing Town | Simple IT SRQ",
    metaDescription: "Local IT support, computer repair, office buildouts, and HIPAA documentation for Parrish, FL — the fastest-growing corner of Manatee County. New-office network setup, flat monthly pricing, and a real local team.",
    intro: "Parrish is the fastest-growing corner of Manatee County, and the IT needs here are the needs of brand-new offices: a medical or dental practice opening in North River Ranch, a construction and development firm building the town itself, and the professional offices following the rooftops up US-301. Simple IT SRQ runs the unglamorous part — cabling and Wi-Fi for a new buildout, Microsoft 365 set up right the first time, HIPAA paperwork for a new practice, and field-ready IT for the contractors working every growth corridor from Fort Hamer to the new hospital district.",
    servicesIntro: "Parrish accounts skew new: medical and dental practices opening in master-planned communities, construction and development firms building the growth corridors, and professional offices setting up for the first time. The capabilities below ship on every engagement; only the emphasis changes.",
    localPatterns: [
      { title: "Medical or dental practice, North River Ranch / US-301", body: "A clean new-office buildout — structured cabling, business firewall, and Wi-Fi sized for exam rooms and chair-side tablets — plus a written HIPAA Risk Assessment and Safeguards binder, EHR and imaging-vendor coordination, and two-step sign-in on every account from day one instead of bolted on later." },
      { title: "Construction or development firm, Parrish growth corridor", body: "Rugged field laptops sized for the truck cab, cellular-backup networking at the job-site trailer so a pour stays on schedule when builder Wi-Fi fails, MDM for foreman tablets running Procore or Buildertrend, and document security for plans, change orders, and insurance certificates." },
      { title: "New professional office, Fort Hamer / US-301", body: "Microsoft 365 set up correctly the first time — email, shared drives, secure sign-in, and company devices that all behave the same — plus business-grade Wi-Fi, labeled cabling, and a backup plan, so a brand-new office runs like an established one on opening day." },
    ],
    landmarks: ["North River Ranch", "Fort Hamer Bridge", "US-301 growth corridor", "Parrish Historic District", "Fort Hamer Park", "the new north-Manatee hospital district"],
    neighborhoods: "North River Ranch, the US-301 growth corridor, the Fort Hamer area, Old Parrish, Ellenton-adjacent business parks, and the new master-planned communities along Moccasin Wallow Road",
    whyLocal: [
      "A Manatee County team that's actually close — Parrish is part of our north-county dispatch run, not a long trip down I-75 from a Tampa MSP.",
      "New-buildout depth: structured cabling, firewall and Wi-Fi design, Microsoft 365 done right the first time, and field-ready IT for the firms building Parrish's growth corridors.",
      "A named primary engineer on every account, flat monthly pricing with no per-ticket surprises, and HIPAA documentation ready for a new practice's first security renewal.",
    ],
    faqs: [
      {
        q: "We're opening a new office in Parrish — can you handle the buildout?",
        a: "Yes. We run the network cabling, install and tune the firewall and Wi-Fi, set up Microsoft 365 and your company devices, configure the security cameras, and stay on-site on opening day. We've done new-office buildouts across Manatee County and into the new Parrish communities."
      },
      {
        q: "Do you support construction and development firms working the Parrish corridor?",
        a: "Yes — rugged field laptops, cellular-backup networking at the job-site trailer, MDM for foreman tablets running Procore or Buildertrend, and document security for plans and change orders. Office IT that survives a power outage on a pour day is part of the plan."
      },
      {
        q: "Can you set up HIPAA paperwork for a new Parrish medical practice?",
        a: "Absolutely — and it's much easier to do right when the office is new. We run the written HIPAA Risk Assessment, build the network and security controls in from day one, sign a BAA, and hand you an audit-ready binder for your first security renewal."
      },
      {
        q: "Are you local to Parrish, or coming from Tampa?",
        a: "We're based in Bradenton and Sarasota — Parrish is part of our regular north-Manatee service area. You get a local engineer who knows the area, not a Tampa subcontractor on a per-mile charge."
      },
      {
        q: "How much does managed IT cost for a small Parrish business?",
        a: "Flat-rate plans start around $95 per person per month for fully managed IT — antivirus, security monitoring, help desk, and on-site support. New offices also get a one-time setup quote for cabling, Wi-Fi, and devices after a free 30-minute call."
      },
    ],
  },
  osprey: {
    slug: "osprey-it-support",
    city: "Osprey",
    cityFull: "Osprey, FL",
    // Osprey centroid; 8mi covers US-41/Bay Street, Blackburn Point,
    // north Casey Key, Oscar Scherer, and the south-Sarasota overlap.
    lat: 27.1956,
    lng: -82.4904,
    radiusMiles: 8,
    h1: "IT Support in Osprey, FL",
    title: "Osprey IT Support | Local IT Help and Cybersecurity | Simple IT SRQ",
    metaDescription: "Local IT support, computer repair, networking, and HIPAA documentation for Osprey, FL businesses and Casey Key residences — from Bay Street to Blackburn Point. Flat monthly pricing and a Sarasota County team that picks up.",
    intro: "Osprey sits in the quiet stretch of US-41 between Sarasota and Venice, where small professional offices, independent medical practices, and the waterfront businesses around Blackburn Point and north Casey Key all need an IT partner who is actually nearby. Simple IT SRQ dispatches engineers out of Sarasota County — not Tampa — and runs managed IT for the Bay Street offices, the practices near Oscar Scherer, and the marine and residential clients along the key. Email, backups, security paperwork, and a tech who answers the phone.",
    servicesIntro: "Osprey accounts are small and personal — professional and medical offices along US-41, marine and waterfront operations near Blackburn Point, and high-end residential and home offices on Casey Key. The capabilities below ship on every engagement; only the emphasis changes.",
    localPatterns: [
      { title: "Medical or professional office, US-41 / Bay Street", body: "A right-sized setup for a small practice or firm — Microsoft 365 done correctly, business Wi-Fi, labeled cabling, and a written HIPAA Risk Assessment and Safeguards binder for the medical offices, all without the overhead a 50-person firm would carry." },
      { title: "Marine or waterfront business, Blackburn Point / Casey Key", body: "Outdoor-rated Wi-Fi that reaches the dock and the lift, ruggedized laptops and tablets standardized for the salt-air lifecycle, invoicing that works from a phone when the office is down, and off-site backups stored well inland." },
      { title: "Residential and home office, Casey Key & Oscar Scherer area", body: "Whole-home and home-office networking that actually covers the property, security cameras with mobile viewing, a tested backup for the home machine, and no-contract repair when a laptop or drive fails." },
    ],
    landmarks: ["Historic Spanish Point", "Blackburn Point Bridge", "Oscar Scherer State Park", "Bay Street / US-41", "north Casey Key", "Pine View area"],
    neighborhoods: "Osprey, north Casey Key, Blackburn Point, the Bay Street / US-41 corridor, Southbay, and the south-Sarasota offices toward Vamo and Oscar Scherer",
    whyLocal: [
      "Sarasota County engineering team — Osprey is part of our regular US-41 dispatch run between Sarasota and Venice, not a drive-down from Tampa.",
      "Right-sized for small offices and residential clients: professional and medical practices, marine businesses, and the homes and home offices along Casey Key.",
      "A named primary engineer on every business account, flat monthly pricing with no per-ticket surprises, and no-contract repair for residential clients.",
    ],
    faqs: [
      {
        q: "Do you cover Osprey from your Sarasota office?",
        a: "Yes — Osprey sits right inside our regular service area on the US-41 corridor between Sarasota and Venice. We're based in Sarasota and Bradenton, so Osprey, Blackburn Point, and north Casey Key are part of our normal route. Most issues we start on remotely first and we'll be straight with you about when a tech can be on-site."
      },
      {
        q: "Do you work with residential clients and home offices on Casey Key?",
        a: "Yes. We do whole-home networking, Wi-Fi that covers the whole property, security cameras with mobile viewing, home-machine backups, and no-contract computer repair for residential clients across Osprey and Casey Key — not just business accounts."
      },
      {
        q: "Can you handle HIPAA for a small Osprey medical office?",
        a: "Yes. We run the same written HIPAA Risk Assessment, install the required Safeguards, sign a BAA, and hand over audit-ready documentation for small practices that don't have room for a full-time IT person."
      },
      {
        q: "Can your Wi-Fi reach a dock near Blackburn Point?",
        a: "Yes — outdoor-rated business access points with directional antennas reliably cover slip and lift areas. We've installed this exact setup at marine clients on the Manatee River and in Cortez. The initial site survey is free."
      },
      {
        q: "What does managed IT cost for a small Osprey business?",
        a: "Flat-rate plans start around $95 per person per month for fully managed IT — antivirus, security monitoring, help desk, and on-site support. Every business gets a specific quote after a free 30-minute call, and residential repair is billed no-contract by the visit."
      },
    ],
  },
  englewood: {
    slug: "englewood-it-support",
    city: "Englewood",
    cityFull: "Englewood, FL",
    // Englewood centroid; 10mi covers Dearborn Street, Manasota Key,
    // Lemon Bay, and the Sarasota/Charlotte county line.
    lat: 26.9620,
    lng: -82.3526,
    radiusMiles: 10,
    h1: "IT Support in Englewood, FL",
    title: "Englewood IT Support | Local IT Help and HIPAA | Simple IT SRQ",
    metaDescription: "Local IT support, computer repair, networking, and HIPAA documentation for Englewood, FL — Dearborn Street, Manasota Key, and Lemon Bay. Medical, marine, and vacation-rental IT with flat monthly pricing and a local team.",
    intro: "Englewood straddles the Sarasota–Charlotte county line, with a business mix shaped by the water: fishing and marine operations on Lemon Bay, vacation-rental and hospitality on Manasota Key, and a dense layer of medical practices serving one of the region's most retiree-heavy populations. Simple IT SRQ covers Englewood from our Venice service area and runs managed IT for the Dearborn Street offices, the bayfront marine businesses, and the practices near Englewood Community Hospital — HIPAA paperwork, salt-air-ready hardware, and a tech who shows up.",
    servicesIntro: "Englewood accounts cluster into three operating profiles — medical and dental practices serving a retiree-heavy population, marine and fishing operations on Lemon Bay, and vacation-rental and hospitality on Manasota Key. The capabilities below ship on every engagement; only the emphasis changes.",
    localPatterns: [
      { title: "Medical or dental practice, Dearborn Street / near the hospital", body: "EHR and imaging-vendor uptime for a high-volume, retiree-heavy patient load, a written HIPAA Risk Assessment and Safeguards binder built for the security-renewal questionnaire, two-step sign-in on every account that touches PHI, and phone coverage that survives barrier-island weather." },
      { title: "Marine or fishing business, Lemon Bay / Manasota Key", body: "Outdoor-rated Wi-Fi that reaches the dock and the fish house, ruggedized devices standardized for the salt-air lifecycle, invoicing and charter booking that work from a captain's phone, and off-site backups stored far enough inland to survive a Gulf landfall." },
      { title: "Vacation rental or hospitality, Manasota Key", body: "Smart-lock integration with the booking system, per-property guest Wi-Fi separated from the owner network, booking-system uptime sized for the winter peak, and off-island backups that don't assume the key has power." },
    ],
    landmarks: ["Historic Dearborn Street", "Manasota Key", "Lemon Bay", "Englewood Beach", "Englewood Community Hospital", "Stump Pass"],
    neighborhoods: "Englewood, Dearborn Street, Manasota Key, Grove City, Rotonda-adjacent offices, and the Lemon Bay waterfront along both sides of the county line",
    whyLocal: [
      "Covered from our Venice service area on the same flat pricing — a local Gulf Coast team, not a per-trip dispatch from Tampa or Fort Myers.",
      "Real depth in the industries Englewood runs on: retiree-heavy medical practices, marine and fishing operations, and Manasota Key vacation rentals.",
      "Hurricane-season continuity engineered for a barrier-island reality: replicated off-site backups, generator-rated networking, and a tested runbook that doesn't assume the key has power.",
    ],
    faqs: [
      {
        q: "Do you cover Englewood, including Manasota Key?",
        a: "Yes — we cover Englewood and Manasota Key from our Venice service area on the same flat pricing. Most issues we start on remotely first, and we schedule on-site visits as quickly as our calendar allows. We'll always be upfront about timing for island work."
      },
      {
        q: "Do you specialize in medical practice IT near Englewood Community Hospital?",
        a: "Yes. A big share of our Gulf Coast work is medical, dental, physical-therapy, and imaging practices. We run written HIPAA Risk Assessments, sign BAAs, manage EHR uptime, and hand over audit-ready documentation for state and insurance renewals — built for the high patient volume an Englewood practice sees."
      },
      {
        q: "Can you support a fishing or marine business on Lemon Bay?",
        a: "Yes — dock and fish-house Wi-Fi, ruggedized devices that survive salt air, charter-booking and invoicing that work from a phone, and off-site backups stored well inland. The initial site survey is free."
      },
      {
        q: "Do you handle vacation rentals on Manasota Key?",
        a: "Yes. Smart-lock-to-booking-system integration, per-property guest Wi-Fi separated from the owner network, booking-system uptime sized for the winter peak, and off-island backups are all things we do for vacation-rental clients along the coast."
      },
      {
        q: "Are you in Sarasota County or Charlotte County for Englewood?",
        a: "Englewood straddles the line, and we serve both sides from our Venice base. The flat pricing and service are the same regardless of which county your address falls in."
      },
    ],
  },
  "north-port": {
    slug: "north-port-it-support",
    city: "North Port",
    cityFull: "North Port, FL",
    // North Port centroid; 10mi covers Wellen Park / West Villages,
    // Sumter Blvd, Toledo Blade, and the US-41 corridor toward Venice.
    lat: 27.0442,
    lng: -82.2359,
    radiusMiles: 10,
    h1: "IT Support in North Port, FL",
    title: "North Port IT Support | Local IT for a Growing City | Simple IT SRQ",
    metaDescription: "IT support, new-office buildouts, computer repair, and HIPAA documentation for North Port, FL — Wellen Park, West Villages, and the Sumter/Toledo Blade corridors. Flat monthly pricing and a Gulf Coast team.",
    intro: "North Port is booming — Wellen Park and the West Villages are pulling in young families, new medical and dental practices, and the construction firms building it all. The IT needs here are new-office needs: cabling and Wi-Fi for a fresh buildout, Microsoft 365 set up right the first time, HIPAA paperwork for a new practice, and field-ready IT for contractors working the growth corridors. Simple IT SRQ serves North Port from our Venice base — we'll be upfront that it's the southern edge of our range, so on-site work is scheduled rather than same-day, but the engineering and the flat pricing are the same.",
    servicesIntro: "North Port accounts skew new and fast-growing: medical and dental practices opening in Wellen Park, construction and development firms building the West Villages, and professional offices setting up along Sumter and Toledo Blade. The capabilities below ship on every engagement; only the emphasis changes.",
    localPatterns: [
      { title: "Medical or dental practice, Wellen Park / Sumter Blvd", body: "A clean new-office buildout — structured cabling, business firewall, and exam-room Wi-Fi — plus a written HIPAA Risk Assessment and Safeguards binder, EHR and imaging-vendor coordination, and two-step sign-in on every account from day one instead of bolted on later." },
      { title: "Construction or development firm, Wellen Park / West Villages", body: "Rugged field laptops sized for the truck cab, cellular-backup networking at the job-site trailer so a pour stays on schedule when builder Wi-Fi fails, MDM for foreman tablets running Procore or Buildertrend, and document security for plans, change orders, and insurance certificates." },
      { title: "New professional office, Toledo Blade / US-41", body: "Microsoft 365 set up correctly the first time — email, shared drives, secure sign-in, and company devices that all behave the same — plus business-grade Wi-Fi, labeled cabling, and a tested backup, so a brand-new North Port office runs like an established one." },
    ],
    landmarks: ["Wellen Park", "CoolToday Park (Atlanta Braves)", "Warm Mineral Springs", "Sumter Boulevard corridor", "Toledo Blade Boulevard", "Myakka State Forest"],
    neighborhoods: "Wellen Park, the West Villages, the Sumter Boulevard corridor, Toledo Blade, the US-41 corridor toward Venice, and the new master-planned communities across North Port",
    whyLocal: [
      "Served from our Venice base on the same flat pricing — we're honest that North Port is the southern edge of our range, so on-site work is scheduled rather than same-day.",
      "New-buildout depth: structured cabling, firewall and Wi-Fi design, Microsoft 365 done right the first time, and field-ready IT for the firms building North Port's growth corridors.",
      "A named primary engineer on every account, HIPAA documentation ready for a new practice's first security renewal, and no per-ticket surprises.",
    ],
    faqs: [
      {
        q: "Do you really cover North Port, or is it out of range?",
        a: "We cover North Port from our Venice base, and we'll be straight with you: it's the southern edge of our service area, so we schedule on-site visits rather than promising same-day. Most issues we handle remotely first, and the engineering, security, and flat pricing are identical to the rest of our markets."
      },
      {
        q: "We're opening a new office in Wellen Park — can you handle the buildout?",
        a: "Yes. We run the network cabling, install and tune the firewall and Wi-Fi, set up Microsoft 365 and your company devices, configure security cameras, and coordinate the opening. New-office buildouts are one of the most common things we do in fast-growing areas like Wellen Park and the West Villages."
      },
      {
        q: "Can you set up HIPAA paperwork for a new North Port practice?",
        a: "Yes — and it's easiest to do right when the office is new. We run the written HIPAA Risk Assessment, build the security controls in from day one, sign a BAA, and hand you an audit-ready binder for your first security renewal."
      },
      {
        q: "Do you support construction firms building in North Port?",
        a: "Yes — rugged field laptops, cellular-backup networking at the job-site trailer, MDM for foreman tablets running Procore or Buildertrend, and document security for plans and change orders. Office IT that survives a power outage on a pour day is part of the plan."
      },
      {
        q: "How much does managed IT cost for a small North Port business?",
        a: "Flat-rate plans start around $95 per person per month for fully managed IT — antivirus, security monitoring, help desk, and remote support, with scheduled on-site visits. New offices also get a one-time setup quote for cabling, Wi-Fi, and devices after a free 30-minute call."
      },
    ],
  },
};

export const cityList = Object.values(cities);
