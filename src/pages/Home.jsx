import {
  Headphones, Server, ShieldCheck, Lock, Cloud, FileCheck,
  HeartPulse, Scale, Landmark, HardHat, Home as HomeIcon, Shield,
  Phone, Mail, MapPin, Clock, Star, Check, ArrowRight, Wifi, Briefcase,
  Loader2, CheckCircle2, AlertCircle, Send
} from "lucide-react";
import { Link } from "react-router-dom";
import { useState, useRef } from "react";
import { useSEO } from "../lib/seo";
import { useScrollReveal, useRevealChildren } from "../lib/useScrollReveal";
import heroGrid from "../assets/hero-grid.svg";
import { posts } from "../data/posts";
import { tapHaptic, selectionHaptic, successHaptic, errorHaptic } from "../lib/haptics";
import { useTurnstile, TURNSTILE_SITE_KEY } from "../lib/useTurnstile";

function Hero() {
  return (
    <section className="hero hero-clean" aria-labelledby="hero-title">
      <div className="hero-bg" aria-hidden="true">
        <img src={heroGrid} alt="" className="hero-grid-bg" />
      </div>
      <div className="container hero-stack-clean">
        <div className="hero-copy hero-copy-centered">
          <span className="eyebrow">IT Support · Sarasota · Bradenton · Venice</span>
          <h1 id="hero-title" className="display">IT support that just works — for Sarasota and Bradenton businesses.</h1>
          <p className="lede">
            We keep your computers running, your data safe, and your team productive.
            A local crew that picks up the phone, flat monthly pricing, and all the
            paperwork your insurance company and auditors ask for.
          </p>
          <div className="hero-ctas">
            <a href="#contact" className="btn btn-primary btn-lg">Get a Free IT Check-Up</a>
            <a href="#solutions" className="btn btn-secondary btn-lg">See What We Do</a>
          </div>
          <ul className="trust-row" aria-label="Why clients trust us">
            <li><Star size={14} strokeWidth={2.25} fill="#F7630C" stroke="#F7630C" /> 5-star Google reviews</li>
            <li><ShieldCheck size={14} strokeWidth={2.25} /> HIPAA paperwork included</li>
            <li><Clock size={14} strokeWidth={2.25} /> Local team · same-day response</li>
          </ul>
          {/* Stat ticker */}
          <div className="hero-stats">
            <div className="hero-stat"><span className="val tabular">0</span><span className="lbl">Security breaches</span></div>
            <div className="hero-stat"><span className="val tabular">&lt;4h</span><span className="lbl">Recovery time</span></div>
            <div className="hero-stat"><span className="val tabular">99.99%</span><span className="lbl">Uptime</span></div>
          </div>
        </div>
      </div>
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
    title: "Everyday IT Support",
    desc: "One flat monthly price covers unlimited help desk, computer and network monitoring, software updates, and new-employee setup. Call, email, or text — a real person in Sarasota answers, and critical problems get a live tech in under 15 minutes."
  },
  {
    Icon: Lock,
    title: "Cybersecurity and Virus Protection",
    desc: "Modern antivirus, email scam filtering, safer web browsing, and 24/7 monitoring that catches attacks while you sleep. We turn on two-step sign-in for every account and hand you the written proof your cyber-insurance carrier asks for at renewal."
  },
  {
    Icon: Cloud,
    title: "Microsoft 365, Email and Cloud Apps",
    desc: "We set up (or clean up) your email, Teams, shared drives, and company devices so everything works the same on every laptop and phone. Moving from another provider? We handle the switch over a weekend so nobody loses a message."
  },
  {
    Icon: Server,
    title: "Backups and Disaster Recovery",
    desc: "Automatic backups of every computer and server, with a second copy stored off-site so a fire, a hurricane, or a ransomware attack can't wipe you out. We test the backups every quarter and keep a simple plan for getting you back up and running in hours, not days."
  },
  {
    Icon: FileCheck,
    title: "HIPAA and Cyber-Insurance Paperwork",
    desc: "Made for medical and dental practices, law firms, and any business renewing their cyber-insurance policy. We run the required security checks, put the protections in place, and give you a binder of documents you can hand an auditor or an insurance agent the same day."
  },
  {
    Icon: Phone,
    title: "Business Phone Systems",
    desc: "Modern phones that work from your desk, your cell, or your laptop — with voicemail in your email, text messaging, and fax-over-email. We move your existing numbers, set up after-hours routing, and train your front desk so switching over is quiet."
  },
  {
    Icon: Wifi,
    title: "Networking, Wi-Fi, and Cabling",
    desc: "Business-grade firewalls and Wi-Fi that actually reach every corner of your office. We run new network cables, label every jack, and guest-separate the Wi-Fi so your customers and staff are never on the same network."
  },
  {
    Icon: Briefcase,
    title: "IT Planning and Budgeting",
    desc: "Sit down with a senior tech once a quarter to look at what's working, what's about to break, and what should be in next year's budget. No corporate speak — just a straight answer on where to spend and where to wait."
  },
];

