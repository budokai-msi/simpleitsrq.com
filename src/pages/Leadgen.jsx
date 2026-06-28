import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { Link } from "../lib/Link";
import {
  ArrowRight, Check, Database, Mail, Building2,
  Search, Phone, FileText, Sparkles,
} from "lucide-react";
import { useSEO, SITE_URL } from "../lib/seo";
import { trackEvent } from "../lib/analytics.js";
import { csrfFetch } from "../lib/csrf";

const LEADGEN_PROMO_CODE = "LAUNCH20";
const LEADGEN_STRIPE_LINKS = {
  growth: {
    monthly: "https://buy.stripe.com/8x2cMYaAX3qg648aUlak01y",
    annual: "https://buy.stripe.com/9B65kwgZl4uk9gk7I9ak01z",
  },
  pro: {
    monthly: "https://buy.stripe.com/14A8wI5gDbWM0JO9Qhak01A",
    annual: "https://buy.stripe.com/4gM28kaAX1i8eAE0fHak01B",
  },
};

function stripeSafeParam(value, fallback = "leadgen") {
  const safe = String(value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return safe || fallback;
}

function leadgenCheckoutReference({
  tierId = "growth",
  billing = "monthly",
  source = "leadgen",
  checkoutContext = {},
} = {}) {
  const parts = [
    "lg",
    stripeSafeParam(tierId),
    stripeSafeParam(billing),
  ];
  const zip = String(checkoutContext.zip || "").replace(/\D/g, "").slice(0, 5);
  if (zip) parts.push("zip", zip);
  if (checkoutContext.niche && checkoutContext.niche !== "All") {
    parts.push("niche", stripeSafeParam(checkoutContext.niche));
  }
  const kept = Number(checkoutContext.kept);
  if (Number.isFinite(kept) && kept >= 0) parts.push("kept", String(Math.round(kept)));
  const dailyCap = Number(checkoutContext.dailyCap);
  if (Number.isFinite(dailyCap) && dailyCap > 0) parts.push("cap", String(Math.round(dailyCap)));
  parts.push("src", stripeSafeParam(source));
  return parts.join("_").slice(0, 150);
}

function parseLeadgenCheckoutReference(value) {
  const raw = stripeSafeParam(value, "");
  if (!raw) return {};
  const parts = raw.split("_").filter(Boolean);
  const parsed = {};
  if (parts.includes("growth")) parsed.tier = "growth";
  else if (parts.includes("pro")) parsed.tier = "pro";
  else if (parts.includes("sample") || parts.includes("free")) parsed.tier = "sample";
  if (parts.includes("annual")) parsed.cadence = "annual";
  else if (parts.includes("monthly")) parsed.cadence = "monthly";
  const readAfter = (key) => {
    const index = parts.indexOf(key);
    return index >= 0 ? parts[index + 1] : "";
  };
  const zip = readAfter("zip");
  if (/^\d{5}$/.test(zip)) parsed.zip = zip;
  const kept = readAfter("kept");
  if (/^\d+$/.test(kept)) parsed.kept = kept;
  const nicheIndex = parts.indexOf("niche");
  if (nicheIndex >= 0) {
    const stopKeys = new Set(["kept", "cap", "src"]);
    const nicheParts = [];
    for (let i = nicheIndex + 1; i < parts.length && !stopKeys.has(parts[i]); i += 1) {
      nicheParts.push(parts[i]);
    }
    if (nicheParts.length) parsed.niche = nicheParts.map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
  }
  return parsed;
}

function withLeadgenCheckoutParams(url, options = {}) {
  if (!url) return "";
  try {
    const next = new URL(url);
    if (!next.searchParams.has("prefilled_promo_code")) {
      next.searchParams.set("prefilled_promo_code", LEADGEN_PROMO_CODE);
    }
    const reference = leadgenCheckoutReference(options);
    next.searchParams.set("client_reference_id", reference.slice(0, 200));
    next.searchParams.set("utm_source", "simpleitsrq_com");
    next.searchParams.set("utm_medium", "leadgen");
    next.searchParams.set("utm_campaign", "leadgen_checkout");
    next.searchParams.set("utm_content", reference.slice(0, 150));
    return next.toString();
  } catch {
    const glue = url.includes("?") ? "&" : "?";
    return url.includes("prefilled_promo_code=")
      ? url
      : `${url}${glue}prefilled_promo_code=${encodeURIComponent(LEADGEN_PROMO_CODE)}`;
  }
}

const TIERS = [
  {
    id: "growth",
    name: "Growth",
    monthly: 19,
    annual: 15,
    blurb: "One zip, one service category, reviewed before outreach.",
    cta: "Start Growth",
    ctaHref: "/book?topic=leadgen-growth&utm_source=leadgen_page&utm_medium=pricing_card&utm_campaign=growth",
    stripeMonthly: import.meta.env.VITE_LEADGEN_GROWTH_MONTHLY_URL || LEADGEN_STRIPE_LINKS.growth.monthly,
    stripeAnnual: import.meta.env.VITE_LEADGEN_GROWTH_ANNUAL_URL || LEADGEN_STRIPE_LINKS.growth.annual,
    highlight: true,
    badge: "Start here",
    features: [
      "1 zip-radius search per day",
      "Up to 500 verified business records / month",
      "Email extraction from business websites",
      "1 reviewed outreach campaign",
      "All industries — any local niche",
      "CSV export with emails included",
      "Webhook + Mailchimp + HubSpot integrations",
      "1-business-day onboarding review",
    ],
  },
  {
    id: "free",
    name: "Sample",
    monthly: 0,
    annual: 0,
    blurb: "A quick look before you pay.",
    cta: "Request sample",
    ctaHref: "/book?topic=leadgen-free&utm_source=leadgen_page&utm_medium=pricing_card&utm_campaign=sample",
    stripeMonthly: null,
    stripeAnnual: null,
    highlight: false,
    features: [
      "1 zip-radius search (lifetime)",
      "Up to 10 verified business records",
      "Email verification preview (3 contacts)",
      "Source fields included",
      "CSV export",
      "Email support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthly: 99,
    annual: 79,
    blurb: "For repeated scans across several local markets.",
    cta: "Start Pro",
    ctaHref: "/book?topic=leadgen-pro&utm_source=leadgen_page&utm_medium=pricing_card&utm_campaign=pro",
    stripeMonthly: import.meta.env.VITE_LEADGEN_PRO_MONTHLY_URL || LEADGEN_STRIPE_LINKS.pro.monthly,
    stripeAnnual: import.meta.env.VITE_LEADGEN_PRO_ANNUAL_URL || LEADGEN_STRIPE_LINKS.pro.annual,
    highlight: false,
    features: [
      "Unlimited zip-radius searches",
      "Up to 5,000 verified business records / month",
      "Bulk email extraction (up to 10 domains at once)",
      "5 concurrent outreach campaigns",
      "HubSpot, Mailchimp, ActiveCampaign, GoHighLevel, Zapier",
      "Open, click, and reply tracking",
      "Priority email support",
      "Quarterly deliverability review",
    ],
  },
];

const PROOF_POINTS = [
  { label: "Works for", value: "Any local niche", detail: "IT, trades, healthcare, retail, restaurants, salons, and more" },
  { label: "Start with", value: "1 zip", detail: "Keep the market focused before scaling" },
  { label: "First pass", value: "35/day", detail: "Capped outreach, not a blast list" },
  { label: "Price", value: "$19/mo", detail: "Cancel if the niche isn't useful" },
];

const SERVICE_USE_CASES = [
  { title: "Trades & home services", body: "Plumbers, roofers, HVAC, landscapers, pest control, cleaners. Independent shops that need more work and actually answer their phone." },
  { title: "Healthcare & professional offices", body: "Dentists, clinics, law firms, accountants, insurance offices. Steady buyers with real budgets — filter by zip and go." },
  { title: "Restaurants, shops & hospitality", body: "Cafés, salons, gyms, boutiques, hotels. Any local business that writes checks to vendors is a prospect." },
];

const EMPTY_SCAN_STEPS = [
  { label: "1. Scan", body: "Enter a zip and service category." },
  { label: "2. Keep", body: "Review the businesses worth contacting." },
  { label: "3. Act", body: "Export, open workspace, or book help." },
];

const PUBLIC_NICHES = [
  "All",
  "Healthcare",
  "Trades",
  "Professional Services",
  "Automotive",
  "Hospitality",
  "Personal Services",
  "Retail",
  "Food & Drink",
  "Education",
  "Real Estate",
  "Cleaning & Maintenance",
  "Media & Creative",
  "Recreation",
];

const SCAN_LIMIT = 80;
const SCAN_CACHE_TTL = 5 * 60 * 1000;

const REVIEW_COPY = {
  keep: "Ready for the first reviewed campaign pass.",
  maybe: "Worth another look before export or outreach.",
  reject: "Leave out of this campaign.",
};

const LEADGEN_FAQS = [
  {
    q: "Can I search any U.S. zip code?",
    a: "Yes. Enter a 5-digit U.S. zip, choose any industry category, and run the scan.",
  },
  {
    q: "Is this limited to IT or technology businesses?",
    a: "No. The scanner covers every industry — food & drink, retail, healthcare, trades, professional services, automotive, hospitality, and more. Pick the niche you serve.",
  },
  {
    q: "Does it find email addresses?",
    a: "Yes. Growth and Pro plans include email extraction: the crawler visits each business website, pulls mailto links and text-pattern emails, scores them by confidence, and adds them to your export.",
  },
  {
    q: "Can I push leads to my CRM or email platform?",
    a: "Yes. Premium plans include webhook, Mailchimp, HubSpot, ActiveCampaign, GoHighLevel, and Zapier integrations. Configure them from your workspace and push leads with one click.",
  },
  {
    q: "Will this book jobs by itself?",
    a: "No. It builds a reviewed local list and keeps outreach controlled. The offer, follow-up, and close still depend on you.",
  },
];

const PRIORITY_NICHES = ["All", "Healthcare", "Trades", "Professional Services", "Retail", "Food & Drink", "Real Estate", "Cleaning & Maintenance"];

const BOOK_DEMO_URL = "/book?topic=leadgen-demo&utm_source=leadgen_page&utm_medium=cta&utm_campaign=demo";
const LEADGEN_PRODUCTS = TIERS.filter((tier) => tier.id !== "free").map((tier) => ({
  slug: `leadgen-${tier.id}`,
  title: `Leadgen ${tier.name}`,
  description: tier.blurb,
  price: tier.monthly,
  buyLink: tier.stripeMonthly || tier.ctaHref,
}));

function Currency({ value }) {
  if (value == null) return <span className="leadgen-tier__price-custom">Custom</span>;
  if (value === 0) return (
    <span className="leadgen-tier__price">
      <span className="leadgen-tier__price-num">Free</span>
    </span>
  );
  return (
    <span className="leadgen-tier__price">
      <span className="leadgen-tier__price-currency">$</span>
      <span className="leadgen-tier__price-num">{value}</span>
      <span className="leadgen-tier__price-suffix">/mo</span>
    </span>
  );
}

function LeadgenPlanLink({
  tierId = "growth",
  billing = "monthly",
  className = "btn btn-primary",
  children,
  onClick,
  source = "leadgen_pricing",
  context = null,
  ctaId = null,
  checkoutContext = {},
}) {
  const tier = TIERS.find((t) => t.id === tierId) || TIERS.find((t) => t.id === "growth") || TIERS[0];
  const rawStripeUrl = billing === "annual" ? tier.stripeAnnual : tier.stripeMonthly;
  const checkoutReference = leadgenCheckoutReference({ tierId: tier.id, billing, source, checkoutContext });
  const stripeUrl = withLeadgenCheckoutParams(rawStripeUrl, { tierId: tier.id, billing, source, checkoutContext });
  const onPlanClick = () => {
    trackEvent("begin_checkout", {
      plan: tier.id,
      billing_cycle: billing,
      value: tier.id === "free" ? 0 : (billing === "annual" ? tier.annual : tier.monthly),
      source,
      checkout_reference: checkoutReference,
      ...(context ? { context } : {}),
    });
    if (typeof onClick === "function") onClick();
  };
  if (stripeUrl) {
    return (
      <a href={stripeUrl} className={className} rel="noopener noreferrer" data-leadgen-cta={ctaId || source} onClick={onPlanClick}>
        {children || tier.cta} <ArrowRight size={16} />
      </a>
    );
  }
  return (
    <Link to={tier.ctaHref} className={className} data-leadgen-cta={ctaId || source} onClick={onPlanClick}>
      {children || tier.cta} <ArrowRight size={16} />
    </Link>
  );
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

// A role / corporate inbox (sales@, info@, contact@…) rather than a personal
// address — the kind you can email-blast. Surfaced as a badge in the list.
const ROLE_EMAIL_RE = /^(sales|info|contact|hello|support|admin|office|reception|team|enquiries|enquiry|inquiries|marketing|hr|careers|jobs|help|service|billing|accounts)@/i;
function isRoleEmail(email) {
  return typeof email === "string" && ROLE_EMAIL_RE.test(email.trim());
}

function downloadCsv(filename, rows) {
  const hasEmails = rows.some((r) => r.email || r.emails?.length);
  const headers = ["status", "name", "industry", "sub_industry", "address", "city", "state", "zip", "website", "phone", "source_url"];
  if (hasEmails) headers.push("email", "email_confidence");
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => {
      const base = headers.slice(0, hasEmails ? -2 : undefined).map((key) => csvCell(row[key]));
      if (hasEmails) {
        const firstEmail = row.email || (Array.isArray(row.emails) ? row.emails[0]?.email : "") || "";
        const conf = row.email_confidence ?? (Array.isArray(row.emails) ? row.emails[0]?.confidence : null) ?? "";
        base.push(csvCell(firstEmail), csvCell(conf !== "" ? Number(conf).toFixed(2) : ""));
      }
      return base.join(",");
    }),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function hostFor(url) {
  if (!url) return "No website";
  try { return new URL(url).host.replace(/^www\./, ""); } catch { return url; }
}

function sourceFor(row) {
  if (!row?.source_url) return "Source pending";
  try { return new URL(row.source_url).host.replace(/^www\./, ""); } catch { return "Source record"; }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function asPoint(row) {
  const lat = Number(row?.lat);
  const lng = Number(row?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function scanKey(zip, niche) {
  return `${zip}:${niche || "All"}:${SCAN_LIMIT}`;
}

function rowSearchText(row) {
  return [
    row.name,
    row.address,
    row.city,
    row.state,
    row.zip,
    row.website,
    row.phone,
    row.industry_group,
    row.sub_industry,
    row.source_id,
    row.source_url,
  ].filter(Boolean).join(" ").toLowerCase();
}
function normalizedGeoPoints(rows, cap = 120) {
  const pts = rows
    .slice(0, cap)
    .map((r) => ({ point: asPoint(r), row: r }))
    .filter((r) => r.point);
  if (!pts.length) return [];
  const lats = pts.map((p) => p.point.lat);
  const lngs = pts.map((p) => p.point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = Math.max(0.0001, maxLat - minLat);
  const lngSpan = Math.max(0.0001, maxLng - minLng);
  return pts.map((p) => ({
    x: ((p.point.lng - minLng) / lngSpan) * 100,
    y: (1 - (p.point.lat - minLat) / latSpan) * 100,
    label: p.row?.name || "Business",
  }));
}

function mapsQueryFor(row, fallback = "") {
  const parts = [row?.name, row?.address, row?.city, row?.state, row?.zip].filter(Boolean);
  const query = parts.join(", ").trim();
  return query || fallback;
}

function LeadgenMap({ rows, scan, selectedIndex, onSelect }) {
  const mapRef = useRef(null);
  const fallbackLoggedRef = useRef(false);
  const [mapError, setMapError] = useState("");
  const [themeMode, setThemeMode] = useState(
    document.documentElement?.getAttribute("data-theme") === "dark" ? "dark" : "light",
  );
  const mappedRows = useMemo(() => (
    rows
      .map((row, index) => ({ row, index: row.__scanIndex ?? index, point: asPoint(row) }))
      .filter((item) => item.point)
  ), [rows]);
  const fallbackPoints = useMemo(() => normalizedGeoPoints(rows), [rows]);
  const centroid = asPoint(scan?.centroid);
  const topRow = rows?.[0] || null;
  const openMapsSearch = useMemo(() => {
    const q = mapsQueryFor(topRow, scan?.label || "");
    return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : "";
  }, [scan?.label, topRow]);
  const openMapsCenter = useMemo(() => {
    if (!centroid) return "";
    return `https://www.google.com/maps/@${centroid.lat},${centroid.lng},13z`;
  }, [centroid]);

  useEffect(() => {
    const root = document.documentElement;
    if (!root) return undefined;
    const observer = new MutationObserver(() => {
      setThemeMode(root.getAttribute("data-theme") === "dark" ? "dark" : "light");
    });
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mappedRows.length) return undefined;

    let disposed = false;
    let leafletMap = null;
    setMapError("");

    import("leaflet")
      .then((mod) => {
        if (disposed || !mapRef.current) return;
        const L = mod.default || mod;
        const isDark = themeMode === "dark";
        const tileProviders = isDark
          ? [
              {
                url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                attribution: "&copy; OpenStreetMap contributors",
              },
              {
                url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
                attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
              },
              {
                url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
                attribution: "Tiles &copy; Esri",
              },
            ]
          : [
              {
                url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                attribution: "&copy; OpenStreetMap contributors",
              },
              {
                url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
                attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
              },
              {
                url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
                attribution: "Tiles &copy; Esri",
              },
            ];
        let activeTileIndex = 0;
        let tileFailures = 0;
        let tileLayer = null;

        const mountTileLayer = () => {
          const provider = tileProviders[activeTileIndex];
          tileLayer = L.tileLayer(provider.url, {
            maxZoom: 19,
            attribution: provider.attribution,
            crossOrigin: true,
          }).addTo(leafletMap);
          tileLayer.on("tileerror", () => {
            tileFailures += 1;
            if (tileFailures < 4) return;
            if (disposed || !leafletMap || activeTileIndex >= tileProviders.length - 1) {
              if (!fallbackLoggedRef.current) {
                trackEvent("exception", {
                  source: "leadgen_public_map_tiles",
                  fatal: false,
                  context: "scanner_map",
                });
                fallbackLoggedRef.current = true;
              }
              setMapError("Live map tiles are blocked on this network/browser. Review list and export still work.");
              return;
            }
            activeTileIndex += 1;
            leafletMap.removeLayer(tileLayer);
            mountTileLayer();
          });
        };

        leafletMap = L.map(mapRef.current, {
          attributionControl: false,
          scrollWheelZoom: false,
          zoomControl: true,
        });
        mountTileLayer();
        L.control.attribution({ prefix: false }).addTo(leafletMap);

        const bounds = [];
        mappedRows.forEach(({ row, index, point }) => {
          bounds.push([point.lat, point.lng]);
          const marker = L.marker([point.lat, point.lng], {
            icon: L.divIcon({
              className: `leadgen-map-pin${index === selectedIndex ? " is-active" : ""}`,
              html: "<span></span>",
              iconSize: [30, 30],
              iconAnchor: [15, 30],
              popupAnchor: [0, -30],
            }),
          }).addTo(leafletMap);

          marker.bindPopup(`
            <div class="leadgen-map-popup">
              <strong>${escapeHtml(row.name)}</strong>
              <span>${escapeHtml([row.sub_industry || row.industry_group, row.city || row.address].filter(Boolean).join(" - "))}</span>
              <a href="${escapeHtml(row.website || row.source_url || "#")}" target="_blank" rel="noopener noreferrer">${escapeHtml(hostFor(row.website || row.source_url))}</a>
            </div>
          `);
          marker.on("click", () => onSelect(index));
          if (index === selectedIndex) marker.openPopup();
        });

        if (bounds.length > 1) {
          leafletMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
        } else {
          const only = bounds[0] || [centroid?.lat || 27.3364, centroid?.lng || -82.5307];
          leafletMap.setView(only, 14);
        }

        window.setTimeout(() => {
          if (!disposed && leafletMap) leafletMap.invalidateSize();
        }, 80);
      })
      .catch(() => {
        if (!disposed) {
          setMapError("Map runtime failed to initialize. You can still use filters, reviewed list, and export.");
        }
      });

    return () => {
      disposed = true;
      if (leafletMap) leafletMap.remove();
    };
  }, [centroid?.lat, centroid?.lng, mappedRows, onSelect, selectedIndex, themeMode]);

  return (
    <section className="leadgen-map-card" aria-label="Market map">
      <div className="leadgen-map-card__head">
        <div>
          <span>Market map</span>
          <strong>{mappedRows.length ? `${mappedRows.length} ${mappedRows.length === 1 ? "business" : "businesses"} plotted` : "No mapped records yet"}</strong>
        </div>
        <span>{scan ? "Mapped from public records" : "Awaiting scan"}</span>
      </div>
      <div className="leadgen-map-shell">
        <div ref={mapRef} className="leadgen-map" aria-hidden={!mappedRows.length} />
        {mapError && fallbackPoints.length ? (
          <div className="leadgen-map-fallback" aria-label="Fallback map using local coordinates">
            {fallbackPoints.map((p, i) => (
              <span key={`${p.label}-${i}`} className="leadgen-map-fallback__dot" style={{ left: `${p.x}%`, top: `${p.y}%` }} title={p.label} />
            ))}
          </div>
        ) : null}
        {!mappedRows.length || mapError ? (
          <div className="leadgen-map-empty">
            <span>
              {mapError || "Run a scan to plot public business records in this market."}
              {mapError ? " You can still use the reviewed list, filters, and export below." : ""}
            </span>
            {mapError ? (
              <div className="leadgen-map-empty__actions">
                {openMapsSearch ? (
                  <a
                    className="btn btn-secondary btn-sm"
                    href={openMapsSearch}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackEvent("select_content", { content_type: "leadgen_map_fallback", destination: "google_maps_search" })}
                  >
                    Open in Google Maps
                  </a>
                ) : null}
                {openMapsCenter ? (
                  <a
                    className="btn btn-secondary btn-sm"
                    href={openMapsCenter}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackEvent("select_content", { content_type: "leadgen_map_fallback", destination: "google_maps_center" })}
                  >
                    Open market center
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

// Animated count-up for the scan payoff numbers. Counts from 0 to `value`
// with an easeOutCubic curve; snaps instantly under prefers-reduced-motion or
// for zero/negative targets. Re-runs whenever the target changes (i.e. on a
// new scan), so reviewing the list doesn't re-trigger the animation.
function CountUp({ value }) {
  const target = Number(value) || 0;
  const [display, setDisplay] = useState(target);
  const rafRef = useRef(0);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || target <= 0) {
      // Snap (no animation) but via rAF so we never setState synchronously
      // inside the effect body.
      rafRef.current = requestAnimationFrame(() => setDisplay(target));
      return () => cancelAnimationFrame(rafRef.current);
    }
    const duration = 850;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(target * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target]);
  return <>{display.toLocaleString()}</>;
}

// Staged, animated "we're working" sequence shown while a scan is in flight.
// Turns a sub-second request into a deliberate input -> processing -> payoff
// beat so the result feels earned rather than dumped.
const SCAN_PROGRESS_STEPS = [
  "Pulling public business records",
  "Filtering to local independents",
  "Crawling sites for email addresses",
  "Flagging national chains",
  "Building your reviewable list",
];
function LeadgenScanProgress() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = window.setInterval(
      () => setStep((s) => Math.min(s + 1, SCAN_PROGRESS_STEPS.length - 1)),
      650
    );
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="leadgen-scan-progress" role="status" aria-live="polite">
      <div className="leadgen-scan-progress__bar"><span /></div>
      <p className="leadgen-scan-progress__step">
        <Search size={14} aria-hidden="true" /> {SCAN_PROGRESS_STEPS[step]}…
      </p>
    </div>
  );
}

function LeadgenScanApp() {
  const scanCacheRef = useRef(new Map());
  const scanPromisesRef = useRef(new Map());
  const initialQuery = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialUrlZipRef = useRef((initialQuery.get("zip") || "").replace(/\D/g, "").slice(0, 5));
  const autoOpenedScanRef = useRef("");
  const refinementRequestRef = useRef(0);
  const [zip, setZip] = useState(() => (initialQuery.get("zip") || "").replace(/\D/g, "").slice(0, 5));
  const [niche, setNiche] = useState(() => {
    const q = initialQuery.get("niche");
    return q && PUBLIC_NICHES.includes(q) ? q : "All";
  });
  const [industryOptions, setIndustryOptions] = useState(PUBLIC_NICHES);
  const [offer, setOffer] = useState(() => initialQuery.get("offer") || "");
  const [dailyCap, setDailyCap] = useState(() => {
    const raw = initialQuery.get("daily_cap");
    const q = Number(raw);
    if (!raw || !Number.isFinite(q)) return 35;
    return Math.max(5, Math.min(100, Math.round(q)));
  });
  const [scan, setScan] = useState(null);
  const [review, setReview] = useState({});
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [searchTerm, setSearchTerm] = useState(() => initialQuery.get("q") || "");
  const [statusFilter, setStatusFilter] = useState(() => {
    const q = initialQuery.get("status");
    return ["all", "keep", "maybe", "reject"].includes(q || "") ? q : "all";
  });
  const [contactFilter, setContactFilter] = useState(() => {
    const q = initialQuery.get("contact");
    return ["all", "website", "phone", "missing-website", "missing-phone", "mapped"].includes(q || "") ? q : "all";
  });
  const [subIndustryFilter, setSubIndustryFilter] = useState(() => initialQuery.get("sub_industry") || "all");
  const [sortBy, setSortBy] = useState(() => {
    const q = initialQuery.get("sort");
    return ["contact", "name", "city", "status", "mapped"].includes(q || "") ? q : "contact";
  });
  const [prefetchState, setPrefetchState] = useState("idle");
  const [lastScanMeta, setLastScanMeta] = useState(null);
  const [copiedView, setCopiedView] = useState(false);
  const [drawerOpenState, setDrawerOpenState] = useState({ key: "", ready: false, assist: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Connected CRM/webhook destinations for the signed-in customer (empty for
  // anonymous visitors — the GET 401s and we just hide the push control).
  const [destinations, setDestinations] = useState([]);
  const [pushTarget, setPushTarget] = useState("");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState(null);
  const [copiedEmails, setCopiedEmails] = useState(false);
  const [extractedEmails, setExtractedEmails] = useState({}); // website -> best email
  const [extracting, setExtracting] = useState(false);
  const [extractMsg, setExtractMsg] = useState(null);
  // Default to independents-only — the prospect list an IT provider wants.
  // Off only when a shared link explicitly opts back into chains (?independents=0).
  const [independentsOnly, setIndependentsOnly] = useState(() => initialQuery.get("independents") !== "0");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const validZip = /^\d{5}$/.test(zip);
  // Only surface keyboard-shortcut hints on devices that actually have a
  // keyboard — on touch screens they're noise that makes the tool look complex.
  const hasKeyboard = typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(pointer: fine)").matches
    : true;

  const rows = scan?.rows || [];
  const broadenedMapRows = scan?.broadened_rows || [];
  const industryCountMap = useMemo(() => (
    Object.fromEntries((scan?.industry_counts || []).map((item) => [item.industry, Number(item.count) || 0]))
  ), [scan?.industry_counts]);
  const reviewedRows = useMemo(() => (
    (scan?.rows || []).map((row, index) => ({
      ...row,
      status: review[index] || "keep",
    }))
  ), [scan, review]);
  const kept = reviewedRows.filter((row) => row.status === "keep");
  const bestEmail = (row) => row.email || (Array.isArray(row.emails) ? row.emails[0]?.email : null) || extractedEmails[row.website] || null;
  const keptWithEmail = kept.filter((row) => bestEmail(row));
  const keptCorporate = keptWithEmail.filter((row) => isRoleEmail(bestEmail(row))).length;
  const chainCount = reviewedRows.filter((row) => row.is_chain).length;
  const independentCount = reviewedRows.length - chainCount;
  const websites = reviewedRows.filter((row) => row.website).length;
  const phones = reviewedRows.filter((row) => row.phone).length;
  const emailCount = reviewedRows.filter((row) => row.email || (Array.isArray(row.emails) && row.emails.length)).length;
  const projectedSendDays = Math.max(1, Math.ceil(kept.length / Math.max(1, Number(dailyCap) || 35)));
  const recommendedTierId = kept.length >= 120 ? "pro" : "growth";
  const recommendedBilling = kept.length >= 120 ? "annual" : "monthly";
  const recommendedTier = TIERS.find((tier) => tier.id === recommendedTierId) || TIERS[0];
  const growthLimitExceeded = kept.length > 500;
  const proCapacityWarning = kept.length > 5000;
  const drawerScanKey = scan ? [zip, niche, scan.matched ?? 0, rows.length].join(":") : "";
  const defaultReadyDrawerOpen = false;
  const defaultAssistDrawerOpen = false;
  const readyDrawerOpen = drawerOpenState.key === drawerScanKey ? drawerOpenState.ready : defaultReadyDrawerOpen;
  const assistDrawerOpen = drawerOpenState.key === drawerScanKey ? drawerOpenState.assist : defaultAssistDrawerOpen;
  const setActionDrawerOpen = (drawer, open) => {
    setDrawerOpenState((current) => ({
      key: drawerScanKey,
      ready: drawer === "ready" ? open : (current.key === drawerScanKey ? current.ready : defaultReadyDrawerOpen),
      assist: drawer === "assist" ? open : (current.key === drawerScanKey ? current.assist : defaultAssistDrawerOpen),
    }));
  };
  const subIndustryOptions = useMemo(() => (
    Array.from(new Set(reviewedRows.map((row) => row.sub_industry).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  ), [reviewedRows]);
  const visibleRows = useMemo(() => {
    const q = deferredSearchTerm.trim().toLowerCase();
    const statusRank = { keep: 0, maybe: 1, reject: 2 };
    return reviewedRows
      .map((row, index) => ({ row: { ...row, __scanIndex: index }, index }))
      .filter(({ row }) => {
        if (q && !rowSearchText(row).includes(q)) return false;
        if (statusFilter !== "all" && row.status !== statusFilter) return false;
        if (subIndustryFilter !== "all" && row.sub_industry !== subIndustryFilter) return false;
        if (contactFilter === "website" && !row.website) return false;
        if (contactFilter === "phone" && !row.phone) return false;
        if (contactFilter === "missing-website" && row.website) return false;
        if (contactFilter === "missing-phone" && row.phone) return false;
        if (contactFilter === "mapped" && !asPoint(row)) return false;
        if (independentsOnly && row.is_chain) return false;
        return true;
      })
      .sort((a, b) => {
        // Independent local businesses always lead — they're the prospects an
        // IT-services provider actually wants; chains sink to the bottom.
        const chainDelta = (a.row.is_chain ? 1 : 0) - (b.row.is_chain ? 1 : 0);
        if (chainDelta) return chainDelta;
        if (sortBy === "name") return a.row.name.localeCompare(b.row.name);
        if (sortBy === "city") return (a.row.city || "").localeCompare(b.row.city || "") || a.row.name.localeCompare(b.row.name);
        if (sortBy === "status") return (statusRank[a.row.status] ?? 9) - (statusRank[b.row.status] ?? 9) || a.row.name.localeCompare(b.row.name);
        if (sortBy === "mapped") return (asPoint(b.row) ? 1 : 0) - (asPoint(a.row) ? 1 : 0) || a.row.name.localeCompare(b.row.name);
        const ac = (a.row.website ? 2 : 0) + (a.row.phone ? 1 : 0);
        const bc = (b.row.website ? 2 : 0) + (b.row.phone ? 1 : 0);
        return bc - ac || a.row.name.localeCompare(b.row.name);
      });
  }, [contactFilter, deferredSearchTerm, independentsOnly, reviewedRows, sortBy, statusFilter, subIndustryFilter]);
  const visibleOnlyRows = visibleRows.map(({ row }) => row);
  const allVisibleSelected = visibleRows.length > 0
    && visibleRows.every(({ index }) => (review[index] || "keep") === "keep");
  // "Best" = reachable leads: a website plus a phone or an email. The one-click
  // curation that saves the visitor manually triaging the long list.
  const rowHasEmail = (row) => !!(row.email || (Array.isArray(row.emails) && row.emails.length));
  const bestVisible = visibleRows.filter(({ row }) => row.website && (row.phone || rowHasEmail(row)));
  const selectBest = () => {
    if (!visibleRows.length) return;
    setReview((current) => {
      const next = { ...current };
      for (const item of visibleRows) next[item.index] = "reject";
      for (const item of bestVisible) next[item.index] = "keep";
      return next;
    });
    trackEvent("select_content", {
      content_type: "leadgen_select_best",
      source: "leadgen_scanner",
      best_count: bestVisible.length,
      visible_count: visibleRows.length,
    });
  };
  const effectiveSelectedIndex = visibleRows.some((item) => item.index === selectedIndex)
    ? selectedIndex
    : visibleRows[0]?.index ?? null;

  useEffect(() => {
    if (!visibleRows.length) return undefined;
    const onKeyDown = (event) => {
      const target = event.target;
      if (target && (target.closest("input, textarea, select, button, a, [contenteditable='true']"))) return;
      const currentPos = visibleRows.findIndex((item) => item.index === effectiveSelectedIndex);
      if (event.key.toLowerCase() === "j") {
        event.preventDefault();
        const nextPos = currentPos < 0 ? 0 : Math.min(visibleRows.length - 1, currentPos + 1);
        setSelectedIndex(visibleRows[nextPos].index);
        return;
      }
      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        const nextPos = currentPos < 0 ? 0 : Math.max(0, currentPos - 1);
        setSelectedIndex(visibleRows[nextPos].index);
        return;
      }
      if (!["1", "2", "3"].includes(event.key)) return;
      const selectedVisible = visibleRows.find((item) => item.index === effectiveSelectedIndex);
      if (!selectedVisible) return;
      event.preventDefault();
      const nextStatus = event.key === "1" ? "keep" : event.key === "2" ? "maybe" : "reject";
      setReview((current) => ({ ...current, [selectedVisible.index]: nextStatus }));
      trackEvent("select_content", {
        content_type: "leadgen_keyboard_review",
        source: "leadgen_scanner",
        applied_status: nextStatus,
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [effectiveSelectedIndex, visibleRows]);
  const effectivePrefetchState = validZip ? prefetchState : "idle";
  const zipHint = zip && !validZip ? "Enter a valid 5-digit US zip to scan this market." : "";
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const setOrDelete = (key, value, defaultValue = "") => {
      if (value == null || value === "" || value === defaultValue) params.delete(key);
      else params.set(key, value);
    };
    setOrDelete("zip", zip);
    setOrDelete("niche", niche, "All");
    setOrDelete("offer", offer);
    setOrDelete("daily_cap", String(dailyCap || ""), "35");
    setOrDelete("q", searchTerm);
    setOrDelete("status", statusFilter, "all");
    setOrDelete("contact", contactFilter, "all");
    setOrDelete("sub_industry", subIndustryFilter, "all");
    setOrDelete("sort", sortBy, "contact");
    setOrDelete("independents", independentsOnly ? "" : "0", "");
    const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash || ""}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash || ""}`) {
      window.history.replaceState({}, "", next);
    }
  }, [zip, niche, offer, dailyCap, searchTerm, statusFilter, contactFilter, subIndustryFilter, sortBy, independentsOnly]);

  useEffect(() => {
    let disposed = false;
    fetch("/api/leadgen")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (disposed || !Array.isArray(data?.industries)) return;
        const options = Array.from(new Set(data.industries.filter(Boolean)));
        if (options.length) setIndustryOptions(options.includes("All") ? options : ["All", ...options]);
      })
      .catch(() => {});
    return () => { disposed = true; };
  }, []);

  const getScanData = useCallback(async (targetZip, targetNiche) => {
    const key = scanKey(targetZip, targetNiche);
    const cached = scanCacheRef.current.get(key);
    if (cached && Date.now() - cached.savedAt < SCAN_CACHE_TTL) {
      return { data: cached.data, cached: true };
    }

    const pending = scanPromisesRef.current.get(key);
    if (pending) return pending;

    const promise = fetch("/api/leadgen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zip: targetZip, niche: targetNiche, limit: SCAN_LIMIT }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          throw new Error(data.message || data.error || `Scan failed (${res.status})`);
        }
        scanCacheRef.current.set(key, { data, savedAt: Date.now() });
        return { data, cached: false };
      })
      .finally(() => {
        scanPromisesRef.current.delete(key);
    });
    scanPromisesRef.current.set(key, promise);
    return promise;
  }, []);

  const applyScan = (data, meta = {}) => {
    setScan(data);
    // Default the first 20 *independent* businesses to "keep" and leave chains
    // out of the kept set (they default to "maybe") — the prospect list an IT
    // provider starts from should be local independents, not national chains.
    let keptSoFar = 0;
    setReview(Object.fromEntries((data.rows || []).map((row, index) => {
      if (row.is_chain) return [index, "maybe"];
      if (keptSoFar < 20) { keptSoFar += 1; return [index, "keep"]; }
      return [index, "maybe"];
    })));
    setSelectedIndex((data.rows || []).length ? 0 : null);
    if (!meta.preserveView) {
      setSearchTerm("");
      setStatusFilter("all");
      setContactFilter("all");
      setSubIndustryFilter("all");
      setSortBy("contact");
    }
    setLastScanMeta({ ...meta, at: Date.now() });
  };

  useEffect(() => {
    if (!/^\d{5}$/.test(initialUrlZipRef.current) || !validZip || scan) {
      return undefined;
    }

    const key = scanKey(zip, niche);
    if (autoOpenedScanRef.current === key) return undefined;
    autoOpenedScanRef.current = key;

    let disposed = false;
    let completed = false;
    const startedAt = performance.now();
    setBusy(true);
    setErr("");
    getScanData(zip, niche)
      .then((result) => {
        completed = true;
        if (disposed) return;
        applyScan(result.data, { cached: result.cached, preserveView: true, autoOpened: true });
        setPrefetchState("ready");
        trackEvent("search", {
          search_term: `${zip}:${niche}`,
          source: "leadgen_scanner_deeplink",
          result_count: Number(result?.data?.matched || 0),
          cached: Boolean(result?.cached),
          latency_ms: Math.round(performance.now() - startedAt),
        });
      })
      .catch((e) => {
        completed = true;
        if (disposed) return;
        const message = String(e?.message || e || "Scan failed");
        setErr(`The shared scan did not open automatically: ${message}. Try Run scan again or change the zip.`);
        trackEvent("exception", {
          description: message,
          fatal: false,
          source: "leadgen_scanner_deeplink",
        });
      })
      .finally(() => {
        if (!disposed) setBusy(false);
      });

    return () => {
      disposed = true;
      if (!completed && autoOpenedScanRef.current === key) {
        autoOpenedScanRef.current = "";
      }
    };
  }, [getScanData, niche, scan, validZip, zip]);

  useEffect(() => {
    if (!validZip) {
      return undefined;
    }

    const key = scanKey(zip, niche);
    const cached = scanCacheRef.current.get(key);
    if (cached && Date.now() - cached.savedAt < SCAN_CACHE_TTL) {
      setPrefetchState("ready");
      return undefined;
    }

    let disposed = false;
    const timer = window.setTimeout(() => {
      setPrefetchState("loading");
      getScanData(zip, niche)
        .then(() => {
          if (!disposed) setPrefetchState("ready");
        })
        .catch(() => {
          if (!disposed) setPrefetchState("idle");
        });
    }, 650);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [getScanData, niche, validZip, zip]);

  const runScan = async () => {
    const startedAt = performance.now();
    const startedWithWarmCache = effectivePrefetchState === "ready";
    setBusy(true);
    setErr("");
    try {
      const result = await getScanData(zip, niche);
      applyScan(result.data, { cached: result.cached });
      setPrefetchState("ready");
      trackEvent("search", {
        search_term: `${zip}:${niche}`,
        source: "leadgen_scanner",
        result_count: Number(result?.data?.matched || 0),
        cached: Boolean(result?.cached),
        prefetched: startedWithWarmCache || Boolean(result?.cached),
        latency_ms: Math.round(performance.now() - startedAt),
      });
    } catch (e) {
      setErr(String(e.message || e));
      trackEvent("exception", {
        description: String(e?.message || e),
        fatal: false,
        source: "leadgen_scanner",
        prefetched: startedWithWarmCache,
      });
    } finally {
      setBusy(false);
    }
  };

  const onScanKeyDown = (event) => {
    if (event.key !== "Enter") return;
    if (busy || !validZip) return;
    event.preventDefault();
    runScan();
  };

  const exportKeptRows = () => {
    const keptRows = visibleOnlyRows.filter((row) => row.status === "keep");
    if (!keptRows.length) return;
    trackEvent("select_content", {
      content_type: "leadgen_export_kept",
      source: "leadgen_scanner",
      zip,
      niche,
      count: keptRows.length,
    });
    downloadCsv(`leadgen-${zip}-${niche.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-kept.csv`, keptRows);
  };

  const copyAllEmails = async () => {
    const emails = kept.map((r) => bestEmail(r)).filter(Boolean);
    if (!emails.length) return;
    try {
      await navigator.clipboard.writeText(emails.join(", "));
      setCopiedEmails(true);
      window.setTimeout(() => setCopiedEmails(false), 1500);
      trackEvent("select_content", { content_type: "leadgen_copy_emails", source: "leadgen_scanner", count: emails.length });
    } catch {
      setCopiedEmails(false);
    }
  };

  // Crawl the selected businesses' domains for emails (role-based sales@/info@
  // score highest). Premium-gated server-side; anonymous/free users get a 401/
  // 403 and a clear message. Bulk endpoint crawls 10 domains in parallel.
  const findEmails = async () => {
    if (extracting) return;
    const targets = Array.from(
      new Map(kept.filter((r) => r.website && !bestEmail(r)).map((r) => [r.website, r])).values()
    ).slice(0, 30);
    if (!targets.length) {
      setExtractMsg({ ok: true, text: keptWithEmail.length ? "Every selected lead already has an email." : "No websites to crawl in this selection." });
      return;
    }
    setExtracting(true);
    setExtractMsg(null);
    const found = { ...extractedEmails };
    let okCount = 0;
    try {
      for (let i = 0; i < targets.length; i += 10) {
        const batch = targets.slice(i, i + 10);
        const res = await csrfFetch("/api/leadgen-emails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domains: batch.map((r) => r.website) }),
        });
        const j = await res.json().catch(() => ({}));
        if (res.status === 401) { setExtractMsg({ ok: false, text: "Sign in on a Growth or Pro plan to extract emails." }); break; }
        if (res.status === 403) { setExtractMsg({ ok: false, text: j.message || "Bulk email extraction requires a Pro plan." }); break; }
        if (res.status === 429) { setExtractMsg({ ok: false, text: "Hit the crawl rate limit — wait a minute and retry." }); break; }
        if (!res.ok || !Array.isArray(j.results)) { setExtractMsg({ ok: false, text: j.message || j.error || "Extraction failed." }); break; }
        j.results.forEach((result, idx) => {
          const best = Array.isArray(result.emails) && result.emails.length ? result.emails[0].email : null;
          if (best) { found[batch[idx].website] = best; okCount += 1; }
        });
      }
      setExtractedEmails(found);
      if (okCount) {
        setExtractMsg((m) => (m && !m.ok) ? m : { ok: true, text: `Found ${okCount} email${okCount === 1 ? "" : "s"}.` });
        trackEvent("generate_lead", { source: "leadgen_find_emails", count: okCount });
      } else {
        setExtractMsg((m) => m || { ok: false, text: "No emails found on those sites." });
      }
    } catch (e) {
      setExtractMsg({ ok: false, text: e.message || "Extraction failed." });
    } finally {
      setExtracting(false);
    }
  };

  // Load the signed-in customer's connected destinations once. Anonymous
  // visitors get a 401 here and simply never see the push control.
  useEffect(() => {
    let active = true;
    fetch("/api/leadgen-integrations", { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!active || !j || !Array.isArray(j.integrations) || !j.integrations.length) return;
        setDestinations(j.integrations);
        setPushTarget(String(j.integrations[0].id));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const pushSelected = async () => {
    if (!pushTarget || !kept.length || pushBusy) return;
    setPushBusy(true);
    setPushMsg(null);
    try {
      const leads = kept.map((r) => ({
        name: r.name,
        email: r.email || (Array.isArray(r.emails) ? r.emails[0]?.email : undefined),
        phone: r.phone,
        website: r.website,
        address: r.address,
        city: r.city,
        state: r.state,
        zip: r.zip,
        industry_group: r.industry_group,
        industry: r.industry,
        sub_industry: r.sub_industry,
      }));
      const res = await csrfFetch("/api/leadgen-integrations?action=push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: Number(pushTarget), leads }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.ok === false) throw new Error(j.message || j.error || `HTTP ${res.status}`);
      setPushMsg({ ok: true, text: `Pushed ${j.sent ?? leads.length}${j.skipped ? ` (${j.skipped} skipped)` : ""}.` });
      trackEvent("generate_lead", { source: "leadgen_scanner_push", count: leads.length });
    } catch (e) {
      setPushMsg({ ok: false, text: e.message || "Push failed." });
    } finally {
      setPushBusy(false);
    }
  };

  const copyViewLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedView(true);
      window.setTimeout(() => setCopiedView(false), 1500);
      trackEvent("select_content", {
        content_type: "leadgen_share_view",
        source: "leadgen_scanner",
        visible_count: visibleRows.length,
      });
    } catch {
      setCopiedView(false);
    }
  };
  const applyVisibleReview = (nextStatus) => {
    if (!visibleRows.length) return;
    setReview((current) => {
      const next = { ...current };
      for (const item of visibleRows) next[item.index] = nextStatus;
      return next;
    });
    trackEvent("select_content", {
      content_type: "leadgen_bulk_review",
      source: "leadgen_scanner",
      filter_status: statusFilter,
      applied_status: nextStatus,
      visible_count: visibleRows.length,
    });
  };

  const marketTypeMatches = useMemo(() => {
    const priority = new Map(PRIORITY_NICHES.map((item, index) => [item, index]));
    return Array.from(new Set(industryOptions.filter(Boolean)))
      .sort((a, b) => {
        if (a === niche) return -1;
        if (b === niche) return 1;
        const countDelta = (industryCountMap[b] || 0) - (industryCountMap[a] || 0);
        if (countDelta) return countDelta;
        const aPriority = priority.has(a) ? priority.get(a) : 99;
        const bPriority = priority.has(b) ? priority.get(b) : 99;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return a.localeCompare(b);
      })
      .slice(0, 6);
  }, [industryCountMap, industryOptions, niche]);

  const applyMarketRefinement = (nextNiche) => {
    setNiche(nextNiche);
    setErr("");
    trackEvent("select_content", {
      content_type: "leadgen_market_refinement",
      source: "leadgen_scanner",
      zip,
      niche: nextNiche,
    });
    if (!validZip || (scan && nextNiche === niche)) return;

    const requestId = refinementRequestRef.current + 1;
    refinementRequestRef.current = requestId;
    setBusy(true);
    setPrefetchState("loading");
    getScanData(zip, nextNiche || "All")
      .then((result) => {
        if (refinementRequestRef.current !== requestId) return;
        applyScan(result.data, { cached: result.cached, refined: true });
        setPrefetchState("ready");
        trackEvent("search", {
          search_term: `${zip}:${nextNiche}`,
          source: "leadgen_market_refinement",
          result_count: Number(result?.data?.matched || 0),
          cached: Boolean(result?.cached),
        });
      })
      .catch((e) => {
        if (refinementRequestRef.current !== requestId) return;
        const message = String(e?.message || e || "Scan failed");
        setErr(`Could not load ${nextNiche} in ${zip}: ${message}`);
        setPrefetchState("idle");
        trackEvent("exception", {
          description: message,
          fatal: false,
          source: "leadgen_market_refinement",
        });
      })
      .finally(() => {
        if (refinementRequestRef.current === requestId) setBusy(false);
      });
  };

  const prefetchRefinement = useCallback((nextNiche) => {
    if (!validZip) return;
    getScanData(zip, nextNiche || "All")
      .then(() => setPrefetchState((current) => (current === "idle" ? "ready" : current)))
      .catch(() => {});
  }, [getScanData, validZip, zip]);

  const scannerContextParams = useMemo(() => {
    const params = new URLSearchParams();
    if (/^\d{5}$/.test(zip)) params.set("zip", zip);
    if (niche && niche !== "All") params.set("niche", niche);
    if (kept.length) params.set("kept", String(kept.length));
    if (dailyCap) params.set("daily_cap", String(dailyCap));
    return params;
  }, [zip, niche, kept.length, dailyCap]);

  const scannerWorkspaceLink = useMemo(() => {
    const params = new URLSearchParams(scannerContextParams);
    params.set("utm_source", "leadgen_page");
    params.set("utm_medium", "scanner");
    params.set("utm_campaign", "workspace_handoff");
    return `/portal/leadgen?${params.toString()}`;
  }, [scannerContextParams]);

  const scannerResultWorkspaceLink = useMemo(() => {
    const params = new URLSearchParams(scannerContextParams);
    params.set("utm_source", "leadgen_page");
    params.set("utm_medium", "scanner_results");
    params.set("utm_campaign", "workspace_handoff");
    return `/portal/leadgen?${params.toString()}`;
  }, [scannerContextParams]);

  const scannerDemoLink = useMemo(() => {
    const params = new URLSearchParams(scannerContextParams);
    params.set("topic", "leadgen-demo");
    params.set("utm_source", "leadgen_page");
    params.set("utm_medium", "cta");
    params.set("utm_campaign", "demo");
    return `/book?${params.toString()}`;
  }, [scannerContextParams]);

  const scannerCheckoutContext = useMemo(() => ({
    zip,
    niche,
    kept: kept.length,
    dailyCap,
  }), [dailyCap, kept.length, niche, zip]);

  return (
    <section className="leadgen-app-shell" aria-label="Leadgen local market scanner">
      {scan && kept.length > 0 ? (
        <div className="leadgen-selbar" role="region" aria-label="Selected leads — quick actions">
          <span className="leadgen-selbar__count"><strong>{kept.length}</strong> selected</span>
          <div className="leadgen-selbar__actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={exportKeptRows}>Export CSV</button>
            {destinations.length ? (
              <>
                <select
                  className="leadgen-push__select"
                  value={pushTarget}
                  onChange={(e) => setPushTarget(e.target.value)}
                  aria-label="CRM destination"
                  disabled={pushBusy}
                >
                  {destinations.map((d) => <option key={d.id} value={d.id}>{d.label || d.kind}</option>)}
                </select>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => pushSelected()}
                  disabled={pushBusy || !pushTarget}
                >
                  {pushBusy ? "Pushing…" : "Push to CRM"}
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="leadgen-app-panel leadgen-app-panel--control">
        <div className="leadgen-app-topline">
          <span className="leadgen-app-live"><span /> Live public-record scanner</span>
          {/* Workspace handoff is only relevant once a list exists — surface it
              after a scan, not as the first thing a new visitor sees. */}
          {scan ? (
            <Link
              to={scannerWorkspaceLink}
              className="leadgen-app-portal-link"
              data-leadgen-cta="scanner_top_workspace"
              onClick={() => trackEvent("generate_lead", { source: "leadgen_scanner_toplink" })}
            >
              Open campaign workspace
            </Link>
          ) : null}
        </div>

        <div className="leadgen-app-title">
          <h1 className="display">Find local businesses in any industry — with emails.</h1>
          <p>
            Enter any zip and choose an industry. We surface independent local
            businesses, extract email addresses from their websites, flag national
            chains, and hand off a clean reviewed list ready for outreach or CRM import.
          </p>
        </div>

        <div className="leadgen-scan-card">
          <div className="leadgen-app-controls leadgen-app-controls--primary">
            <label>
              <span>Zip code</span>
              <input
                value={zip}
                onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
                onKeyDown={onScanKeyDown}
                inputMode="numeric"
                placeholder="e.g. 34237"
                aria-label="Target zip code"
              />
            </label>
            <label>
              <span>Customer type</span>
              <select value={niche} onChange={(e) => setNiche(e.target.value)} aria-label="Target niche">
                {industryOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <button type="button" className="btn btn-primary" onClick={runScan} disabled={busy || !validZip}>
              <Search size={16} aria-hidden="true" />
              {busy ? "Scanning..." : !validZip ? "Enter zip" : scan ? "Refresh scan" : "Run scan"}
            </button>
          </div>
          {/* Outreach config (offer + send pace) only matters once there's a
              list to act on — keep it out of the pre-scan view so the entry
              is just "where + what + scan". */}
          {scan ? (
            <details className="leadgen-advanced-controls">
              <summary>Outreach settings</summary>
              <div className="leadgen-advanced-controls__grid">
                <label>
                  <span>Offer angle</span>
                  <input
                    value={offer}
                    onChange={(e) => setOffer(e.target.value)}
                    onKeyDown={onScanKeyDown}
                    placeholder="Backup cleanup for busy offices"
                    aria-label="Offer angle"
                  />
                </label>
                <label>
                  <span>Daily send cap</span>
                  <input
                    type="number"
                    min="5"
                    max="100"
                    value={dailyCap}
                    onChange={(e) => setDailyCap(e.target.value)}
                    onKeyDown={onScanKeyDown}
                    aria-label="Daily send cap"
                  />
                </label>
              </div>
            </details>
          ) : null}
        </div>

        {/* Post-scan category refinement. Pre-scan this duplicated the
            Customer-type dropdown; now it only appears once a scan exists,
            where it earns its place by showing the live per-category counts. */}
        {scan ? (
          <details className="leadgen-market-builder" aria-label="Refine by category">
            <summary className="leadgen-market-builder__summary">
              <span>{`${scan.matched || 0} record${scan.matched === 1 ? "" : "s"} loaded`}</span>
              <strong>{`${niche === "All" ? "All businesses" : niche} in ${zip}`}</strong>
              <em>Refine</em>
            </summary>
            <div className="leadgen-market-builder__chips">
              {marketTypeMatches.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`leadgen-market-refinement-btn${item === niche ? " is-active" : ""}`}
                  onClick={() => applyMarketRefinement(item)}
                  onMouseEnter={() => prefetchRefinement(item)}
                  onFocus={() => prefetchRefinement(item)}
                  title={`Scan ${item} in ${zip}`}
                  aria-label={`Switch to ${item} for ZIP ${zip}`}
                >
                  <span>{item === "All" ? "All businesses" : item}</span>
                  <small>
                    {item !== "All"
                      ? `${industryCountMap[item] || 0} found`
                      : item === niche ? "Selected" : "Switch"}
                  </small>
                </button>
              ))}
              {!marketTypeMatches.length ? (
                <div className="leadgen-market-builder__empty">
                  No categories in this scan yet. Use All businesses or scan again.
                </div>
              ) : null}
            </div>
          </details>
        ) : null}
        {zipHint ? <p className="leadgen-app-error" style={{ marginTop: 8 }}>{zipHint}</p> : null}

        {busy ? (
          <LeadgenScanProgress />
        ) : (
          <div className={`leadgen-prefetch leadgen-prefetch--${effectivePrefetchState}`}>
            <span />
            {effectivePrefetchState === "loading" ? "Loading this market…" : null}
            {effectivePrefetchState === "ready" ? "Ready — results load instantly." : null}
            {effectivePrefetchState === "idle" ? (validZip ? "Ready to scan this market." : "Enter a 5-digit zip to start.") : null}
          </div>
        )}

        {err ? <p className="leadgen-app-error">{err}</p> : null}

        {scan && kept.length >= 5 ? (
          <div className="leadgen-action-drawer leadgen-action-drawer--compact" role="region" aria-label="Next best conversion actions">
            <details
              open={readyDrawerOpen}
              onToggle={(event) => setActionDrawerOpen("ready", event.currentTarget.open)}
            >
              <summary>
                <span>Launch path</span>
                <strong>{kept.length} reviewed - {projectedSendDays} send day{projectedSendDays === 1 ? "" : "s"}</strong>
                <em>{readyDrawerOpen ? "Collapse" : "Expand"}</em>
              </summary>
              <div className="leadgen-action-drawer__body">
                <p>
                  At {dailyCap || 35}/day, this is about {projectedSendDays} send day
                  {projectedSendDays === 1 ? "" : "s"}. Recommended plan: {recommendedTier.name}.
                </p>
                {growthLimitExceeded ? (
                  <p className="leadgen-action-drawer__warn">
                    This reviewed set is above Growth capacity (500 records/month). Pro is the safer fit.
                  </p>
                ) : null}
                {proCapacityWarning ? (
                  <p className="leadgen-action-drawer__warn">
                    This reviewed set is above Pro monthly capacity (5,000). Split by niche or request Enterprise onboarding.
                  </p>
                ) : null}
                <div className="leadgen-action-drawer__actions">
                  <Link
                    to={scannerDemoLink}
                    className="btn btn-secondary btn-sm"
                    data-leadgen-cta="scanner_strip_demo"
                    onClick={() => trackEvent("generate_lead", { source: "leadgen_scanner_ready_demo", kept_count: kept.length })}
                  >
                    Review with us
                  </Link>
                  <Link
                    to={scannerWorkspaceLink}
                    className="btn btn-secondary btn-sm"
                    data-leadgen-cta="scanner_strip_workspace"
                    onClick={() => trackEvent("generate_lead", { source: "leadgen_scanner_ready_workspace", kept_count: kept.length })}
                  >
                    Open workspace
                  </Link>
                  <a
                    href="#pricing"
                    className="btn btn-secondary btn-sm"
                    data-leadgen-cta="scanner_strip_pricing"
                    onClick={() => trackEvent("select_content", {
                      content_type: "leadgen_scanner_conversion",
                      destination: "pricing_section",
                      kept_count: kept.length,
                    })}
                  >
                    Compare plans
                  </a>
                </div>
              </div>
            </details>
            <LeadgenPlanLink
              tierId={recommendedTierId}
              billing={recommendedBilling}
              className="btn btn-primary btn-sm leadgen-action-drawer__primary"
              source="leadgen_scanner_recommended_plan"
              context="scanner_conversion_strip"
              ctaId="scanner_strip_recommended"
              checkoutContext={scannerCheckoutContext}
              onClick={() => trackEvent("generate_lead", {
                source: "leadgen_scanner_recommended_plan",
                kept_count: kept.length,
                recommended_tier: recommendedTier.id,
                projected_days: projectedSendDays,
              })}
            >
              {`Start ${recommendedTier.name}`}
            </LeadgenPlanLink>
          </div>
        ) : null}

        {scan && kept.length < 5 ? (
          <div className="leadgen-action-drawer leadgen-action-drawer--assist leadgen-action-drawer--compact" role="region" aria-label="Recommended next action for this scan">
            <details
              open={assistDrawerOpen}
              onToggle={(event) => setActionDrawerOpen("assist", event.currentTarget.open)}
            >
              <summary>
                <span>Next step</span>
                <strong>
                  {rows.length
                    ? `${kept.length} kept. Broaden this market.`
                    : `No ${niche === "All" ? "public" : niche.toLowerCase()} records found.`}
                </strong>
                <em>{assistDrawerOpen ? "Collapse" : "Expand"}</em>
              </summary>
              <div className="leadgen-action-drawer__body">
                <p>
                  {niche !== "All"
                    ? `Switch to all businesses in ${zip}, then narrow from a fuller list.`
                    : "Try a nearby zip or send this view to the workspace for manual review."}
                </p>
                <div className="leadgen-action-drawer__actions">
                  <Link
                    to={scannerDemoLink}
                    className="btn btn-secondary btn-sm"
                    data-leadgen-cta="scanner_low_volume_demo"
                    onClick={() => trackEvent("generate_lead", {
                      source: "leadgen_scanner_low_volume_demo",
                      kept_count: kept.length,
                      matched_count: scan.matched,
                      niche,
                    })}
                  >
                    Ask for review
                  </Link>
                  {rows.length ? (
                    <Link
                      to={scannerWorkspaceLink}
                      className="btn btn-secondary btn-sm"
                      data-leadgen-cta="scanner_low_volume_workspace"
                      onClick={() => trackEvent("generate_lead", {
                        source: "leadgen_scanner_low_volume_workspace",
                        kept_count: kept.length,
                        matched_count: scan.matched,
                        niche,
                      })}
                    >
                      Open workspace
                    </Link>
                  ) : null}
                </div>
              </div>
            </details>
            {niche !== "All" ? (
              <button
                type="button"
                className="btn btn-primary btn-sm leadgen-action-drawer__primary"
                onClick={() => applyMarketRefinement("All")}
                disabled={busy}
              >
                Broaden
              </button>
            ) : (
              <Link
                to={scannerDemoLink}
                className="btn btn-primary btn-sm leadgen-action-drawer__primary"
                data-leadgen-cta="scanner_low_volume_demo_primary"
                onClick={() => trackEvent("generate_lead", {
                  source: "leadgen_scanner_low_volume_demo_primary",
                  kept_count: kept.length,
                  matched_count: scan.matched,
                  niche,
                })}
              >
                Ask for review
              </Link>
            )}
          </div>
        ) : null}
      </div>

      <div className="leadgen-app-panel leadgen-app-panel--results">
        <div className="leadgen-app-results-head">
          <div>
            <span>{scan ? `${visibleRows.length} shown of ${scan.matched}` : "Ready to scan"}</span>
            <h2>Your list</h2>
          </div>
          <div className="leadgen-app-actions">
            {scan ? (
              <>
                {kept.length >= 5 ? (
                  <LeadgenPlanLink
                    tierId={recommendedTierId}
                    billing={recommendedBilling}
                    className="btn btn-primary btn-sm"
                    source="leadgen_scanner_results_recommended"
                    context="results_header"
                    ctaId="scanner_results_recommended"
                    checkoutContext={scannerCheckoutContext}
                    onClick={() => trackEvent("generate_lead", {
                      source: "leadgen_scanner_results_recommended",
                      kept_count: kept.length,
                      recommended_tier: recommendedTier.id,
                    })}
                  >
                    {`Start ${recommendedTier.name}`}
                  </LeadgenPlanLink>
                ) : null}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={copyViewLink}
                >
                  {copiedView ? "Copied" : "Copy view link"}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={exportKeptRows} disabled={!kept.length}>Export CSV ({kept.length})</button>
                {destinations.length ? (
                  <span className="leadgen-push">
                    <select
                      className="leadgen-push__select"
                      value={pushTarget}
                      onChange={(e) => setPushTarget(e.target.value)}
                      aria-label="CRM destination"
                      disabled={pushBusy}
                    >
                      {destinations.map((d) => <option key={d.id} value={d.id}>{d.label || d.kind}</option>)}
                    </select>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={pushSelected}
                      disabled={pushBusy || !kept.length || !pushTarget}
                    >
                      {pushBusy ? "Pushing…" : `Push ${kept.length}`}
                    </button>
                  </span>
                ) : null}
                {pushMsg ? (
                  <span className={`leadgen-push__msg${pushMsg.ok ? "" : " is-error"}`} role="status" aria-live="polite">{pushMsg.text}</span>
                ) : null}
                <Link
                  to={scannerResultWorkspaceLink}
                  className="btn btn-primary btn-sm"
                  data-leadgen-cta="scanner_results_workspace"
                  onClick={() => trackEvent("generate_lead", { source: "leadgen_scanner_results" })}
                >
                  Use in workspace
                </Link>
              </>
            ) : null}
          </div>
        </div>

        <LeadgenMap
          rows={rows.length ? visibleOnlyRows : broadenedMapRows}
          scan={scan}
          selectedIndex={effectiveSelectedIndex}
          onSelect={setSelectedIndex}
        />

        {scan ? (
          <div className="leadgen-review-summary">
            <span className="leadgen-review-summary__count"><strong>{kept.length}</strong> selected of {reviewedRows.length}</span>
            <span title="Independent local businesses found in this market" style={{ color: "#067647", fontWeight: 600 }}>
              {independentCount} independent
            </span>
            {chainCount ? (
              <button
                type="button"
                onClick={() => {
                  setIndependentsOnly((v) => !v);
                  trackEvent("select_content", { content_type: "leadgen_independents_toggle", source: "leadgen_scanner", on: !independentsOnly });
                }}
                aria-pressed={independentsOnly}
                title="Hide national/regional chains and show only independent local businesses"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "3px 11px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
                  border: independentsOnly ? "1px solid #067647" : "1px solid var(--syn-border, #d0d5dd)",
                  background: independentsOnly ? "#067647" : "transparent",
                  color: independentsOnly ? "#fff" : "var(--text-1)",
                }}
              >
                {independentsOnly
                  ? <><Check size={13} aria-hidden="true" /> Independents only</>
                  : `Hide ${chainCount} chain${chainCount === 1 ? "" : "s"}`}
              </button>
            ) : null}
            {hasKeyboard ? (
              <span className="leadgen-review-summary__hint">J/K to move · 1 keep · 3 remove</span>
            ) : null}
            {visibleRows.length ? (
              <div className="leadgen-review-summary__actions" role="group" aria-label="Selection actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyVisibleReview("keep")}>Select all</button>
                {bestVisible.length > 0 && bestVisible.length < visibleRows.length ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm leadgen-select-best"
                    onClick={selectBest}
                    title="Keep only reachable leads — a website plus a phone or email"
                  >
                    <Sparkles size={14} aria-hidden="true" /> Select best ({bestVisible.length})
                  </button>
                ) : null}
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyVisibleReview("reject")}>Clear</button>
              </div>
            ) : null}
          </div>
        ) : null}

        {scan ? (
          <div className="leadgen-result-tools" aria-label="Result search and filters">
            <div className="leadgen-result-tools__primary">
              <label className="leadgen-result-tools__search">
                <span>Search loaded records</span>
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onBlur={() => {
                    if (!searchTerm.trim()) return;
                    trackEvent("select_content", {
                      content_type: "leadgen_result_search",
                      source: "leadgen_scanner",
                      query_length: searchTerm.trim().length,
                      visible_count: visibleRows.length,
                    });
                  }}
                  placeholder="Name, city, service, phone, website..."
                  aria-label="Search loaded lead records"
                  disabled={!reviewedRows.length}
                />
              </label>
              <label>
                <span>Status</span>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    const next = e.target.value;
                    setStatusFilter(next);
                    trackEvent("select_content", {
                      content_type: "leadgen_result_filter",
                      source: "leadgen_scanner",
                      filter_key: "status",
                      filter_value: next,
                    });
                  }}
                  disabled={!reviewedRows.length}
                >
                  <option value="all">All</option>
                  <option value="keep">Selected</option>
                  <option value="reject">Removed</option>
                </select>
              </label>
            </div>
            <details className="leadgen-result-more-filters">
              <summary>More filters</summary>
              <div className="leadgen-result-more-filters__grid">
                <label>
                  <span>Contact</span>
                  <select
                    value={contactFilter}
                    onChange={(e) => {
                      const next = e.target.value;
                      setContactFilter(next);
                      trackEvent("select_content", {
                        content_type: "leadgen_result_filter",
                        source: "leadgen_scanner",
                        filter_key: "contact",
                        filter_value: next,
                      });
                    }}
                    disabled={!reviewedRows.length}
                  >
                    <option value="all">All</option>
                    <option value="website">Has website</option>
                    <option value="phone">Has phone</option>
                    <option value="missing-website">No website</option>
                    <option value="missing-phone">No phone</option>
                    <option value="mapped">Mapped</option>
                  </select>
                </label>
                <label>
                  <span>Sub-industry</span>
                  <select
                    value={subIndustryFilter}
                    onChange={(e) => {
                      const next = e.target.value;
                      setSubIndustryFilter(next);
                      trackEvent("select_content", {
                        content_type: "leadgen_result_filter",
                        source: "leadgen_scanner",
                        filter_key: "sub_industry",
                        filter_value: next,
                      });
                    }}
                    disabled={!subIndustryOptions.length}
                  >
                    <option value="all">All</option>
                    {subIndustryOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label>
                  <span>Sort</span>
                  <select
                    value={sortBy}
                    onChange={(e) => {
                      const next = e.target.value;
                      setSortBy(next);
                      trackEvent("select_content", {
                        content_type: "leadgen_result_sort",
                        source: "leadgen_scanner",
                        sort_key: next,
                      });
                    }}
                    disabled={!reviewedRows.length}
                  >
                    <option value="contact">Best contact</option>
                    <option value="name">Name</option>
                    <option value="city">City</option>
                    <option value="status">Review status</option>
                    <option value="mapped">Mapped first</option>
                  </select>
                </label>
              </div>
            </details>
          </div>
        ) : null}

        <div className="leadgen-result-list">
          {!scan ? (
            <div className="leadgen-empty-review">
              <strong>Build a usable lead list</strong>
              <span>Enter any 5-digit zip, choose the customer type, and run a scan. The list stays reviewable before anything becomes outreach.</span>
              <div className="leadgen-empty-review__flow" aria-label="Leadgen workflow preview">
                {EMPTY_SCAN_STEPS.map((item) => (
                  <div key={item.label}>
                    <b>{item.label}</b>
                    <p>{item.body}</p>
                  </div>
                ))}
              </div>
              <div className="leadgen-empty-review__actions">
                <Link
                  to={scannerDemoLink}
                  className="btn btn-secondary btn-sm"
                  data-leadgen-cta="scanner_prescan_review"
                  onClick={() => trackEvent("generate_lead", { source: "leadgen_scanner_prescan_review" })}
                >
                  Get list review
                </Link>
                <a
                  href="#pricing"
                  className="btn btn-secondary btn-sm"
                  data-leadgen-cta="scanner_prescan_pricing"
                  onClick={() => trackEvent("select_content", {
                    content_type: "leadgen_scanner_prescan",
                    destination: "pricing_section",
                  })}
                >
                  See pricing
                </a>
              </div>
            </div>
          ) : !rows.length ? (
            <div className="leadgen-empty-review">
              <strong>No records found for this scan</strong>
              <span>
                {niche !== "All"
                  ? `No ${niche.toLowerCase()} records matched ${zip}. Broaden to all businesses or try a nearby zip.`
                  : `No public business records matched ${zip}. Try a nearby zip or ask us to review it manually.`}
                {broadenedMapRows.length ? " The map still shows broader public records for this ZIP." : ""}
              </span>
              <div className="leadgen-empty-review__actions">
                <Link
                  to={scannerDemoLink}
                  className="btn btn-secondary btn-sm"
                  data-leadgen-cta="scanner_empty_review"
                  onClick={() => trackEvent("generate_lead", {
                    source: "leadgen_scanner_empty_review",
                    matched_count: scan.matched,
                    niche,
                  })}
                >
                  Ask for review
                </Link>
              </div>
            </div>
          ) : !visibleRows.length ? (
            <div className="leadgen-empty-review">
              <strong>No records match these filters</strong>
              <span>Clear the search or loosen the filters. The original scan is still cached for this zip and niche.</span>
            </div>
          ) : (
            <>
              <div className="leadgen-result-header">
                <label className="leadgen-result-row__check" title={allVisibleSelected ? "Clear all shown" : "Select all shown"}>
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={() => applyVisibleReview(allVisibleSelected ? "reject" : "keep")}
                    aria-label="Select all shown businesses"
                  />
                </label>
                <button
                  type="button"
                  className={`leadgen-result-header__col${sortBy === "name" ? " is-sorted" : ""}`}
                  onClick={() => setSortBy("name")}
                >
                  Business{sortBy === "name" ? " ↓" : ""}
                </button>
                <button
                  type="button"
                  className={`leadgen-result-header__col${sortBy === "contact" ? " is-sorted" : ""}`}
                  onClick={() => setSortBy("contact")}
                >
                  Website / phone{sortBy === "contact" ? " ↓" : ""}
                </button>
              </div>
              {visibleRows.map(({ row, index }) => (
            <article
              key={`${row.source_id || row.name}-${index}`}
              className={`leadgen-result-row leadgen-result-row--${review[index] || "keep"}${index === effectiveSelectedIndex ? " is-selected" : ""}`}
              title={`${REVIEW_COPY[review[index] || "keep"]} Source: ${row.source_url || "not available"}`}
              onMouseEnter={() => setSelectedIndex(index)}
              onFocus={() => setSelectedIndex(index)}
            >
              <label className="leadgen-result-row__check" title="Include this business in your list">
                <input
                  type="checkbox"
                  checked={(review[index] || "keep") === "keep"}
                  onChange={(e) => setReview((current) => ({ ...current, [index]: e.target.checked ? "keep" : "reject" }))}
                  aria-label={`Include ${row.name} in your list`}
                />
              </label>
              <div className="leadgen-result-row__main">
                <strong>
                  {row.name}
                  {row.is_chain ? (
                    <span className="lead-tag lead-tag--chain" title="National or regional chain — usually not an independent local prospect">Chain</span>
                  ) : !independentsOnly ? (
                    <span className="lead-tag lead-tag--local" title="Independent local business — a good IT-services prospect">Local</span>
                  ) : null}
                </strong>
                <span>{[row.sub_industry || row.industry_group, row.city || row.address, row.zip].filter(Boolean).join(" - ")}</span>
              </div>
              <div className="leadgen-result-row__meta">
                <a href={row.website || row.source_url} target="_blank" rel="noopener noreferrer">{hostFor(row.website || row.source_url)}</a>
                {row.email || row.emails?.[0]?.email ? (
                  <a
                    className="leadgen-result-row__email"
                    href={`mailto:${row.email || row.emails[0].email}`}
                    onClick={(e) => e.stopPropagation()}
                    title="Email this business"
                  >
                    <Mail size={12} aria-hidden="true" /> {row.email || row.emails[0].email}
                  </a>
                ) : null}
                {row.phone ? <span>{row.phone}</span> : <span>Phone missing</span>}
                <span className="leadgen-result-row__source">{sourceFor(row)}</span>
              </div>
            </article>
              ))}
            </>
          )}
        </div>
      </div>

      {scan ? (
        <div className="leadgen-scan-followup" aria-label="Scan metrics and campaign planning">
          <div className="leadgen-app-kpis" aria-label="Scan metrics">
            <div className="leadgen-app-kpis__hero"><Building2 size={15} /><strong><CountUp value={scan?.matched ?? 0} /></strong><span>local businesses</span></div>
            {emailCount > 0 ? (
              <div><Mail size={15} /><strong><CountUp value={emailCount} /></strong><span>emails found</span></div>
            ) : null}
            <div><Database size={15} /><strong><CountUp value={websites} /></strong><span>with websites</span></div>
            <div><Phone size={15} /><strong><CountUp value={phones} /></strong><span>with phone</span></div>
            <div><Check size={15} /><strong>{kept.length}</strong><span>selected</span></div>
          </div>
          <div className="leadgen-app-brief">
            <div>
              <span>Campaign brief</span>
              <strong>{/^\d{5}$/.test(zip) ? `${niche} in ${zip}` : "Choose a zip and niche"}</strong>
              <p>{offer || "Add an offer angle before sending."}</p>
            </div>
            <div>
              <span>Send rule</span>
              <strong>{dailyCap || 35}/day max</strong>
              <p>{kept.length ? `${projectedSendDays} sending day estimate for kept rows.` : lastScanMeta?.cached ? "Loaded from a warmed scan." : "Review the list first."}</p>
            </div>
          </div>
          <div className="leadgen-selected-emails" aria-label="Selected leads and emails">
            <div className="leadgen-selected-emails__head">
              <strong>{kept.length} selected</strong>
              <span>{keptWithEmail.length} with an email{keptCorporate ? ` · ${keptCorporate} corporate` : ""}</span>
              {kept.some((r) => r.website && !bestEmail(r)) ? (
                <button type="button" className="btn btn-primary btn-sm" onClick={findEmails} disabled={extracting}>
                  {extracting ? "Finding emails…" : "Find emails"}
                </button>
              ) : null}
              {keptWithEmail.length ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={copyAllEmails}>
                  {copiedEmails ? "Copied!" : "Copy all emails"}
                </button>
              ) : null}
            </div>
            {extractMsg ? (
              <p className={`leadgen-selected-emails__msg${extractMsg.ok ? "" : " is-error"}`} role="status" aria-live="polite">{extractMsg.text}</p>
            ) : null}
            {kept.length ? (
              <ul className="leadgen-selected-emails__list">
                {kept.slice(0, 60).map((r, i) => {
                  const em = bestEmail(r);
                  return (
                    <li key={`${r.source_id || r.name}-${i}`}>
                      <span className="leadgen-selected-emails__name">{r.name}</span>
                      {em ? (
                        <span className="leadgen-selected-emails__email">
                          {isRoleEmail(em) ? (
                            <span className="leadgen-selected-emails__badge" title="Role / corporate inbox — good for an email blast">corporate</span>
                          ) : null}
                          <a className="leadgen-selected-emails__addr" href={`mailto:${em}`}>
                            <Mail size={12} aria-hidden="true" /> {em}
                          </a>
                        </span>
                      ) : (
                        <span className="leadgen-selected-emails__missing">
                          {r.website ? `no email yet · ${hostFor(r.website)}` : "no website"}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="leadgen-selected-emails__empty">Tick businesses above to build your outreach list.</p>
            )}
            {kept.length > 60 ? (
              <p className="leadgen-selected-emails__more">+{kept.length - 60} more — export or push to get them all.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function Leadgen() {
  const [billing, setBilling] = useState("monthly");
  const scrollMilestonesRef = useRef(new Set());
  const sectionViewRef = useRef(new Set());
  const firstCtaRef = useRef(false);

  useSEO({
    title: "Local Lead Generation with Email Extraction | Simple IT SRQ",
    description:
      "Scan any U.S. zip code, discover local businesses across every industry, extract verified email addresses, and push leads directly to HubSpot, Mailchimp, or your CRM.",
    canonical: `${SITE_URL}/leadgen`,
    image: `${SITE_URL}/og-image.png`,
    breadcrumbs: [
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Leadgen", url: `${SITE_URL}/leadgen` },
    ],
    products: LEADGEN_PRODUCTS,
    productBasePath: "/leadgen",
    faqs: LEADGEN_FAQS,
  });

  useEffect(() => {
    const hints = [
      "https://checkout.stripe.com",
      "https://js.stripe.com",
      "https://tile.openstreetmap.org",
      "https://basemaps.cartocdn.com",
      "https://server.arcgisonline.com",
    ];
    const nodes = [];
    for (const href of hints) {
      const preconnect = document.createElement("link");
      preconnect.rel = "preconnect";
      preconnect.href = href;
      preconnect.crossOrigin = "anonymous";
      document.head.appendChild(preconnect);
      nodes.push(preconnect);

      const dns = document.createElement("link");
      dns.rel = "dns-prefetch";
      dns.href = href;
      document.head.appendChild(dns);
      nodes.push(dns);
    }
    return () => nodes.forEach((n) => n.remove());
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const maxScroll = Math.max(1, doc.scrollHeight - window.innerHeight);
      const depth = Math.round((window.scrollY / maxScroll) * 100);
      for (const mark of [25, 50, 75, 100]) {
        if (depth >= mark && !scrollMilestonesRef.current.has(mark)) {
          scrollMilestonesRef.current.add(mark);
          trackEvent("select_content", {
            content_type: "leadgen_scroll_depth",
            destination: `depth_${mark}`,
          });
        }
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onClick = (event) => {
      if (firstCtaRef.current) return;
      const target = event.target instanceof Element ? event.target.closest("[data-leadgen-cta]") : null;
      if (!target) return;
      const cta = target.getAttribute("data-leadgen-cta");
      if (!cta) return;
      firstCtaRef.current = true;
      trackEvent("select_content", {
        content_type: "leadgen_first_cta_click",
        destination: cta,
      });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    const ids = ["pricing", "faq"];
    const nodes = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!nodes.length) return undefined;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = entry.target.id;
        if (!id || sectionViewRef.current.has(id)) continue;
        sectionViewRef.current.add(id);
        trackEvent("select_content", {
          content_type: "leadgen_section_view",
          destination: id,
        });
      }
    }, { threshold: 0.35 });
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <main id="main" className="leadgen-public">
      <LeadgenCheckoutSuccess />
      <section className="section hero hero-clean leadgen-hero">
        <div className="container">
          <LeadgenScanApp />
        </div>
      </section>

      <LeadgenProofStrip />

      <section className="section leadgen-product-focus">
        <div className="container leadgen-product-focus__grid">
          <div>
            <h2 className="title-1">Every local business near you is a potential customer.</h2>
            <p className="lede">
              Pick an industry, drop in a zip. We find the independents,
              pull their emails, and skip the national chains.
              You review the short list and reach out — no guesswork, no list brokers.
            </p>
          </div>
          <div className="leadgen-product-rules">
            {SERVICE_USE_CASES.map((rule, index) => (
              <article key={rule.title} className="leadgen-product-rule">
                <span>{index + 1}</span>
                <div>
                  <h3>{rule.title}</h3>
                  <p>{rule.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="section">
        <div className="container">
          <div className="section-head" style={{ maxWidth: 720 }}>
            <span className="eyebrow">Pricing</span>
            <h2 className="title-1">Start with the $19 local test.</h2>
            <p className="lede">
              Run one real market before buying ads or chasing a giant list.
            </p>
          </div>

          <div className="leadgen-billing-toggle" role="tablist" aria-label="Billing cadence">
            <button
              role="tab"
              aria-selected={billing === "monthly"}
              className={`leadgen-billing-btn${billing === "monthly" ? " is-active" : ""}`}
              onClick={() => {
                setBilling("monthly");
                trackEvent("select_content", {
                  content_type: "leadgen_billing_toggle",
                  destination: "monthly",
                });
              }}
            >Monthly</button>
            <button
              role="tab"
              aria-selected={billing === "annual"}
              className={`leadgen-billing-btn${billing === "annual" ? " is-active" : ""}`}
              onClick={() => {
                setBilling("annual");
                trackEvent("select_content", {
                  content_type: "leadgen_billing_toggle",
                  destination: "annual",
                });
              }}
            >
              Annual <span className="leadgen-billing-save">Save up to {Math.max(...TIERS.filter(t => t.monthly > 0).map(t => Math.round((1 - t.annual / t.monthly) * 100)))}%</span>
            </button>
          </div>

          <div className="leadgen-tiers">
            {TIERS.map((t) => (
              <div
                key={t.id}
                className={`leadgen-tier${t.highlight ? " leadgen-tier--highlight" : ""}`}
              >
                {t.badge && <span className="leadgen-tier__badge">{t.badge}</span>}
                <h3 className="leadgen-tier__name">{t.name}</h3>
                <Currency value={billing === "annual" ? t.annual : t.monthly} />
                <p className="leadgen-tier__blurb">{t.blurb}</p>
                {(() => {
                  const rawStripeUrl = billing === "annual" ? t.stripeAnnual : t.stripeMonthly;
                  if (rawStripeUrl) {
                    return (
                      <LeadgenPlanLink
                        tierId={t.id}
                        billing={billing}
                        className={`btn ${t.highlight ? "btn-primary" : "btn-secondary"} leadgen-tier__cta`}
                        source={`leadgen_pricing_${t.id}`}
                        context="pricing_table"
                        ctaId={`pricing_${t.id}_${billing}`}
                      >
                        {t.cta}
                      </LeadgenPlanLink>
                    );
                  }
                  return (
                    <Link
                      to={t.ctaHref}
                      className={`btn ${t.highlight ? "btn-primary" : "btn-secondary"} leadgen-tier__cta`}
                      data-leadgen-cta={`pricing_${t.id}_${billing}`}
                      onClick={() => trackEvent("generate_lead", { source: `leadgen_pricing_${t.id}`, context: "pricing_table" })}
                    >
                      {t.cta} <ArrowRight size={14} />
                    </Link>
                  );
                })()}
                <ul className="leadgen-tier__features">
                  {t.features.map((f) => (
                    <li key={f}><Check size={14} /> {f}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="leadgen-tier__fineprint">
            All prices in USD. Annual plans billed up-front, 14-day money back.
            Volume above tier caps available on request.
          </p>
        </div>
      </section>

      <LeadgenIntegrationsSection />

      <section id="faq" className="section section-alt" aria-labelledby="leadgen-faq-title">
        <div className="container" style={{ maxWidth: 820 }}>
          <div className="section-head">
            <span className="eyebrow">FAQ</span>
            <h2 id="leadgen-faq-title" className="title-1">Short answers.</h2>
          </div>
          <div className="faq-list">
            {LEADGEN_FAQS.map((item) => (
              <details
                key={item.q}
                className="faq-item"
                onToggle={(e) => {
                  if (e.currentTarget.open) {
                    trackEvent("select_content", {
                      content_type: "leadgen_faq_open",
                      destination: item.q,
                    });
                  }
                }}
              >
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

const INTEGRATION_LIST = [
  {
    name: "Webhook / Zapier",
    domain: "zapier.com",
    desc: "POST leads to any URL — wire into Zapier, Make, n8n, or your own backend.",
    badge: "Growth+",
  },
  {
    name: "Mailchimp",
    domain: "mailchimp.com",
    desc: "Sync leads to a Mailchimp audience. Merge tags for name, company, industry, and phone.",
    badge: "Growth+",
  },
  {
    name: "HubSpot",
    domain: "hubspot.com",
    desc: "Create contacts in HubSpot CRM with industry, website, and leadsource pre-filled.",
    badge: "Growth+",
  },
  {
    name: "ActiveCampaign",
    domain: "activecampaign.com",
    desc: "Add contacts to ActiveCampaign and tag them by industry for segmented sequences.",
    badge: "Pro",
  },
  {
    name: "GoHighLevel",
    domain: "gohighlevel.com",
    desc: "Push contacts directly to a GHL location — ideal for agencies running client pipelines.",
    badge: "Pro",
  },
  {
    name: "CSV with emails",
    csv: true,
    desc: "Every export includes extracted email addresses and confidence scores as extra columns.",
    badge: "Growth+",
  },
];

function LeadgenIntegrationsSection() {
  return (
    <section id="integrations" className="section leadgen-integrations-section" aria-labelledby="integrations-title">
      <div className="container">
        <div className="section-head" style={{ maxWidth: 720 }}>
          <span className="eyebrow">Integrations</span>
          <h2 id="integrations-title" className="title-1">Push leads where your team already works.</h2>
          <p className="lede">
            Growth and Pro plans include one-click export to the marketing and CRM tools you already use.
            Connect once, push whenever your review list is ready.
          </p>
        </div>
        <div className="leadgen-integrations-grid">
          {INTEGRATION_LIST.map((item) => (
            <div key={item.name} className="leadgen-integration-card">
              <span className="leadgen-integration-card__logo" aria-hidden="true">
                {item.csv ? (
                  <FileText size={22} strokeWidth={1.75} />
                ) : (
                  <img
                    src={`https://icons.duckduckgo.com/ip3/${item.domain}.ico`}
                    alt=""
                    width="26"
                    height="26"
                    loading="lazy"
                    decoding="async"
                  />
                )}
              </span>
              <div className="leadgen-integration-card__body">
                <strong>{item.name}</strong>
                <span className="leadgen-integration-card__badge">{item.badge}</span>
                <p>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <p style={{ textAlign: "center", marginTop: "2rem", color: "var(--text-2, #64748b)", fontSize: 14 }}>
          Configure integrations from your campaign workspace after signup.
        </p>
      </div>
    </section>
  );
}

function LeadgenProofStrip() {
  return (
    <section className="leadgen-proof" aria-label="Leadgen proof points">
      <div className="container leadgen-proof__grid">
        {PROOF_POINTS.map((point) => (
          <div key={point.label} className="leadgen-proof__item">
            <span className="leadgen-proof__label">{point.label}</span>
            <strong>{point.value}</strong>
            <span>{point.detail}</span>
          </div>
        ))}
      </div>
    </section>
  );
}


// ---------- post-checkout notice ----------
// Stripe redirects can land here with ?checkout=success or ?checkout=cancelled.
// We strip the transient checkout flags after first render so refresh/share stays clean.
function LeadgenCheckoutSuccess() {
  const [state] = useState(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const checkout = (params.get("checkout") || "").toLowerCase();
    const isSuccess = checkout === "success";
    const isCancelled = checkout === "cancelled" || checkout === "canceled" || checkout === "cancel";
    if (!isSuccess && !isCancelled) return null;
    const parsedReference = parseLeadgenCheckoutReference(
      params.get("client_reference_id") || params.get("utm_content") || "",
    );
    const tier = (params.get("tier") || parsedReference.tier || "leadgen").toLowerCase();
    const cadence = (params.get("cadence") || parsedReference.cadence || "").toLowerCase();
    const zip = (params.get("zip") || parsedReference.zip || "").replace(/\D/g, "").slice(0, 5);
    const niche = params.get("niche") || parsedReference.niche || "";
    const kept = params.get("kept") || parsedReference.kept || "";
    return {
      status: isSuccess ? "success" : "cancelled",
      tier,
      cadence,
      zip,
      niche,
      kept,
    };
  });

  useEffect(() => {
    if (typeof window === "undefined" || !state) return;
    // Clean URL so refresh / share doesn't replay the success state.
    try {
      const params = new URLSearchParams(window.location.search);
      params.delete("checkout");
      params.delete("tier");
      params.delete("cadence");
      params.delete("client_reference_id");
      const qs = params.toString();
      const url = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
      window.history.replaceState(null, "", url);
    } catch { /* ignore */ }
  }, [state]);

  if (!state) return null;

  const tierLabel = state.tier === "growth" ? "Growth" :
    state.tier === "pro" ? "Pro" :
    state.tier === "free" || state.tier === "sample" ? "Sample" :
    state.tier === "enterprise" ? "Enterprise" :
    state.tier === "starter" ? "Growth" :
    "Leadgen";
  const cadenceLabel = state.cadence === "annual" ? "annual" :
    state.cadence === "monthly" ? "monthly" : "";
  const workspaceParams = new URLSearchParams({
    utm_source: "stripe_checkout",
    utm_medium: "success_banner",
    utm_campaign: "leadgen_onboarding",
  });
  if (state.zip) workspaceParams.set("zip", state.zip);
  if (state.niche) workspaceParams.set("niche", state.niche);
  if (state.kept) workspaceParams.set("kept", state.kept);
  if (state.tier) workspaceParams.set("tier", state.tier);
  workspaceParams.set("checkout_status", state.status);
  const workspaceHref = `/portal/leadgen?${workspaceParams.toString()}`;
  const reviewParams = new URLSearchParams({
    topic: state.status === "success" ? "leadgen-onboarding" : "leadgen-demo",
    utm_source: "leadgen_checkout",
    utm_medium: state.status,
    utm_campaign: "leadgen_recovery",
  });
  if (state.zip) reviewParams.set("zip", state.zip);
  if (state.niche) reviewParams.set("niche", state.niche);
  if (state.kept) reviewParams.set("kept", state.kept);
  const reviewHref = `/book?${reviewParams.toString()}`;
  const noticeTitle = state.status === "success"
    ? `You're in. Welcome to Leadgen ${tierLabel}${cadenceLabel ? ` - ${cadenceLabel}` : ""}.`
    : "Checkout paused. No payment was completed.";
  const noticeBody = state.status === "success"
    ? "Your receipt is on its way from Stripe. Open the workspace with your market context, or book onboarding and we will review the first target list before anything sends."
    : "Keep this scan open, ask for a quick review, or return to pricing when you are ready.";
  const noticeEyebrow = state.status === "success" ? "Checkout complete" : "Checkout recovery";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`leadgen-checkout-notice leadgen-checkout-notice--${state.status}`}
    >
      <div className="leadgen-checkout-notice__inner">
        <div className="leadgen-checkout-notice__copy">
          <span className="leadgen-checkout-notice__eyebrow">{noticeEyebrow}</span>
          <strong>
            {state.status === "success" ? <Check size={18} aria-hidden="true" /> : null}
            {noticeTitle}
          </strong>
          <p>{noticeBody}</p>
        </div>
        <div className="leadgen-checkout-notice__actions">
          <Link
            to={workspaceHref}
            className="btn btn-primary btn-sm"
            data-leadgen-cta={`checkout_${state.status}_workspace`}
            onClick={() => trackEvent("generate_lead", {
              source: `leadgen_checkout_${state.status}_workspace`,
              plan: state.tier,
              billing_cycle: state.cadence,
            })}
          >
            Open workspace
          </Link>
          <Link
            to={reviewHref}
            className="btn btn-secondary btn-sm"
            data-leadgen-cta={`checkout_${state.status}_review`}
            onClick={() => trackEvent("generate_lead", {
              source: `leadgen_checkout_${state.status}_review`,
              plan: state.tier,
              billing_cycle: state.cadence,
            })}
          >
            {state.status === "success" ? "Book onboarding" : "Ask for review"}
          </Link>
          <a
            href="#pricing"
            className="btn btn-secondary btn-sm"
            data-leadgen-cta={`checkout_${state.status}_pricing`}
            onClick={() => trackEvent("select_content", {
              content_type: "leadgen_checkout_notice",
              destination: "pricing",
              plan: state.tier,
              billing_cycle: state.cadence,
            })}
          >
            Pricing
          </a>
        </div>
      </div>
    </div>
  );
}

