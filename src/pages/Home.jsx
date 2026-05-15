import {
  Headphones, Server, ShieldCheck, Lock, Cloud, FileCheck,
  HeartPulse, Scale, Landmark, HardHat, Home as HomeIcon, Shield,
  Phone, Mail, MapPin, Clock, Check, ArrowRight, Wifi, Briefcase,
  Loader2, CheckCircle2, AlertCircle, Send, Wrench,
  Camera, Users, Bot, Sparkles
} from "lucide-react";
import { Link } from "../lib/Link";
import { useState } from "react";
import { useSEO } from "../lib/seo";
import posts from "../data/posts-meta.json";
import BlogCover from "../components/BlogCover";
import GoogleReviews from "../components/GoogleReviews";
import { tapHaptic, selectionHaptic, successHaptic, errorHaptic } from "../lib/haptics";
import { useTurnstile, TURNSTILE_SITE_KEY } from "../lib/useTurnstile";
import { csrfFetch } from "../lib/csrf";

function Hero() {
  const paths = [
    {
      label: "Computer repair",
      desc: "Slow PCs, failed drives, malware cleanup, new laptop setup.",
      href: "#contact",
    },
    {
      label: "Small office IT",
      desc: "Microsoft 365, Wi-Fi, backups, phones, users, and vendors.",
      href: "#solutions",
    },
    {
      label: "Security paperwork",
      desc: "MFA, encryption, backup proof, policies, and renewal evidence.",
      href: "#compliance",
    },
    {
      label: "Local lead campaigns",
      desc: "Verified local contacts, capped sends, reply tracking, clear limits.",
      to: "/leadgen",
    },
  ];

  return (
    <section className="home-hero" aria-labelledby="hero-title">
      <div className="container home-hero__grid">
        <div className="home-hero__copy">
          <span className="eyebrow">Simple IT SRQ</span>
          <h1 id="hero-title" className="display">IT support, computer repair, and local lead tools.</h1>
          <p className="lede">
            Book one-time repair, move a small office onto Microsoft 365,
            clean up Wi-Fi, or run a focused local lead campaign. We handle
            the work, document what changed, and keep the next step obvious.
          </p>
          <div className="home-hero__actions">
            <a href="#contact" className="btn btn-primary btn-lg">Book IT support</a>
            <Link to="/services" className="btn btn-secondary btn-lg">See services</Link>
            <Link to="/leadgen" className="btn btn-secondary btn-lg">Leadgen</Link>
          </div>
          <ul className="home-hero__proof" aria-label="What we support">
            <li><MapPin size={15} /> Sarasota, Bradenton, Venice</li>
            <li><Clock size={15} /> One-time repair or monthly support</li>
            <li><ShieldCheck size={15} /> Documentation without insurance sales</li>
          </ul>
        </div>
        <aside className="home-hero__panel" aria-label="Choose a service">
          <div className="home-hero__panel-head">
            <span>Start here</span>
            <strong>What needs attention?</strong>
          </div>
          <div className="home-hero__path-list">
            {paths.map((path) => {
              const content = (
                <>
                  <span>
                    <strong>{path.label}</strong>
                    <small>{path.desc}</small>
                  </span>
                  <ArrowRight size={16} aria-hidden="true" />
                </>
              );
              return path.to ? (
                <Link key={path.label} to={path.to} className="home-hero__path">{content}</Link>
              ) : (
                <a key={path.label} href={path.href} className="home-hero__path">{content}</a>
              );
            })}
          </div>
        </aside>
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
    Icon: Wrench,
    title: "Computer repair and setup",
    desc: "Slow PC, bad drive, malware cleanup, laptop setup, printer issue, or workstation replacement."
  },
  {
    Icon: Headphones,
    title: "Managed office support",
    desc: "Help desk, monitoring, updates, user setup, vendor coordination, and a simple monthly plan."
  },
  {
    Icon: Camera,
    title: "Cameras and access",
    desc: "PoE cameras, recorders, mobile viewing, access cleanup, cable runs, and owner training."
  },
  {
    Icon: Cloud,
    title: "Microsoft 365 and Google Workspace",
    desc: "Email, Teams, Drive, shared mailboxes, MFA, device sign-in, migrations, and cleanup."
  },
  {
    Icon: Wifi,
    title: "Wi-Fi, firewall, and cabling",
    desc: "Business-grade network gear, guest Wi-Fi, labels, rack cleanup, coverage fixes, and handoff notes."
  },
  {
    Icon: Lock,
    title: "Security hardening",
    desc: "MFA, passkeys, endpoint protection, admin cleanup, scam filtering, and practical written proof."
  },
  {
    Icon: Server,
    title: "Backups and recovery",
    desc: "Local and cloud backups, restore tests, recovery contacts, and a plain disaster checklist."
  },
  {
    Icon: Phone,
    title: "Phones and messaging",
    desc: "VoIP, number moves, after-hours routing, voicemail to email, and basic texting workflows."
  },
  {
    Icon: FileCheck,
    title: "IT documentation",
    desc: "Policies, device inventory, MFA status, backup evidence, vendor access, and renewal packets."
  },
  {
    Icon: Briefcase,
    title: "Quarterly IT planning",
    desc: "A short review of what is working, what is fragile, and what should be budgeted next."
  },
];

