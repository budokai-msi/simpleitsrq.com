import {
  Lock, Cloud, FileCheck, HeartPulse, Scale, Landmark, HardHat,
  Home as HomeIcon, Phone, Mail, MapPin, Clock, ArrowRight, Wifi, Briefcase,
  Loader2, CheckCircle2, AlertCircle, Send, ArrowUpRight, Headphones,
  Server, Shield, Star
} from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { useSEO } from "../lib/seo";
import { posts } from "../data/posts";
import { tapHaptic, selectionHaptic, successHaptic, errorHaptic } from "../lib/haptics";
import { useTurnstile, TURNSTILE_SITE_KEY } from "../lib/useTurnstile";

function Hero() {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "2-digit"
  }).toUpperCase();
  return (
    <section className="e-hero" aria-labelledby="hero-title">
      <div className="container">
        <div className="e-hero-meta">
          <span><span className="dot" aria-hidden="true" />Online · Sarasota, FL</span>
          <span>Edition {today}</span>
          <span className="hide-sm">Est. 2023</span>
        </div>
        <h1 id="hero-title">
          IT support that <em>just works</em> — for the businesses of Sarasota, Bradenton & Venice.
        </h1>
        <div className="e-hero-foot">
          <p className="e-hero-lede">
            A local crew that picks up the phone. Flat monthly pricing. Every
            piece of paperwork your insurer and auditors ask for — ready the
            same day.
          </p>
          <div className="e-hero-ctas">
            <a href="#contact" className="btn btn-primary btn-lg">Get a free IT check-up <ArrowUpRight size={14} /></a>
            <a href="#solutions" className="e-hero-link">See what we do →</a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Ticker() {
  const items = [
    "0 breaches since 2023",
    "<15 min first response",
    "99.99% uptime",
    "HIPAA paperwork included",
    "Local team, no call centers",
    "Flat monthly pricing",
    "Same-day onsite across Sarasota & Bradenton",
    "Cyber-insurance renewal support",
  ];
  const loop = [...items, ...items];
  return (
    <div className="e-ticker" aria-hidden="true">
      <div className="e-ticker-track">
        {loop.map((t, i) => <span key={i}>{t}</span>)}
      </div>
    </div>
  );
}

function LogosBar() {
  const vendors = ["Microsoft 365", "SentinelOne", "Defender", "Intune", "Fortinet", "Cisco Meraki"];
  return (
    <section className="logos-bar" aria-label="Tools and brands we install">
      <div className="container">
        <p className="logos-title">Tools we install & support ——</p>
        <div className="logos-row">
          {vendors.map((v) => <span key={v} className="logo-mark">{v}</span>)}
        </div>
      </div>
    </section>
  );
}

const SOLUTIONS = [
  { title: "Everyday IT support", desc: "Unlimited help desk, monitoring, software updates, new-employee setup. A real person in Sarasota picks up — critical issues get a live tech under 15 minutes." },
  { title: "Cybersecurity & virus protection", desc: "Modern antivirus, email scam filtering, safer browsing, 24/7 monitoring. Two-step sign-in on every account and the written proof your cyber-insurance carrier asks for." },
  { title: "Microsoft 365 & cloud apps", desc: "Email, Teams, shared drives, company devices — all set up to work the same on every laptop and phone. Migrations handled over a weekend, no lost messages." },
  { title: "Backups & disaster recovery", desc: "Automatic backups with off-site copies, quarterly restore tests, and a plain-English recovery plan so fire, hurricane, or ransomware can't wipe you out." },
  { title: "HIPAA & cyber-insurance paperwork", desc: "For medical, dental, legal, and any business renewing cyber-insurance. We run the required checks and hand you a binder ready for the auditor." },
  { title: "Business phone systems", desc: "Voicemail in your email, text messaging, fax-to-email. We port your numbers, set after-hours routing, and train the front desk so switching is quiet." },
  { title: "Networking, Wi-Fi, cabling", desc: "Business-grade firewalls and Wi-Fi that reach every corner. New cabling, labeled jacks, and a guest network that isolates visitors from staff." },
  { title: "IT planning & budgeting", desc: "Quarterly sit-down with a senior tech — what's working, what's about to break, what belongs in next year's budget. No corporate speak." },
];

function Solutions() {
  return (
    <section className="e-section" id="solutions" aria-labelledby="solutions-title">
      <div className="container">
        <div className="e-section-head">
          <div className="e-section-num">01 — Index</div>
          <div>
            <h2 id="solutions-title">Everything <em>one</em> local team can handle.</h2>
            <p className="e-section-sub">No more juggling five vendors for five problems. Computers, phones, email, Wi-Fi, backups, security — one number, one bill, one team that knows your setup.</p>
          </div>
        </div>
        <ul className="e-solutions-list">
          {SOLUTIONS.map((s, i) => (
            <li key={s.title}>
              <a href="#contact" className="e-sol-row">
                <span className="e-sol-num">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="e-sol-title">{s.title}</h3>
                <p className="e-sol-desc">{s.desc}</p>
                <ArrowUpRight size={22} className="e-sol-arrow" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const INDUSTRIES = [
  { name: "Healthcare", badges: ["HIPAA", "HITECH"] },
  { name: "Legal", badges: ["ABA", "SOC 2"] },
  { name: "Finance", badges: ["GLBA", "PCI-DSS"] },
  { name: "Construction", badges: ["OSHA", "CMMC"] },
  { name: "Real Estate", badges: ["NAR", "SOC 2"] },
  { name: "Non-Profit", badges: ["990", "GDPR"] },
];

function Industries() {
  return (
    <section className="e-industries" id="industries" aria-labelledby="industries-title">
      <div className="container">
        <div className="e-section-head">
          <div className="e-section-num">02 — Practice</div>
          <div>
            <h2 id="industries-title">The industries we <em>know</em> the paperwork for.</h2>
            <p className="e-section-sub">We specialize in the offices that live under the most regulation — and the insurers and auditors they answer to.</p>
          </div>
        </div>
      </div>
      <div className="e-industries-scroll" role="list">
        {INDUSTRIES.map((ind, i) => (
          <article className="e-ind-card" key={ind.name} role="listitem">
            <span className="e-ind-num">{String(i + 1).padStart(2, "0")} / {String(INDUSTRIES.length).padStart(2, "0")}</span>
            <h3 className="e-ind-name">{ind.name}</h3>
            <div className="e-ind-badges">
              {ind.badges.map((b) => <span key={b}>{b}</span>)}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Compliance() {
  const features = [
    "HIPAA paperwork & risk reviews",
    "Cyber-insurance renewal help",
    "Off-site backups you can actually restore",
    "Disaster-recovery plan your team understands",
    "Full-disk encryption on every device",
    "Quarterly security posture report",
  ];
  const stats = [
    { v: "0", l: "Breaches since 2023" },
    { v: "<4h", l: "Median recovery time" },
    { v: "99.99%", l: "Monitored uptime" },
    { v: "100%", l: "Renewal pass rate" },
  ];
  return (
    <section className="e-compliance" id="compliance" aria-labelledby="compliance-title">
      <div className="container">
        <div className="e-section-head">
          <div className="e-section-num">03 — Evidence</div>
          <div>
            <h2 id="compliance-title">The paperwork most IT guys <em>hate</em>. We bring a binder.</h2>
          </div>
        </div>
        <div className="e-comp-grid">
          <div>
            <p className="e-comp-pull">
              Audits, HIPAA reviews, cyber-insurance renewals — <em>we do the work</em> and hand you the documents.
            </p>
            <ul className="e-comp-list">
              {features.map((f, i) => (
                <li key={f} data-num={String(i + 1).padStart(2, "0")}>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="e-comp-stats">
            {stats.map((s) => (
              <div key={s.l} className="e-comp-stat">
                <span className="v tabular">{s.v}</span>
                <span className="l">{s.l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Testimonial() {
  return (
    <section className="e-testimonial" aria-label="Client testimonial">
      <div className="container">
        <div className="e-testimonial-grid">
          <div className="e-section-num">04 — Record</div>
          <figure>
            <blockquote>
              "Within a month they had two-step sign-in on every account, replaced our backups, and walked our carrier through everything they'd put in place. Our renewal premium <em>dropped 18%</em>."
            </blockquote>
            <figcaption>
              <strong>Karen M.</strong> Practice Administrator · Sarasota dental group
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}

function BlogPreview() {
  const recent = [...posts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const fmt = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }).toUpperCase();
  return (
    <section className="e-blog" id="blog" aria-labelledby="blog-title">
      <div className="container">
        <div className="e-section-head">
          <div className="e-section-num">05 — Writing</div>
          <div>
            <h2 id="blog-title">Straight takes for <em>local</em> business owners.</h2>
            <p className="e-section-sub">What's actually worth your attention in security, AI, and cloud — without the hype.</p>
          </div>
        </div>
        <div className="e-blog-list">
          {recent.map((p) => (
            <Link to={`/blog/${p.slug}`} key={p.slug} className="e-blog-row">
              <time className="e-blog-date" dateTime={p.date}>{fmt(p.date)}</time>
              <span className="e-blog-cat">{p.category}</span>
              <h3 className="e-blog-title">{p.title}</h3>
              <ArrowUpRight size={20} className="e-sol-arrow" />
            </Link>
          ))}
        </div>
        <div className="e-blog-foot">
          <Link to="/blog" className="btn btn-secondary btn-lg">All writing →</Link>
        </div>
      </div>
    </section>
  );
}

function CtaBanner() {
  return (
    <section className="e-cta">
      <div className="container">
        <h2>Tired of <em>fighting</em> with your IT?</h2>
        <p>Book a free 30-minute call with a local tech. No sales pitch — just a straight answer on what's wrong and what it'd take to fix.</p>
        <div className="e-cta-actions">
          <Link to="/book" className="btn btn-primary btn-lg">Book a free call <ArrowUpRight size={14} /></Link>
          <Link to="/support" className="btn btn-secondary btn-lg">Existing client? Get help</Link>
        </div>
      </div>
    </section>
  );
}

function MobileStickyCTA() {
  return (
    <div className="m-sticky-cta" aria-hidden="false">
      <span>Local IT · Sarasota & Bradenton</span>
      <Link to="/book">Book</Link>
    </div>
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
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");

  const { containerRef: turnstileRef, reset: resetTurnstile } = useTurnstile(setTurnstileToken);

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
    <section className="e-contact" id="contact" aria-labelledby="contact-title">
      <div className="container">
        <div className="e-section-head">
          <div className="e-section-num">06 — Contact</div>
          <div>
            <h2 id="contact-title">Tell us what's <em>going on</em>.</h2>
            <p className="e-section-sub">A real person replies within one business hour.</p>
          </div>
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
                <label><span>Name</span>
                  <input type="text" name="name" value={form.name} onChange={update("name")}
                    required aria-required="true" autoComplete="name" disabled={submitting} /></label>
                <label><span>Company</span>
                  <input type="text" name="company" value={form.company} onChange={update("company")}
                    autoComplete="organization" disabled={submitting} /></label>
              </div>
              <div className="row-2">
                <label><span>Email</span>
                  <input type="email" name="email" value={form.email} onChange={update("email")}
                    required aria-required="true" autoComplete="email" inputMode="email" disabled={submitting} /></label>
                <label><span>Phone</span>
                  <input type="tel" name="phone" value={form.phone} onChange={update("phone")}
                    autoComplete="tel" inputMode="tel" disabled={submitting} /></label>
              </div>
              <label><span>Message</span>
                <textarea name="message" rows="5" value={form.message} onChange={update("message")}
                  disabled={submitting} /></label>

              <div aria-hidden="true" style={{
                position: "absolute", left: "-10000px", top: "auto",
                width: "1px", height: "1px", overflow: "hidden", pointerEvents: "none",
              }}>
                <input type="text" name="website" tabIndex="-1" autoComplete="off"
                  value={form._hp} onChange={update("_hp")} />
              </div>

              {TURNSTILE_SITE_KEY && (
                <div ref={turnstileRef} className="turnstile-widget" style={{ margin: "8px 0" }} />
              )}

              <button type="submit" className="btn btn-primary btn-lg btn-submit"
                disabled={submitting} onPointerDown={tapHaptic}>
                {submitting
                  ? <><Loader2 size={18} className="spin" /> Sending...</>
                  : <><Send size={16} /> Send message</>}
              </button>

              <p className="form-note">We'll reply within one business hour. No spam, ever.</p>

              {status === "error" && (
                <div className="form-banner form-banner-error" role="alert">
                  <AlertCircle size={18} /><span>{errorMsg}</span>
                </div>
              )}
            </form>

            {status === "success" && (
              <div className="form-success-overlay" role="status" aria-live="polite">
                <div className="form-success-card">
                  <div className="success-check"><CheckCircle2 size={56} /></div>
                  <h3>Message sent</h3>
                  <p>Thanks — a real human at Simple IT SRQ will reply within one business hour.</p>
                  <button type="button" className="btn btn-secondary" onClick={reset}>Send another</button>
                </div>
              </div>
            )}
          </div>

          <aside className="contact-info" aria-label="Contact information">
            <div className="info-row"><Mail size={18} /><div><strong>Email</strong><br />hello@simpleitsrq.com</div></div>
            <div className="info-row"><MapPin size={18} /><div><strong>Service Area</strong><br />Sarasota, Bradenton, Venice</div></div>
            <div className="info-row"><Clock size={18} /><div><strong>Hours</strong><br />Mon–Fri, 8:00 AM – 6:00 PM</div></div>
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
      <Ticker />
      <LogosBar />
      <Solutions />
      <Industries />
      <Compliance />
      <Testimonial />
      <BlogPreview />
      <CtaBanner />
      <Contact />
      <MobileStickyCTA />
    </>
  );
}
