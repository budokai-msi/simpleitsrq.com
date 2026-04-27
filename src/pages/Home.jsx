import {
  Headphones, Server, ShieldCheck, Lock, Cloud, FileCheck,
  HeartPulse, Scale, Landmark, HardHat, Home as HomeIcon, Shield,
  Phone, Mail, MapPin, Clock, Star, Check, ArrowRight, Wifi, Briefcase,
  Loader2, CheckCircle2, AlertCircle, Send, GraduationCap, Key, Wrench,
  Camera, Network, RefreshCw, Users
} from "lucide-react";
import { Link } from "../lib/Link";
import { useState, useEffect } from "react";
import { useSEO } from "../lib/seo";
import { useExperiment, recordConversion } from "../lib/ab";
import heroGrid from "../assets/hero-grid.svg";
import posts from "../data/posts-meta.json";
import BlogCover from "../components/BlogCover";
import RecommendedTools from "../components/RecommendedTools";
import NewsletterSignup from "../components/NewsletterSignup";
import GoogleReviews from "../components/GoogleReviews";
import { tapHaptic, selectionHaptic, successHaptic, errorHaptic } from "../lib/haptics";
import { useTurnstile, TURNSTILE_SITE_KEY } from "../lib/useTurnstile";
import { csrfFetch } from "../lib/csrf";
import { track } from "../lib/analytics";

// Hero copy variants — assigned via useExperiment("home-hero-v2", [...]).
// All three variants now lead with managed IT + helpdesk; differences are
// in the *angle* (flat-fee MSP, pain-point-led helpdesk, outsourced-IT-
// department framing). Voice is informed by the patterns local Sarasota
// MSPs use (month-to-month, no offshore queue, real engineers, plain
// English, transparent pricing) but every line here is original — no
// competitor copy lifted.
//
// Conversions tracked when the primary CTA is clicked. After ~30 days
// look at GA4 events filtered to experiment_id="home-hero-v2" and
// compare CTR per variant; ship the winner as the only copy.
//
// Bumped from "home-hero" → "home-hero-v2" because the v1 buy-led /
// wisp-led copy was retired so we want clean attribution.
const HERO_VARIANTS = {
  // Default flat-fee MSP positioning. Most direct read of the offer.
  control: {
    eyebrow: "Managed IT · Helpdesk · Cybersecurity — Sarasota · Bradenton · Venice",
    h1: "Managed IT and helpdesk that just works.",
    lede:
      "Local Sarasota engineers. Flat monthly pricing. Month-to-month, no long-term contract. We answer the phone, fix the problem, and document what we did — for medical offices, law firms, contractors, real-estate brokerages, and any small business that's tired of fighting their computers.",
    primaryLabel: "Get a Free IT Check-Up",
    primaryHref: "#contact",
    secondaryLabel: "See What We Do",
    secondaryHref: "#solutions",
  },
  // Pain-point lead — for visitors who already know IT is broken and
  // are hunting for someone who'll just answer the phone.
  "helpdesk-led": {
    eyebrow: "Local Sarasota Helpdesk · Real Engineers, Real Phones",
    h1: "Stop fighting your computers. Start running your business.",
    lede:
      "If your office is calling a different vendor for every problem — printers, email, Wi-Fi, the screen that won't turn on — we're the one number you call instead. Unlimited helpdesk, 24/7 monitoring, and a real Sarasota engineer on the line. Month-to-month, no offshore queue, no franchise headquarters.",
    primaryLabel: "Talk to a local engineer",
    primaryHref: "#contact",
    secondaryLabel: "See our services",
    secondaryHref: "#solutions",
  },
  // Outsourced-IT-department framing — for owners thinking "we need IT
  // staff but can't justify a hire" who recognize the role on hearing it.
  "outsourced-led": {
    eyebrow: "Your Outsourced IT Department · For Sarasota Small Businesses",
    h1: "The IT department your business is too small to hire.",
    lede:
      "We're the full-time IT team for offices that don't want one in-house. One flat fee per user covers helpdesk, computers, network, Microsoft 365, security, and the cyber-insurance paperwork your carrier asks for at renewal — handled by a Sarasota crew that gets to know your office, your industry, and your people.",
    primaryLabel: "Get a free IT check-up",
    primaryHref: "#contact",
    secondaryLabel: "See our services",
    secondaryHref: "#solutions",
  },
};