function Solutions() {
  return (
    <section className="section" id="solutions" aria-labelledby="solutions-title">
      <div className="container">
        <div className="section-head reveal-up" data-reveal>
          <span className="eyebrow">Capabilities</span>
          <h2 id="solutions-title" className="title-1">Work people actually call us for</h2>
          <p className="section-sub">Repair the urgent issue, then clean up the system behind it: accounts, backups, Wi-Fi, devices, documentation, and vendor sprawl.</p>
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
                Ask about this <ArrowRight size={14} />
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
          <span className="eyebrow">Industries</span>
          <h2 id="industries-title" className="title-1">Offices and homes we support</h2>
          <p className="section-sub">Healthcare, legal, financial services, construction, real estate, home offices, and seasonal properties. We document controls when needed, but we do not sell insurance or audits.</p>
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
    "HIPAA risk assessments and remediation plans",
    "security renewal evidence packages",
    "Tested off-site backups with documented RTO/RPO",
    "Written disaster-recovery runbook for your team",
    "Full-disk encryption on every laptop and mobile device",
  ];
  return (
    <section className="section" id="compliance" aria-labelledby="compliance-title">
      <div className="container compliance-grid reveal-up">
        <div>
          <span className="eyebrow">Paperwork and proof</span>
          <h2 id="compliance-title" className="title-1">The IT evidence people keep asking you for</h2>
          <p className="section-sub">
            HIPAA risk assessments, security renewals, disaster-recovery
            runbooks, and the evidence trail behind them. We do the engineering
            work and hand you the documents your reviewer, board, or lender
            asked for. We are not an auditor, broker, or law firm.
          </p>
          <ul className="feature-list">
            {features.map((f) => (
              <li key={f}><Check size={18} color="#111827" /> {f}</li>
            ))}
          </ul>
        </div>
        <aside className="compliance-card" aria-label="Documentation package">
          <div className="cc-header">
            <Shield size={24} color="#111827" />
            <div>
              <span className="cc-eyebrow">IT documentation</span>
              <h3 className="cc-title">What goes in the packet</h3>
            </div>
          </div>
          <ul className="cc-checklist">
            <li><Check size={16} /> Device inventory and owner list</li>
            <li><Check size={16} /> MFA and admin account status</li>
            <li><Check size={16} /> Backup location and last restore test</li>
            <li><Check size={16} /> Encryption and endpoint protection notes</li>
            <li><Check size={16} /> Recovery contacts and vendor access</li>
          </ul>
          <div className="cc-footer">
            <Check size={14} color="#107C10" /> Built from the actual systems we touched
          </div>
        </aside>
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

function CtaBanner() {
  return (
    <section className="section">
      <div className="container">
        <div className="cta-banner reveal-scale">
          <h2 className="title-2">Need a real fix this week?</h2>
          <p>Send the issue, the location, and the deadline. We will tell you whether it is a repair visit, a managed support fit, or something you should not pay us for.</p>
          <div className="cta-actions">
            <Link to="/book" className="btn btn-primary btn-lg">Book a time</Link>
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
    title: "Simple IT SRQ | Local IT Support, Computer Repair, and Security Cameras - Sarasota and Bradenton",
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
      <GoogleReviews />
      <BlogPreview />
      <CtaBanner />
      <Contact />
    </>
  );
}
