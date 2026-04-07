import {
  Headphones, Server, ShieldCheck, Lock, Cloud, FileCheck,
  HeartPulse, Scale, Landmark, HardHat, Home as HomeIcon, Shield,
  Phone, Mail, MapPin, Clock, Star, Check, ArrowRight, Wifi, Briefcase,
  Loader2, CheckCircle2, AlertCircle, Send
} from "lucide-react";
import { Link } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSEO } from "../lib/seo";
import { posts } from "../data/posts";
import { tapHaptic, selectionHaptic, successHaptic, errorHaptic } from "../lib/haptics";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/**
 * Loads the Turnstile script (once) and renders the widget into a container.
 * The token is pushed back to the form via `onToken`. When `VITE_TURNSTILE_SITE_KEY`
 * is not set (local dev without a .env.local), the widget silently no-ops so
 * the form still works.
 */
function useTurnstile(onToken) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const onTokenRef = useRef(onToken);

  useEffect(() => { onTokenRef.current = onToken; }, [onToken]);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !containerRef.current) return;

    let cancelled = false;

    const loadScript = () =>
      new Promise((resolve, reject) => {
        if (window.turnstile) return resolve();
        const existing = document.querySelector(
          `script[data-turnstile="1"]`
        );
        if (existing) {
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", reject, { once: true });
          return;
        }
        const s = document.createElement("script");
        s.src = TURNSTILE_SCRIPT_SRC;
        s.async = true;
        s.defer = true;
        s.dataset.turnstile = "1";
        s.onload = () => resolve();
        s.onerror = reject;
        document.head.appendChild(s);
      });

    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token) => onTokenRef.current?.(token),
          "error-callback": () => onTokenRef.current?.(null),
          "expired-callback": () => onTokenRef.current?.(null),
          theme: "auto",
          size: "normal",
          action: "contact",
        });
      })
      .catch((err) => {
        console.warn("[turnstile] script failed to load", err);
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch { /* noop */ }
        widgetIdRef.current = null;
      }
    };
  }, []);

  const reset = useCallback(() => {
    if (widgetIdRef.current && window.turnstile) {
      try { window.turnstile.reset(widgetIdRef.current); } catch { /* noop */ }
    }
  }, []);

  return { containerRef, reset };
}