function Hero() {
  const variant = useExperiment("home-hero-v2", ["control", "helpdesk-led", "outsourced-led"]);
  const v = HERO_VARIANTS[variant] || HERO_VARIANTS.control;

  const onPrimary = () => recordConversion("home-hero-v2", "primary-cta");
  const onSecondary = () => recordConversion("home-hero-v2", "secondary-cta");

  // Internal links (start with /) use SmoothLink for view-transition;
  // hash anchors (#contact) use plain <a> so the in-page jump still
  // works under react-router's hash handling.
  const Primary = v.primaryHref.startsWith("/") ? Link : "a";
  const primaryProps = v.primaryHref.startsWith("/")
    ? { to: v.primaryHref, onClick: onPrimary }
    : { href: v.primaryHref, onClick: onPrimary };
  const Secondary = v.secondaryHref.startsWith("/") ? Link : "a";
  const secondaryProps = v.secondaryHref.startsWith("/")
    ? { to: v.secondaryHref, onClick: onSecondary }
    : { href: v.secondaryHref, onClick: onSecondary };

  return (
    <section className="hero hero-clean" aria-labelledby="hero-title" data-experiment-variant={variant}>
      <div className="hero-bg" aria-hidden="true">
        <img
          src={heroGrid}
          alt=""
          className="hero-grid-bg"
          fetchpriority="high"
          decoding="async"
        />
      </div>
      <div className="container hero-stack-clean">
        <div className="hero-copy hero-copy-centered">
          <span className="eyebrow">{v.eyebrow}</span>
          <h1 id="hero-title" className="display">{v.h1}</h1>
          <p className="lede">{v.lede}</p>
          <div className="hero-ctas">
            <Primary className="btn btn-primary btn-lg" {...primaryProps}>{v.primaryLabel}</Primary>
            <Secondary className="btn btn-secondary btn-lg" {...secondaryProps}>{v.secondaryLabel}</Secondary>
          </div>
          <ul className="trust-row" aria-label="Why clients trust us">
            <li><Star size={14} strokeWidth={2.25} fill="#F7630C" stroke="#F7630C" /> 5-star Google reviews</li>
            <li><Clock size={14} strokeWidth={2.25} /> Same-day response · &lt;15 min for urgent</li>
            <li><ShieldCheck size={14} strokeWidth={2.25} /> Local SW Florida team · no offshore queue</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function HeroPaths() {
  // Three revenue / lead-magnet paths surfaced immediately below the hero.
  // Free tier (Tools) captures top-of-funnel, mid-tier (Store playbooks)
  // monetizes the audience that isn't ready to call yet, and the Academy
  // pulls the cyber-insurance-required subscription crowd.
  return (
    <section className="hero-paths" aria-label="Other ways to start">
      <div className="container">
        <div className="hero-paths-row">
          <Link to="/tools" className="hero-path">
            <span className="hero-path-icon" aria-hidden="true"><Wrench size={22} /></span>
            <span className="hero-path-copy">
              <span className="hero-path-label">Free Tools</span>
              <span className="hero-path-desc">Password breach check, more coming</span>
            </span>
          </Link>
          <Link to="/store" className="hero-path">
            <span className="hero-path-icon" aria-hidden="true"><FileCheck size={22} /></span>
            <span className="hero-path-copy">
              <span className="hero-path-label">Playbooks &amp; Templates</span>
              <span className="hero-path-desc">$19–$299 · WISP, HIPAA, compliance</span>
            </span>
          </Link>
          <Link to="/security-academy" className="hero-path">
            <span className="hero-path-icon" aria-hidden="true"><GraduationCap size={22} /></span>
            <span className="hero-path-copy">
              <span className="hero-path-label">Security Academy</span>
              <span className="hero-path-desc">$12/user/mo · insurance-required training</span>
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}

// Static defense trust card — earlier version pulled live attack
// counts from a public endpoint, but live OPSEC numbers shouldn't be
// part of our public attack surface (a sophisticated attacker can
// fingerprint our defenses by watching the counters move). Now reads
// only the boolean `protectionActive` from /api/contact?action=protection-status
// and shows abstract trust copy. Real numbers stay inside the admin
// portal.
function LiveDefenseStrip() {
  const [active, setActive] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/contact?action=protection-status")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (!cancelled && data) setActive(!!data.protectionActive); })
      .catch(() => { /* defaults to active=true */ });
    return () => { cancelled = true; };
  }, []);

  if (!active) return null;

  return (
    <section className="live-defense-strip" aria-label="Defense status">
      <div className="container">
        <Link to="/exposure-scan" className="live-defense-card" style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          gap: "16px 20px",
          alignItems: "center",
          padding: "18px 22px",
          borderRadius: 14,
          background: "linear-gradient(180deg, rgba(16, 124, 16, 0.05) 0%, rgba(16, 124, 16, 0.02) 100%)",
          border: "1px solid rgba(16, 124, 16, 0.18)",
          textDecoration: "none",
          color: "inherit",
          transition: "transform 160ms ease, box-shadow 160ms ease",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              display: "inline-block", width: 10, height: 10, borderRadius: 999,
              background: "#107C10", animation: "pulse-green 2s infinite",
            }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#107C10" }}>
              Active defense
            </span>
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 15, color: "var(--text-1)" }}>
              Same defense layer protecting this site is what we deploy on client sites
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--syn-text-muted, #6b7280)" }}>
              Automated CVE auto-block · OSINT threat-feed enrichment · honeypot trapping · rate-limit defense
            </p>
          </div>
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 600, color: "#107C10", whiteSpace: "nowrap" }}>
            Run a free scan <ArrowRight size={14} />
          </span>
        </Link>
      </div>
      <style>{`
        @keyframes pulse-green {
          0%, 100% { box-shadow: 0 0 0 0 rgba(16, 124, 16, 0.55); }
          50% { box-shadow: 0 0 0 6px rgba(16, 124, 16, 0); }
        }
        .live-defense-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(16, 124, 16, 0.1);
        }
        @media (max-width: 720px) {
          .live-defense-card {
            grid-template-columns: 1fr !important;
            text-align: center;
          }
          .live-defense-card > * { justify-self: center; }
        }
      `}</style>
    </section>
  );
}

