import { useState, useMemo } from "react";
import { Link } from "../lib/Link";
import {
  Check, X, ArrowRight, Loader2, CheckCircle2, AlertCircle, ShieldCheck, MapPin,
} from "lucide-react";
import { services, audienceFilter } from "../data/services";
import { useSEO } from "../lib/seo";
import { csrfFetch } from "../lib/csrf";
import { trackEvent } from "../lib/analytics";
import "../styles/services-revenue.css";

function servicePriceLabel(svc) {
  if (svc.price === 0) return "Free";
  const prefix = svc.priceFrom ? "from " : "";
  const suffix = svc.priceSuffix || "";
  return `${prefix}$${svc.price.toLocaleString()}${suffix}`;
}

function serviceCheckoutPayload(svc, source, extra = {}) {
  const price = typeof svc.price === "number" ? svc.price : undefined;
  return {
    source,
    service_slug: svc.slug,
    service_title: svc.title,
    value: price,
    currency: "USD",
    items: [{
      item_id: svc.slug,
      item_name: svc.title,
      item_category: svc.audience,
      price,
      quantity: 1,
    }],
    ...extra,
  };
}

// Reservation / checkout CTA. When a
// service has a buyLink, we render a hard Buy/Reserve button that opens the
// Stripe-hosted checkout. When it doesn't, we capture purchase intent and
// route the customer toward scheduling so the SKU can still turn into revenue.
function BuyCta({ svc }) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("idle"); // idle | submitting | sent | error
  const [errMsg, setErrMsg] = useState("");

  // $0 lead-gen tier routes to /book, not Stripe.
  if (svc.status === "consult") {
    return (
      <Link
        to={svc.buyLink || "/book"}
        className="btn btn-primary svc-buy-btn"
        onClick={() => trackEvent("generate_lead", serviceCheckoutPayload(svc, "services_consult_click"))}
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
        rel="noopener noreferrer"
        onClick={() => trackEvent("begin_checkout", serviceCheckoutPayload(svc, "services_buy_click", {
          checkout_kind: isStripe ? "stripe" : "external",
        }))}
      >
        {svc.price === 0 ? "Reserve now" : `Buy now - ${servicePriceLabel(svc)}`}
        <ArrowRight size={16} />
      </a>
    );
  }

  // Purchase-intent capture for SKUs that do not have a live Payment Link yet.
  const submit = async (e) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    const cleanPhone = phone.trim();
    if (!cleanEmail || !/.+@.+\..+/.test(cleanEmail)) {
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
          name: cleanEmail.split("@")[0],
          email: cleanEmail,
          phone: cleanPhone,
          message: [
            `[services-reserve] Wants scheduling/payment link for "${svc.title}".`,
            `Slug: ${svc.slug}`,
            `Published price: ${servicePriceLabel(svc)}`,
            `Phone: ${cleanPhone || "not provided"}`,
            "Source: /services",
          ].join("\n"),
          source: "services-reserve",
        }),
      });
      if (res.ok) {
        trackEvent("generate_lead", serviceCheckoutPayload(svc, "services_reserve_request"));
        trackEvent("add_to_cart", serviceCheckoutPayload(svc, "services_reserve_request"));
        setStatus("sent");
      } else {
        setStatus("error");
        setErrMsg("Couldn't send the request. Try again or email hello@simpleitsrq.com.");
      }
    } catch {
      setStatus("error");
      setErrMsg("Network hiccup. Try again.");
    }
  };

  if (status === "sent") {
    return (
      <div className="svc-reserve-sent" role="status">
        <CheckCircle2 size={18} color="var(--success)" />
        <span>Request received. We'll send the scheduling/payment link and the next available windows.</span>
      </div>
    );
  }

  const bookHref = `/book?topic=${encodeURIComponent(svc.slug)}&source=services-reserve`;

  return (
    <form className="svc-reserve" onSubmit={submit} noValidate>
      <div className="svc-reserve-head">
        <span className="svc-reserve-kicker">Ready to move?</span>
        <strong>Request the scheduling link</strong>
        <p>We confirm fit, send payment or booking details, and hold the scope at the posted price.</p>
      </div>
      <div className="svc-reserve-row">
        <label className="svc-reserve-field" htmlFor={`reserve-email-${svc.slug}`}>
          <span>Email</span>
          <input
            id={`reserve-email-${svc.slug}`}
            type="email"
            placeholder="you@business.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={status === "submitting"}
            autoComplete="email"
            inputMode="email"
          />
        </label>
        <label className="svc-reserve-field" htmlFor={`reserve-phone-${svc.slug}`}>
          <span>Phone <em>optional</em></span>
          <input
            id={`reserve-phone-${svc.slug}`}
            type="tel"
            placeholder="(941) 555-0144"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={status === "submitting"}
            autoComplete="tel"
            inputMode="tel"
          />
        </label>
      </div>
      <div className="svc-reserve-actions">
        <button
          type="submit"
          className="btn btn-primary svc-buy-btn"
          disabled={status === "submitting"}
        >
          {status === "submitting" ? <Loader2 size={16} className="spin" /> : "Send request"}
        </button>
        <Link
          to={bookHref}
          className="svc-reserve-book"
          onClick={() => trackEvent("generate_lead", serviceCheckoutPayload(svc, "services_reserve_book_call"))}
        >
          Book a call instead <ArrowRight size={14} />
        </Link>
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
const SERVICE_PRODUCTS = services.map((svc) => ({
  slug: svc.slug,
  title: svc.title,
  description: svc.tagline,
  price: svc.price,
  buyLink: svc.buyLink,
}));
const LIVE_CHECKOUT_COUNT = services.filter((svc) => svc.status === "live" && svc.buyLink).length;
const PAID_SERVICE_COUNT = services.filter((svc) => svc.price > 0).length;
const HAS_LIVE_CHECKOUT = LIVE_CHECKOUT_COUNT > 0;
const SERVICES_HERO_TITLE = HAS_LIVE_CHECKOUT
  ? "Productized IT services. Public pricing. Online checkout."
  : "Productized IT services. Public pricing. Fast scheduling.";
const SERVICES_HERO_COPY = HAS_LIVE_CHECKOUT
  ? "A fixed-fee service catalog for Sarasota, Bradenton, Venice, Lakewood Ranch, and Nokomis. Each engagement has a defined scope, a written statement of work, and a posted price. Select an SKU, complete checkout, and schedule."
  : "A fixed-fee service catalog for Sarasota, Bradenton, Venice, Lakewood Ranch, and Nokomis. Each engagement has a defined scope, a written statement of work, and a posted price. Select an SKU, request the scheduling or payment link, and we confirm fit before work starts.";
const SERVICES_META_DESCRIPTION = HAS_LIVE_CHECKOUT
  ? "Buy scoped IT help with public pricing: computer tune-ups, malware cleanup, M365 migration, copier setup, and Windows upgrades across Sarasota and Bradenton."
  : "Request scoped IT help with public pricing: computer tune-ups, malware cleanup, M365 migration, copier setup, and Windows upgrades across Sarasota and Bradenton.";
const SERVICES_SECOND_STAT = HAS_LIVE_CHECKOUT
  ? { value: LIVE_CHECKOUT_COUNT, label: "Checkout-ready SKUs" }
  : { value: PAID_SERVICE_COUNT, label: "Paid service paths" };

const SERVICES_FAQS = [
  {
    q: "Do you publish fixed prices before we book?",
    a: "Yes. Services on this page include published scope and price so you can choose without waiting on a quote call.",
  },
  {
    q: "Do you support Sarasota, Bradenton, and Venice businesses?",
    a: "Yes. We support Sarasota, Bradenton, Venice, Lakewood Ranch, and nearby areas in our normal service window.",
  },
  {
    q: "What if I need work that is not listed as a productized service?",
    a: "Book a consultation and we will scope custom work such as multi-site projects, server replacements, or recovery engagements.",
  },
];

export default function Services() {
  useSEO({
    title: "Fixed-Fee IT Services in Sarasota & Bradenton",
    description: SERVICES_META_DESCRIPTION,
    canonical: "https://simpleitsrq.com/services",
    image: "https://simpleitsrq.com/og-image.png",
    breadcrumbs: [
      { name: "Home", url: "https://simpleitsrq.com/" },
      { name: "Services", url: "https://simpleitsrq.com/services" },
    ],
    products: SERVICE_PRODUCTS,
    productBasePath: "/services",
    faqs: SERVICES_FAQS,
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
          <span className="eyebrow">Service Catalog · Fixed Fee · Public Pricing</span>
          <h1 className="display">{SERVICES_HERO_TITLE}</h1>
          <p className="lede">
            {SERVICES_HERO_COPY} No quote-and-callback dance, no hourly surprises.
          </p>
          <div className="services-trust-row">
            <span><MapPin size={14} /> Local Sarasota / Bradenton engineering team</span>
            <span><ShieldCheck size={14} /> Fixed scope - written deliverables - clear handoff notes</span>
          </div>
          <div className="services-hero-actions">
            <a
              href="#services-catalog"
              className="btn btn-primary btn-lg"
              onClick={() => trackEvent("select_content", { content_type: "services_hero_cta", action: "browse_catalog" })}
            >
              Browse service catalog <ArrowRight size={16} />
            </a>
            <Link
              to="/book"
              className="btn btn-secondary btn-lg"
              onClick={() => trackEvent("generate_lead", { source: "services_hero_book_consultation" })}
            >
              Book consultation <ArrowRight size={16} />
            </Link>
          </div>
          <div className="services-stat-band" role="list" aria-label="Service catalog at a glance">
            <div role="listitem" className="services-stat">
              <div className="services-stat__num">{services.length}</div>
              <div className="services-stat__label">Productized SKUs</div>
            </div>
            <div role="listitem" className="services-stat">
              <div className="services-stat__num">{SERVICES_SECOND_STAT.value}</div>
              <div className="services-stat__label">{SERVICES_SECOND_STAT.label}</div>
            </div>
            <div role="listitem" className="services-stat">
              <div className="services-stat__num">Written</div>
              <div className="services-stat__label">Scope before scheduling</div>
            </div>
            <div role="listitem" className="services-stat">
              <div className="services-stat__num">5-city</div>
              <div className="services-stat__label">SWFL service area</div>
            </div>
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
                onClick={() => { setTab(t); trackEvent("select_content", { content_type: "services_tab_filter", tab: t }); }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section id="services-catalog" className="section">
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
          <Link
            to="/book"
            className="btn btn-primary btn-lg"
            onClick={() => trackEvent("generate_lead", { source: "services_outro_book_call" })}
          >
            Book a free 30-min call
          </Link>
        </div>
      </section>
    </main>
  );
}
