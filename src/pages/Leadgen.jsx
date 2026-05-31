import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { Link } from "../lib/Link";
import {
  ArrowRight, Check, MapPin, Database, Mail, ShieldCheck,
  Filter, Send, BarChart3, Building2,
  Search, Info,
} from "lucide-react";
import { useSEO, SITE_URL } from "../lib/seo";
import { trackEvent } from "../lib/analytics.js";

const TIERS = [
  {
    id: "growth",
    name: "Growth",
    monthly: 19,
    annual: 15,
    blurb: "The focused paid test: one local niche, reviewed before sending.",
    cta: "Start Growth",
    ctaHref: "/book?topic=leadgen-growth&utm_source=leadgen_page&utm_medium=pricing_card&utm_campaign=growth",
    stripeMonthly: import.meta.env.VITE_LEADGEN_GROWTH_MONTHLY_URL,
    stripeAnnual: import.meta.env.VITE_LEADGEN_GROWTH_ANNUAL_URL,
    highlight: true,
    badge: "Start here",
    features: [
      "1 zip-radius search per day",
      "Up to 500 verified business records / month",
      "1 active outreach campaign",
      "Industry & sub-industry filters",
      "Per-domain throttling + reply detection",
      "CSV + Google Sheets export",
      "1-business-day onboarding review",
    ],
  },
  {
    id: "free",
    name: "Sample",
    monthly: 0,
    annual: 0,
    blurb: "A small inspection sample. Useful, but not the product.",
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
    blurb: "For repeat campaigns across several territories or niches.",
    cta: "Start Pro",
    ctaHref: "/book?topic=leadgen-pro&utm_source=leadgen_page&utm_medium=pricing_card&utm_campaign=pro",
    stripeMonthly: import.meta.env.VITE_LEADGEN_PRO_MONTHLY_URL,
    stripeAnnual: import.meta.env.VITE_LEADGEN_PRO_ANNUAL_URL,
    highlight: false,
    features: [
      "Unlimited zip-radius searches",
      "Up to 5,000 verified business records / month",
      "5 concurrent outreach campaigns",
      "Webhook-ready export",
      "Open, click, and reply tracking",
      "Priority email support",
      "Custom enrichment fields",
      "Quarterly deliverability review",
    ],
  },
];

const FEATURES = [
  {
    Icon: MapPin,
    title: "Public business records",
    body: "Start with OpenStreetMap business records, keep the source ID, and let you inspect where the record came from before outreach.",
  },
  {
    Icon: Database,
    title: "Published contact emails",
    body: "Find contact emails from business websites and run basic deliverability checks before a contact lands in the campaign queue.",
  },
  {
    Icon: Filter,
    title: "Narrow local targeting",
    body: "Pick a zip code and one business type so the campaign stays specific enough to write a useful offer.",
  },
  {
    Icon: Send,
    title: "Capped sending",
    body: "Set daily send caps, include an unsubscribe link and physical address, and pause campaigns that start bouncing.",
  },
  {
    Icon: BarChart3,
    title: "Reply tracking",
    body: "Track opens, clicks, replies, and unsubscribes so you know whether the niche is worth another campaign.",
  },
  {
    Icon: ShieldCheck,
    title: "Exports and source fields",
    body: "Export the list with source fields and campaign status so you can review the work outside the dashboard.",
  },
];

const STEPS = [
  { Icon: MapPin, label: "1. Pick a local market", body: "Choose one zip code and one business type, such as dental offices in 34237 or contractors in Bradenton." },
  { Icon: Mail,   label: "2. Build the list", body: "Pull public business records, find published contact emails, and remove obvious duplicates before export or outreach." },
  { Icon: Send,   label: "3. Review before sending", body: "Check the offer, sender, footer, unsubscribe link, and daily cap before the first email leaves." },
  { Icon: BarChart3, label: "4. Follow the replies", body: "Watch replies, clicks, and unsubscribes so you can decide whether to keep the niche, change the offer, or stop." },
];

const COMPLIANCE = [
  "Physical mailing address and unsubscribe link on outreach emails",
  "No purchased email lists",
  "OpenStreetMap source IDs retained where available",
  "Daily send caps by plan",
  "Campaigns pause when bounce problems show up",
  "First campaign reviewed before launch",
];

const PROOF_POINTS = [
  { label: "Product", value: "Growth", detail: "The default first paid test" },
  { label: "Scope", value: "1 zip + 1 niche", detail: "No broad spray campaigns" },
  { label: "Safety", value: "35/day cap", detail: "Review before the first send" },
  { label: "Price", value: "$19/mo", detail: "Upgrade only after it proves useful" },
];

