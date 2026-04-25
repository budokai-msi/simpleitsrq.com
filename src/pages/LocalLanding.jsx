import { useEffect, useState } from "react";
import { Link, useLocation, Navigate } from "react-router-dom";
import {
  Check, MapPin, Star, Clock, ShieldCheck, ArrowRight,
  Headphones, Lock, Cloud, Server, FileCheck, Phone, Wifi, Briefcase,
} from "lucide-react";
import { cities } from "../data/cities";
import { useSEO, SITE_URL } from "../lib/seo";
import RecommendedTools from "../components/RecommendedTools";

const SERVICES = [
  { Icon: Headphones, title: "Everyday IT Support", desc: "One flat monthly price covers unlimited help desk, monitoring, and software updates. A local tech answers the phone, and we triage critical issues first." },
  { Icon: Lock, title: "Cybersecurity and Virus Protection", desc: "Antivirus, email scam filtering, safer web browsing, and 24/7 monitoring — plus the written proof your cyber-insurance carrier asks for at renewal." },
  { Icon: Cloud, title: "Microsoft 365, Email, and Cloud Apps", desc: "We set up your email, Teams, shared drives, and company devices so everything works the same on every laptop and phone." },
  { Icon: Server, title: "Backups and Disaster Recovery", desc: "Automatic backups of every computer and server, with a second copy stored off-site. We test the backups every quarter so a restore actually works when you need it." },
  { Icon: FileCheck, title: "HIPAA and Cyber-Insurance Paperwork", desc: "Written security reviews, the protections auditors and insurers expect, and a binder of documents you can hand them the same day." },
  { Icon: Phone, title: "Business Phone Systems", desc: "Modern phones that work from your desk, your cell, or your laptop — with voicemail in your email, text messaging, and fax-over-email." },
  { Icon: Wifi, title: "Networking, Wi-Fi, and Cabling", desc: "Business-grade firewalls, Wi-Fi that reaches every corner, guest-separated networks, and clean cable runs with every jack labeled." },
  { Icon: Briefcase, title: "IT Planning and Budgeting", desc: "Quarterly check-ins with a senior tech, a simple 12-month plan, and an IT budget you can explain to anyone in plain English." },
];

function buildLocalBusinessLd(city) {
  // telephone intentionally omitted — the business is email + form first,
  // and Google treats a placeholder (000-0000) phone as a bad-schema signal
  // that can downgrade the LocalBusiness rich result. If/when a tracked
  // phone number is set up, add it here.
  //
  // Geo + serviceArea (optional per-city; see src/data/cities.js) let the
  // hyper-local pages (e.g. /bradenton-34207-it-support) tell Google the
  // explicit 10-mile-radius service zone. Without coords the schema stays
  // in the "known city" shape Google has always accepted.
  const schema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${SITE_URL}/${city.slug}#business`,
    name: `Simple IT SRQ — ${city.city}`,
    image: `${SITE_URL}/logo.png`,
    url: `${SITE_URL}/${city.slug}`,
    email: "hello@simpleitsrq.com",
    address: {
      "@type": "PostalAddress",
      addressLocality: city.city,
      addressRegion: "FL",
      addressCountry: "US",
      ...(city.postalCode ? { postalCode: city.postalCode } : {}),
    },
    areaServed: city.city,
    priceRange: "$$",
    description: city.metaDescription,
    openingHours: "Mo-Fr 08:00-18:00",
  };

  if (typeof city.lat === "number" && typeof city.lng === "number") {
    schema.geo = { "@type": "GeoCoordinates", latitude: city.lat, longitude: city.lng };
    if (typeof city.radiusMiles === "number") {
      schema.serviceArea = {
        "@type": "GeoCircle",
        geoMidpoint: { "@type": "GeoCoordinates", latitude: city.lat, longitude: city.lng },
        geoRadius: Math.round(city.radiusMiles * 1609.34),
      };
    }
  }

  return schema;
}

