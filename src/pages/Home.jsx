import {
  Headphones, Server, ShieldCheck, Lock, Cloud, FileCheck,
  HeartPulse, Scale, Landmark, HardHat, Home as HomeIcon, Shield,
  Phone, Mail, MapPin, Clock, Check, ArrowRight, Wifi, Briefcase,
  Loader2, CheckCircle2, AlertCircle, Send, Wrench,
  Camera, Network, RefreshCw, Users, Monitor, Bot, Sparkles
} from "lucide-react";
import { Link } from "../lib/Link";
import { useState } from "react";
import { useSEO } from "../lib/seo";
import heroGrid from "../assets/hero-grid.svg";
import posts from "../data/posts-meta.json";
import BlogCover from "../components/BlogCover";
import GoogleReviews from "../components/GoogleReviews";
import { tapHaptic, selectionHaptic, successHaptic, errorHaptic } from "../lib/haptics";
import { useTurnstile, TURNSTILE_SITE_KEY } from "../lib/useTurnstile";
import { csrfFetch } from "../lib/csrf";

function Hero() {
  return (
    <section className="hero hero-clean hero-mesh grain" aria-labelledby="hero-title">
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
          <span className="eyebrow">IT Support · Sarasota · Bradenton · Venice</span>
          <h1 id="hero-title" className="display hero-aura-title">Managed IT for Sarasota and Bradenton businesses.</h1>
          <p className="lede">
            Helpdesk, networks, Microsoft 365, cybersecurity, backups, and on-site repair —
            delivered by a local team on a flat monthly rate. We keep your workstations,
            servers, and email running, document everything your insurance carrier and
            auditors ask for, and answer the phone when something breaks.
          </p>
          <div className="hero-ctas">
            <a href="#contact" className="btn btn-primary btn-lg">Request an IT assessment</a>
            <a href="#solutions" className="btn btn-secondary btn-lg">See our services</a>
          </div>
          <ul className="trust-row" aria-label="Why clients work with us">
            <li><MapPin size={14} strokeWidth={2.25} /> On-site coverage across Sarasota, Bradenton, and Venice</li>
            <li><Clock size={14} strokeWidth={2.25} /> Flat monthly contracts — no hourly surprises</li>
            <li><ShieldCheck size={14} strokeWidth={2.25} /> HIPAA, GLBA, and cyber-insurance documentation included</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function LogosBar() {
  const vendors = [
    { name: "M365 Copilot", Icon: Bot },
    { name: "Google Gemini", Icon: Sparkles },
    { name: "SentinelOne", Icon: Shield },
    { name: "Entra ID", Icon: Lock },
    { name: "Fortinet", Icon: Server },
    { name: "Cisco Meraki", Icon: Wifi },
  ];
  return (
    <section className="logos-bar" aria-label="Tools and brands we install">
      <div className="container">
        <p className="logos-title">The tools we install and support for you</p>
        <div className="logos-row">
          {vendors.map((v) => (
            <span key={v.name} className="logo-mark">
              <v.Icon size={16} color="var(--brand)" />
              {v.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

const SOLUTIONS = [
  {
    Icon: Headphones,
    title: "Helpdesk and Everyday IT Support",
    desc: "Unlimited help desk, computer and network monitoring, software updates, and new-employee setup. Call, email, or text — a real person in Sarasota answers, and we triage critical issues first."
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
    title: "Enterprise Domain Environments (Entra ID)",
    desc: "Microsoft Entra ID, Active Directory, Group Policy, and the user/computer setup that lets a 20-person office act like one. New cloud-native build-outs and rescues of legacy on-premise servers."
  },
  {
    Icon: RefreshCw,
    title: "Migrations and AI Readiness",
    desc: "Email migrations to Microsoft 365 or Google Workspace, server replacements, and Copilot/Gemini AI readiness audits. We plan the cutover, do the work over a weekend, and stay on-site the morning after."
  },
  {
    Icon: Lock,
    title: "Cybersecurity and Zero Trust",
    desc: "Modern antivirus, email scam filtering, and 24/7 monitoring. We turn on phishing-resistant MFA and passkeys for every account and hand you the written proof your cyber-insurance carrier asks for at renewal."
  },
  {
    Icon: Cloud,
    title: "Microsoft 365, Google Workspace & AI",
    desc: "We set up (or clean up) your email, Teams, and cloud apps like Copilot and Gemini so your team can actually use AI safely without leaking company data."
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
          <span className="eyebrow">What We Do</span>
          <h2 id="solutions-title" className="title-1">Everything you'd hire a local IT shop for — under one roof</h2>
          <p className="section-sub">Helpdesk, computer repair, security cameras, networking, enterprise domains, migrations and upgrades. For Sarasota and Bradenton businesses and homes — so you don't have to call five different people when something breaks.</p>
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
          <h2 id="industries-title" className="title-1">Who we know how to support</h2>
          <p className="section-sub">Medical, legal, financial, construction, and real estate offices across Sarasota and Bradenton — plus residential clients, home offices, and snowbird condos that need a local tech who'll just show up.</p>
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
          <span className="eyebrow">Paperwork and Disaster Planning</span>
          <h2 id="compliance-title" className="title-1">We handle the paperwork most IT guys hate</h2>
          <p className="section-sub">
            Audits, cyber-insurance renewals, HIPAA reviews, disaster-recovery plans — we do
            the work and hand you the documents so you can focus on running your business.
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
            "We brought Simple IT SRQ in after a ransomware scare our previous
            provider missed. They turned on two-step sign-in across every
            account, rebuilt our backup setup, and walked our cyber-insurance
            carrier through every control they'd put in place. The renewal
            paperwork went through without a single follow-up question."
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
  const stats = [
    { v: "Local", l: "Sarasota, Bradenton, and Venice" },
    { v: "Flat", l: "Monthly contracts" },
    { v: "24/7", l: "Endpoint and network monitoring" },
    { v: "Documented", l: "HIPAA, GLBA, and cyber-insurance" },
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
          <h2 className="title-2">Talk to a local engineer</h2>
          <p>Book a 30-minute consult with a Sarasota-based engineer. We'll review your current stack, the gaps you already know about, and where a managed agreement would or wouldn't make sense for your business.</p>
          <div className="cta-actions">
            <Link to="/book" className="btn btn-primary btn-lg">Book a consult</Link>
            <Link to="/support" className="btn btn-secondary btn-lg">Existing client support</Link>
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
    title: "Simple IT SRQ | Local IT Support, Computer Repair, and Security Cameras — Sarasota and Bradenton",
    description: "Local IT support, helpdesk, computer repair, security cameras, and enterprise IT (Active Directory, migrations, upgrades) for businesses and homes in Sarasota, Bradenton, and Venice. Flat monthly pricing for businesses, no-contract repair for residential. Email hello@simpleitsrq.com.",
    canonical: "https://simpleitsrq.com/",
    image: "https://simpleitsrq.com/og-image.png",
    breadcrumbs: [{ name: "Home", url: "https://simpleitsrq.com/" }],
    organization: true,
  });
  return (
    <>
      <Hero />
      <LogosBar />
      <Solutions />
      <Industries />
      <Compliance />
      <Testimonial />
      <GoogleReviews />
      <StatsBar />
      <BlogPreview />
      <CtaBanner />
      <Contact />
    </>
  );
}
