import { useMemo, useState } from "react";
import { Link } from "../lib/Link";
import { TOOL_CATEGORIES } from "../data/toolCatalog";
import { useSEO } from "../lib/seo";
import {
  ArrowRight,
  ExternalLink,
  FileCheck,
  HardDrive,
  KeyRound,
  Monitor,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Wrench,
  Wifi,
  Zap,
} from "lucide-react";
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

const findTool = (categoryId, labelMatch) => {
  const cat = TOOL_CATEGORIES.find((c) => c.id === categoryId);
  return cat?.items.find((item) => labelMatch.test(item.label)) || cat?.items[0] || null;
};

function ToolLink({ item, compact = false, reason }) {
  if (!item) return null;
  if (!item.href) {
    return (
      <div className={compact ? "tool-buy-link tool-buy-link--compact is-disabled" : "tool-buy-link is-disabled"}>
        <span>
          <strong>{item.label}</strong>
          <small>{reason || item.desc}</small>
        </span>
      </div>
    );
  }
  return (
    <a
      href={item.href}
      target="_blank"
      rel="sponsored noopener noreferrer"
      className={compact ? "tool-buy-link tool-buy-link--compact" : "tool-buy-link"}
      onClick={() => trackAffiliateClick({
        slug: "tools",
        destination: item.href,
        label: item.label,
        network: item.vendor || "Amazon",
      })}
    >
      <span>
        <strong>{item.label}</strong>
        <small>{reason || item.desc}</small>
      </span>
      <ExternalLink size={15} />
    </a>
  );
}

function NumberField({ label, value, min = 0, max = 200, onChange }) {
  return (
    <label className="tool-field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value || 0))))}
      />
    </label>
  );
}

function UpsPlanner() {
  const [workstations, setWorkstations] = useState(4);
  const [networkDevices, setNetworkDevices] = useState(4);
  const [minutes, setMinutes] = useState(10);
  const watts = workstations * 115 + networkDevices * 22;
  const va = Math.ceil((watts / 0.6) * (minutes > 15 ? 1.35 : 1.15));
  const choice = va >= 1300
    ? findTool("power", /rackmount|line-interactive/i)
    : findTool("power", /line-interactive/i);
  return (
    <section className="tool-planner">
      <div className="tool-planner__head">
        <Zap size={20} />
        <div>
          <h2>Small Office UPS Calculator</h2>
          <p>Size battery backup for desks, switches, modem, and router before Florida power flickers do the math for you.</p>
        </div>
      </div>
      <div className="tool-planner__controls">
        <NumberField label="Workstations" value={workstations} min={1} max={50} onChange={setWorkstations} />
        <NumberField label="Network devices" value={networkDevices} min={1} max={40} onChange={setNetworkDevices} />
        <NumberField label="Shutdown minutes" value={minutes} min={5} max={45} onChange={setMinutes} />
      </div>
      <div className="tool-result">
        <strong>{fmt(va)} VA target</strong>
        <span>{fmt(watts)} estimated watts. Buy above the target, not below it.</span>
      </div>
      <ToolLink item={choice} reason="Start here for a normal small-office battery backup spec." />
    </section>
  );
}

function BackupPlanner() {
  const [staff, setStaff] = useState(8);
  const [tb, setTb] = useState(2);
  const needsNas = staff >= 4 || tb >= 2;
  const pick = needsNas
    ? findTool("backup", /2-bay nas/i)
    : findTool("backup", /portable ssd/i);
  const drive = findTool("backup", /wd red|ironwolf/i);
  return (
    <section className="tool-planner">
      <div className="tool-planner__head">
        <HardDrive size={20} />
        <div>
          <h2>Backup Path Finder</h2>
          <p>Decide whether a simple USB backup is enough or whether the office needs a NAS plus offsite backup.</p>
        </div>
      </div>
      <div className="tool-planner__controls">
        <NumberField label="Staff" value={staff} min={1} max={80} onChange={setStaff} />
        <NumberField label="Shared data TB" value={tb} min={1} max={80} onChange={setTb} />
      </div>
      <div className="tool-result">
        <strong>{needsNas ? "Use a NAS" : "USB backup can work"}</strong>
        <span>{needsNas ? "Multiple people or shared files need a network target with mirrored drives." : "One or two PCs can start with a portable SSD plus cloud backup."}</span>
      </div>
      <ToolLink item={pick} />
      {needsNas ? <ToolLink item={drive} compact reason="Add two NAS-rated drives and mirror them." /> : null}
    </section>
  );
}

function SecurityKeyPlanner() {
  const [users, setUsers] = useState(6);
  const keyCount = users * 2;
  const pick = users >= 12
    ? findTool("security", /budget|security key/i)
    : findTool("security", /5c nfc/i);
  return (
    <section className="tool-planner">
      <div className="tool-planner__head">
        <KeyRound size={20} />
        <div>
          <h2>YubiKey Rollout Math</h2>
          <p>Hardware MFA works when every person has a primary key and a spare. One-key rollouts fail on the first lost key.</p>
        </div>
      </div>
      <div className="tool-planner__controls">
        <NumberField label="Users" value={users} min={1} max={200} onChange={setUsers} />
      </div>
      <div className="tool-result">
        <strong>{fmt(keyCount)} keys</strong>
        <span>Two per person: one daily key, one sealed spare in the office.</span>
      </div>
      <ToolLink item={pick} />
    </section>
  );
}