function Hero() {
  return (
    <section className="hero hero-clean" aria-labelledby="hero-title">
      <div className="hero-bg" aria-hidden="true" />
      <div className="container hero-stack-clean">
        <div className="hero-copy hero-copy-centered">
          <span className="eyebrow">Managed IT · Sarasota · Bradenton · SRQ</span>
          <h1 id="hero-title" className="display">Enterprise IT, simplified for local business.</h1>
          <p className="lede">
            Simple IT SRQ delivers managed IT, cybersecurity, and cloud services to growing
            businesses across the Suncoast. SentinelOne EDR, Microsoft Defender, Intune, and a
            local engineering team. HIPAA documented. Cyber-insurance ready.
          </p>
          <div className="hero-ctas">
            <a href="#contact" className="btn btn-primary btn-lg">Get a Free IT Audit</a>
            <a href="#solutions" className="btn btn-secondary btn-lg">Explore Solutions</a>
          </div>
          <ul className="trust-row" aria-label="Trust indicators">
            <li><Star size={14} strokeWidth={2.25} fill="#F7630C" stroke="#F7630C" /> 5.0 Google rating</li>
            <li><ShieldCheck size={14} strokeWidth={2.25} /> HIPAA documented</li>
            <li><Clock size={14} strokeWidth={2.25} /> Local team · same-day response</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function LogosBar() {
  const logos = ["HEALTHCARE PARTNERS", "GULF COAST LEGAL", "SRQ FINANCIAL", "BAYSHORE BUILDERS", "HARBOR REALTY", "MERIDIAN GROUP"];
  return (
    <section className="logos-bar" aria-label="Trusted clients">
      <div className="container">
        <p className="logos-title">Trusted by businesses across the SRQ region</p>
        <div className="logos-row">
          {logos.map((l) => <span key={l} className="logo-mark">{l}</span>)}
        </div>
      </div>
    </section>
  );
}

const SOLUTIONS = [
  {
    Icon: Headphones,
    title: "Managed IT Support for Bradenton and Sarasota Businesses",
    desc: "Flat-rate, fully managed IT for SRQ teams of 5 to 150 employees. We monitor servers, workstations, and networks 24/7, patch on a documented schedule, and answer help-desk calls from a local team - not an offshore queue. Every client gets a named technical lead and a 15-minute response SLA on critical tickets."
  },
  {
    Icon: Lock,
    title: "Cybersecurity and Managed Detection and Response (MDR)",
    desc: "Layered protection built around SentinelOne EDR, Microsoft Defender for Business, DNS filtering, and 24/7 SOC monitoring. We deploy MFA on every account, lock down admin privileges, and produce the exact written documentation your cyber-insurance carrier asks for at renewal."
  },
  {
    Icon: Cloud,
    title: "Microsoft 365 and Azure Management",
    desc: "We handle the full Microsoft 365 stack: tenant setup, mailbox migration, SharePoint and OneDrive, Intune device enrollment, Conditional Access policies, and ongoing license right-sizing. For Azure workloads we design the landing zone, set up backups, and tune costs every quarter."
  },
  {
    Icon: Server,
    title: "Backup, Disaster Recovery and Business Continuity",
    desc: "Image-based backups of every server and critical workstation, replicated to an immutable cloud copy in a separate region. We test restores quarterly, document RTO/RPO targets per workload, and keep a written runbook so a hurricane, ransomware event, or hardware failure does not shut you down for more than a few hours."
  },
  {
    Icon: FileCheck,
    title: "HIPAA and Cyber-Insurance Compliance",
    desc: "Built for Sarasota medical practices, dental offices, law firms, and any business renewing cyber liability coverage. We perform a written risk assessment, deploy the technical controls insurers and HHS expect (MFA, EDR, encrypted backups, access logging), and hand you the policy documents and evidence packets you need on audit day."
  },
  {
    Icon: Phone,
    title: "Cloud VoIP and Unified Communications",
    desc: "Microsoft Teams Phone or RingCentral deployments with auto-attendants, SMS, e-fax, and call recording. We port your existing numbers, configure E911 for every site, and train your front desk so go-live is uneventful."
  },
  {
    Icon: Wifi,
    title: "Network Design, Wi-Fi and Structured Cabling",
    desc: "Business-grade firewalls (Fortinet or Cisco Meraki), segmented VLANs, and Wi-Fi designed from a heat-map survey rather than guesswork. We pull cable, mount APs, and document every jack so the next change is fast and cheap."
  },
  {
    Icon: Briefcase,
    title: "Virtual CIO and Technology Strategy",
    desc: "A quarterly business review with a senior engineer who actually reads your strategic plan. We build a 12-month technology roadmap, benchmark your IT spend against peers, and translate compliance and security requirements into a budget your CFO can defend."
  },
];

function Solutions() {
  return (
    <section className="section" id="solutions" aria-labelledby="solutions-title">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">Solutions</span>
          <h2 id="solutions-title" className="title-1">Solutions Built for Your Business</h2>
          <p className="section-sub">Everything you need to run, secure, and scale your technology - delivered by a local team that picks up the phone.</p>
        </div>
        <div className="cards-grid">
          {SOLUTIONS.map(({ Icon, title, desc }) => (
            <article key={title} className="card">
              <div className="card-icon"><Icon size={22} /></div>
              <h3 className="card-title">{title}</h3>
              <p className="card-desc">{desc}</p>
              <a href="#contact" className="card-link">Learn more <ArrowRight size={14} /></a>
            </article>
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
];

function Industries() {
  return (
    <section className="section section-alt" id="industries" aria-labelledby="industries-title">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">Industries</span>
          <h2 id="industries-title" className="title-1">Industries We Serve</h2>
          <p className="section-sub">Compliance-aware IT for the regulated industries that power the Suncoast economy.</p>
        </div>
        <div className="industries-grid">
          {INDUSTRIES.map(({ Icon, name, badges }) => (
            <article key={name} className="industry-card">
              <div className="industry-icon"><Icon size={26} /></div>
              <h3 className="industry-name">{name}</h3>
              <div className="badges">
                {badges.map((b) => <span key={b} className="badge">{b}</span>)}
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
    "HIPAA Risk Assessments and Documentation",
    "Cyber-Insurance Renewal Evidence Packets",
    "Immutable, Air-Gapped Backups",
    "Disaster Recovery Playbooks",
    "256-bit End-to-End Encryption"
  ];
  return (
    <section className="section" id="compliance" aria-labelledby="compliance-title">
      <div className="container compliance-grid">
        <div>
          <span className="eyebrow">Compliance and DR</span>
          <h2 id="compliance-title" className="title-1">Compliance and Disaster Recovery You Can Trust</h2>
          <p className="section-sub">
            From HIPAA risk assessments to immutable backups, we engineer the controls auditors
            and insurance carriers expect - and the resilience your business demands.
          </p>
          <ul className="feature-list">
            {features.map((f) => (
              <li key={f}><Check size={18} color="#0F6CBD" /> {f}</li>
            ))}
          </ul>
        </div>
        <aside className="compliance-card" aria-label="Compliance dashboard">
          <div className="cc-header">
            <Shield size={24} color="#0F6CBD" />
            <div>
              <span className="cc-eyebrow">HIPAA DOCUMENTED PARTNER</span>
              <h3 className="cc-title">Compliance Dashboard</h3>
            </div>
          </div>
          <div className="cc-grid">
            <div><span>0</span><small>Breaches</small></div>
            <div><span>&lt;4h</span><small>Recovery</small></div>
            <div><span>256-bit</span><small>Encryption</small></div>
            <div><span>99.99%</span><small>Uptime</small></div>
          </div>
          <div className="cc-footer">
            <Check size={14} color="#107C10" /> All controls passing
          </div>
        </aside>
      </div>
    </section>
  );
}

function CategoryIcon({ category }) {
  const map = {
    "Cybersecurity": Lock,
    "AI & Productivity": Server,
    "Cloud": Cloud,
    "Compliance": FileCheck,
    "Privacy": Shield,
    "Business Tech": Briefcase,
    "Industry News": Star,
  };
  const Icon = map[category] || Briefcase;
  return <Icon size={28} />;
}

function BlogPreview() {
  const recent = [...posts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  return (
    <section className="section section-alt" id="blog" aria-labelledby="blog-title">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">From the Blog</span>
          <h2 id="blog-title" className="title-1">Insights for SRQ Business Owners</h2>
          <p className="section-sub">Plain-English takes on the security, AI, and cloud stories that matter for Sarasota and Bradenton businesses.</p>
        </div>
        <div className="blog-grid">
          {recent.map((p) => (
            <article key={p.slug} className="blog-card">
              <Link to={`/blog/${p.slug}`} className="blog-card-img" aria-label={p.title}>
                <div className="blog-card-img-inner"><CategoryIcon category={p.category} /></div>
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
    { v: "99.99%", l: "Uptime SLA" },
    { v: "<15 Min", l: "Response Time" },
    { v: "24/7", l: "Monitoring" },
    { v: "100%", l: "Local Team" },
  ];
  return (
    <section className="stats-bar" aria-label="Key statistics">
      <div className="container stats-grid">
        {stats.map((s) => (
          <div key={s.l} className="stat">
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
        <div className="cta-banner">
          <h2 className="title-2">Ready to simplify your IT?</h2>
          <p>Schedule a free 30-minute consultation with a local engineer. No pressure, no jargon - just clarity.</p>
          <div className="cta-actions">
            <a href="#contact" className="btn btn-primary btn-lg">Book a Free Audit</a>
            <a href="mailto:hello@simpleitsrq.com" className="btn btn-secondary btn-lg">Email Us</a>
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
      const r = await fetch("/api/contact", {
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
          <h2 id="contact-title" className="title-1">Get in touch</h2>
          <p className="section-sub">Tell us about your business - we will reply within one business hour.</p>
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
                We'll reply within one business hour. No spam, ever.
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
                  <p>Thanks for reaching out — a real human at Simple IT SRQ will reply within one business hour.</p>
                  <button type="button" className="btn btn-secondary" onClick={reset}>
                    Send another
                  </button>
                </div>
              </div>
            )}
          </div>

          <aside className="contact-info" aria-label="Contact information">
            <div className="info-row"><Mail size={18} /><div><strong>Email</strong><br />hello@simpleitsrq.com</div></div>
            <div className="info-row"><MapPin size={18} /><div><strong>Service Area</strong><br />Sarasota, Bradenton and the SRQ region</div></div>
            <div className="info-row"><Clock size={18} /><div><strong>Hours</strong><br />Mon-Fri, 8:00 AM - 6:00 PM</div></div>
          </aside>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  useSEO({
    title: "Simple IT SRQ | Managed IT Services in Sarasota and Bradenton, FL",
    description: "Managed IT, cybersecurity, and cloud services for Sarasota and Bradenton businesses. SentinelOne EDR, Microsoft Defender, Intune, HIPAA documented. Email hello@simpleitsrq.com.",
    canonical: "https://simpleitsrq.com/",
    image: "https://simpleitsrq.com/og-image.png",
    breadcrumbs: [{ name: "Home", url: "https://simpleitsrq.com/" }],
  });
  return (
    <>
      <Hero />
      <LogosBar />
      <Solutions />
      <Industries />
      <Compliance />
      <BlogPreview />
      <StatsBar />
      <CtaBanner />
      <Contact />
    </>
  );
}
