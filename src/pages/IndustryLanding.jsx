import { useEffect } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import {
  Check, MapPin, ShieldCheck, ArrowRight, Headphones, Lock, Cloud, Server,
  FileCheck, Phone, Wifi, Briefcase,
} from "lucide-react";
import { cities } from "../data/cities";
import { industries, matchIndustryPattern } from "../data/industries";
import { useSEO, SITE_URL } from "../lib/seo";

// Same 8 service tiles the city pages use — kept identical so the
// industry pages don't drift in copy + so visitors recognize the
// pattern when they navigate from a city page to an industry page.
const SERVICES = [
  { Icon: Headphones, title: "Everyday IT Support",                desc: "One flat monthly price covers unlimited help desk, monitoring, and software updates. A local tech answers the phone, and we triage critical issues first." },
  { Icon: Lock,       title: "Cybersecurity and Virus Protection", desc: "Antivirus, email scam filtering, safer web browsing, and 24/7 monitoring — plus the written proof your cyber-insurance carrier asks for at renewal." },
  { Icon: Cloud,      title: "Microsoft 365, Email, and Cloud Apps", desc: "We set up your email, Teams, shared drives, and company devices so everything works the same on every laptop and phone." },
  { Icon: Server,     title: "Backups and Disaster Recovery",      desc: "Automatic backups of every computer and server, with a second copy stored off-site. We test the backups every quarter so a restore actually works when you need it." },
  { Icon: FileCheck,  title: "HIPAA and Cyber-Insurance Paperwork", desc: "Written security reviews, the protections auditors and insurers expect, and a binder of documents you can hand them the same day." },
  { Icon: Phone,      title: "Business Phone Systems",             desc: "Modern phones that work from your desk, your cell, or your laptop — with voicemail in your email, text messaging, and fax-over-email." },
  { Icon: Wifi,       title: "Networking, Wi-Fi, and Cabling",     desc: "Business-grade firewalls, Wi-Fi that reaches every corner, guest-separated networks, and clean cable runs with every jack labeled." },
  { Icon: Briefcase,  title: "IT Planning and Budgeting",          desc: "Quarterly check-ins with a senior tech, a simple 12-month plan, and an IT budget you can explain to anyone in plain English." },
];

function buildLocalBusinessLd(industry, city, url) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${SITE_URL}${url}#business`,
    name: `Simple IT SRQ — ${industry.displayName} in ${city.city}`,
    image: `${SITE_URL}/logo.png`,
    url: `${SITE_URL}${url}`,
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
    description: `${industry.displayName} IT support in ${city.city} — ${industry.serviceType}. ${city.metaDescription}`,
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

function buildServiceLd(industry, city, url) {
  const serviceArea = (typeof city.lat === "number" && typeof city.lng === "number" && typeof city.radiusMiles === "number")
    ? {
        "@type": "GeoCircle",
        geoMidpoint: { "@type": "GeoCoordinates", latitude: city.lat, longitude: city.lng },
        geoRadius: Math.round(city.radiusMiles * 1609.34),
      }
    : { "@type": "AdministrativeArea", name: city.city };

  return {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${SITE_URL}${url}#service`,
    name: `${industry.displayName} IT Support in ${city.city}`,
    serviceType: industry.serviceType,
    provider: {
      "@type": "LocalBusiness",
      "@id": `${SITE_URL}${url}#business`,
      name: "Simple IT SRQ",
      url: `${SITE_URL}${url}`,
    },
    areaServed: serviceArea,
    audience: {
      "@type": "BusinessAudience",
      audienceType: industry.displayName,
    },
    description: industry.intro,
    url: `${SITE_URL}${url}`,
  };
}