function LogosBar() {
  // The brands we use under the hood. Kept so prospective clients (and their
  // insurance carriers or auditors) can recognize the tools, but framed as
  // "what we install for you" instead of a raw vendor dump.
  const vendors = [
    "Microsoft 365",
    "SentinelOne",
    "Microsoft Defender",
    "Intune",
    "Fortinet",
    "Cisco Meraki",
  ];
  return (
    <section className="logos-bar" aria-label="Tools and brands we install">
      <div className="container">
        <p className="logos-title">The tools we install and support for you</p>
        <div className="logos-row">
          {vendors.map((v) => <span key={v} className="logo-mark">{v}</span>)}
        </div>
      </div>
    </section>
  );
}

const SOLUTIONS = [
  {
    Icon: Headphones,
    title: "Managed IT and Helpdesk",
    desc: "Unlimited helpdesk, 24/7 computer and network monitoring, software updates, and new-employee onboarding — all under one flat monthly fee per user. Call, email, or text and a real Sarasota engineer answers; critical problems get a live tech in under 15 minutes."
  },
  {
    Icon: Wrench,
    title: "Computer Repair (Business and Residential)",
    desc: "Slow PCs, dead laptops, failed drives, virus removal, screen swaps, and the upgrade that's been sitting on the desk for a year. We work on home machines too — no contract, no minimum, just an honest diagnosis and a quote."
  },
  {
    Icon: Camera,
    title: "Security Camera Installation",
    desc: "IP camera systems for shops, offices, warehouses, and homes — wired or PoE, indoor or outdoor, with mobile viewing and on-site recording. We pick the gear, run the cable, mount it, and show you how to use it."
  },
  {
    Icon: Network,
    title: "Enterprise Domain Environments",
    desc: "Active Directory, Entra/Azure AD, Group Policy, file shares, and the user/computer setup that lets a 20-person office act like one. New domain build-outs and rescues of the one you inherited."
  },
  {
    Icon: RefreshCw,
    title: "Migrations and Upgrades",
    desc: "Email migrations to Microsoft 365 or Google Workspace, server replacements, file-share moves, Windows 11 rollouts, and hardware refreshes. We plan the cutover, do the work over a weekend, and stay on-site the morning after."
  },
  {
    Icon: Lock,
    title: "Cybersecurity and Virus Protection",
    desc: "Modern antivirus, email scam filtering, safer web browsing, and 24/7 monitoring. We turn on two-step sign-in for every account and hand you the written proof your cyber-insurance carrier asks for at renewal."
  },
  {
    Icon: Cloud,
    title: "Microsoft 365, Email and Cloud Apps",
    desc: "We set up (or clean up) your email, Teams, shared drives, and company devices so everything works the same on every laptop and phone."
  },
  {
    Icon: Server,
    title: "Backups and Disaster Recovery",
    desc: "Automatic backups of every computer and server, with a second copy stored off-site so a fire, a hurricane, or a ransomware attack can't wipe you out. We test the backups every quarter."
  },
  {
    Icon: Phone,
    title: "Business Phone Systems",
    desc: "Modern phones that work from your desk, your cell, or your laptop — with voicemail in your email, text messaging, and fax-over-email. We move your existing numbers and set up after-hours routing."
  },
  {
    Icon: Wifi,
    title: "Networking, Wi-Fi, and Cabling",
    desc: "Business-grade firewalls and Wi-Fi that actually reach every corner of your office or home. We run new network cables, label every jack, and guest-separate the Wi-Fi."
  },
  {
    Icon: FileCheck,
    title: "HIPAA and Cyber-Insurance Paperwork",
    desc: "Made for medical and dental practices, law firms, and any business renewing their cyber-insurance policy. We run the required security checks, put the protections in place, and give you a binder of documents you can hand an auditor."
  },
  {
    Icon: Briefcase,
    title: "IT Planning and Budgeting",
    desc: "Sit down with a senior tech once a quarter to look at what's working, what's about to break, and what should be in next year's budget. No corporate speak — just a straight answer on where to spend and where to wait."
  },
];