function ClosetPlanner() {
  const [drops, setDrops] = useState(12);
  const [aps, setAps] = useState(2);
  const patch = findTool("infrastructure", /patch panel/i);
  const rack = findTool("infrastructure", /wall-mount/i);
  const switchPick = aps > 1 || drops > 8
    ? findTool("networking", /16-port|managed poe/i)
    : findTool("networking", /8-port|poe switch/i);
  return (
    <section className="tool-planner">
      <div className="tool-planner__head">
        <Server size={20} />
        <div>
          <h2>Network Closet Starter List</h2>
          <p>Turn the pile of cables beside the modem into something a tech can fix in ten minutes.</p>
        </div>
      </div>
      <div className="tool-planner__controls">
        <NumberField label="Wall drops" value={drops} min={1} max={96} onChange={setDrops} />
        <NumberField label="Access points" value={aps} min={0} max={16} onChange={setAps} />
      </div>
      <div className="tool-result">
        <strong>{drops > 24 ? "Use a larger rack" : "6U rack is usually enough"}</strong>
        <span>{aps ? "Use PoE so ceiling gear does not need wall adapters." : "Patch, label, and leave room for a future access point."}</span>
      </div>
      <ToolLink item={rack} compact />
      <ToolLink item={patch} compact />
      <ToolLink item={switchPick} compact />
    </section>
  );
}

function fmt(value) {
  return Number(value || 0).toLocaleString();
}

function CategorySection({ cat }) {
  const Icon = ICONS[cat.id] || ShieldCheck;
  const liveItems = cat.items;
  if (liveItems.length === 0) return null;
  return (
    <section className="tool-category" id={cat.id}>
      <div className="tool-category-head">
        <h2><Icon size={22} /> {cat.title}</h2>
        <p className="tool-category-intro">{cat.intro}</p>
      </div>
      <div className="tool-grid">
        {liveItems.map((item) => (
          <ToolLink key={item.label} item={item} />
        ))}
      </div>
    </section>
  );
}

export default function Tools() {
  const essentials = useMemo(() => ([
    findTool("power", /line-interactive/i),
    findTool("security", /5c nfc/i),
    findTool("backup", /2-bay nas|portable ssd/i),
    findTool("networking", /u6 pro|access point/i),
  ]).filter(Boolean), []);

  useSEO({
    title: "Small Office Tech Calculators & Recommended Hardware | Simple IT SRQ",
    description: "Practical small-office tech calculators and recommended hardware for Sarasota, Bradenton, and Venice businesses: UPS sizing, backup planning, YubiKeys, WiFi, docks, and network closets.",
    canonical: "https://simpleitsrq.com/tools",
    breadcrumbs: [
      { name: "Home", url: "https://simpleitsrq.com/" },
      { name: "Recommended Tools", url: "https://simpleitsrq.com/tools" },
    ],
  });

  return (
    <main className="tools-page">
      <header className="tools-hero tools-hero--buyer">
        <div>
          <h1>Buy the right office tech the first time.</h1>
          <p>
            Calculators and field-tested picks for small offices around Sarasota,
            Bradenton, and Venice. Start with the problem, then buy the gear.
            Links may earn an affiliate commission at no extra cost to you.
          </p>
          <div className="tools-hero-actions">
            <a href="#calculators" className="btn btn-primary">
              Use the calculators <SlidersHorizontal size={16} />
            </a>
            <Link to="/book" className="btn btn-secondary">
              Ask us to spec it <Wrench size={16} />
            </Link>
          </div>
        </div>
        <aside className="tools-quick-list" aria-label="Most common office buys">
          <h2>Most common fixes</h2>
          {essentials.map((item) => <ToolLink key={item.label} item={item} compact />)}
        </aside>
      </header>

      <section className="tools-calculators" id="calculators" aria-label="Office technology calculators">
        <UpsPlanner />
        <BackupPlanner />
        <SecurityKeyPlanner />
        <ClosetPlanner />
      </section>

      <section className="tools-guide-strip">
        <article>
          <h2>When to call before buying</h2>
          <p>If the purchase touches wiring, shared files, WiFi coverage, cameras, or login security, a 15-minute spec check can save a return, a truck roll, or a weekend outage.</p>
        </article>
        <Link to="/services" className="tool-guide-link">
          See fixed-fee install options <ArrowRight size={16} />
        </Link>
      </section>

      {TOOL_CATEGORIES.map((cat) => (
        <CategorySection key={cat.id} cat={cat} />
      ))}

      <section className="tools-cta">
        <h2>Need help choosing?</h2>
        <p>
          Send us your office count, floor layout, and what keeps breaking.
          We will spec the right gear and install it cleanly.
        </p>
        <Link to="/#contact" className="btn btn-primary">Talk to Simple IT SRQ</Link>
      </section>

      <footer className="tools-disclosure">
        <p>
          <strong>Affiliate Disclosure:</strong> This page contains affiliate links.
          When you purchase through these links, we may earn a commission at no
          additional cost to you. We recommend products because they fit common
          office jobs, not because a vendor paid for placement.
        </p>
      </footer>
    </main>
  );
}
