import { Link } from "../lib/Link";
import { ShieldCheck, Cloud, HardDrive, Lock, Briefcase, ArrowRight, Check } from "lucide-react";
import { useSEO, SITE_URL } from "../lib/seo";

// Vendor stack. Each entry explains what the vendor does, why we picked
// them, and the client-facing benefit. These are the tools we deploy and
// support — not a paid advertisement. Keeping the language honest because
// prospects and their cyber-insurance carriers do check.
const STACK = [
  {
    slug: "microsoft-365",
    name: "Microsoft 365",
    tagline: "Business email, Teams, OneDrive, SharePoint, Office apps",
    Icon: Cloud,
    categoryLabel: "Productivity & Email",
    why: "The core productivity platform for ~90% of the small businesses we support. We configure Business Premium (not Business Standard) because the Premium tier bundles Defender for Office 365, Intune MDM, and Azure AD P1 — the three features every cyber-insurance questionnaire now asks about.",
    clientBenefit: "One vendor for email, files, video, and device management, with a compliance posture that stands up to HIPAA and GLBA reviews.",
  },
  {
    slug: "huntress",
    name: "Huntress",
    tagline: "Managed detection and response (MDR)",
    Icon: ShieldCheck,
    categoryLabel: "Security — MDR",
    why: "Cyber-insurance carriers in 2026 increasingly require a real MDR on every endpoint, not just antivirus. Huntress is the SOC-as-a-service the MSP industry has settled on for small business — human analysts, 24/7, persistence-focused detection that catches what EDR misses.",
    clientBenefit: "When something malicious gets past the firewall at 2am, a human at Huntress is reading the alert and calling us. Your insurance renewal questionnaire has a clean answer to 'do you have 24/7 monitoring?'",
  },
  {
    slug: "sentinelone",
    name: "SentinelOne",
    tagline: "AI-powered endpoint protection (EDR)",
    Icon: Lock,
    categoryLabel: "Security — EDR",
    why: "SentinelOne replaces traditional antivirus with behavior-based EDR — it catches new malware by what it does, not what it looks like. We pair it with Huntress so you get automated detection AND human-in-the-loop response on the same endpoints.",
    clientBenefit: "Ransomware that encrypts your files gets stopped and rolled back automatically, not 48 hours later when someone notices.",
  },
  {
    slug: "acronis",
    name: "Acronis Cyber Protect",
    tagline: "Backup, disaster recovery, anti-ransomware",
    Icon: HardDrive,
    categoryLabel: "Backup & DR",
    why: "Most small businesses in SW Florida keep their last backup on the same network as the machine being backed up — which is exactly what ransomware looks for first. Acronis stores every backup in an off-site cloud vault with immutable retention, so even a full network compromise doesn't wipe your recovery option.",
    clientBenefit: "Hurricane season, a ransomware incident, or a stolen laptop — your files come back in hours, not days, from a location the attacker never touched.",
  },
  {
    slug: "intune",
    name: "Microsoft Intune",
    tagline: "Mobile device management + endpoint policy",
    Icon: Briefcase,
    categoryLabel: "Device Management",
    why: "The 2026 cyber-insurance questionnaire asks specifically whether you can wipe a lost laptop and enforce encryption on every device. Intune is how we answer 'yes' honestly — it manages the full device lifecycle from handed-out to decommissioned.",
    clientBenefit: "A lost phone or a fired employee doesn't become a data breach. One click wipes the company data and leaves the personal data alone.",
  },
  {
    slug: "fortinet",
    name: "Fortinet FortiGate",
    tagline: "Next-generation firewalls and secure Wi-Fi",
    Icon: ShieldCheck,
    categoryLabel: "Network & Firewall",
    why: "We deploy FortiGate firewalls in medical, law, and financial offices because the built-in IPS, web filtering, and VPN concentrator satisfy the network-segmentation requirements HIPAA and GLBA auditors ask for. Cisco Meraki for simpler offices where cloud dashboards matter more than granular policy.",
    clientBenefit: "Your guest Wi-Fi is cleanly isolated from the network your EHR runs on. Auditors and insurers see a real network-segmentation diagram, not a single flat subnet.",
  },
];

function StackCard({ vendor }) {
  const { Icon } = vendor;
  return (
    <article className="partner-card">
      <div className="partner-card-head">
        <span className="partner-card-icon" aria-hidden="true"><Icon size={22} /></span>
        <div className="partner-card-heading">
          <span className="partner-card-category">{vendor.categoryLabel}</span>
          <h3 className="partner-card-name">{vendor.name}</h3>
          <p className="partner-card-tagline">{vendor.tagline}</p>
        </div>
      </div>
      <div className="partner-card-body">
        <p className="partner-card-section-label">Why we chose it</p>
        <p className="partner-card-text">{vendor.why}</p>
        <p className="partner-card-section-label">What it means for you</p>
        <p className="partner-card-text">{vendor.clientBenefit}</p>
      </div>
    </article>
  );
}

export default function Partners() {
  useSEO({
    title: "Our Vendor Stack — The Tools We Deploy and Recommend | Simple IT SRQ",
    description: "The IT and cybersecurity tools Simple IT SRQ installs and supports for Sarasota, Bradenton, and Venice businesses — Microsoft 365, Huntress, SentinelOne, Acronis, Intune, and Fortinet. Plain-English explanations of why each one is in our stack.",
    canonical: `${SITE_URL}/partners`,
    image: `${SITE_URL}/og-image.png`,
    breadcrumbs: [
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Our Vendor Stack", url: `${SITE_URL}/partners` },
    ],
  });

  return (
    <main id="main" className="partners-main">
      <section className="section partners-hero">
        <div className="container">
          <span className="eyebrow">Our Vendor Stack</span>
          <h1 className="display">The tools we deploy and recommend.</h1>
          <p className="lede">
            Managed IT isn't one product — it's a deliberate stack of six or
            seven vendors that each own one job. Here are the ones we run in
            every engagement, why we picked them, and what each one actually
            does for your business, auditor, and insurance carrier.
          </p>
          <div className="partners-hero-meta">
            <span><Check size={14} /> Honest about what we use — no affiliate-badge theater</span>
            <span><Check size={14} /> Cyber-insurance-aligned</span>
            <span><Check size={14} /> Same stack across every client</span>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <div className="partner-grid">
            {STACK.map((v) => <StackCard key={v.slug} vendor={v} />)}
          </div>
        </div>
      </section>

      <section className="section partners-outro">
        <div className="container" style={{ textAlign: "center" }}>
          <h2 className="title-2">Different stack makes sense for you?</h2>
          <p className="lede" style={{ maxWidth: 680, margin: "0 auto 24px" }}>
            We run this stack because it's what's earned our trust with the
            mix of medical, legal, financial, and marine businesses on the
            SW Florida coast. If your industry or compliance posture needs
            something different, we'll tell you honestly instead of shoehorning
            you into our defaults.
          </p>
          <div className="partners-outro-ctas">
            <Link to="/book" className="btn btn-primary btn-lg">
              Book a 30-Minute Call <ArrowRight size={14} />
            </Link>
            <Link to="/store" className="btn btn-secondary btn-lg">
              Browse Our Playbooks
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