const PRODUCT_RULES = [
  { title: "One market", body: "Pick a zip code or tight service area. Sarasota dentists, Bradenton contractors, Venice property managers - not everyone at once." },
  { title: "One offer", body: "Use a plain first email tied to a real service. The system helps deliver it; it cannot save weak positioning." },
  { title: "One review", body: "Before the first send, review source records, contact fields, unsubscribe footer, daily cap, and the actual email copy." },
];

const WORKSPACE_FLOW = [
  {
    Icon: Search,
    title: "Discover",
    body: "Enter a zip code and niche. The workspace queues a local business crawl and keeps source fields with every record.",
  },
  {
    Icon: Mail,
    title: "Crawl emails",
    body: "Scan business websites for published contact emails, then separate deliverable contacts from no-contact records.",
  },
  {
    Icon: Filter,
    title: "Review",
    body: "Tag, reject, update, or export businesses before a campaign can touch the list.",
  },
  {
    Icon: Send,
    title: "Campaigns",
    body: "Write with the AI helper, send a test, set the daily cap, and start only the reviewed campaign.",
  },
  {
    Icon: BarChart3,
    title: "Jobs and insights",
    body: "Watch queued jobs, sends, opens, clicks, unsubscribes, and which local niche is worth another pass.",
  },
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
];

const SCAN_LIMIT = 80;
const SCAN_CACHE_TTL = 5 * 60 * 1000;

const SCANNER_CONTEXT = [
  {
    title: "Public records first",
    body: "The scan starts from public business records, then keeps the source URL visible so you can audit the list.",
  },
  {
    title: "Review before outreach",
    body: "Nothing here means 'send now'. Keep, maybe, or reject each business before it reaches a campaign.",
  },
  {
    title: "Cap the test",
    body: "The daily cap turns a list into a small test instead of a broad spray campaign.",
  },
];

const REVIEW_COPY = {
  keep: "Ready for the first reviewed campaign pass.",
  maybe: "Worth another look before export or outreach.",
  reject: "Leave out of this campaign.",
};

const LEADGEN_FAQS = [
  {
    q: "Can I search any U.S. zip code?",
    a: "Yes. Enter any 5-digit U.S. zip code, pick an industry niche, and run the scan.",
  },
  {
    q: "Is this hard-coded to Sarasota, Bradenton, or Venice?",
    a: "No. Those are examples. The scanner and filters are dynamic and work by zip and niche.",
  },
  {
    q: "What happens if the map does not load?",
    a: "You can still review, filter, and export the full result list. Mapping is optional to the workflow.",
  },
];

const QUICK_MARKETS = [
  { label: "Sarasota healthcare", zip: "34239", niche: "Healthcare", offer: "HIPAA-aware IT support for independent practices" },
  { label: "Bradenton trades", zip: "34208", niche: "Trades", offer: "Fast dispatch IT and phone setup for field teams" },
  { label: "Venice services", zip: "34285", niche: "Professional Services", offer: "Secure email + backup hygiene for local offices" },
];

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
}) {
  const tier = TIERS.find((t) => t.id === tierId) || TIERS[1];
  const stripeUrl = billing === "annual" ? tier.stripeAnnual : tier.stripeMonthly;
  const onPlanClick = () => {
    trackEvent("begin_checkout", {
      plan: tier.id,
      billing_cycle: billing,
      value: tier.id === "free" ? 0 : (billing === "annual" ? tier.annual : tier.monthly),
      source,
      ...(context ? { context } : {}),
    });
    if (typeof onClick === "function") onClick();
  };
  if (stripeUrl) {
    return (
      <a href={stripeUrl} className={className} rel="noopener noreferrer" onClick={onPlanClick}>
        {children || tier.cta} <ArrowRight size={16} />
      </a>
    );
  }
  return (
    <Link to={tier.ctaHref} className={className} onClick={onPlanClick}>
      {children || tier.cta} <ArrowRight size={16} />
    </Link>
  );
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadCsv(filename, rows) {
  const headers = ["status", "name", "industry", "sub_industry", "address", "city", "state", "zip", "website", "phone", "source_url"];
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(",")),
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

function LeadgenMap({ rows, scan, selectedIndex, onSelect }) {
  const mapRef = useRef(null);
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
              <a href="${escapeHtml(row.website || row.source_url || "#")}" target="_blank" rel="noreferrer">${escapeHtml(hostFor(row.website || row.source_url))}</a>
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
        <span>{scan ? "Live OSM coordinates" : "Awaiting scan"}</span>
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
          </div>
        ) : null}
      </div>
    </section>
  );
}

