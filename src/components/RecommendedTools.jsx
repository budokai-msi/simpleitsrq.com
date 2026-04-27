import { Link } from "../lib/Link";
import { ArrowRight, Zap, HardDrive, KeyRound } from "lucide-react";

const TAG = import.meta.env.VITE_AFF_AMAZON_TAG || "";

function amazonSearch(query) {
  if (!TAG) return "/tools";
  return `https://www.amazon.com/s?k=${encodeURIComponent(query)}&tag=${encodeURIComponent(TAG)}`;
}

// Three universally-useful picks that every small office benefits from.
// Deliberately hardcoded (not pulled from toolCatalog.js) so this teaser
// stays stable as the catalog grows, and the copy is tuned for "why
// this matters to you" rather than product spec talk.
const PICKS = [
  {
    Icon: Zap,
    name: "Line-Interactive UPS",
    desc: "Ride out a Florida brown-out without rebooting every workstation.",
    query: "APC back-ups pro 1500va line interactive",
  },
  {
    Icon: HardDrive,
    name: "Portable 2TB SSD",
    desc: "Overnight backups that unplug in the morning — ransomware can't reach what isn't mounted.",
    query: "samsung t7 portable ssd 2tb",
  },
  {
    Icon: KeyRound,
    name: "Hardware 2FA Key",
    desc: "Stops 99% of password-theft attacks. Works with Microsoft 365, Google, and every password manager worth using.",
    query: "yubikey 5 series",
  },
];

export default function RecommendedTools({
  title = "Recommended tools we actually use",
  subtitle = "Small purchases that punch above their weight for a 5- to 30-person office.",
}) {
  return (
    <section className="section rec-tools" aria-labelledby="rec-tools-title">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">Tool Shelf</span>
          <h2 id="rec-tools-title" className="title-1">{title}</h2>
          <p className="section-sub">{subtitle}</p>
        </div>
        <div className="rec-tools-grid">
          {PICKS.map(({ Icon, name, desc, query }) => (
            <a
              key={name}
              href={amazonSearch(query)}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="rec-tool-card"
            >
              <div className="rec-tool-icon"><Icon size={22} /></div>
              <div className="rec-tool-body">
                <h3>{name}</h3>
                <p>{desc}</p>
                <span className="rec-tool-cta">View on Amazon <ArrowRight size={12} /></span>
              </div>
            </a>
          ))}
        </div>
        <div className="rec-tools-footer">
          <Link to="/tools" className="btn btn-secondary">See the full list of recommended tools <ArrowRight size={14} /></Link>
          <p className="rec-tools-disclosure">Simple IT SRQ is an Amazon Associate — qualifying purchases may earn us a small commission at no extra cost to you.</p>
        </div>
      </div>
    </section>
  );
}
