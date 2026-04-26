import { Link } from "../lib/Link";
import { TOOL_CATEGORIES } from "../data/toolCatalog";
import { useSEO } from "../lib/seo";
import { ExternalLink, ShieldCheck, Zap, HardDrive, Wifi, Monitor, FileCheck, Server } from "lucide-react";
import { trackAffiliateClick } from "../lib/trackClick";

const ICONS = {
  power: Zap,
  backup: HardDrive,
  security: ShieldCheck,
  networking: Wifi,
  desk: Monitor,
  compliance: FileCheck,
  infrastructure: Server,
};

function ToolCard({ item }) {
  if (!item.href) return null;
  return (
    <a
      href={item.href}
      target="_blank"
      rel="sponsored noopener noreferrer"
      className="tool-card"
      onClick={() => trackAffiliateClick({
        slug: "tools", destination: item.href, label: item.label, network: "Amazon",
      })}
    >
      <strong>{item.label}</strong>
      <p>{item.desc}</p>
      <span className="tool-card-cta">
        View on Amazon <ExternalLink size={14} />
      </span>
    </a>
  );
}

function CategorySection({ cat }) {
  const Icon = ICONS[cat.id] || ShieldCheck;
  const liveItems = cat.items.filter((i) => i.href);
  if (liveItems.length === 0) return null;
  return (
    <section className="tool-category" id={cat.id}>
      <h2><Icon size={22} /> {cat.title}</h2>
      <p className="tool-category-intro">{cat.intro}</p>
      <div className="tool-grid">
        {liveItems.map((item, i) => (
          <ToolCard key={i} item={item} />
        ))}
      </div>
    </section>
  );
}

export default function Tools() {
  useSEO({
    title: "Recommended Tools & Hardware | Simple IT SRQ",
    description: "Curated hardware and software recommendations for Sarasota and Bradenton small businesses. UPS, backup drives, security keys, WiFi, docking stations, and compliance gear.",
    canonical: "https://simpleitsrq.com/tools",
    breadcrumbs: [
      { name: "Home", url: "https://simpleitsrq.com/" },
      { name: "Recommended Tools", url: "https://simpleitsrq.com/tools" },
    ],
  });

  return (
    <main className="tools-page">
      <header className="tools-hero">
        <h1>Tools & Hardware We Recommend</h1>
        <p>
          Curated picks for small businesses in Sarasota, Bradenton, and Venice.
          Every product here is something we have deployed, tested, or standardized
          on for managed-services clients. Links go to Amazon — we earn a small
          affiliate commission on qualifying purchases.
        </p>
        <nav className="tools-toc">
          {TOOL_CATEGORIES.map((cat) => {
            const Icon = ICONS[cat.id] || ShieldCheck;
            return (
              <a key={cat.id} href={`#${cat.id}`} className="tools-toc-link">
                <Icon size={16} /> {cat.title}
              </a>
            );
          })}
        </nav>
      </header>

      {TOOL_CATEGORIES.map((cat) => (
        <CategorySection key={cat.id} cat={cat} />
      ))}

      <section className="tools-cta">
        <h2>Need Help Choosing?</h2>
        <p>
          Not sure what fits your office? We do on-site assessments and spec
          the right hardware for your headcount, layout, and compliance
          requirements — no guesswork.
        </p>
        <Link to="/#contact" className="btn btn-primary">Talk to Simple IT SRQ</Link>
      </section>

      <footer className="tools-disclosure">
        <p>
          <strong>Affiliate Disclosure:</strong> This page contains affiliate links.
          When you purchase through these links, we earn a small commission at no
          additional cost to you. We only recommend products we have used with clients
          or tested ourselves. This helps fund our free guides and blog content.
        </p>
      </footer>
    </main>
  );
}