function buildFaqLd(industry) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: industry.faqs.map((f) => ({
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

export default function IndustryLanding() {
  // URL pattern: /:industrySlug-:cityKey  e.g. /medical-it-sarasota
  // We parse from the catch-all param so a single Route element handles
  // every (industry, city) combo without enumerating in App.jsx.
  const params = useParams();
  const slug = params["*"] || params.slug || "";

  // Find which (industry, city) this slug resolves to. Industry slugs
  // already end with "-it" so we match by suffix to find the city key.
  let resolved = null;
  for (const ind of Object.values(industries)) {
    const prefix = ind.slug + "-";
    if (slug.startsWith(prefix)) {
      const cityKey = slug.slice(prefix.length);
      const city = cities[cityKey];
      if (city && ind.cities.includes(cityKey)) {
        const pattern = matchIndustryPattern(ind, city);
        if (pattern) {
          resolved = { industry: ind, city, cityKey, pattern };
          break;
        }
      }
    }
  }

  const url = resolved ? `/${resolved.industry.slug}-${resolved.cityKey}` : "/";
  const title = resolved
    ? `${resolved.industry.displayName} IT Support in ${resolved.city.city} | Simple IT SRQ`
    : "";
  const description = resolved
    ? `${resolved.industry.displayName} IT support in ${resolved.city.city}, FL. ${resolved.industry.intro.slice(0, 140)}…`
    : "";

  useSEO(
    resolved
      ? {
          title,
          description,
          canonical: `${SITE_URL}${url}`,
          // Per-(industry, city) Open Graph card rendered by
          // scripts/generate-industry-og-images.mjs at prebuild time.
          // Card filename mirrors the URL slug pattern.
          image: `${SITE_URL}/og-industry-${resolved.industry.slug}-${resolved.cityKey}.png`,
          // 4-deep crumb: Home → Service Area → City → Industry vertical.
          // Tells Google the entity-relationship between the city hub and
          // the vertical page so they don't compete for the same query.
          breadcrumbs: [
            { name: "Home", url: `${SITE_URL}/` },
            { name: "Service Area", url: `${SITE_URL}/service-area` },
            { name: resolved.city.city, url: `${SITE_URL}/${resolved.city.slug}` },
            { name: resolved.industry.displayName, url: `${SITE_URL}${url}` },
          ],
        }
      : {}
  );

  useEffect(() => {
    if (!resolved) return;
    injectSchema("jsonld-industry-business", buildLocalBusinessLd(resolved.industry, resolved.city, url));
    injectSchema("jsonld-industry-service", buildServiceLd(resolved.industry, resolved.city, url));
    injectSchema("jsonld-industry-faq", buildFaqLd(resolved.industry));
    return () => {
      removeSchema("jsonld-industry-business");
      removeSchema("jsonld-industry-service");
      removeSchema("jsonld-industry-faq");
    };
  }, [resolved, url]);

  if (!resolved) return <Navigate to="/service-area" replace />;
  const { industry, city, pattern } = resolved;

  return (
    <main id="main" className="local-landing">
      <section className="section hero hero-clean">
        <div className="container hero-stack-clean">
          <div className="hero-copy hero-copy-centered">
            <span className="eyebrow">
              <MapPin size={14} style={{ display: "inline", marginRight: 6 }} />
              {industry.displayName} · {city.cityFull}
            </span>
            <h1 className="display">
              {industry.h1Prefix} <span className="brand-accent">in {city.city}</span>
            </h1>
            <p className="lede">{industry.intro}</p>
            <div className="hero-ctas">
              <Link to="/book" className="btn btn-primary btn-lg">
                Book a free 30-minute consult <ArrowRight size={16} />
              </Link>
              <Link to={`/${city.slug}`} className="btn btn-secondary btn-lg">
                See all {city.city} IT services
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Industry-specific pattern from the matching city.localPatterns block. */}
      <section className="section">
        <div className="container" style={{ maxWidth: 880 }}>
          <h2 className="title-1">What we deliver for {industry.displayName.toLowerCase()} in {city.city}</h2>
          <div style={{ padding: "20px 24px", borderRadius: 12, background: "var(--syn-surface, #f9fafb)", border: "1px solid var(--syn-border, #e5e7eb)", borderLeft: "4px solid #0F6CBD", marginTop: 12 }}>
            <h3 style={{ marginTop: 0, fontSize: "1.05rem" }}>{pattern.title}</h3>
            <p style={{ margin: 0, lineHeight: 1.6 }}>{pattern.body}</p>
          </div>

          <h3 style={{ marginTop: 32, fontSize: "1.15rem" }}>Where we focus for this industry</h3>
          <ul style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12, padding: 0, listStyle: "none" }}>
            {industry.emphasis.map((e, i) => (
              <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <ShieldCheck size={16} color="#107C10" style={{ flexShrink: 0, marginTop: 3 }} />
                <span>{e}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Standard 8-service grid — same as city pages, IT-services first. */}
      <section className="section section-alt" id="solutions">
        <div className="container">
          <div className="section-head">
            <h2 className="title-1">All eight services on every plan</h2>
            <p className="section-sub">
              Whether you sign up because of {industry.displayName.toLowerCase()} compliance pressure or because your network keeps dropping mid-day, every Simple IT SRQ engagement covers the same eight services. {city.city} firms get all of it on day one.
            </p>
          </div>
          <div className="solutions-grid">
            {SERVICES.map(({ Icon, title, desc }) => (
              <div key={title} className="solution-card">
                <div className="solution-icon"><Icon size={22} /></div>
                <h3 className="solution-title">{title}</h3>
                <p className="solution-desc">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ — industry-level, applies across cities. */}
      <section className="section">
        <div className="container" style={{ maxWidth: 880 }}>
          <h2 className="title-1">Frequently asked — {industry.displayName.toLowerCase()}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
            {industry.faqs.map((f, i) => (
              <details key={i} style={{ padding: "14px 18px", borderRadius: 10, background: "var(--syn-surface-2, #fff)", border: "1px solid var(--syn-border, #e5e7eb)" }}>
                <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "1rem" }}>{f.q}</summary>
                <p style={{ margin: "10px 0 0", lineHeight: 1.6, color: "var(--syn-text-muted, #4b5563)" }}>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Cross-link back to the city hub + the other industry pages
          this city has, so visitors and Google see the entity graph. */}
      <section className="section section-alt">
        <div className="container" style={{ maxWidth: 880 }}>
          <h2 className="title-1" style={{ fontSize: "1.4rem" }}>Other industries we serve in {city.city}</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
            {Object.values(industries)
              .filter((i) => i.slug !== industry.slug && i.cities.includes(resolved.cityKey) && matchIndustryPattern(i, city))
              .map((i) => (
                <Link
                  key={i.slug}
                  to={`/${i.slug}-${resolved.cityKey}`}
                  className="btn btn-secondary"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  {i.displayName}
                  <ArrowRight size={14} />
                </Link>
              ))}
            <Link to={`/${city.slug}`} className="btn btn-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              All {city.city} IT services <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
