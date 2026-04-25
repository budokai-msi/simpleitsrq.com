import { Link } from "react-router-dom";
import {
  Briefcase, ArrowRight, MapPin, Stethoscope, Scale, TrendingUp, Anchor,
  HardHat, KeyRound,
} from "lucide-react";
import { useSEO, SITE_URL } from "../lib/seo";
import { industries, matchIndustryPattern } from "../data/industries";
import { cities } from "../data/cities";

// Lucide icon per industry — keeps the hub page visually scannable so
// a visitor can find their vertical in 3 seconds without reading copy.
const ICONS = {
  medical:           Stethoscope,
  "law-firm":        Scale,
  "financial-advisor": TrendingUp,
  marine:            Anchor,
  construction:      HardHat,
  "vacation-rental": KeyRound,
};

// Service-area umbrella copy — Florida-flavored so the page can rank
// for "florida [industry] it support" queries that don't include a
// specific city. Each industry section then cascades into city links.
const HUB_INTRO = `Florida small-business IT looks different from the national playbook. Hurricane season, snowbird traffic, FIPA + FTC Safeguards on top of HIPAA, a healthcare market the size of some entire states packed into Sarasota and Manatee counties — every industry we serve has its own version of "what works on the Gulf Coast." This page is the index: pick your industry, then drill into the city closest to your office.`;

export default function IndustriesHub() {
  useSEO({
    title: "IT Support by Industry — Florida Small Business | Simple IT SRQ",
    description:
      "Industry-specific IT support for Florida small businesses: medical & dental practices, law firms, financial advisors, marine services, construction firms, and vacation rental management. HIPAA, GLBA, Florida-Bar-aligned. Pick your vertical and city.",
    canonical: `${SITE_URL}/industries`,
    image: `${SITE_URL}/og-image.png`,
    breadcrumbs: [
      { name: "Home",         url: `${SITE_URL}/` },
      { name: "Service Area", url: `${SITE_URL}/service-area` },
      { name: "Industries",   url: `${SITE_URL}/industries` },
    ],
  });

  return (
    <main id="main">
      <section className="section" aria-labelledby="industries-title">
        <div className="container" style={{ maxWidth: 980 }}>
          <div className="section-head">
            <span className="eyebrow" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Briefcase size={14} /> Industries we serve
            </span>
            <h1 id="industries-title" className="display">
              IT support by industry — across the Florida Gulf Coast
            </h1>
            <p className="lede">{HUB_INTRO}</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 24 }}>
            {Object.values(industries).map((industry) => {
              const Icon = ICONS[Object.keys(industries).find((k) => industries[k] === industry)] || Briefcase;
              // Build a list of (cityKey, city) for cities where this
              // industry has a real matching pattern. Hides verticals
              // we don't actually serve in a particular city — keeps the
              // hub page honest, no thin links.
              const liveCityPairs = industry.cities
                .map((cityKey) => ({ cityKey, city: cities[cityKey] }))
                .filter(({ city }) => city && matchIndustryPattern(industry, city));

              if (liveCityPairs.length === 0) return null;

              return (
                <article
                  key={industry.slug}
                  style={{
                    padding: "24px 26px",
                    borderRadius: 14,
                    background: "var(--syn-surface, #f9fafb)",
                    border: "1px solid var(--syn-border, #e5e7eb)",
                    borderLeft: "4px solid #0F6CBD",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                    <div style={{
                      flexShrink: 0,
                      width: 44, height: 44,
                      borderRadius: 10,
                      background: "rgba(15, 108, 189, 0.1)",
                      display: "grid", placeItems: "center",
                      color: "#0F6CBD",
                    }}>
                      <Icon size={22} aria-hidden="true" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h2 className="title-2" style={{ marginTop: 0, marginBottom: 6, fontSize: "1.4rem" }}>
                        {industry.displayName}
                      </h2>
                      <p style={{ margin: "0 0 14px", color: "var(--syn-text-muted, #4b5563)", lineHeight: 1.55 }}>
                        {industry.intro.slice(0, 320)}{industry.intro.length > 320 ? "…" : ""}
                      </p>

                      <div style={{
                        marginTop: 8, padding: "10px 14px", borderRadius: 8,
                        background: "var(--syn-surface-2, #fff)",
                        border: "1px solid var(--syn-border, #e5e7eb)",
                      }}>
                        <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--syn-text-muted, #6b7280)" }}>
                          {industry.displayName} IT support, by city
                        </p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {liveCityPairs.map(({ cityKey, city }) => (
                            <Link
                              key={cityKey}
                              to={`/${industry.slug}-${cityKey}`}
                              style={{
                                padding: "6px 12px", borderRadius: 999,
                                background: "rgba(15, 108, 189, 0.08)",
                                color: "var(--text-1)",
                                border: "1px solid rgba(15, 108, 189, 0.2)",
                                fontSize: 13, fontWeight: 500,
                                textDecoration: "none",
                                display: "inline-flex", alignItems: "center", gap: 4,
                              }}
                            >
                              <MapPin size={12} aria-hidden="true" />
                              {city.city}
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <div style={{
            marginTop: 36, padding: "20px 24px", borderRadius: 12,
            background: "var(--syn-surface, #f9fafb)",
            border: "1px solid var(--syn-border, #e5e7eb)",
          }}>
            <h2 className="title-2" style={{ marginTop: 0, fontSize: "1.2rem" }}>Don't see your industry?</h2>
            <p className="section-sub" style={{ marginBottom: 14 }}>
              The page above lists the verticals we have city-specific
              dedicated copy for. We also support most other small-business
              types — accounting, marketing/PR, professional services,
              property management, retail, light manufacturing, and similar.
              The IT services and the engagement model are the same; the
              compliance specifics shift. Tell us what you do and we'll
              outline a fit on a free 30-minute call.
            </p>
            <Link to="/book" className="btn btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              Book a free consult <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
