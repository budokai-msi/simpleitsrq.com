// Productized fixed-fee services catalog for /services.
//
// Sales channel: Stripe Payment Links (zero serverless-function cost,
// hosted by Stripe, no custom checkout code). Create the link in your
// Stripe dashboard for each service, paste the URL into `buyLink`, flip
// `status` from "waitlist" → "live", and the page swaps the email-capture
// CTA for a real Buy Now button on the next deploy.
//
// Status flags:
//   "live"     — buyLink set; full Buy CTA renders, hard-conversion path
//   "waitlist" — no buyLink yet; email-capture CTA renders so we measure
//                demand BEFORE you spend time wiring the Stripe link
//   "consult"  — $0 lead-gen entry tier; routes to /book instead of Stripe
//
// Cross-link from blog posts: every service has a `slug` so you can deep-link
// /services#computer-tune-up from anywhere in the content.

const env = (typeof import.meta !== "undefined" && import.meta.env) || {};

export const services = [
  // ─────── Residential / single-machine repair ───────
  {
    slug: "computer-tune-up",
    title: "Computer Tune-Up",
    tagline: "We'll make your slow PC run like it did when you bought it.",
    audience: "Residential",
    audiences: ["Residential", "Business"],
    price: 99,
    priceSuffix: "",
    priceNote: "Flat fee · 1–2 hour drop-off · most machines done same day",
    duration: "1–2 hours",
    contents: [
      "Full diagnostic + drive-health and temperature check",
      "Malware and adware scan with multiple engines",
      "Startup-list cleanup and unnecessary-service removal",
      "Driver sweep and Windows Update / macOS update pass",
      "Browser reset + extension audit (the #1 cause of slow browsing)",
      "Disk health report — we tell you if a replacement is coming",
    ],
    notInScope: [
      "Hardware replacement (we'll quote separately if a part is dying)",
      "Data recovery from a failed drive",
      "Full OS reinstall (priced as 'Computer Reset' — different SKU)",
    ],
    bookingNote: "Drop off at our Bradenton location by appointment.",
    buyLink: env.VITE_STRIPE_LINK_TUNEUP || "",
    status: "waitlist",
    priority: 1,
  },
  {
    slug: "virus-removal",
    title: "Virus / Malware / Ransomware Cleanup",
    tagline: "We'll get the bad software off and harden the machine so it doesn't come back.",
    audience: "Both",
    audiences: ["Residential", "Business"],
    price: 179,
    priceFrom: true,
    priceSuffix: "",
    priceNote: "$179 simple browser-hijack · up to $399 for full ransomware. We diagnose first and quote firmly before any work.",
    duration: "2–4 hours typical, sometimes overnight",
    contents: [
      "Multi-engine malware scan with Windows Defender, Malwarebytes, ESET, and HitmanPro",
      "Browser cleanup and extension audit",
      "Boot-sector / rootkit scan via offline tooling (catches what in-OS scans miss)",
      "Post-clean hardening — UAC, firewall, browser settings re-tightened",
      "Optional: full backup of your data before we start (highly recommended for any ransomware case)",
      "Written summary of what was found, what it did, what's been done",
    ],
    notInScope: [
      "Ransomware DECRYPTION (almost always impossible without paying ransom — we restore from backup instead)",
      "Reinstall of paid software (we'll preserve license keys if accessible)",
    ],
    bookingNote: "If you suspect ransomware: power off the machine, do NOT plug in any external drives, and call us first.",
    buyLink: env.VITE_STRIPE_LINK_VIRUS_REMOVAL || "",
    status: "waitlist",
    priority: 2,
  },
  {
    slug: "ssd-upgrade",
    title: "SSD Upgrade — 1TB",
    tagline: "The single best upgrade for any 5-year-old PC. Boot in seconds, app launches feel instant.",
    audience: "Both",
    audiences: ["Residential", "Business"],
    price: 249,
    priceSuffix: "",
    priceNote: "Includes 1TB Crucial or Samsung SSD, full data migration, and 1-year drive warranty.",
    duration: "Same-day drop-off",
    contents: [
      "Full disk-clone migration — every file, every program, every setting preserved",
      "1TB SSD installed (Crucial MX500 SATA or Samsung 970/990 NVMe depending on machine)",
      "Original drive returned to you (use as external backup or wipe and reuse)",
      "Boot performance benchmark before + after (we'll show you the receipts)",
      "1-year warranty on the SSD against drive failure",
    ],
    notInScope: [
      "Machines older than 8 years — we'll honestly recommend replacement instead",
      "Custom drive sizes larger than 1TB (separate quote, but we can do up to 4TB)",
    ],
    buyLink: env.VITE_STRIPE_LINK_SSD || "",
    status: "waitlist",
    priority: 3,
  },
  {
    slug: "laptop-battery",
    title: "Laptop Battery Replacement",
    tagline: "OEM batteries only. No swelling, no off-brand fire hazards.",
    audience: "Both",
    audiences: ["Residential", "Business"],
    price: 169,
    priceFrom: true,
    priceSuffix: "",
    priceNote: "$169 for most consumer laptops · up to $249 for ultrabooks with sealed batteries.",
    duration: "Same-day drop-off",
    contents: [
      "Genuine brand-name OEM battery (Dell / Lenovo / HP / Asus parts — no aftermarket)",
      "Battery health report on the old battery (so you can see why it died)",
      "Calibration cycle on the new battery before pickup",
      "Replacement of the battery connector seal if it's worn",
    ],
    notInScope: [
      "Replacement of internal motherboard battery (CMOS) — that's a separate $79 service",
      "MacBook batteries (we partner with an Apple-authorized shop in Sarasota)",
    ],
    buyLink: env.VITE_STRIPE_LINK_BATTERY || "",
    status: "waitlist",
    priority: 4,
  },

  // ─────── Business one-shot projects ───────
  {
    slug: "network-audit",
    title: "Network + Wi-Fi Audit",
    tagline: "On-site survey, written report, fixed-fee — no commitment to a managed plan.",
    audience: "Business",
    audiences: ["Business"],
    price: 399,
    priceSuffix: "",
    priceNote: "Up to 5,000 sq ft single building. Multi-site or larger spaces: separate quote.",
    duration: "On-site visit + 3-business-day report",
    contents: [
      "On-site walkthrough with a tech (60–90 minutes)",
      "Wi-Fi signal-strength heat map of every room",
      "Per-AP and per-port utilization measurement",
      "Firewall configuration review and exposed-port audit",
      "Guest-network isolation check",
      "Written report with prioritized fix list and quoted prices for each",
      "Quote for the install if you want us to do the fixes (not required)",
    ],
    notInScope: [
      "Implementation of any fixes — that's a separate engagement",
      "Penetration testing (we'll refer you to a partner pentest firm)",
    ],
    buyLink: env.VITE_STRIPE_LINK_NETWORK_AUDIT || "",
    status: "waitlist",
    priority: 5,
  },
  {
    slug: "camera-install-deposit",
    title: "4-Camera Security System — Reservation Deposit",
    tagline: "$500 deposit reserves your install slot. Applied to the $3,500 total.",
    audience: "Both",
    audiences: ["Residential", "Business"],
    price: 500,
    priceSuffix: " deposit",
    priceNote: "Total: $3,500 for 4× UniFi Protect G5 cams + NVR + cabling + install. Deposit credits in full.",
    duration: "Install scheduled 2–3 weeks out",
    contents: [
      "Pre-install site walkthrough with the tech who'll do the install",
      "4 UniFi Protect G5 cameras — Bullet, Dome, or Pro depending on placement",
      "UniFi Cloud Key or Dream Machine NVR — local recording, no monthly fees",
      "Cat6 cable runs to each camera, labeled and documented",
      "Hurricane-rated mounting hardware (lag bolts into framing, marine-grade stainless on barrier islands)",
      "$2 silica-gel pack in every outdoor camera housing — eliminates morning lens fog",
      "$40 PoE surge protector at the rack (saved more cameras than any other line item)",
      "App setup, mobile viewing test, and a 15-minute training session",
    ],
    notInScope: [
      "Cameras 5+ — pay-per-camera add-on at $400–$700 each, deposited separately",
      "Existing-system swap-outs — we'll quote those after a free walkthrough",
    ],
    bookingNote: "Read the buyer's guide first → /blog/business-security-cameras-sarasota-honest-guide-2026",
    buyLink: env.VITE_STRIPE_LINK_CAMERA_DEPOSIT || "",
    status: "waitlist",
    priority: 6,
  },
  {
    slug: "m365-migration",
    title: "Microsoft 365 Migration",
    tagline: "We move your email, files, and devices over a weekend. Nobody loses a message.",
    audience: "Business",
    audiences: ["Business"],
    price: 1500,
    priceSuffix: "",
    priceNote: "Up to 25 mailboxes. 26+ mailboxes priced at +$45 per additional mailbox.",
    duration: "1–2 weeks of prep + a weekend cutover",
    contents: [
      "Tenant setup or audit of existing tenant (we'll fix anything misconfigured first)",
      "Mailbox migration from Google Workspace, Exchange on-prem, or another M365 tenant",
      "OneDrive / SharePoint setup with sensible folder structure",
      "Conditional Access + 2FA configuration for every account",
      "Outlook profile setup on every workstation, weekend cutover",
      "Monday-morning on-site for the post-cutover questions",
      "Written documentation handed to your office manager",
    ],
    notInScope: [
      "M365 license costs — billed by Microsoft, not us. We'll guide you to the right SKU.",
      "Custom add-on apps (Power Apps, Dynamics, etc.)",
    ],
    buyLink: env.VITE_STRIPE_LINK_M365_MIGRATION || "",
    status: "waitlist",
    priority: 7,
  },

  // ─────── Sarasota seasonal — UNIQUE LOCAL PLAY ───────
  {
    slug: "snowbird-arrival-setup",
    title: "Snowbird Pre-Arrival IT Setup",
    tagline: "We get the condo ready for your arrival. Wi-Fi works, cameras are healthy, computers are awake. Nov–Apr only.",
    audience: "Residential",
    audiences: ["Residential"],
    price: 349,
    priceSuffix: "",
    priceNote: "$349 per visit · book by Nov 1 for first week of arrival · Sarasota / Bradenton / Venice / Casey Key only.",
    duration: "Single visit, 2–3 hours",
    contents: [
      "Full Wi-Fi network test from every room — modem reset, range extender check",
      "Smart-TV, Apple TV, and streaming-device login verification",
      "Security-camera health check and recording-storage validation",
      "Computer wake-up: install pending updates, run a malware scan, verify backups",
      "Smart-lock battery and connectivity check",
      "Smoke-detector + thermostat battery swap (you supply or we do, +$15 each)",
      "Post-visit email with photos showing every device's state",
    ],
    notInScope: [
      "Hardware replacements (we'll quote on-site)",
      "Long-term monthly monitoring — see Snowbird Watch (coming soon)",
    ],
    bookingNote: "Book at least 5 days before arrival. We can also accept pickup keys via your property manager.",
    buyLink: env.VITE_STRIPE_LINK_SNOWBIRD || "",
    status: "waitlist",
    priority: 8,
  },

  // ─────── Free entry tier (lead-gen) ───────
  {
    slug: "free-strategy-call",
    title: "Free 30-Minute IT Strategy Call",
    tagline: "No sales pitch, no obligation. We'll tell you what's worth fixing and what isn't.",
    audience: "Business",
    audiences: ["Residential", "Business"],
    price: 0,
    priceSuffix: "",
    priceNote: "Free · 30 minutes · video or phone",
    duration: "30 minutes",
    contents: [
      "Quick assessment of your current setup",
      "Honest read on the top 2–3 risks we hear during the call",
      "Ballpark pricing for any work we'd recommend",
      "Written follow-up email summarizing the conversation",
    ],
    notInScope: [
      "We won't quote a managed-services contract on this call — that comes after a paid audit if you want one.",
    ],
    buyLink: "/book",
    status: "consult",
    priority: 99,
  },
];

// Filter helper for the Services page tabs
export const audienceFilter = (svc, target) => {
  if (target === "All") return true;
  return svc.audiences?.includes(target);
};