function Solutions() {
  const ref = useRef(null);
  useRevealChildren(ref);
  return (
    <section className="section" id="solutions" aria-labelledby="solutions-title">
      <div className="container" ref={ref}>
        <div className="section-head reveal-up" data-reveal>
          <span className="eyebrow">What We Do</span>
          <h2 id="solutions-title" className="title-1">Everything your business needs from an IT company</h2>
          <p className="section-sub">One local team for your computers, phones, email, Wi-Fi, backups, and security — so you don't have to call five different vendors when something breaks.</p>
        </div>
        <div className="solution-grid">
          {SOLUTIONS.map(({ Icon, title, desc }, i) => (
            <a key={title} href="#contact" className="solution-card card-hover card-tilt gradient-border reveal-up" data-reveal data-reveal-delay={Math.min(i + 1, 5)}>
              <div className="solution-card-head">
                <span className="solution-card-icon gradient-icon"><Icon size={18} /></span>
                <h3 className="solution-card-title">{title}</h3>
              </div>
              <p className="solution-card-desc">{desc}</p>
              <span className="solution-card-link shimmer-line">
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
];

function Industries() {
  const ref = useRef(null);
  useRevealChildren(ref);
  return (
    <section className="section section-alt" id="industries" aria-labelledby="industries-title">
      <div className="container" ref={ref}>
        <div className="section-head reveal-up" data-reveal>
          <span className="eyebrow">Who We Work With</span>
          <h2 id="industries-title" className="title-1">Businesses we know how to support</h2>
          <p className="section-sub">We specialize in the industries that have to deal with the most paperwork — medical, legal, financial, construction, and real estate offices across Sarasota and Bradenton.</p>
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
  const ref = useScrollReveal();
  const features = [
    "HIPAA paperwork and risk reviews",
    "Cyber-insurance renewal help",
    "Off-site backups you can actually restore",
    "A simple disaster-recovery plan for your team",
    "Strong encryption on every laptop and phone",
  ];
  return (
    <section className="section" id="compliance" aria-labelledby="compliance-title">
      <div className="container compliance-grid reveal-up" ref={ref}>
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
  const ref = useRef(null);
  useRevealChildren(ref);
  const recent = [...posts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  return (
    <section className="section section-alt" id="blog" aria-labelledby="blog-title">
      <div className="container" ref={ref}>
        <div className="section-head reveal-up" data-reveal>
          <span className="eyebrow">From the Blog</span>
          <h2 id="blog-title" className="title-1">Tips for local business owners</h2>
          <p className="section-sub">Straightforward takes on the security, AI, and cloud news that actually matters for Sarasota and Bradenton businesses.</p>
        </div>
        <div className="blog-grid">
          {recent.map((p) => (
            <article key={p.slug} className="blog-card card-hover reveal-up" data-reveal>
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
  const ref = useRef(null);
  useRevealChildren(ref);
  const stats = [
    { v: "99.99%", l: "Uptime promise" },
    { v: "<15 min", l: "Response time" },
    { v: "24/7", l: "Monitoring" },
    { v: "100%", l: "Local team" },
  ];
  return (
    <section className="stats-bar" aria-label="Key statistics">
      <div className="container stats-grid" ref={ref}>
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
  const ref = useScrollReveal();
  return (
    <section className="section">
      <div className="container">
        <div className="cta-banner reveal-scale" ref={ref}>
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
          <h2 id="contact-title" className="title-1">Tell us what's going on</h2>
          <p className="section-sub">Drop us a note and a real person will get back to you within one business hour.</p>
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
    title: "Simple IT SRQ | IT Support for Sarasota and Bradenton Businesses",
    description: "Local IT support, cybersecurity, and cloud services for small businesses in Sarasota, Bradenton, and Venice. Flat monthly pricing, same-day response, HIPAA and cyber-insurance paperwork included. Email hello@simpleitsrq.com.",
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
      <Testimonial />
      <BlogPreview />
      <StatsBar />
      <CtaBanner />
      <Contact />
    </>
  );
}
