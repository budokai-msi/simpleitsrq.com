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
    h1: "IT Support in Sarasota, FL",
    title: "Sarasota IT Support | Local IT Help and Cybersecurity | Simple IT SRQ",
    metaDescription: "Local IT support for Sarasota businesses. Flat monthly pricing, same-day response, HIPAA paperwork, and a real team that picks up the phone. Free IT check-up.",
    intro: "From the galleries on Main Street to the medical offices off Fruitville Road, Sarasota businesses depend on computers and internet that just work. Simple IT SRQ is the local IT team for dental groups, law firms, real-estate brokerages, boutique retailers, and professional-services firms from Lido Key to the UTC corridor. We watch your computers, email, and network around the clock — and when you need someone in person, we show up.",
    landmarks: ["Main Street Sarasota", "St. Armands Circle", "Lido Key", "Fruitville Road medical corridor", "Downtown Sarasota"],
    neighborhoods: "downtown Sarasota, St. Armands, Lido Key, Siesta Key, Osprey, the Rosemary District, and the Fruitville medical corridor",
    whyLocal: [
      "Same-day, on-site help anywhere from Lido Key to Osprey — nobody stuck driving down from Tampa.",
      "A named tech who actually knows your office, your staff, and the security questions your insurance company keeps asking.",
      "HIPAA reviews and paperwork made for the dozens of independent medical and dental practices that make Sarasota one of Florida's busiest healthcare markets.",
    ],
    faqs: [
      {
        q: "How quickly can you get on-site in Sarasota?",
        a: "For downtown Sarasota, Lido Key, and the Fruitville corridor we aim for same-day on-site help for anything urgent, and next business day for things that can wait. Most problems get solved remotely in under 15 minutes."
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
    h1: "IT Support in Bradenton, FL",
    title: "Bradenton IT Support | Local Tech Team | Simple IT SRQ",
    metaDescription: "Local IT support, cybersecurity, and cloud services for Bradenton, FL businesses. Flat monthly pricing, HIPAA paperwork, same-day help. Free IT check-up.",
    intro: "Bradenton is our home. From the Riverwalk and downtown Old Main Street to the business parks off SR-64 and the medical offices on Manatee Avenue, Simple IT SRQ supports the local businesses that keep Manatee County running. We're the IT team for construction firms, marine businesses, independent medical practices, manufacturers, and professional-services companies across Bradenton, Palmetto, and Ellenton.",
    landmarks: ["Bradenton Riverwalk", "Old Main Street", "Manatee Avenue medical corridor", "SR-64 business parks", "Downtown Bradenton"],
    neighborhoods: "downtown Bradenton, the Riverwalk and Old Main Street, West Bradenton, Palma Sola, Bayshore Gardens, and the Manatee Avenue medical corridor",
    whyLocal: [
      "We live and work in Manatee County. Our techs are in Bradenton the same day — not driving down I-75 from a Tampa office.",
      "Hurricane-season plans built for the Gulf Coast: off-site backups, networks that keep running on a generator, and a tested plan for getting you back online.",
      "A named tech on your account, 15-minute response on urgent problems, and flat monthly pricing that doesn't balloon when something breaks.",
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
    h1: "IT Support in Lakewood Ranch, FL",
    title: "Lakewood Ranch IT Support | Local IT Help | Simple IT SRQ",
    metaDescription: "Local IT support for Lakewood Ranch professional services, medical, and finance offices. Flat monthly pricing, HIPAA paperwork, and a real team that picks up the phone.",
    intro: "Lakewood Ranch is one of the fastest-growing planned communities in the country, and the professional offices clustered around Main Street, Lakewood Ranch Medical Center, and the UTC mall need IT that keeps up. Simple IT SRQ supports the law firms, financial advisors, medical practices, and real-estate brokerages building their businesses across Lakewood Ranch — from Waterside Place to the shops at University Town Center.",
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
        a: "Yes — a big share of our clients are right there. Same-business-day on-site help, and most problems solved remotely in under 15 minutes."
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
    h1: "IT Support in Nokomis, FL",
    title: "Nokomis IT Support | Local IT Help and Cybersecurity | Simple IT SRQ",
    metaDescription: "Local IT support for Nokomis and Casey Key businesses. Same-day help, flat monthly pricing, HIPAA paperwork, and a real team based in Sarasota County. Free IT check-up.",
    intro: "Nokomis sits at the quiet south end of Sarasota County where Casey Key meets the mainland — and the small businesses here deserve IT support that actually shows up. Simple IT SRQ supports the vacation rental companies, marine services, medical offices, real-estate firms, and professional-service practices along US-41 and Albee Road. We're 15 minutes away, not two hours from Tampa.",
    landmarks: ["Nokomis Beach", "Casey Key", "US-41 corridor", "Albee Road", "North Jetty Park"],
    neighborhoods: "Nokomis, Casey Key, Laurel, south Osprey, and the US-41 business corridor between Venice and Sarasota",
    whyLocal: [
      "Same-day on-site response from Sarasota County — we don't drive down from Tampa or Orlando like the big shops do.",
      "Built for 5- to 30-person offices: vacation rental managers, marine service companies, medical practices, and professional firms that need reliable IT without enterprise pricing.",
      "Hurricane-season backup and recovery plans made for the barrier-island reality: off-site backups, generator-safe networks, and a tested plan that doesn't assume you'll have power.",
    ],
    faqs: [
      {
        q: "How quickly can you get to Nokomis?",
        a: "We're based in Bradenton and Sarasota. Nokomis is about 25 minutes from our Sarasota team — same-day for anything urgent, next business day for scheduled work. Most issues get resolved remotely in under 15 minutes."
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
};

export const cityList = Object.values(cities);
