import { Link } from "../lib/Link";
import {
  Briefcase, ArrowRight, MapPin, Stethoscope, Scale, TrendingUp, Anchor,
  HardHat, KeyRound,
} from "lucide-react";
import { useSEO, SITE_URL } from "../lib/seo";
import { industries, matchIndustryPattern } from "../data/industries";
import { cities } from "../data/cities";

// Lucide icon per industry - keeps the hub page visually scannable so
// a visitor can find their vertical in 3 seconds without reading copy.
const ICONS = {
  medical:           Stethoscope,
  "law-firm":        Scale,
  "financial-advisor": TrendingUp,
  marine:            Anchor,
  construction:      HardHat,
  "vacation-rental": KeyRound,
};

// Service-area umbrella copy - Florida-flavored so the page can rank
// for "florida [industry] it support" queries that don't include a
// specific city. Each industry section then cascades into city links.
const HUB_INTRO = `Florida small-business IT looks different from the national playbook. Hurricane season, snowbird traffic, FIPA + FTC Safeguards on top of HIPAA, a healthcare market the size of some entire states packed into Sarasota and Manatee counties - every industry we serve has its own version of "what works on the Gulf Coast." This page is the index: pick your industry, then drill into the city closest to your office.`;

export default function IndustriesHub() {
  useSEO({
    title: "Industry IT Support for Florida SMBs | Simple IT SRQ",
    description:
      "IT support for medical, legal, finance, marine, construction, and vacation-rental teams across Sarasota, Bradenton, Venice, and Lakewood Ranch.",
    canonical: `${SITE_URL}/industries`,
    image: `${SITE_URL}/og-industries.png`,
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
              IT support by industry - across the Florida Gulf Coast
            </h1>
            <p className="lede">{HUB_INTRO}</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 24 }}>
            {Object.values(industries).map((industry) => {
              const Icon = ICONS[Object.keys(industries).find((k) => industries[k] === industry)] || Briefcase;
              // Build a list of (cityKey, city) for cities where this
              // industry has a real matching pattern. Hides verticals
              // we don't actually serve in a particular city - keeps the
              // hub page honest, no thin links.
              const liveCityPairs = industry.cities
                .map((cityKey) => ({ cityKey, city: cities[cityKey] }))
                .filter(({ city }) => city && matchIndustryPattern(industry, city));

              if (liveCityPairs.length === 0) return null;

              return (
                <article
                  key={industry.slug}
                  className="card card-border bg-base-100 border-l-4 border-l-neutral"
                >
                  <div className="card-body">
                    <div className="flex items-start gap-4">
                      <div className="grid place-items-center w-11 h-11 rounded-lg bg-neutral/10 text-neutral shrink-0">
                        <Icon size={22} aria-hidden="true" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="text-xl font-semibold mt-0 mb-1.5">{industry.displayName}</h2>
                        <p className="m-0 mb-3.5 text-sm text-base-content/70 leading-relaxed">
                          {industry.intro.slice(0, 320)}{industry.intro.length > 320 ? "…" : ""}
                        </p>

                        <div className="mt-2 p-2.5 rounded-lg bg-base-200 border border-base-300">
                          <p className="m-0 mb-2 text-xs font-semibold text-base-content/60">
                            {industry.displayName} IT support, by city
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {liveCityPairs.map(({ cityKey, city }) => (
                              <Link
                                key={cityKey}
                                to={`/${industry.slug}-${cityKey}`}
                                className="badge badge-outline badge-neutral gap-1 py-2 px-3 no-underline"
                              >
                                <MapPin size={12} aria-hidden="true" />
                                {city.city}
                              </Link>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="card card-border bg-base-100 mt-9">
            <div className="card-body">
              <h2 className="text-xl font-semibold mt-0">Don't see your industry?</h2>
              <p className="text-sm text-base-content/70 leading-relaxed mb-3.5">
                The page above lists the verticals we have city-specific
                dedicated copy for. We also support most other small-business
                types - accounting, marketing/PR, professional services,
                property management, retail, light manufacturing, and similar.
                The IT services and the engagement model are the same; the
                compliance specifics shift. Tell us what you do and we'll
                outline a fit on a free 30-minute call.
              </p>
              <Link to="/book" className="btn btn-primary self-start">
                Book a free consult <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
