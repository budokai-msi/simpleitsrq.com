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
    metaDescription: "Local IT support, computer repair, security cameras, and enterprise IT for Sarasota businesses and residential clients. Flat monthly pricing, HIPAA paperwork, and a real team that picks up the phone. Free IT check-up.",
    intro: "From the galleries on Main Street to the medical offices off Fruitville Road, Sarasota businesses depend on computers and internet that just work. Simple IT SRQ is the local IT team for dental groups, law firms, real-estate brokerages, boutique retailers, and professional-services firms from Lido Key to the UTC corridor. We watch your computers, email, and network around the clock — and when you need someone in person, we show up.",
    servicesIntro: "Most Sarasota offices we support fall into one of three patterns: a medical or dental practice in the Fruitville corridor, a law or financial firm downtown, or a boutique retailer on St. Armands or Main Street. The services below apply to all three — the emphasis just shifts with the business.",
    localPatterns: [
      { title: "Medical practice, Fruitville corridor", body: "EHR uptime on whatever platform the practice uses, HIPAA paperwork built for cyber-insurance renewals, and a Wi-Fi plan that handles 10 providers plus chair-side tablets on the same network without dropping the imaging software." },
      { title: "Law firm, downtown Sarasota", body: "Microsoft 365 security tuned for law firms, Clio or PracticePanther integrations, encrypted client-document sharing with audit trails, and the cyber-insurance evidence package insurers now demand at renewal — ready to hand over on day one." },
      { title: "Boutique retailer, St. Armands / Main Street", body: "Point-of-sale uptime during peak tourist weekends, guest Wi-Fi that's isolated from the register network, security cameras that actually get reviewed after an incident, and back-office systems that survive a hurricane-season power dip." },
    ],
    landmarks: ["Main Street Sarasota", "St. Armands Circle", "Lido Key", "Fruitville Road medical corridor", "Downtown Sarasota"],
    neighborhoods: "downtown Sarasota, St. Armands, Lido Key, Siesta Key, Osprey, the Rosemary District, and the Fruitville medical corridor",
    whyLocal: [
      "On-site help anywhere from Lido Key to Osprey — local techs, not a Tampa hand-off.",
      "A named tech who actually knows your office, your staff, and the security questions your insurance company keeps asking.",
      "HIPAA reviews and paperwork made for the dozens of independent medical and dental practices that make Sarasota one of Florida's busiest healthcare markets.",
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
    metaDescription: "Local IT support, computer repair, security cameras, and enterprise IT for Bradenton, FL businesses and residential clients. Flat monthly pricing, HIPAA paperwork, and a real Manatee County team. Free IT check-up.",
    intro: "Bradenton is our home. From the Riverwalk and downtown Old Main Street to the business parks off SR-64 and the medical offices on Manatee Avenue, Simple IT SRQ supports the local businesses that keep Manatee County running. We're the IT team for construction firms, marine businesses, independent medical practices, manufacturers, and professional-services companies across Bradenton, Palmetto, and Ellenton.",
    servicesIntro: "Bradenton clients split roughly into three buckets: medical and dental practices on Manatee Avenue, construction and marine businesses near SR-64 and the Port, and professional-services firms across Palmetto and Ellenton. The services below apply everywhere — the priorities just shift with the trade.",
    localPatterns: [
      { title: "Construction firm, SR-64 corridor", body: "Rugged field laptops that survive the truck cab, cellular-backup networks at the job-site trailer, MDM for the foreman tablets, and a plan for the days when the office loses power but a concrete pour is still on the schedule." },
      { title: "Marine business, Bradenton / Palmetto waterfront", body: "Reliable Wi-Fi that reaches the dock and the lift, mobile-device management for fleet iPads, invoicing systems that survive a hurricane-season power outage, and offsite backups that don't assume the mainland is online." },
      { title: "Medical practice, Manatee Avenue", body: "EHR integration with the imaging or lab vendor the practice actually uses, quarterly tabletop exercises documented for the insurance binder, and the audit-ready HIPAA documentation the state surveyor opens first." },
    ],
    landmarks: ["Bradenton Riverwalk", "Old Main Street", "Manatee Avenue medical corridor", "SR-64 business parks", "Downtown Bradenton"],
    neighborhoods: "downtown Bradenton, the Riverwalk and Old Main Street, West Bradenton, Palma Sola, Bayshore Gardens, and the Manatee Avenue medical corridor",
    whyLocal: [
      "We live and work in Manatee County. Our techs are based right here — not driving down I-75 from a Tampa office.",
      "Hurricane-season plans built for the Gulf Coast: off-site backups, networks that keep running on a generator, and a tested plan for getting you back online.",
      "A named tech on your account, a real person at the other end of the phone, and flat monthly pricing that doesn't balloon when something breaks.",
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
    intro: "Lakewood Ranch is one of the fastest-growing planned communities in the country, and the professional offices clustered around Main Street, Lakewood Ranch Medical Center, and the UTC mall need IT that keeps up. Simple IT SRQ supports the law firms, financial advisors, medical practices, and real-estate brokerages building their businesses across Lakewood Ranch — from Waterside Place to the shops at University Town Center.",
    servicesIntro: "Lakewood Ranch is a professional-services town: law, finance, medical, insurance, real estate. Most of our LWR clients are 15-to-50-person offices chasing a cyber-insurance renewal or building out a new suite at Center Point or Waterside Place. The services below show up on every engagement — the order on the list just rearranges.",
    localPatterns: [
      { title: "Financial advisory firm, LWR Main Street", body: "SEC + GLBA documentation written to what examiners actually ask in 2026, MFA hardware keys on every admin account, encrypted email workflows that don't break Outlook, and quarterly phishing tests with results packaged for the compliance binder." },
      { title: "Real estate brokerage, UTC corridor", body: "Agent account churn without the lost-email drama, shared-drive governance per team, MLS and transaction-management integrations, and commission-software uptime the day before every closing." },
      { title: "Medical specialist, LWR Medical Center area", body: "HIPAA, cyber-insurance evidence, and the EHR-vendor coordination nobody wants to do themselves — we book the vendor calls, document the integrations, and keep the audit file current between renewal cycles." },
    ],
    landmarks: ["Lakewood Ranch Main Street", "University Town Center (UTC) mall", "Waterside Place", "Lakewood Ranch Medical Center", "Center Point corporate park"],
    neighborhoods: "Lakewood Ranch Main Street, Waterside Place, Country Club East, Central Park, the UTC corridor, and the business parks along SR-70",
    whyLocal: [
      "We work with the exact kind of 10- to 80-person professional offices that make up most of Lakewood Ranch — law, finance, medical, insurance, and real estate.",
      "Cyber-insurance renewal help that matches what insurers are actually asking in 2026: two-step sign-in on every account, modern antivirus, off-site backups, and a written response plan.",
      "Quarterly planning meetings where we sit down and walk through what's working, what's about to break, and what belongs in next year's budget — in plain English.",
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
        q: "Our cyber-insurance renewal questionnaire keeps getting harder. Can you help?",
        a: "That's one of our specialties. We walk through every question on your insurance carrier's form, fix anything that's missing, and give you written proof. Several Lakewood Ranch clients have cut their renewal premium after switching to us."
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
    intro: "Nokomis sits at the quiet south end of Sarasota County where Casey Key meets the mainland — and the small businesses here deserve IT support that actually shows up. Simple IT SRQ supports the vacation rental companies, marine services, medical offices, real-estate firms, and professional-service practices along US-41 and Albee Road — plus residential clients across Casey Key. We're across Sarasota County, not two hours from Tampa.",
    servicesIntro: "Nokomis clients are mostly 5-to-30-person offices along US-41 and Casey Key. The mix leans vacation rental, marine services, and independent medical — each with its own seasonal rhythm. We size everything for the November-through-April surge, not the sleepy summer.",
    localPatterns: [
      { title: "Vacation rental management, Casey Key", body: "Smart-lock integrations that stay synced with the booking calendar, guest Wi-Fi per property separated from the owner network, booking-system uptime during Jan-Mar peak, and an off-island data backup nobody in the Casey Key rental world is actually doing." },
      { title: "Marine services, US-41 corridor", body: "Shop-floor Wi-Fi that reaches past the lift, invoicing systems that work from a captain's phone when the tech is at the dock, inventory for parts that ride out the SR-681 gap during a storm, and hurricane plans written for a week without power." },
      { title: "Independent medical, Laurel / south Osprey", body: "HIPAA-ready documentation, phone coverage that survives barrier-island weather (cellular backup + call-forwarding to personal devices), and an incident response that assumes the EHR vendor hotline has a 90-minute hold time." },
    ],
    landmarks: ["Nokomis Beach", "Casey Key", "US-41 corridor", "Albee Road", "North Jetty Park"],
    neighborhoods: "Nokomis, Casey Key, Laurel, south Osprey, and the US-41 business corridor between Venice and Sarasota",
    whyLocal: [
      "Local Sarasota County team — we don't drive down from Tampa or Orlando like the big shops do.",
      "Built for 5- to 30-person offices and residential clients: vacation rental managers, marine service companies, medical practices, professional firms, and the homes and condos in between.",
      "Hurricane-season backup and recovery plans made for the barrier-island reality: off-site backups, generator-safe networks, and a tested plan that doesn't assume you'll have power.",
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
    intro: "Venice has a business mix you don't find anywhere else on the Gulf Coast: a healthcare cluster around the hospital, a historic downtown full of long-running professional practices, and a wave of newer offices around the Jacaranda and airport corridors. Those offices also deal with something the rest of the region doesn't — a real snowbird season that doubles network load from November to April. Simple IT SRQ handles IT for the Venice medical groups, law firms, accounting practices, dental offices, and real-estate brokerages that need a local team who understands both the seasonal surge and the year-round compliance grind.",
    servicesIntro: "Venice is really two towns at once — a downtown of long-running professional practices, and a healthcare cluster around ShoreView Hospital. Both roughly double in network load November through April. We build for that seasonal reality, not the summer average.",
    localPatterns: [
      { title: "Dental or medical specialist, Venice Avenue / near ShoreView", body: "Snowbird-season network sizing (firewalls, APs, and ISP plans spec'd for the peak), HIPAA paperwork aligned to 2026 cyber-insurance renewal forms, and an EHR vendor point-of-contact log that saves an hour on every support call." },
      { title: "Law firm, historic downtown Venice", body: "Document security with matter-level access, client portal uptime, matter-based backups that ignore the rest of the drive, and the three-times-a-year phishing-simulation evidence the Florida Bar's risk-management CLEs now quietly expect." },
      { title: "Imaging or physical therapy, Jacaranda corridor", body: "DICOM uptime with cross-site replication to a second suite, badge-reader access control that ties into the practice's HR onboarding, and an incident-response runbook the front desk can actually read at 7:45am when things go sideways." },
    ],
    landmarks: ["Historic Venice Avenue", "Shamrock Park business corridor", "ShoreView Hospital (formerly Venice Regional Bayfront Health)", "Venice Municipal Airport", "Jacaranda Plaza", "The Legacy Trail"],
    neighborhoods: "Historic downtown Venice, Venice Island, the Jacaranda corridor, East Venice, the Venice airport business district, South Venice, and Englewood-adjacent offices off River Road",
    whyLocal: [
      "Seasonal-load planning: we size firewalls, Wi-Fi, and bandwidth for the Nov–Apr snowbird surge so your network doesn't crawl when every exam room, reception desk, and guest laptop is in use at once.",
      "Healthcare and HIPAA depth — Venice has one of the highest concentrations of medical practices per capita in the state. We do written HIPAA risk assessments, BAAs, and audit-ready documentation, not just antivirus.",
      "We're a Sarasota County team — Venice is part of our regular service area, not a contracted-out drive from a Tampa MSP.",
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
    intro: "34207 is where Simple IT SRQ is based. We support businesses and residential clients across West Bradenton, Bayshore Gardens, Samoset, and Oneco — plus everything within roughly a 10-mile drive of the 34207 core, which covers downtown Bradenton, Palmetto, Ellenton, Holmes Beach and Bradenton Beach on the barrier islands, Cortez, Longboat Key (north), and the northern edge of Sarasota.",
    servicesIntro: "The businesses we support inside this radius split across three buckets: medical and dental practices along Cortez Road and 14th Street West; construction, marine, and trades operations near the Port and along SR-64; and retail + hospitality in the barrier-island tourist corridor. What we install doesn't change; the emphasis does.",
    localPatterns: [
      { title: "Medical or dental practice, Cortez Road / 14th Street West", body: "EHR and imaging vendor uptime, HIPAA Risk Assessment + Safeguards paperwork, cyber-insurance evidence binder your carrier asks for at renewal, and two-step sign-in on every account so the one staff click that would otherwise cost you $40,000 in ransomware doesn't." },
      { title: "Marine or waterfront business, Bayshore Gardens / Cortez / Palma Sola", body: "Dock and lift Wi-Fi that actually reaches the waterfront, ruggedized fleet tablets for the captains, invoicing that survives a summer power outage, and off-site backups stored far enough inland that a tropical storm hitting Anna Maria doesn't take both copies offline." },
      { title: "Retail or hospitality, Anna Maria / Bradenton Beach / Holmes Beach", body: "Point-of-sale uptime through spring break and peak tourist weekends, guest Wi-Fi isolated from the register network, credit-card processing that passes PCI SAQ-A, and security cameras that actually get reviewed after an incident." },
      { title: "Professional services, downtown Bradenton / Old Main Street", body: "Microsoft 365 Business Premium tuned for law, accounting, or consulting; encrypted client-document sharing; cyber-insurance questionnaire answers ready for renewal; and the written WISP your insurer now requires." },
    ],
    landmarks: ["Bayshore Gardens Park", "Cortez Road", "14th Street West medical corridor", "SR-64 construction corridor", "Manatee River Riverwalk", "Anna Maria Island Bridge", "Port Manatee"],
    neighborhoods: "Bayshore Gardens, West Bradenton, Samoset, Oneco, Palma Sola, downtown Bradenton, Cortez, Palmetto, Ellenton, Holmes Beach, Bradenton Beach, Anna Maria, northern Longboat Key, Tallevast, and the SR-64 business corridor",
    whyLocal: [
      "Our office is inside 34207 — not a 'we also service Bradenton' satellite run from Tampa or Lakewood Ranch. Onsite work across the 10-mile radius is what we do every day, not an extra-fee premium.",
      "We've restored three clients post-hurricane in the past five years, every one of them inside this radius. The playbooks are tested. The backups really get tested quarterly.",
      "Every one of our Bradenton clients has a named tech who knows the office by name, the equipment by serial, and the two staff members who always call first.",
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
        a: "Yes — a big chunk of our 34207-radius clients are independent medical, dental, physical-therapy, and chiropractic practices. We run the written HIPAA Risk Assessment, put the Administrative / Physical / Technical Safeguards in place, issue the BAAs you need for every vendor, and hand you a binder the state surveyor or your cyber-insurance carrier opens first."
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
};

export const cityList = Object.values(cities);
