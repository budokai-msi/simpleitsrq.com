import { Link } from "react-router-dom";
import { MapPin, Phone, ArrowRight } from "lucide-react";
import { useSEO, SITE_URL } from "../lib/seo";

// Coverage cards. Coords are relative (0-100) inside the SVG viewBox so
// nudging the map art later doesn't require recomputing pin positions.
// Drive-time + SLA fields were retired — we don't promise response
// windows or trip times publicly anymore.
const COVERAGE = [
  {
    slug: "bradenton-it-support",
    name: "Bradenton",
    tag: "Our home base",
    x: 46,
    y: 18,
  },
  {
    slug: "lakewood-ranch-it-support",
    name: "Lakewood Ranch",
    tag: "UTC, Main Street, Center Point",
    x: 82,
    y: 26,
  },
  {
    slug: "sarasota-it-support",
    name: "Sarasota",
    tag: "Downtown, St. Armands, Fruitville",
    x: 40,
    y: 48,
  },
  {
    slug: "nokomis-it-support",
    name: "Nokomis",
    tag: "Casey Key, US-41, Laurel",
    x: 52,
    y: 72,
  },
  {
    slug: "venice-it-support",
    name: "Venice",
    tag: "Venice Ave, Jacaranda, Airport",
    x: 48,
    y: 86,
  },
];

// Simplified SVG of the SW Florida coastline between Anna Maria Island
// and Englewood. Not cartographically exact — this is a wayfinding
// illustration, not a reference map.
function CoverageMap() {
  return (
    <div className="service-map">
      <svg
        viewBox="0 0 400 500"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Service area map of Southwest Florida showing Bradenton, Lakewood Ranch, Sarasota, Nokomis, and Venice"
        className="service-map-svg"
      >
        <defs>
          <linearGradient id="gulf" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#BFE4F7" />
            <stop offset="100%" stopColor="#87C9EA" />
          </linearGradient>
          <linearGradient id="land" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F4F8EE" />
            <stop offset="100%" stopColor="#E6EFD6" />
          </linearGradient>
        </defs>

        <rect width="400" height="500" fill="url(#gulf)" />
        <path
          d="M 400 0 L 400 500 L 80 500 Q 140 420 110 340 Q 80 260 160 200 Q 210 140 180 80 Q 150 30 200 0 Z"
          fill="url(#land)"
          stroke="#5C8B2E"
          strokeWidth="1.5"
          strokeOpacity="0.35"
        />

        <path
          d="M 80 500 Q 140 420 110 340 Q 80 260 160 200 Q 210 140 180 80 Q 150 30 200 0"
          fill="none"
          stroke="#2F6FA8"
          strokeWidth="2"
          strokeOpacity="0.6"
        />

        <text x="40" y="250" fontSize="11" fill="#3873A5" fontFamily="system-ui, sans-serif" fontWeight="500" opacity="0.7">Gulf of Mexico</text>

        {COVERAGE.map((c) => {
          const cx = (c.x / 100) * 400;
          const cy = (c.y / 100) * 500;
          return (
            <g key={c.slug}>
              <circle cx={cx} cy={cy} r="14" fill="#0F6CBD" opacity="0.15" />
              <circle cx={cx} cy={cy} r="6" fill="#0F6CBD" />
              <circle cx={cx} cy={cy} r="2" fill="#fff" />
              <text
                x={cx + 12}
                y={cy + 4}
                fontSize="13"
                fill="#222"
                fontFamily="system-ui, sans-serif"
                fontWeight="600"
              >
                {c.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function ServiceArea() {
  useSEO({
    title: "Service Area | IT Support for Sarasota, Bradenton, Venice, Lakewood Ranch, and Nokomis",
    description: "Simple IT SRQ covers all of Sarasota County and Manatee County — Bradenton, Sarasota, Lakewood Ranch, Venice, and Nokomis. Local IT support, computer repair, security cameras, and enterprise IT for businesses and homes. Flat monthly pricing for businesses.",
    canonical: `${SITE_URL}/service-area`,
    image: `${SITE_URL}/og-image.png`,
    breadcrumbs: [
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Service Area", url: `${SITE_URL}/service-area` },
    ],
  });

  return (
    <main id="main" className="service-area-main">
      <section className="section service-area-hero">
        <div className="container">
          <span className="eyebrow">Where We Work</span>
          <h1 className="display">Serving Southwest Florida — businesses and homes.</h1>
          <p className="lede">
            From Bradenton through Lakewood Ranch, down to Sarasota and
            south to Venice and Nokomis. Local techs across the region —
            for offices, retail, residential, and snowbird condos alike.
          </p>
          <div className="service-area-meta">
            <span><MapPin size={14} /> 5 covered markets</span>
            <span><Phone size={14} /> <a href="tel:+14072421456">(407) 242-1456</a></span>
          </div>
        </div>
      </section>

      <section className="section service-area-map-wrap">
        <div className="container">
          <CoverageMap />
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <h2 className="title-2">Our covered markets</h2>
          <p className="section-lede">
            Click any market below to see the local landing page — neighborhood
            detail, FAQ, pricing examples, and the specific industries we
            support in that town.
          </p>
          <div className="service-area-cards">
            {COVERAGE.map((c) => (
              <Link to={`/${c.slug}`} key={c.slug} className="service-area-card">
                <div className="service-area-card-head">
                  <MapPin size={18} />
                  <h3 className="service-area-card-name">{c.name}</h3>
                </div>
                <p className="service-area-card-tag">{c.tag}</p>
                <span className="service-area-card-cta">
                  IT support in {c.name} <ArrowRight size={14} />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section service-area-outro">
        <div className="container" style={{ textAlign: "center" }}>
          <h2 className="title-2">Not on the list? Ask us anyway.</h2>
          <p className="lede" style={{ maxWidth: 680, margin: "0 auto 24px" }}>
            We cover Englewood from Venice, Palmetto and Ellenton from Bradenton,
            and Osprey and Laurel from either direction. If your office is within
            an hour of Bradenton, there's a good chance we already serve a
            neighbor.
          </p>
          <Link to="/book" className="btn btn-primary btn-lg">Book a Free Call</Link>
        </div>
      </section>
    </main>
  );
}