function LeadgenScanApp() {
  const scanCacheRef = useRef(new Map());
  const scanPromisesRef = useRef(new Map());
  const [zip, setZip] = useState("");
  const [niche, setNiche] = useState("All");
  const [industryOptions, setIndustryOptions] = useState(PUBLIC_NICHES);
  const [offer, setOffer] = useState("");
  const [dailyCap, setDailyCap] = useState(35);
  const [scan, setScan] = useState(null);
  const [review, setReview] = useState({});
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [contactFilter, setContactFilter] = useState("all");
  const [subIndustryFilter, setSubIndustryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("contact");
  const [prefetchState, setPrefetchState] = useState("idle");
  const [lastScanMeta, setLastScanMeta] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const validZip = /^\d{5}$/.test(zip);

  const rows = scan?.rows || [];
  const reviewedRows = useMemo(() => (
    (scan?.rows || []).map((row, index) => ({
      ...row,
      status: review[index] || "keep",
    }))
  ), [scan, review]);
  const kept = reviewedRows.filter((row) => row.status === "keep");
  const maybe = reviewedRows.filter((row) => row.status === "maybe");
  const rejected = reviewedRows.filter((row) => row.status === "reject");
  const websites = reviewedRows.filter((row) => row.website).length;
  const phones = reviewedRows.filter((row) => row.phone).length;
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
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "name") return a.row.name.localeCompare(b.row.name);
        if (sortBy === "city") return (a.row.city || "").localeCompare(b.row.city || "") || a.row.name.localeCompare(b.row.name);
        if (sortBy === "status") return (statusRank[a.row.status] ?? 9) - (statusRank[b.row.status] ?? 9) || a.row.name.localeCompare(b.row.name);
        if (sortBy === "mapped") return (asPoint(b.row) ? 1 : 0) - (asPoint(a.row) ? 1 : 0) || a.row.name.localeCompare(b.row.name);
        const ac = (a.row.website ? 2 : 0) + (a.row.phone ? 1 : 0);
        const bc = (b.row.website ? 2 : 0) + (b.row.phone ? 1 : 0);
        return bc - ac || a.row.name.localeCompare(b.row.name);
      });
  }, [contactFilter, deferredSearchTerm, reviewedRows, sortBy, statusFilter, subIndustryFilter]);
  const visibleOnlyRows = visibleRows.map(({ row }) => row);
  const effectiveSelectedIndex = visibleRows.some((item) => item.index === selectedIndex)
    ? selectedIndex
    : visibleRows[0]?.index ?? null;
  const effectivePrefetchState = validZip ? prefetchState : "idle";
  const zipHint = zip && !validZip ? "Enter a valid 5-digit US zip to scan this market." : "";

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
    setReview(Object.fromEntries((data.rows || []).map((_, index) => [index, index < 20 ? "keep" : "maybe"])));
    setSelectedIndex((data.rows || []).length ? 0 : null);
    setSearchTerm("");
    setStatusFilter("all");
    setContactFilter("all");
    setSubIndustryFilter("all");
    setSortBy("contact");
    setLastScanMeta({ ...meta, at: Date.now() });
  };

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

  const exportRows = () => {
    if (!visibleOnlyRows.length) return;
    trackEvent("select_content", {
      content_type: "leadgen_export",
      source: "leadgen_scanner",
      zip,
      niche,
      count: visibleOnlyRows.length,
    });
    downloadCsv(`leadgen-${zip}-${niche.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`, visibleOnlyRows);
  };

  const applyQuickMarket = (preset) => {
    setZip(preset.zip);
    setNiche(preset.niche);
    setOffer(preset.offer);
    setDailyCap(35);
    setErr("");
    trackEvent("select_content", {
      content_type: "leadgen_quick_market",
      source: "leadgen_scanner",
      label: preset.label,
      zip: preset.zip,
      niche: preset.niche,
    });
  };

  const prefetchMarket = useCallback((preset) => {
    if (!preset?.zip || !/^\d{5}$/.test(preset.zip)) return;
    getScanData(preset.zip, preset.niche || "All")
      .then(() => setPrefetchState((current) => (current === "idle" ? "ready" : current)))
      .catch(() => {});
  }, [getScanData]);

  return (
    <section className="leadgen-app-shell" aria-label="Leadgen local market scanner">
      <div className="leadgen-app-panel leadgen-app-panel--control">
        <div className="leadgen-app-topline">
          <span className="leadgen-app-live"><span /> Live public-record scanner</span>
            <Link
              to="/portal/leadgen?utm_source=leadgen_page&utm_medium=scanner&utm_campaign=workspace_handoff"
              className="leadgen-app-portal-link"
              onClick={() => trackEvent("generate_lead", { source: "leadgen_scanner_toplink" })}
            >
            Open campaign workspace
          </Link>
        </div>

        <div className="leadgen-app-title">
          <h1 className="display">Build a local prospect list before you buy anything.</h1>
          <p>
            Pick a zip and niche. Leadgen pulls public business records, shows the source,
            lets you review the list, and exports the segment for the real campaign workspace.
          </p>
        </div>

        <div className="leadgen-context-strip" aria-label="How to read this scanner">
          {SCANNER_CONTEXT.map((item) => (
            <div key={item.title} className="leadgen-context-item" tabIndex="0">
              <Info size={15} aria-hidden="true" />
              <strong>{item.title}</strong>
              <span className="leadgen-context-item__hint">{item.body}</span>
            </div>
          ))}
        </div>

        <div className="leadgen-app-controls">
          <label>
            <span>Zip code</span>
            <input
              value={zip}
              onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
              onKeyDown={onScanKeyDown}
              inputMode="numeric"
              placeholder="Enter any 5-digit zip"
              aria-label="Target zip code"
            />
          </label>
          <label>
            <span>Niche</span>
            <select value={niche} onChange={(e) => setNiche(e.target.value)} aria-label="Target niche">
              {industryOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="leadgen-app-controls__wide">
            <span>Offer angle</span>
            <input
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              onKeyDown={onScanKeyDown}
              placeholder="Example: backup cleanup for busy offices"
              aria-label="Offer angle"
            />
          </label>
          <label>
            <span>Daily cap</span>
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
          <button type="button" className="btn btn-primary" onClick={runScan} disabled={busy || !validZip}>
            <Search size={16} aria-hidden="true" />
            {busy ? "Scanning..." : effectivePrefetchState === "ready" ? "Open scan" : "Run scan"}
          </button>
        </div>

        <div className="leadgen-quick-markets" aria-label="Quick market presets">
          <span>Quick start</span>
          {QUICK_MARKETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="leadgen-quick-market-btn"
              onClick={() => applyQuickMarket(preset)}
              onMouseEnter={() => prefetchMarket(preset)}
              onFocus={() => prefetchMarket(preset)}
              title={preset.offer}
              aria-label={`${preset.label}: ${preset.offer}`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {zipHint ? <p className="leadgen-app-error" style={{ marginTop: 8 }}>{zipHint}</p> : null}

        <div className={`leadgen-prefetch leadgen-prefetch--${effectivePrefetchState}`}>
          <span />
          {effectivePrefetchState === "loading" ? "Prefetching this market..." : null}
          {effectivePrefetchState === "ready" ? "Scan is warmed and ready." : null}
          {effectivePrefetchState === "idle" ? "Enter a valid zip to warm the scan." : null}
        </div>

        {err ? <p className="leadgen-app-error">{err}</p> : null}

        <div className="leadgen-app-kpis" aria-label="Scan metrics">
          <div><Building2 size={15} /><strong>{scan?.matched ?? "-"}</strong><span>matching records</span></div>
          <div><Database size={15} /><strong>{websites || "-"}</strong><span>with websites</span></div>
          <div><Mail size={15} /><strong>{phones || "-"}</strong><span>with phone</span></div>
          <div><Check size={15} /><strong>{kept.length || "-"}</strong><span>kept after review</span></div>
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
            <p>{kept.length ? `${Math.ceil(kept.length / Math.max(1, Number(dailyCap) || 35))} sending day estimate for kept rows.` : lastScanMeta?.cached ? "Loaded from a warmed scan." : "Run and review a scan first."}</p>
          </div>
        </div>

        {scan && kept.length >= 5 ? (
          <div className="leadgen-conversion-strip" role="region" aria-label="Next best conversion actions">
            <div>
              <span>Ready to launch</span>
              <strong>{kept.length} reviewed businesses ready for a first campaign pass</strong>
              <p>
                At {dailyCap || 35}/day, this is about {Math.max(1, Math.ceil(kept.length / Math.max(1, Number(dailyCap) || 35)))} send day
                {Math.ceil(kept.length / Math.max(1, Number(dailyCap) || 35)) === 1 ? "" : "s"}.
              </p>
            </div>
            <div className="leadgen-conversion-strip__actions">
              <LeadgenPlanLink
                tierId="growth"
                billing="monthly"
                className="btn btn-primary btn-sm"
                source="leadgen_scanner_ready_growth"
                context="scanner_conversion_strip"
                onClick={() => trackEvent("generate_lead", { source: "leadgen_scanner_ready_growth", kept_count: kept.length })}
              >
                Start Growth
              </LeadgenPlanLink>
              <Link
                to={BOOK_DEMO_URL}
                className="btn btn-secondary btn-sm"
                onClick={() => trackEvent("generate_lead", { source: "leadgen_scanner_ready_demo", kept_count: kept.length })}
              >
                Review with us
              </Link>
              <Link
                to="/portal/leadgen?utm_source=leadgen_page&utm_medium=scanner_strip&utm_campaign=workspace_handoff"
                className="btn btn-secondary btn-sm"
                onClick={() => trackEvent("generate_lead", { source: "leadgen_scanner_ready_workspace", kept_count: kept.length })}
              >
                Open workspace
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      <div className="leadgen-app-panel leadgen-app-panel--results">
        <div className="leadgen-app-results-head">
          <div>
            <span>{scan ? `${visibleRows.length} visible / ${scan.matched} matched` : "Ready to scan"}</span>
            <h2>Review list</h2>
          </div>
          <div className="leadgen-app-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={exportRows} disabled={!reviewedRows.length}>Export CSV</button>
            <Link
              to="/portal/leadgen?utm_source=leadgen_page&utm_medium=scanner_results&utm_campaign=workspace_handoff"
              className="btn btn-primary btn-sm"
              onClick={() => trackEvent("generate_lead", { source: "leadgen_scanner_results" })}
            >
              Use in workspace
            </Link>
          </div>
        </div>

        <div className="leadgen-review-summary">
          <span>{kept.length} keep</span>
          <span>{maybe.length} maybe</span>
          <span>{rejected.length} reject</span>
          {scan ? <span>{visibleRows.length} visible</span> : null}
        </div>

        <div className="leadgen-result-tools" aria-label="Result search and filters">
          <label className="leadgen-result-tools__search">
            <span>Search loaded records</span>
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Name, city, service, phone, website..."
              aria-label="Search loaded lead records"
              disabled={!reviewedRows.length}
            />
          </label>
          <label>
            <span>Status</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} disabled={!reviewedRows.length}>
              <option value="all">All</option>
              <option value="keep">Keep</option>
              <option value="maybe">Maybe</option>
              <option value="reject">Reject</option>
            </select>
          </label>
          <label>
            <span>Contact</span>
            <select value={contactFilter} onChange={(e) => setContactFilter(e.target.value)} disabled={!reviewedRows.length}>
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
            <select value={subIndustryFilter} onChange={(e) => setSubIndustryFilter(e.target.value)} disabled={!subIndustryOptions.length}>
              <option value="all">All</option>
              {subIndustryOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>Sort</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} disabled={!reviewedRows.length}>
              <option value="contact">Best contact</option>
              <option value="name">Name</option>
              <option value="city">City</option>
              <option value="status">Review status</option>
              <option value="mapped">Mapped first</option>
            </select>
          </label>
        </div>

        <LeadgenMap rows={visibleOnlyRows} scan={scan} selectedIndex={effectiveSelectedIndex} onSelect={setSelectedIndex} />

        <div className="leadgen-result-list">
          {!rows.length ? (
            <div className="leadgen-empty-review">
              <strong>No list yet</strong>
              <span>Enter a zip code, choose a niche, and run a scan. Results here come from public records with source fields attached.</span>
            </div>
          ) : !visibleRows.length ? (
            <div className="leadgen-empty-review">
              <strong>No records match these filters</strong>
              <span>Clear the search or loosen the filters. The original scan is still cached for this zip and niche.</span>
            </div>
          ) : visibleRows.map(({ row, index }) => (
            <article
              key={`${row.source_id || row.name}-${index}`}
              className={`leadgen-result-row leadgen-result-row--${review[index] || "keep"}${index === effectiveSelectedIndex ? " is-selected" : ""}`}
              title={`${REVIEW_COPY[review[index] || "keep"]} Source: ${row.source_url || "not available"}`}
              onMouseEnter={() => setSelectedIndex(index)}
              onFocus={() => setSelectedIndex(index)}
            >
              <div className="leadgen-result-row__main">
                <strong>{row.name}</strong>
                <span>{[row.sub_industry || row.industry_group, row.city || row.address, row.zip].filter(Boolean).join(" - ")}</span>
              </div>
              <div className="leadgen-result-row__meta">
                <a href={row.website || row.source_url} target="_blank" rel="noreferrer">{hostFor(row.website || row.source_url)}</a>
                {row.phone ? <span>{row.phone}</span> : <span>Phone missing</span>}
                <span className="leadgen-result-row__source">{sourceFor(row)}</span>
              </div>
              <select
                className={`leadgen-review-select leadgen-review-select--${review[index] || "keep"}`}
                value={review[index] || "keep"}
                onChange={(e) => setReview((current) => ({ ...current, [index]: e.target.value }))}
                aria-label={`Review status for ${row.name}`}
                title={REVIEW_COPY[review[index] || "keep"]}
              >
                <option value="keep">Keep</option>
                <option value="maybe">Maybe</option>
                <option value="reject">Reject</option>
              </select>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Leadgen() {
  const [billing, setBilling] = useState("monthly");

  useSEO({
    title: "Get Local Leads | Simple IT SRQ",
    description:
      "Run a small local lead test: one zip, one business type, verified contacts, capped sends, and reply tracking from $19/month.",
    canonical: `${SITE_URL}/leadgen`,
    image: `${SITE_URL}/og-image.png`,
    breadcrumbs: [
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Leadgen", url: `${SITE_URL}/leadgen` },
    ],
    products: LEADGEN_PRODUCTS,
    faqs: LEADGEN_FAQS,
  });

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
            <h2 className="title-1">The product is the first paid test.</h2>
            <p className="lede">
              Not a CRM. Not a social scheduler. Not a promise of booked calls.
              Growth is the controlled workflow that tells you whether a local
              niche is worth pursuing before you spend real ad money.
            </p>
          </div>
          <div className="leadgen-product-rules">
            {PRODUCT_RULES.map((rule, index) => (
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

      <LeadgenWorkspaceSection />

      {/* Operating rules */}
      <section className="section leadgen-statband-section">
        <div className="container">
          <div className="leadgen-statband">
            <div className="leadgen-statband__cell">
              <div className="leadgen-statband__num">1</div>
              <div className="leadgen-statband__label">Zip code to start</div>
            </div>
            <div className="leadgen-statband__cell">
              <div className="leadgen-statband__num">1</div>
              <div className="leadgen-statband__label">Business type to target</div>
            </div>
            <div className="leadgen-statband__cell">
              <div className="leadgen-statband__num">35</div>
              <div className="leadgen-statband__label">Default daily send cap</div>
            </div>
            <div className="leadgen-statband__cell">
              <div className="leadgen-statband__num">$19</div>
              <div className="leadgen-statband__label">First paid test</div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="section section-alt">
        <div className="container">
          <div className="section-head" style={{ maxWidth: 720 }}>
            <span className="eyebrow">How it works</span>
            <h2 className="title-1">Four steps from a local market to a real reply.</h2>
          </div>
          <div className="leadgen-steps">
            {STEPS.map((s) => (
              <div key={s.label} className="leadgen-step">
                <div className="leadgen-step__icon"><s.Icon size={22} /></div>
                <h3 className="leadgen-step__title">{s.label}</h3>
                <p className="leadgen-step__body">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="section">
        <div className="container">
          <div className="section-head" style={{ maxWidth: 720 }}>
            <span className="eyebrow">Capabilities</span>
            <h2 className="title-1">The parts that matter before you send.</h2>
          </div>
          <div className="leadgen-features">
            {FEATURES.map((f) => (
              <div key={f.title} className="leadgen-feature">
                <div className="leadgen-feature__icon"><f.Icon size={20} /></div>
                <h3 className="leadgen-feature__title">{f.title}</h3>
                <p className="leadgen-feature__body">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Compliance band */}
      <section className="section section-alt leadgen-compliance">
        <div className="container">
          <div className="section-head" style={{ maxWidth: 760 }}>
            <span className="eyebrow"><ShieldCheck size={14} style={{ display: "inline", marginRight: 6 }} /> Compliance & deliverability</span>
            <h2 className="title-1">Built to keep the first test controlled.</h2>
            <p className="lede">
              The goal is not maximum volume. The goal is a narrow list, a clean
              offer, a working unsubscribe path, and enough replies to know whether
              the market is worth chasing.
            </p>
          </div>
          <ul className="leadgen-compliance-list">
            {COMPLIANCE.map((c) => (
              <li key={c}><Check size={16} /> {c}</li>
            ))}
          </ul>
        </div>
      </section>

      <LeadgenTestimonials />

      <LeadgenLimits />

      {/* Pricing */}
      <section id="pricing" className="section">
        <div className="container">
          <div className="section-head" style={{ maxWidth: 720 }}>
            <span className="eyebrow">Pricing</span>
            <h2 className="title-1">Growth is the default. Everything else is secondary.</h2>
            <p className="lede">
              Start with Growth unless you only want to inspect a sample.
              Pro is for teams already repeating the same workflow across
              several local markets.
            </p>
          </div>

          <div className="leadgen-billing-toggle" role="tablist" aria-label="Billing cadence">
            <button
              role="tab"
              aria-selected={billing === "monthly"}
              className={`leadgen-billing-btn${billing === "monthly" ? " is-active" : ""}`}
              onClick={() => setBilling("monthly")}
            >Monthly</button>
            <button
              role="tab"
              aria-selected={billing === "annual"}
              className={`leadgen-billing-btn${billing === "annual" ? " is-active" : ""}`}
              onClick={() => setBilling("annual")}
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
                  const stripeUrl = billing === "annual" ? t.stripeAnnual : t.stripeMonthly;
                  if (stripeUrl) {
                    return (
                      <LeadgenPlanLink
                        tierId={t.id}
                        billing={billing}
                        className={`btn ${t.highlight ? "btn-primary" : "btn-secondary"} leadgen-tier__cta`}
                        source={`leadgen_pricing_${t.id}`}
                        context="pricing_table"
                      >
                        {t.cta} <ArrowRight size={14} />
                      </LeadgenPlanLink>
                    );
                  }
                  return (
                    <Link
                      to={t.ctaHref}
                      className={`btn ${t.highlight ? "btn-primary" : "btn-secondary"} leadgen-tier__cta`}
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

      {/* Final CTA */}
      <section className="section section-alt leadgen-final-cta">
        <div className="container" style={{ maxWidth: 720, textAlign: "center" }}>
          <h2 className="title-1">Start with one local list.</h2>
          <p className="lede" style={{ marginTop: 12 }}>
            Growth is the fastest honest test: enough records to learn, enough
            throttling to stay safe, and a one-business-day review before launch.
          </p>
          <div className="hero-ctas" style={{ justifyContent: "center", marginTop: 24 }}>
            <LeadgenPlanLink
              tierId="growth"
              billing="monthly"
              className="btn btn-primary btn-lg"
              source="leadgen_final_cta_growth"
              context="final_cta"
            >
              Start Growth
            </LeadgenPlanLink>
            <Link
              to={BOOK_DEMO_URL}
              className="btn btn-secondary btn-lg"
              onClick={() => trackEvent("generate_lead", { source: "leadgen_final_cta_demo" })}
            >
              Review my first niche
            </Link>
          </div>
        </div>
      </section>
    </main>
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

function LeadgenWorkspaceSection() {
  return (
    <section className="section section-alt leadgen-workspace">
      <div className="container leadgen-workspace__grid">
        <div className="leadgen-workspace__copy">
          <span className="eyebrow">Actual workspace</span>
          <h2 className="title-1">This is the app behind the page.</h2>
          <p className="lede">
            The public page sells the paid test. The portal is where the work
            happens: build the local list, verify contacts, review the campaign,
            run the queue, and see whether the market responds.
          </p>
          <div className="hero-ctas">
            <Link
              to="/portal/leadgen?utm_source=leadgen_page&utm_medium=workspace_section&utm_campaign=workspace_handoff"
              className="btn btn-primary"
              onClick={() => trackEvent("generate_lead", { source: "leadgen_workspace_cta" })}
            >
              Open workspace <ArrowRight size={16} />
            </Link>
            <Link
              to={BOOK_DEMO_URL}
              className="btn btn-secondary"
              onClick={() => trackEvent("generate_lead", { source: "leadgen_workspace_demo" })}
            >
              Review a niche
            </Link>
          </div>
        </div>
        <div className="leadgen-workspace__flow" aria-label="Leadgen workspace workflow">
          {WORKSPACE_FLOW.map((item, index) => (
            <article key={item.title} className="leadgen-workspace__step">
              <span className="leadgen-workspace__num">{index + 1}</span>
              <div className="leadgen-workspace__icon"><item.Icon size={18} /></div>
              <div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- objections band ----------
// We deliberately ship pre-launch principles instead of fabricated
// testimonials. Real customer quotes go here once we have explicit
// written permission per FTC 16 CFR §255 endorsement guides.
const OBJECTIONS = [
  {
    Icon: ShieldCheck,
    title: "What keeps this from getting sloppy?",
    body: "Small batches, daily caps, unsubscribe links, a physical address, and a pre-send review on the first campaign. If the list or offer is weak, we say that before sending.",
    color: "#111827",
  },
  {
    Icon: Database,
    title: "Where do the records actually come from?",
    body: "Business records start with OpenStreetMap. Contact emails come from published business websites, contact pages, and mailto links, not purchased email lists.",
    color: "#6b7280",
  },
  {
    Icon: BarChart3,
    title: "What should I expect?",
    body: "A paid test should tell you whether one local niche responds to one clear offer. It is not a promise of customers; it is a faster way to stop guessing.",
    color: "#9ca3af",
  },
];

function LeadgenTestimonials() {
  return (
    <section className="section leadgen-testimonials">
      <div className="container">
        <div className="section-head" style={{ maxWidth: 720 }}>
          <span className="eyebrow">Before you sign</span>
          <h2 className="title-1">The questions we would ask before buying it.</h2>
          <p className="lede">
            No fake testimonials. No mystery database. This is the plain version
            of what the tool does and where it can disappoint you.
          </p>
        </div>
        <div className="leadgen-testimonials__grid">
          {OBJECTIONS.map((o) => (
            <div key={o.title} className="leadgen-testimonial">
              <div
                className="leadgen-testimonial__mark"
                style={{ color: o.color, opacity: 0.85 }}
                aria-hidden="true"
              >
                <o.Icon size={22} />
              </div>
              <h3 className="leadgen-objection__title">{o.title}</h3>
              <p className="leadgen-objection__body">{o.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LeadgenLimits() {
  return (
    <section className="section section-alt leadgen-limits">
      <div className="container leadgen-limits__grid">
        <div>
          <span className="eyebrow">Honest limits</span>
          <h2 className="title-1">This will not fix a bad offer.</h2>
          <p className="lede">
            Leadgen gives you local data and safer outbound mechanics.
            It still needs a real offer, a narrow audience, and replies handled
            by a human who knows the business.
          </p>
        </div>
        <div className="leadgen-limits__panel">
          <h3>What happens after signup</h3>
          <ol>
            <li>We review your target zip, niche, and offer within one business day.</li>
            <li>You run the first Growth search and inspect the source records.</li>
            <li>We tune the first campaign cap before anything sends.</li>
            <li>You get replies in your inbox, plus open/click/reply tracking in the dashboard.</li>
          </ol>
        </div>
      </div>
    </section>
  );
}

// ---------- post-checkout success banner ----------
// Stripe Payment Links redirect here with ?checkout=success&tier=...&cadence=...
// We strip the params after first render so a refresh doesn't re-show the banner.
function LeadgenCheckoutSuccess() {
  // Read the success params on first render via lazy initializer so we
  // never call setState inside an effect (avoids the cascading-render
  // lint and avoids a pointless re-render.
  const [state] = useState(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success") return null;
    return {
      tier: params.get("tier") || "your plan",
      cadence: params.get("cadence") || "",
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
      const qs = params.toString();
      const url = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
      window.history.replaceState(null, "", url);
    } catch { /* ignore */ }
  }, [state]);

  if (!state) return null;

  const tierLabel = state.tier === "starter" ? "Starter" :
    state.tier === "growth" ? "Growth" :
    state.tier === "enterprise" ? "Enterprise" : "your plan";
  const cadenceLabel = state.cadence === "annual" ? "annual" :
    state.cadence === "monthly" ? "monthly" : "";

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: "linear-gradient(135deg, #111827 0%, #374151 100%)",
        color: "#fff",
        padding: "20px 16px",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 8, fontWeight: 700, fontSize: "1.05rem" }}>
          <Check size={20} aria-hidden="true" />
          You&rsquo;re in. Welcome to Leadgen {tierLabel}{cadenceLabel ? ` - ${cadenceLabel}` : ""}.
        </div>
        <p style={{ margin: "4px 0 12px", fontSize: "0.95rem", opacity: 0.95, lineHeight: 1.5 }}>
          Your receipt is on its way from Stripe. We&rsquo;ll email your onboarding
          checklist within 1 business hour, and your dashboard credentials within 24 hours.
        </p>
        <div style={{ display: "inline-flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <a
            href={`mailto:hello@simpleitsrq.com?subject=Leadgen%20${tierLabel}%20onboarding`}
            className="btn btn-secondary btn-sm"
            style={{ background: "#fff", color: "#111827", borderColor: "#fff" }}
          >
            Email us your priority list
          </a>
          <Link
            to="/book?topic=leadgen-onboarding"
            className="btn btn-secondary btn-sm"
            style={{ background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,0.7)" }}
          >
            Book onboarding call
          </Link>
        </div>
      </div>
    </div>
  );
}