// Emit one Service node per offering so Google associates each named
// IT service with the city's geo + service area. Significantly stronger
// signal than the flat LocalBusiness node alone — when someone searches
// "managed IT services Bradenton" Google can match the Service node's
// areaServed instead of inferring from page copy.
function buildServiceLd(city) {
  const serviceArea = (typeof city.lat === "number" && typeof city.lng === "number" && typeof city.radiusMiles === "number")
    ? {
        "@type": "GeoCircle",
        geoMidpoint: { "@type": "GeoCoordinates", latitude: city.lat, longitude: city.lng },
        geoRadius: Math.round(city.radiusMiles * 1609.34),
      }
    : { "@type": "AdministrativeArea", name: city.city };

  const provider = {
    "@type": "LocalBusiness",
    "@id": `${SITE_URL}/${city.slug}#business`,
    name: "Simple IT SRQ",
    url: `${SITE_URL}/${city.slug}`,
  };

  const services = [
    { name: `Managed IT Support in ${city.city}`,                  type: "Managed IT services" },
    { name: `Cybersecurity for ${city.city} small businesses`,     type: "Cybersecurity" },
    { name: `Microsoft 365 + Cloud setup in ${city.city}`,         type: "Cloud computing" },
    { name: `Backup + Disaster Recovery in ${city.city}`,          type: "Backup and disaster recovery" },
    { name: `HIPAA + Cyber-Insurance Paperwork in ${city.city}`,   type: "Compliance documentation" },
    { name: `Business Phone Systems in ${city.city}`,              type: "VoIP" },
    { name: `Networking, Wi-Fi, and Cabling in ${city.city}`,      type: "Network setup" },
    { name: `IT Planning + Budgeting in ${city.city}`,             type: "vCIO" },
  ];

  return {
    "@context": "https://schema.org",
    "@graph": services.map((s, i) => ({
      "@type": "Service",
      "@id": `${SITE_URL}/${city.slug}#service-${i + 1}`,
      name: s.name,
      serviceType: s.type,
      provider,
      areaServed: serviceArea,
      url: `${SITE_URL}/${city.slug}`,
    })),
  };
}

function buildFaqLd(city) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: city.faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

function injectSchema(id, data) {
  let s = document.getElementById(id);
  if (!s) {
    s = document.createElement("script");
    s.type = "application/ld+json";
    s.id = id;
    document.head.appendChild(s);
  }
  s.textContent = JSON.stringify(data);
}
function removeSchema(id) {
  const s = document.getElementById(id);
  if (s) s.remove();
}

