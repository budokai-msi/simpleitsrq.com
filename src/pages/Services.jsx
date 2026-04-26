import { useState, useMemo } from "react";
import { Link } from "../lib/Link";
import {
  Check, X, ArrowRight, Loader2, CheckCircle2, AlertCircle, ShieldCheck, MapPin,
} from "lucide-react";
import { services, audienceFilter } from "../data/services";
import { useSEO } from "../lib/seo";
import { csrfFetch } from "../lib/csrf";
import { track } from "../lib/analytics";

// Reservation / waitlist CTA. Mirrors the pattern used on /store: when a
// service has a buyLink, we render a hard Buy/Reserve button that opens the
// Stripe-hosted checkout. When it doesn't, we render an email capture so we
// can measure demand BEFORE wiring the Stripe link.
function BuyCta({ svc }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | submitting | sent | error
  const [errMsg, setErrMsg] = useState("");

  // $0 lead-gen tier routes to /book, not Stripe.
  if (svc.status === "consult") {
    return (
      <Link
        to={svc.buyLink || "/book"}
        className="btn btn-primary svc-buy-btn"
        onClick={() => track("services_buy_click", { slug: svc.slug, kind: "consult" })}
      >
        Book a free call <ArrowRight size={16} />
      </Link>
    );
  }

  if (svc.status === "live" && svc.buyLink) {
    const isStripe = svc.buyLink.startsWith("https://buy.stripe.com");
    return (
      <a
        href={svc.buyLink}
        className="btn btn-primary svc-buy-btn"
        rel="noopener"
        onClick={() => track("services_buy_click", { slug: svc.slug, kind: isStripe ? "stripe" : "external" })}
      >
        {svc.price === 0 ? "Reserve now" : `Buy now — $${svc.price}${svc.priceSuffix || ""}`}
        <ArrowRight size={16} />
      </a>
    );
  }

  // Waitlist email capture
  const submit = async (e) => {
    e.preventDefault();
    if (!email || !/.+@.+\..+/.test(email)) {
      setStatus("error");
      setErrMsg("Enter a valid email.");
      return;
    }
    setStatus("submitting");
    setErrMsg("");
    try {
      const res = await csrfFetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: email.split("@")[0],
          email,
          message: `[services-waitlist] Wants to be notified when "${svc.title}" opens for purchase. Slug: ${svc.slug}`,
          source: "services-waitlist",
        }),
      });
      if (res.ok) {
        track("services_waitlist_signup", { slug: svc.slug });
        setStatus("sent");
      } else {
        setStatus("error");
        setErrMsg("Couldn't add you to the list. Try again or email hello@simpleitsrq.com.");
      }
    } catch {
      setStatus("error");
      setErrMsg("Network hiccup. Try again.");
    }
  };

  if (status === "sent") {
    return (
      <div className="svc-waitlist-sent" role="status">
        <CheckCircle2 size={18} color="var(--success)" /> You're on the list. We'll email when this opens.
      </div>
    );
  }

  return (
    <form className="svc-waitlist" onSubmit={submit} noValidate>
      <label className="svc-waitlist-label" htmlFor={`waitlist-${svc.slug}`}>
        Email me when this opens
      </label>
      <div className="svc-waitlist-row">
        <input
          id={`waitlist-${svc.slug}`}
          type="email"
          placeholder="you@business.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "submitting"}
          autoComplete="email"
          inputMode="email"
        />
        <button
          type="submit"
          className="btn btn-secondary"
          disabled={status === "submitting"}
        >
          {status === "submitting" ? <Loader2 size={16} className="spin" /> : "Notify me"}
        </button>
      </div>
      {status === "error" && (
        <p className="svc-waitlist-err" role="alert"><AlertCircle size={14} /> {errMsg}</p>
      )}
    </form>
  );
}

