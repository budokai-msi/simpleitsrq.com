import {
  Headphones, Server, ShieldCheck, Lock, Cloud,
  Shield,
  Phone, Mail, MapPin, Clock, Check, ArrowRight, Wifi,
  Loader2, CheckCircle2, AlertCircle, Send, Wrench,
  Camera
} from "lucide-react";
import { Link } from "../lib/Link";
import { useEffect, useRef, useState } from "react";
import { useSEO } from "../lib/seo";
import posts from "../data/posts-meta.json";
import BlogCover from "../components/BlogCover";
import GoogleReviews from "../components/GoogleReviews";
import { tapHaptic, selectionHaptic, successHaptic, errorHaptic } from "../lib/haptics";
import { useTurnstile, TURNSTILE_SITE_KEY } from "../lib/useTurnstile";
import { csrfFetch } from "../lib/csrf";
import { trackEvent } from "../lib/analytics";
import { trackBehaviorEvent } from "../lib/behaviorBeacon";

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
            <a
              href="#contact"
              className="btn btn-primary btn-lg"
              onClick={() => trackEvent("generate_lead", { source: "home_hero_contact" })}
            >
              Book IT support <ArrowRight size={16} aria-hidden="true" />
            </a>
            <Link
              to="/services"
              className="btn btn-secondary btn-lg"
              onClick={() => trackEvent("select_content", { content_type: "home_hero_services" })}
            >
              See services <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link
              to="/leadgen"
              className="btn btn-secondary btn-lg"
              onClick={() => trackEvent("generate_lead", { source: "home_hero_leadgen" })}
            >
              Leadgen <ArrowRight size={16} aria-hidden="true" />
            </Link>
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
    { name: "M365 Copilot", logo: "/brand-logos/m365-copilot.svg", href: "https://www.microsoft.com/microsoft-copilot" },
    { name: "Google Gemini", logo: "/brand-logos/google-gemini.svg", href: "https://gemini.google.com/" },
    { name: "SentinelOne", logo: "/brand-logos/sentinelone.svg", href: "https://www.sentinelone.com/" },
    { name: "Entra ID", logo: "/brand-logos/entra-id.svg", href: "https://www.microsoft.com/security/business/microsoft-entra" },
    { name: "Fortinet", logo: "/brand-logos/fortinet.svg", href: "https://www.fortinet.com/" },
    { name: "Cisco Meraki", logo: "/brand-logos/cisco-meraki.svg", href: "https://meraki.cisco.com/" },
  ];
  return (
    <section className="logos-bar" aria-label="Tools and brands we install">
      <div className="container">
        <p className="logos-title">The tools we install and support for you</p>
        <div className="logos-row">
          {vendors.map((v) => (
            <a
              key={v.name}
              className="logo-mark"
              href={v.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${v.name} official site`}
              onClick={() => trackEvent("select_content", { content_type: "vendor_logo_click", destination: v.name, source: "home_logos_bar" })}
            >
              <span className="logo-mark__img-wrap" aria-hidden="true">
                <img
                  className="logo-mark__img"
                  src={v.logo}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              </span>
              {v.name}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

const SOLUTIONS = [
  {
    Icon: Wrench,
    title: "Computer repair",
    desc: "Slow, infected, cracked, overheating, or won't boot. We repair Windows and Mac, recover what we can, and tell you when replacement is cheaper."
  },
  {
    Icon: Headphones,
    title: "Email and account lockouts",
    desc: "Microsoft 365, Google Workspace, password resets, MFA recovery, shared mailbox cleanup, and owner access."
  },
  {
    Icon: Wifi,
    title: "Wi-Fi and network fixes",
    desc: "Dead rooms, dropped video calls, messy cabling, slow switches, guest Wi-Fi, firewall cleanup, and small-office access points."
  },
  {
    Icon: Cloud,
    title: "New office setup",
    desc: "Internet handoff, workstations, printers, Microsoft 365, shared drives, passwords, and the checklist people forget until opening day."
  },
  {
    Icon: Server,
    title: "Backups and recovery",
    desc: "Set up local and cloud backups, test a restore, and document who to call before a bad drive becomes a business emergency."
  },
  {
    Icon: Lock,
    title: "Security cleanup",
    desc: "Remove risky admin accounts, turn on MFA, clean up old devices, and reduce the obvious ways people get phished."
  },
  {
    Icon: Camera,
    title: "Cameras and vendor handoffs",
    desc: "PoE cameras, recorders, mobile viewing, ISP appointments, software logins, and the vendor details that disappear when staff changes."
  },
  {
    Icon: Phone,
    title: "Phones and front desk tools",
    desc: "VoIP moves, number transfers, after-hours routing, voicemail to email, basic texting workflows, and front desk device setup."
  },
];

function Solutions() {
  return (
    <section className="section" id="solutions" aria-labelledby="solutions-title">
      <div className="container">
        <div className="section-head reveal-up" data-reveal>
          <span className="eyebrow">Common Calls</span>
          <h2 id="solutions-title" className="title-1">When tech stops work, call us.</h2>
          <p className="section-sub">Most calls start with one broken thing: a laptop, printer, email account, Wi-Fi room, camera, or backup. We fix that first, then check the setup so the same issue is less likely to come back.</p>
        </div>
        <div className="solution-grid">
          {SOLUTIONS.map(({ Icon, title, desc }, i) => (
            <a
              key={title}
              href="#contact"
              className="solution-card reveal-up"
              data-reveal
              data-reveal-delay={Math.min(i + 1, 5)}
              onClick={() => trackEvent("generate_lead", { source: "home_solution_card", solution: title })}
            >
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

const SITUATIONS = [
  {
    id: "medical",
    label: "Healthcare offices",
    Icon: ShieldCheck,
    pain: "Phones, EHR logins, guest Wi-Fi, and front desk check-in break at the same time.",
    focus: "Secure access, staff onboarding/offboarding, backup testing, and fast workstation recovery.",
    outcomes: ["Protected sign-in flow", "Fewer front desk delays", "Documented controls for renewals"],
    cta: "Book healthcare support",
  },
  {
    id: "legal",
    label: "Legal and finance",
    Icon: Lock,
    pain: "Partner email, document portals, and shared drives become risky after staff or device changes.",
    focus: "MFA cleanup, mailbox permissions, encryption, and file-share access maps.",
    outcomes: ["Lower account risk", "Cleaner client data access", "Repeatable audit-ready evidence"],
    cta: "Book secure office support",
  },
  {
    id: "field",
    label: "Trades and field teams",
    Icon: Wifi,
    pain: "Dispatch, mobile devices, printers, and jobsite Wi-Fi fail under daily load.",
    focus: "Reliable connectivity, rugged device setup, camera access, and vendor handoffs.",
    outcomes: ["Fewer call-backs from the field", "Clear office/jobsite sync", "Faster issue triage"],
    cta: "Book field IT support",
  },
  {
    id: "home",
    label: "Residential and home office",
    Icon: Wrench,
    pain: "Slow laptops, flaky Wi-Fi zones, camera alerts, and family/home-office device conflicts.",
    focus: "Repair-first visits, network cleanup, secure remote access, and camera/mobile setup.",
    outcomes: ["Faster daily device use", "Stable whole-home Wi-Fi", "Simple ownership docs for devices"],
    cta: "Book home IT support",
  },
];

function Industries() {
  const sectionRef = useRef(null);
  const firstInteractionTrackedRef = useRef(false);
  const firedDepthRef = useRef(new Set());
  const initialScenarioRef = useRef(SITUATIONS[0].id);
  const [activeId, setActiveId] = useState(SITUATIONS[0].id);
  const active = SITUATIONS.find((item) => item.id === activeId) || SITUATIONS[0];
  const activeIndex = SITUATIONS.findIndex((item) => item.id === active.id);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof window === "undefined") return undefined;

    function trackDepthMilestones() {
      const rect = section.getBoundingClientRect();
      const viewport = window.innerHeight || document.documentElement.clientHeight || 0;
      if (viewport <= 0 || rect.height <= 0) return;
      const visible = Math.max(0, Math.min(rect.bottom, viewport) - Math.max(rect.top, 0));
      const pct = Math.round((visible / rect.height) * 100);
      const milestones = [25, 50, 75, 100];
      for (const milestone of milestones) {
        if (pct >= milestone && !firedDepthRef.current.has(milestone)) {
          firedDepthRef.current.add(milestone);
          trackEvent("home_situation_scroll_depth", {
            section: "industries",
            depth_percent: milestone,
          });
          trackBehaviorEvent("home_situation_scroll_depth", {
            valueNum: milestone,
            valueText: "industries",
            meta: { section: "industries", depth_percent: milestone },
          });
        }
      }
    }

    trackDepthMilestones();
    window.addEventListener("scroll", trackDepthMilestones, { passive: true });
    window.addEventListener("resize", trackDepthMilestones);
    return () => {
      window.removeEventListener("scroll", trackDepthMilestones);
      window.removeEventListener("resize", trackDepthMilestones);
    };
  }, []);

  const handleScenarioClick = (itemId) => {
    if (!firstInteractionTrackedRef.current) {
      firstInteractionTrackedRef.current = true;
      trackEvent("home_situation_first_interaction", {
        section: "industries",
        selected_scenario: itemId,
      });
      trackBehaviorEvent("home_situation_first_interaction", {
        valueText: itemId,
        meta: { section: "industries", selected_scenario: itemId },
      });
    }
    if (itemId !== activeId) {
      trackEvent("home_situation_switch", {
        section: "industries",
        from_scenario: activeId,
        to_scenario: itemId,
      });
      trackBehaviorEvent("home_situation_switch", {
        valueText: itemId,
        meta: { section: "industries", from_scenario: activeId, to_scenario: itemId },
      });
    }
    setActiveId(itemId);
  };

  const handleScenarioCtaClick = (kind) => {
    const isDefaultScenario = active.id === initialScenarioRef.current;
    trackEvent("home_situation_cta_click", {
      section: "industries",
      cta_kind: kind,
      scenario_id: active.id,
      scenario_rank: activeIndex + 1,
      scenario_is_default: isDefaultScenario ? 1 : 0,
    });
    trackBehaviorEvent("home_situation_cta_click", {
      valueText: active.id,
      valueNum: activeIndex + 1,
      meta: {
        section: "industries",
        cta_kind: kind,
        scenario_id: active.id,
        scenario_rank: activeIndex + 1,
        scenario_is_default: isDefaultScenario ? 1 : 0,
      },
    });
  };

  return (
    <section ref={sectionRef} className="section section-alt" id="industries" aria-labelledby="industries-title">
      <div className="container">
        <div className="section-head reveal-up" data-reveal>
          <span className="eyebrow">Where We Help Most</span>
          <h2 id="industries-title" className="title-1">Pick your situation. See the exact fix path.</h2>
          <p className="section-sub">Instead of broad industry cards, choose the environment that matches your team and we show what we stabilize first.</p>
        </div>
        <div className="situation-shell reveal-up" data-reveal>
          <nav className="situation-nav" aria-label="Support situations">
            {SITUATIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`situation-nav__btn${activeId === item.id ? " is-active" : ""}`}
                onClick={() => handleScenarioClick(item.id)}
              >
                <item.Icon size={15} aria-hidden="true" />
                {item.label}
              </button>
            ))}
          </nav>
          <article className="situation-body" aria-live="polite">
            <header className="situation-body__head">
              <span className="situation-body__icon"><active.Icon size={18} /></span>
              <h3>{active.label}</h3>
            </header>
            <p className="situation-copy"><strong>Pain:</strong> {active.pain}</p>
            <p className="situation-copy"><strong>First focus:</strong> {active.focus}</p>
            <ul className="situation-outcomes">
              {active.outcomes.map((outcome) => (
                <li key={outcome}><Check size={15} aria-hidden="true" /> {outcome}</li>
              ))}
            </ul>
            <div className="situation-actions">
              <a href="#contact" className="btn btn-primary" onClick={() => handleScenarioCtaClick("primary_contact")}>{active.cta}</a>
              <Link to="/services" className="btn btn-secondary" onClick={() => handleScenarioCtaClick("secondary_services")}>See service details</Link>
            </div>
          </article>
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
          <Link
            to="/blog"
            className="btn btn-secondary btn-lg"
            onClick={() => trackEvent("select_content", { content_type: "home_blog_index_cta", source: "home_blog_section" })}
          >
            View all posts
          </Link>
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
            <Link
              to="/book"
              className="btn btn-primary btn-lg"
              onClick={() => trackEvent("generate_lead", { source: "home_bottom_cta_book" })}
            >
              Book a time
            </Link>
            <Link
              to="/support"
              className="btn btn-secondary btn-lg"
              onClick={() => trackEvent("select_content", { content_type: "home_bottom_cta_support", source: "home_bottom_cta" })}
            >
              Existing client support
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

const ERROR_MESSAGES = {
  name_required: "Please enter your name.",
  email_invalid: "That email address looks off - double-check it?",
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
    trackEvent("generate_lead", {
      source: "home_contact_submit_attempt",
      has_phone: form.phone ? 1 : 0,
      has_company: form.company ? 1 : 0,
      message_length: String(form.message || "").trim().length,
    });

    // If Turnstile is configured (prod) but no token yet, prompt the user.
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      errorHaptic();
      setStatus("error");
      setErrorMsg(ERROR_MESSAGES.captcha_required);
      trackEvent("exception", {
        source: "home_contact_submit",
        fatal: false,
        reason: "captcha_required",
      });
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
        trackEvent("generate_lead", {
          source: "home_contact_submit_success",
          has_phone: form.phone ? 1 : 0,
          has_company: form.company ? 1 : 0,
        });
        return;
      }

      errorHaptic();
      setStatus("error");
      const errorCode = data?.error || "send_failed";
      setErrorMsg(ERROR_MESSAGES[errorCode] || "Something went wrong. Please try again in a moment.");
      trackEvent("exception", {
        source: "home_contact_submit",
        fatal: false,
        reason: errorCode,
        http_status: r.status,
      });
      // Turnstile tokens are single-use — get a fresh one for the retry.
      setTurnstileToken("");
      resetTurnstile();
    } catch {
      errorHaptic();
      setStatus("error");
      setErrorMsg(ERROR_MESSAGES.network_error);
      trackEvent("exception", {
        source: "home_contact_submit",
        fatal: false,
        reason: "network_error",
      });
      setTurnstileToken("");
      resetTurnstile();
    }
  };

  const submitting = status === "submitting";
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(form.email || "").trim());
  const formReady =
    String(form.name || "").trim().length > 1 &&
    emailLooksValid &&
    String(form.message || "").trim().length > 9;

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
                disabled={submitting || !formReady}
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
              {!formReady && status !== "success" ? (
                <p className="form-note">Add name, valid email, and a short message to send.</p>
              ) : null}

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