export default function LocalLanding() {
  const { pathname } = useLocation();
  const citySlug = pathname.replace(/^\//, "").replace(/\/$/, "");
  const key = citySlug.replace("-it-support", "").trim();
  const city = cities[key] || Object.values(cities).find((c) => c.slug === citySlug);

  useSEO(
    city
      ? {
          title: city.title,
          description: city.metaDescription,
          canonical: `${SITE_URL}/${city.slug}`,
          image: `${SITE_URL}/og-image.png`,
          // 3-deep breadcrumb: Home → Service Area → This city. Richer
          // BreadcrumbList signal than 2 levels and gives Google a clean
          // entity-relationship between the city pages and the hub.
          breadcrumbs: [
            { name: "Home", url: `${SITE_URL}/` },
            { name: "Service Area", url: `${SITE_URL}/service-area` },
            { name: city.city, url: `${SITE_URL}/${city.slug}` },
          ],
        }
      : {}
  );

  useEffect(() => {
    if (!city) return;
    injectSchema("jsonld-local-business", buildLocalBusinessLd(city));
    injectSchema("jsonld-services", buildServiceLd(city));
    injectSchema("jsonld-faq", buildFaqLd(city));
    return () => {
      removeSchema("jsonld-local-business");
      removeSchema("jsonld-services");
      removeSchema("jsonld-faq");
    };
  }, [city]);

  const [form, setForm] = useState({ name: "", email: "", company: "", message: "" });
  const [sent, setSent] = useState(false);

  if (!city) return <Navigate to="/" replace />;

  const submit = (e) => {
    e.preventDefault();
    setSent(true);
  };

  return (
    <main id="main" className="local-main">
      <section className="hero hero-clean">
        <div className="hero-bg" aria-hidden="true" />
        <div className="container hero-stack-clean">
          <div className="hero-copy hero-copy-centered">
            <span className="eyebrow"><MapPin size={14} /> {city.cityFull}</span>
            <h1 className="display">{city.h1}<br /><span className="brand-accent">Simple IT SRQ</span></h1>
            <p className="lede">{city.intro}</p>
            <div className="hero-ctas">
              <a href="#local-contact" className="btn btn-primary btn-lg">Get a Free IT Audit</a>
              <Link to="/#solutions" className="btn btn-secondary btn-lg">Explore Solutions</Link>
            </div>
            <ul className="trust-row" aria-label="Trust indicators">
              <li><Star size={14} fill="#F7630C" stroke="#F7630C" /> 5.0 Google rating</li>
              <li><ShieldCheck size={14} /> HIPAA documented</li>
              <li><Clock size={14} /> Same-day response in {city.city}</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Neighborhoods we serve</span>
            <h2 className="title-1">Local IT support across {city.city}</h2>
            <p className="section-sub">
              We support businesses across {city.neighborhoods}. Our engineers live in Sarasota and Bradenton, which means same-day on-site response and none of the drive-down-from-Tampa excuses.
            </p>
          </div>
        </div>
      </section>

      <section className="section section-alt" id="local-services">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Services</span>
            <h2 className="title-1">Managed IT services for {city.city} businesses</h2>
            <p className="section-sub">
              {city.servicesIntro || "Eight core services, one flat monthly rate, one local team."}
            </p>
          </div>
          <div className="solution-grid">
            {SERVICES.map(({ Icon, title, desc }) => (
              <article key={title} className="solution-card">
                <div className="solution-card-head">
                  <span className="solution-card-icon"><Icon size={18} /></span>
                  <h3 className="solution-card-title">{title}</h3>
                </div>
                <p className="solution-card-desc">{desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {Array.isArray(city.localPatterns) && city.localPatterns.length > 0 && (
        <section className="section" id="local-patterns">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">What we see locally</span>
              <h2 className="title-1">Three {city.city} client patterns, and how the playbook changes</h2>
              <p className="section-sub">
                The generic services list applies to every office. What changes between Sarasota, Bradenton, Lakewood Ranch, Nokomis, and Venice is the emphasis — what matters most for the specific work happening here. These are the three recurring shapes of {city.city} engagements.
              </p>
            </div>
            <div className="local-patterns-grid">
              {city.localPatterns.map((p) => (
                <article key={p.title} className="local-pattern-card">
                  <h3>{p.title}</h3>
                  <p>{p.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Why local</span>
            <h2 className="title-1">Why {city.city} businesses choose Simple IT SRQ</h2>
          </div>
          <ul className="feature-list feature-list-lg">
            {city.whyLocal.map((line) => (
              <li key={line}><Check size={18} color="#0F6CBD" /> {line}</li>
            ))}
          </ul>
        </div>
      </section>

      <RecommendedTools
        title={`Tool shelf for ${city.city} small offices`}
        subtitle="The three purchases we recommend every new client make before signing with an MSP — or with us."
      />

      <section className="section section-alt">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">FAQ</span>
            <h2 className="title-1">Frequently asked questions</h2>
          </div>
          <div className="faq-list">
            {city.faqs.map((f) => (
              <details key={f.q} className="faq-item">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="local-contact">
        <div className="container">
          <div className="lead-capture lead-capture-wide">
            <div>
              <span className="eyebrow">Free IT audit</span>
              <h2 className="title-2">Get a free 15-minute IT assessment for your {city.city} business</h2>
              <p>Tell us a little about your team and we'll schedule a no-pressure call with a local engineer. No sales pitch — just a clear read on your risk, your Microsoft 365, and what good would look like.</p>
              <ul className="feature-list">
                <li><Check size={16} color="#0F6CBD" /> Local engineer, same-day callback</li>
                <li><Check size={16} color="#0F6CBD" /> No long-term contract required</li>
                <li><Check size={16} color="#0F6CBD" /> Works with your current team or replaces it</li>
              </ul>
            </div>
            <form className="lead-capture-form" onSubmit={submit} noValidate>
              {sent ? (
                <div className="lead-capture-success">
                  <Check size={28} color="#107C10" />
                  <h3>Thanks — we'll be in touch.</h3>
                  <p>A local engineer will reach out within one business day.</p>
                </div>
              ) : (
                <>
                  <label>Name
                    <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </label>
                  <label>Work email
                    <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </label>
                  <label>Company
                    <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
                  </label>
                  <label>How can we help?
                    <textarea rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
                  </label>
                  <button type="submit" className="btn btn-primary btn-lg">Request my audit <ArrowRight size={16} /></button>
                </>
              )}
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