function Solutions() {
  return (
    <section className="section" id="solutions" aria-labelledby="solutions-title">
      <div className="container">
        <div className="section-head reveal-up" data-reveal>
          <span className="eyebrow">Managed IT Services</span>
          <h2 id="solutions-title" className="title-1">Your outsourced IT department, run from Sarasota</h2>
          <p className="section-sub">Helpdesk, computer repair, security cameras, networking, enterprise domains, migrations, backups, and Microsoft 365 — handled by one local team. For Sarasota and Bradenton businesses and homes, so you don't have to call five different people when something breaks.</p>
        </div>
        <div className="solution-grid">
          {SOLUTIONS.map(({ Icon, title, desc }, i) => (
            <a key={title} href="#contact" className="solution-card reveal-up" data-reveal data-reveal-delay={Math.min(i + 1, 5)}>
              <div className="solution-card-head">
                <span className="solution-card-icon"><Icon size={18} /></span>
                <h3 className="solution-card-title">{title}</h3>
              </div>
              <p className="solution-card-desc">{desc}</p>
              <span className="solution-card-link">
                Learn more <ArrowRight size={14} />
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

const INDUSTRIES = [
  { Icon: HeartPulse, name: "Healthcare", badges: ["HIPAA", "HITECH"] },
  { Icon: Scale, name: "Legal", badges: ["ABA", "SOC 2"] },
  { Icon: Landmark, name: "Finance", badges: ["GLBA", "PCI-DSS"] },
  { Icon: HardHat, name: "Construction", badges: ["OSHA", "CMMC"] },
  { Icon: HomeIcon, name: "Real Estate", badges: ["NAR", "SOC 2"] },
  { Icon: Users, name: "Residential", badges: ["Home offices", "Snowbird condos"] },
];

function Industries() {
  return (
    <section className="section section-alt" id="industries" aria-labelledby="industries-title">
      <div className="container">
        <div className="section-head reveal-up" data-reveal>
          <span className="eyebrow">Who We Work With</span>
          <h2 id="industries-title" className="title-1">Industries we know how to support</h2>
          <p className="section-sub">Medical, legal, financial, construction, and real estate offices across Sarasota and Bradenton — the verticals with the most demanding day-to-day IT. We also handle residential clients, home offices, and snowbird condos that need a local tech who'll just show up.</p>
        </div>
        <div className="industries-grid">
          {INDUSTRIES.map(({ Icon, name, badges }, i) => (
            <article key={name} className="industry-card card-hover reveal-up" data-reveal data-reveal-delay={i + 1}>
              <div className="industry-icon"><Icon size={26} /></div>
              <h3 className="industry-name">{name}</h3>
              <div className="badges">
                {badges.map((b) => <span key={b} className="badge badge-glow">{b}</span>)}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Compliance() {
  const features = [
    "HIPAA paperwork and risk reviews",
    "Cyber-insurance renewal help",
    "Off-site backups you can actually restore",
    "A simple disaster-recovery plan for your team",
    "Strong encryption on every laptop and phone",
  ];
  return (
    <section className="section" id="compliance" aria-labelledby="compliance-title">
      <div className="container compliance-grid reveal-up">
        <div>
          <span className="eyebrow">Beyond the Helpdesk</span>
          <h2 id="compliance-title" className="title-1">When you need it, we cover compliance and disaster recovery too</h2>
          <p className="section-sub">
            Most months we're just keeping your team productive. But when an audit lands, an
            insurance carrier asks for proof, or a hurricane is headed for the Gulf, we already
            have the paperwork drafted and the recovery plan ready to execute.
          </p>
          <ul className="feature-list">
            {features.map((f) => (
              <li key={f}><Check size={18} color="#0F6CBD" /> {f}</li>
            ))}
          </ul>
        </div>
        <aside className="compliance-card" aria-label="Our track record">
          <div className="cc-header">
            <Shield size={24} color="#0F6CBD" />
            <div>
              <span className="cc-eyebrow">HIPAA DOCUMENTED PARTNER</span>
              <h3 className="cc-title">Our track record</h3>
            </div>
          </div>
          <div className="cc-grid">
            <div><span>0</span><small>Breaches</small></div>
            <div><span>&lt;4h</span><small>Back up and running</small></div>
            <div><span>Strong</span><small>Encryption</small></div>
            <div><span>99.99%</span><small>Uptime</small></div>
          </div>
          <div className="cc-footer">
            <Check size={14} color="#107C10" /> Paperwork and protections in place
          </div>
        </aside>
      </div>
    </section>
  );
}

function Testimonial() {
  return (
    <section className="testimonial-section" aria-label="Client testimonial">
      <div className="container">
        <figure className="testimonial">
          <blockquote>
            "We switched to Simple IT SRQ after our last IT company missed a
            ransomware attempt. Within a month they had two-step sign-in on
            every account, replaced our backups, and walked our cyber-insurance
            carrier through everything they'd put in place. Our renewal premium
            dropped 18%."
          </blockquote>
          <figcaption>
            <strong>Karen M.</strong>
            <span> Practice Administrator, Sarasota dental group</span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

function FreeTools() {
  return (
    <section className="section" id="free-tools" aria-labelledby="free-tools-title">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">Free + Upgrade</span>
          <h2 id="free-tools-title" className="title-1">Try a tool, train your team, or skip ahead</h2>
          <p className="section-sub">
            Three ways to engage without ever calling us — one is free, one is recurring, one is a $29 one-shot.
          </p>
        </div>
        <div className="free-tools-grid">
          <Link to="/password-check" className="free-tools-card">
            <span className="free-tools-icon"><Key size={22} /></span>
            <span className="free-tools-tag">Free · No signup</span>
            <h3>Is your password breached?</h3>
            <p>Privacy-preserving check against 800M+ known-breached passwords. Password never leaves your browser. Same technique 1Password Watchtower uses.</p>
            <span className="free-tools-cta">Run the check <ArrowRight size={14} /></span>
          </Link>
          <Link to="/security-academy" className="free-tools-card is-featured">
            <span className="free-tools-icon"><GraduationCap size={22} /></span>
            <span className="free-tools-tag">Recurring · From $12/user/mo</span>
            <h3>Simple IT SRQ Security Academy</h3>
            <p>Fully-managed security awareness training for your team. Monthly 5-minute modules, quarterly phishing sims, annual compliance report your carrier will love.</p>
            <span className="free-tools-cta">Join the waitlist <ArrowRight size={14} /></span>
          </Link>
          <Link to="/store/saas-incident-response-playbook" className="free-tools-card">
            <span className="free-tools-icon"><FileCheck size={22} /></span>
            <span className="free-tools-tag">$29 · One-shot</span>
            <h3>SaaS Incident Response Playbook</h3>
            <p>The 14-page printable fillable version of our vendor-breach audit. Florida FIPA-aware. Drops into your cyber-insurance binder. Written the morning two SaaS vendors had a bad day.</p>
            <span className="free-tools-cta">See the preview <ArrowRight size={14} /></span>
          </Link>
        </div>
      </div>
    </section>
  );
}

function BlogPreview() {
  const recent = [...posts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  return (
    <section className="section section-alt" id="blog" aria-labelledby="blog-title">
      <div className="container">
        <div className="section-head reveal-up" data-reveal>
          <span className="eyebrow">From the Blog</span>
          <h2 id="blog-title" className="title-1">Tips for local business owners</h2>
          <p className="section-sub">Straightforward takes on the security, AI, and cloud news that actually matters for Sarasota and Bradenton businesses.</p>
        </div>
        <div className="blog-grid">
          {recent.map((p) => (
            <article key={p.slug} className="blog-card card-hover reveal-up" data-reveal>
              <Link to={`/blog/${p.slug}`} className="blog-card-img" aria-label={p.title}>
                <BlogCover post={p} variant="card" />
              </Link>
              <div className="blog-card-body">
                <span className="blog-card-category">{p.category}</span>
                <h3 className="blog-card-title"><Link to={`/blog/${p.slug}`}>{p.title}</Link></h3>
                <p className="blog-card-excerpt">{p.excerpt}</p>
                <div className="blog-card-meta">
                  <time dateTime={p.date}>{new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</time>
                  <Link to={`/blog/${p.slug}`} className="blog-card-readmore">Read more <ArrowRight size={14} /></Link>
                </div>
              </div>
            </article>
          ))}
        </div>
        <div className="blog-cta-row">
          <Link to="/blog" className="btn btn-secondary btn-lg">View all posts</Link>
        </div>
      </div>
    </section>
  );
}

function StatsBar() {
  // Honest stats only. "100% Florida-based" is geographic fact. "24/7
  // monitoring" is true (we run automated agent checks every 15 min).
  // No SLA puffery — response-time claims have been retired.
  const stats = [
    { v: "Local", l: "Sarasota and Bradenton based" },
    { v: "B2B + Home", l: "Businesses and residential" },
    { v: "24/7", l: "Automated monitoring" },
    { v: "Flat", l: "Monthly pricing — no surprises" },
  ];
  return (
    <section className="stats-bar" aria-label="Key statistics">
      <div className="container stats-grid">
        {stats.map((s, i) => (
          <div key={s.l} className="stat reveal-up" data-reveal data-reveal-delay={i + 1}>
            <span className="stat-v">{s.v}</span>
            <span className="stat-l">{s.l}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function CtaBanner() {
  return (
    <section className="section">
      <div className="container">
        <div className="cta-banner reveal-scale">
          <h2 className="title-2">Tired of fighting with your IT?</h2>
          <p>Book a free 30-minute call with a local tech. No sales pitch, no jargon — just a straight answer on what's wrong and what it'd take to fix.</p>
          <div className="cta-actions">
            <Link to="/book" className="btn btn-primary btn-lg">Book a free call</Link>
            <Link to="/support" className="btn btn-secondary btn-lg">Existing client? Get help</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

const ERROR_MESSAGES = {
  name_required: "Please enter your name.",
  email_invalid: "That email address looks off — double-check it?",
  message_required: "Add a short message so we know how to help.",
  bot_detected: "We couldn't verify your browser. Please refresh the page and try again.",
  rate_limited: "Too many submissions in a short window. Please wait a few minutes and try again.",
  send_failed: "We couldn't send your message just now. Please try again in a moment.",
  network_error: "Network hiccup. Check your connection and try again.",
  invalid_body: "Something went wrong with that request. Please try again.",
  invalid_json: "Something went wrong with that request. Please try again.",
  method_not_allowed: "Something went wrong with that request. Please try again.",
  captcha_required: "Please complete the security check before sending.",
};

const initialForm = { name: "", company: "", email: "", phone: "", message: "", _hp: "" };

function Contact() {
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState("idle"); // idle | submitting | success | error
  const [errorMsg, setErrorMsg] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");

  const { containerRef: turnstileRef, reset: resetTurnstile } =
    useTurnstile(setTurnstileToken);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const reset = () => {
    setForm(initialForm);
    setStatus("idle");
    setErrorMsg("");
    setTurnstileToken("");
    resetTurnstile();
    selectionHaptic();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (status === "submitting") return;

    // If Turnstile is configured (prod) but no token yet, prompt the user.
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      errorHaptic();
      setStatus("error");
      setErrorMsg(ERROR_MESSAGES.captcha_required);
      return;
    }

    selectionHaptic();
    setStatus("submitting");
    setErrorMsg("");

    try {
      const r = await csrfFetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, turnstileToken }),
      });
      const data = await r.json().catch(() => ({}));

      if (r.ok && data.ok) {
        successHaptic();
        // Estimated lead value for an inbound IT consultation request —
        // conservative; tune in GA4 if attribution shows a different number.
        track.lead("home-contact", 250, { has_phone: !!form.phone, has_company: !!form.company });
        setStatus("success");
        return;
      }

      errorHaptic();
      setStatus("error");
      setErrorMsg(ERROR_MESSAGES[data?.error] || "Something went wrong. Please try again in a moment.");
      // Turnstile tokens are single-use — get a fresh one for the retry.
      setTurnstileToken("");
      resetTurnstile();
    } catch {
      errorHaptic();
      setStatus("error");
      setErrorMsg(ERROR_MESSAGES.network_error);
      setTurnstileToken("");
      resetTurnstile();
    }
  };

  const submitting = status === "submitting";

  return (
    <section className="section" id="contact" aria-labelledby="contact-title">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">Contact</span>
          <h2 id="contact-title" className="title-1">Tell us what's going on</h2>
          <p className="section-sub">Drop us a note and a real person will get back to you during business hours.</p>
        </div>
        <div className="contact-grid">
          <div className="form-shell">
            <form
              className={`form${status === "success" ? " is-success" : ""}`}
              onSubmit={handleSubmit}
              aria-label="Contact form"
              noValidate
            >
              <div className="row-2">
                <label>
                  <span>Name</span>
                  <input
                    type="text" name="name" value={form.name} onChange={update("name")}
                    required aria-required="true" autoComplete="name"
                    disabled={submitting}
                  />
                </label>
                <label>
                  <span>Company</span>
                  <input
                    type="text" name="company" value={form.company} onChange={update("company")}
                    autoComplete="organization" disabled={submitting}
                  />
                </label>
              </div>
              <div className="row-2">
                <label>
                  <span>Email</span>
                  <input
                    type="email" name="email" value={form.email} onChange={update("email")}
                    required aria-required="true" autoComplete="email"
                    inputMode="email" disabled={submitting}
                  />
                </label>
                <label>
                  <span>Phone</span>
                  <input
                    type="tel" name="phone" value={form.phone} onChange={update("phone")}
                    autoComplete="tel" inputMode="tel" disabled={submitting}
                  />
                </label>
              </div>
              <label>
                <span>Message</span>
                <textarea
                  name="message" rows="5" value={form.message} onChange={update("message")}
                  disabled={submitting}
                />
              </label>

              {/* Honeypot — hidden from real users, catches bots.
                  Inline styles + class so no layout rule can leak it. */}
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: "-10000px",
                  top: "auto",
                  width: "1px",
                  height: "1px",
                  overflow: "hidden",
                  pointerEvents: "none",
                }}
              >
                <input
                  type="text"
                  name="website"
                  tabIndex="-1"
                  autoComplete="off"
                  value={form._hp}
                  onChange={update("_hp")}
                />
              </div>

              {/* Cloudflare Turnstile — renders only when VITE_TURNSTILE_SITE_KEY is set. */}
              {TURNSTILE_SITE_KEY && (
                <div
                  ref={turnstileRef}
                  className="turnstile-widget"
                  style={{ margin: "8px 0" }}
                />
              )}

              <button
                type="submit"
                className="btn btn-primary btn-lg btn-submit"
                disabled={submitting}
                onPointerDown={tapHaptic}
              >
                {submitting ? (
                  <><Loader2 size={18} className="spin" /> Sending...</>
                ) : (
                  <><Send size={16} /> Send Message</>
                )}
              </button>

              <p className="form-note">
                We'll reply during business hours. No spam, ever.
              </p>

              {status === "error" && (
                <div className="form-banner form-banner-error" role="alert">
                  <AlertCircle size={18} />
                  <span>{errorMsg}</span>
                </div>
              )}
            </form>

            {status === "success" && (
              <div className="form-success-overlay" role="status" aria-live="polite">
                <div className="form-success-card">
                  <div className="success-check">
                    <CheckCircle2 size={56} />
                  </div>
                  <h3>Message sent</h3>
                  <p>Thanks for reaching out — a real human at Simple IT SRQ will reply during business hours.</p>
                  <button type="button" className="btn btn-secondary" onClick={reset}>
                    Send another
                  </button>
                </div>
              </div>
            )}
          </div>

          <aside className="contact-info" aria-label="Contact information">
            <div className="info-row"><Mail size={18} /><div><strong>Email</strong><br />hello@simpleitsrq.com</div></div>
            <div className="info-row"><MapPin size={18} /><div><strong>Service Area</strong><br />Sarasota, Bradenton, and Venice</div></div>
            <div className="info-row"><Clock size={18} /><div><strong>Hours</strong><br />Mon-Fri, 8:00 AM - 6:00 PM</div></div>
          </aside>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  useSEO({
    title: "Simple IT SRQ | Managed IT, Helpdesk, and Computer Repair — Sarasota and Bradenton",
    description: "Local managed IT and helpdesk for Sarasota, Bradenton, and Venice — plus computer repair, security cameras, and enterprise IT (Active Directory, migrations, upgrades) for businesses and homes. Flat monthly pricing for businesses, no-contract repair for residential. A real SW Florida engineer answers the phone.",
    canonical: "https://simpleitsrq.com/",
    image: "https://simpleitsrq.com/og-image.png",
    breadcrumbs: [{ name: "Home", url: "https://simpleitsrq.com/" }],
    organization: true,
  });
  return (
    <>
      <Hero />
      <HeroPaths />
      <LiveDefenseStrip />
      <LogosBar />
      <Solutions />
      <Industries />
      <Compliance />
      <Testimonial />
      <GoogleReviews />
      <BlogPreview />
      <section className="section section-alt">
        <div className="container">
          <NewsletterSignup variant="card" />
        </div>
      </section>
      <FreeTools />
      <RecommendedTools />
      <StatsBar />
      <CtaBanner />
      <Contact />
    </>
  );
}