function ServiceCard({ svc }) {
  return (
    <article id={svc.slug} className="svc-card reveal-up" data-reveal>
      <header className="svc-card-head">
        <div className="svc-card-meta">
          <span className={`svc-audience svc-audience-${svc.audience.toLowerCase()}`}>{svc.audience}</span>
          <span className="svc-duration">{svc.duration}</span>
        </div>
        <h3 className="svc-card-title">{svc.title}</h3>
        <p className="svc-card-tagline">{svc.tagline}</p>
      </header>

      <div className="svc-price-block">
        <span className="svc-price">
          {svc.priceFrom && <span className="svc-price-from">from </span>}
          {svc.price === 0 ? "Free" : `$${svc.price.toLocaleString()}`}
          {svc.priceSuffix && <span className="svc-price-suffix">{svc.priceSuffix}</span>}
        </span>
        {svc.priceNote && <p className="svc-price-note">{svc.priceNote}</p>}
      </div>

      <div className="svc-includes">
        <h4>What's included</h4>
        <ul>
          {svc.contents.map((c) => (
            <li key={c}><Check size={14} color="var(--success)" /> <span>{c}</span></li>
          ))}
        </ul>
      </div>

      {svc.notInScope?.length > 0 && (
        <details className="svc-not-included">
          <summary>What's NOT included</summary>
          <ul>
            {svc.notInScope.map((n) => (
              <li key={n}><X size={14} color="var(--text-3)" /> <span>{n}</span></li>
            ))}
          </ul>
        </details>
      )}

      {svc.bookingNote && (
        <p className="svc-booking-note"><ShieldCheck size={14} /> {svc.bookingNote}</p>
      )}

      <div className="svc-cta">
        <BuyCta svc={svc} />
      </div>
    </article>
  );
}

const TABS = ["All", "Residential", "Business"];

export default function Services() {
  useSEO({
    title: "Buy a Service | Computer Repair, Cameras, Migrations — Sarasota & Bradenton",
    description: "Productized fixed-fee IT services for Sarasota and Bradenton. Computer tune-up $99, virus removal from $179, SSD upgrade $249, security camera install reservation $500 deposit, M365 migration $1,500, snowbird pre-arrival setup $349. No quotes, no phone tag — just a Buy Now button.",
    canonical: "https://simpleitsrq.com/services",
    image: "https://simpleitsrq.com/og-image.png",
    breadcrumbs: [
      { name: "Home", url: "https://simpleitsrq.com/" },
      { name: "Services", url: "https://simpleitsrq.com/services" },
    ],
  });

  const [tab, setTab] = useState("All");
  const filtered = useMemo(
    () => services.filter((s) => audienceFilter(s, tab)).sort((a, b) => a.priority - b.priority),
    [tab],
  );

  return (
    <main id="main" className="services-main">
      <section className="section services-hero">
        <div className="container">
          <span className="eyebrow">Services · Fixed Fee · No Quotes</span>
          <h1 className="display">Buy a service. No phone tag, no "I'll think about it."</h1>
          <p className="lede">
            Productized fixed-fee IT services for Sarasota, Bradenton, Venice,
            Lakewood Ranch, and Nokomis. Pick what you need, pay online,
            schedule. Most local IT shops can't do this — we wrote the
            checkout so you wouldn't have to wait on a callback to spend
            your money.
          </p>
          <div className="services-trust-row">
            <span><MapPin size={14} /> Local Sarasota / Bradenton team</span>
            <span><ShieldCheck size={14} /> Flat fees · written what's-included list · 30-day satisfaction guarantee</span>
          </div>
        </div>
      </section>

      <section className="section services-tabs-wrap">
        <div className="container">
          <div className="services-tabs" role="tablist" aria-label="Filter services by audience">
            {TABS.map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                className={`services-tab${tab === t ? " is-active" : ""}`}
                onClick={() => { setTab(t); track("services_tab_filter", { tab: t }); }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="services-grid">
            {filtered.map((svc) => (
              <ServiceCard key={svc.slug} svc={svc} />
            ))}
          </div>
        </div>
      </section>

      <section className="section services-outro">
        <div className="container" style={{ textAlign: "center" }}>
          <h2 className="title-2">Don't see what you need?</h2>
          <p className="lede" style={{ maxWidth: 640, margin: "0 auto 24px" }}>
            We do plenty of work that's harder to productize — Active Directory
            rebuilds, server replacements, multi-site cabling, and the awkward
            half-managed environments where a former IT person left things in a
            state. Book a free call and we'll quote it after a real
            conversation.
          </p>
          <Link to="/book" className="btn btn-primary btn-lg">Book a free 30-min call</Link>
        </div>
      </section>
    </main>
  );
}
