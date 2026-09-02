import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
// Leadgen CSS is imported eagerly in main.jsx so the whole stylesheet ships
// in a single bundle that is always linked from index.html. Importing here
// caused Vite/Rollup to split the CSS into orphan chunks that were never
// referenced from the page bundle, leaving the new daisyUI card classes
// unstyled on production.
import { Link } from "../lib/Link";
import { ArrowRight, Check, ChevronDown, ExternalLink, Globe2, Mail, MapPin, Phone, Search, Sparkles } from "lucide-react";
import { useSEO, SITE_URL } from "../lib/seo";
import { trackEvent } from "../lib/analytics.js";
import { csrfFetch } from "../lib/csrf";
import { useAuth } from "../lib/authContext.js";

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
const PUBLIC_NICHES = ["All", "Healthcare", "Trades", "Professional Services", "Automotive", "Hospitality", "Personal Services", "Retail", "Food & Drink", "Education", "Real Estate", "Cleaning & Maintenance", "Media & Creative", "Recreation"];
const SCAN_LIMIT = 80;

// Reverse-geocode lat/lon → US ZIP via OpenStreetMap Nominatim.
// Free, no API key, CORS-enabled, low-volume use is fine per their policy.
// We send a descriptive User-Agent (Nominatim blocks bare Node fetchers)
// and a contact email query param so their abuse team can reach us.
//
// zoom=14 returns the postcode reliably (zoom=10 only returns the city
// without postcode for many US metro areas).
async function reverseGeocodeZip(lat, lon, { signal } = {}) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("zoom", "14");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("email", "hello@simpleitsrq.com");
  const res = await fetch(url, {
    signal,
    headers: {
      Accept: "application/json",
      "User-Agent": "simpleitsrq-leadgen/1.0 (https://simpleitsrq.com; hello@simpleitsrq.com)",
    },
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const addr = data?.address || {};
  const candidate = addr.postcode || addr.postal_code || "";
  const match = String(candidate).match(/\b(\d{5})\b/);
  return match ? match[1] : null;
}

function getStoredZipPref() {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem("leadgen.zipPref"); } catch { return null; }
}
function setStoredZipPref(state) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem("leadgen.zipPref", state); } catch {}
}

// Detect the browser's actual geolocation permission state via the Permissions
// API. Returns "granted" | "denied" | "prompt" | "unsupported". This is the
// key to the "Try location again" problem: once a user denies geolocation, the
// browser will NOT re-prompt (permission is sticky). So we must detect the
// sticky "denied" state and guide the user to re-enable it in browser settings
// instead of silently calling getCurrentPosition (which just fires the error
// callback with code 1 and shows no prompt).
async function queryGeoPermission() {
  try {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return "unsupported";
    const status = await navigator.permissions.query({ name: "geolocation" });
    return status.state; // "granted" | "denied" | "prompt"
  } catch {
    return "unsupported";
  }
}

// Human, per-platform instructions for re-enabling geolocation after a sticky
// denial. The browser will not re-prompt on its own, so we tell the user where
// to flip it back on. Detected from the user agent.
function geoDeniedHelp() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return "On iPhone/iPad: Settings → Privacy & Security → Location Services → turn on, then allow Simple IT SRQ. Then reload this page.";
  }
  if (/Android/i.test(ua)) {
    return "On Android: Settings → Apps → Simple IT SRQ → Permissions → Location → Allow. Then reload this page.";
  }
  if (/Edg\//i.test(ua)) {
    return "In Edge: click the lock icon in the address bar → Site permissions → Location → Allow. Then reload this page.";
  }
  if (/Firefox\//i.test(ua)) {
    return "In Firefox: click the shield/lock icon in the address bar → Permissions → Location → Allow. Then reload this page.";
  }
  if (/Chrome\//i.test(ua) || /Chromium/i.test(ua)) {
    return "In Chrome: click the lock icon in the address bar → Site settings → Location → Allow. Then reload this page.";
  }
  if (/Safari\//i.test(ua)) {
    return "In Safari: Safari → Settings → Websites → Location → Allow for this site. Then reload this page.";
  }
  if (/Linux/i.test(ua)) {
    return "On Linux: check your browser's site-permissions settings (address-bar lock icon) and your desktop's location service, then reload this page.";
  }
  return "Allow location for this site in your browser's site-permissions settings, then reload this page.";
}

function stripeSafeParam(value, fallback = "leadgen") {
  const safe = String(value ?? "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
  return safe || fallback;
}

function leadgenCheckoutReference({ tierId = "growth", billing = "monthly", source = "leadgen", checkoutContext = {} } = {}) {
  const parts = ["lg", stripeSafeParam(tierId), stripeSafeParam(billing)];
  const zip = String(checkoutContext.zip || "").replace(/\D/g, "").slice(0, 5);
  if (zip) parts.push("zip", zip);
  if (checkoutContext.niche && checkoutContext.niche !== "All") parts.push("niche", stripeSafeParam(checkoutContext.niche));
  parts.push("src", stripeSafeParam(source));
  return parts.join("_").slice(0, 150);
}

function withLeadgenCheckoutParams(url, options = {}) {
  if (!url) return "";
  try {
    const next = new URL(url);
    if (!next.searchParams.has("prefilled_promo_code")) next.searchParams.set("prefilled_promo_code", LEADGEN_PROMO_CODE);
    next.searchParams.set("client_reference_id", leadgenCheckoutReference(options));
    next.searchParams.set("utm_source", "simpleitsrq_com");
    next.searchParams.set("utm_medium", "leadgen");
    next.searchParams.set("utm_campaign", "leadgen_checkout");
    return next.toString();
  } catch {
    return url;
  }
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function contactInsightLabels(signal) {
  if (!signal) return [];
  const labels = [];
  if (signal.brand_asset?.data_uri) labels.push("Brand asset");
  if (signal.has_contact_form) labels.push("Contact form");
  if (signal.social?.linkedin) labels.push("LinkedIn");
  if (signal.social?.facebook) labels.push("Facebook");
  if (signal.social?.instagram) labels.push("Instagram");
  if (Number(signal.pages_fetched) > 0) labels.push(`${Number(signal.pages_fetched)} pages checked`);
  return labels;
}

function dataCoverage(row, email = "") {
  const fields = [
    ["business name", row.name],
    ["category", row.sub_industry || row.industry_group || row.industry],
    ["address", row.address || (row.city && row.state)],
    ["website", row.website],
    ["phone", row.phone],
    ["email", email],
    ["source", row.source_url || row.source_id],
  ];
  const filled = fields.filter(([, value]) => Boolean(value)).length;
  const missing = fields.filter(([, value]) => !value).map(([label]) => label);
  return { filled, total: fields.length, percent: Math.round((filled / fields.length) * 100), missing };
}

function fitLabel(row) {
  if (row?.fit_label) return row.fit_label;
  if (!row?.is_chain && row?.sub_industry) return "Strong fit";
  if (!row?.is_chain) return "Good fit";
  return "Review";
}

function fitRank(row) {
  const label = fitLabel(row);
  if (label === "Strong fit") return 3;
  if (label === "Good fit") return 2;
  return 1;
}

function hostnameOf(value) {
  if (!value) return "";
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return String(value).replace(/^https?:\/\//, "").split("/")[0];
  }
}

function websiteHref(value) {
  if (!value) return "";
  const raw = String(value).trim();
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function telHref(value) {
  return `tel:${String(value || "").replace(/[^+\d]/g, "")}`;
}

function prospectKey(row) {
  return row.source_id || `${row.name || "prospect"}-${row.__scanIndex}`;
}

function downloadCsv(filename, rows) {
  const headers = ["status", "name", "industry", "sub_industry", "address", "city", "state", "zip", "website", "phone", "email", "fit", "data_coverage", "source", "source_confidence", "source_url"];
  const lines = [headers.map(csvCell).join(",")];
  rows.forEach((row) => {
    const coverage = dataCoverage(row, row.email || row.emails?.[0]?.email || "");
    const record = { ...row, fit: fitLabel(row), data_coverage: coverage.percent };
    lines.push(headers.map((key) => csvCell(record[key])).join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}


function escapeMapHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function mapPoint(row) {
  const lat = Number(row?.lat);
  const lng = Number(row?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function normalizedMapPoints(rows, cap = 120) {
  const points = rows.slice(0, cap).map((row) => ({ point: mapPoint(row), row })).filter((item) => item.point);
  if (!points.length) return [];
  const lats = points.map((item) => item.point.lat);
  const lngs = points.map((item) => item.point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = Math.max(0.0001, maxLat - minLat);
  const lngSpan = Math.max(0.0001, maxLng - minLng);
  return points.map((item) => ({
    x: ((item.point.lng - minLng) / lngSpan) * 100,
    y: (1 - (item.point.lat - minLat) / latSpan) * 100,
    label: item.row?.name || "Business",
  }));
}

function mapsQueryFor(row, fallback = "") {
  const parts = [row?.name, row?.address, row?.city, row?.state, row?.zip].filter(Boolean);
  return parts.join(", ").trim() || fallback;
}

function BusinessFavicon({ brandAsset, name }) {
  const [failed, setFailed] = useState(false);
  const initials = String(name || "Business").trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "B";
  const src = brandAsset?.data_uri || "";
  if (!src || failed) return <span className="leadgen-business-favicon is-fallback" aria-hidden="true">{initials}</span>;
  return (
    <span className="leadgen-business-favicon" aria-hidden="true">
      <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
    </span>
  );
}

function LeadgenMap({ rows, scan }) {
  const mapRef = useRef(null);
  const fallbackLoggedRef = useRef(false);
  const [mapError, setMapError] = useState("");
  const [themeMode, setThemeMode] = useState(() => (
    typeof document !== "undefined" && document.documentElement?.getAttribute("data-theme") === "dark" ? "dark" : "light"
  ));
  const mappedRows = useMemo(() => rows.map((row, index) => ({
    row,
    index: row.__scanIndex ?? index,
    point: mapPoint(row),
  })).filter((item) => item.point), [rows]);
  const fallbackPoints = useMemo(() => normalizedMapPoints(rows), [rows]);
  const centroid = mapPoint(scan?.centroid);
  const topRow = rows?.[0] || null;
  const openMapsSearch = useMemo(() => {
    const query = mapsQueryFor(topRow, scan?.zip || "");
    return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
  }, [scan?.zip, topRow]);
  const openMapsCenter = useMemo(() => centroid ? `https://www.google.com/maps/@${centroid.lat},${centroid.lng},13z` : "", [centroid?.lat, centroid?.lng]);

  useEffect(() => {
    if (typeof MutationObserver === "undefined") return undefined;
    const root = document.documentElement;
    const observer = new MutationObserver(() => setThemeMode(root.getAttribute("data-theme") === "dark" ? "dark" : "light"));
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mappedRows.length) return undefined;
    let disposed = false;
    let leafletMap = null;
    setMapError("");

    import("leaflet").then((mod) => {
      if (disposed || !mapRef.current) return;
      const L = mod.default || mod;
      const isDark = themeMode === "dark";
      const tileProviders = isDark ? [
        { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "&copy; OpenStreetMap contributors" },
        { url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", attribution: "&copy; OpenStreetMap contributors &copy; CARTO" },
        { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attribution: "Tiles &copy; Esri" },
      ] : [
        { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "&copy; OpenStreetMap contributors" },
        { url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", attribution: "&copy; OpenStreetMap contributors &copy; CARTO" },
        { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", attribution: "Tiles &copy; Esri" },
      ];
      let activeTileIndex = 0;
      let tileFailures = 0;
      let tileLayer = null;

      const mountTileLayer = () => {
        const provider = tileProviders[activeTileIndex];
        tileLayer = L.tileLayer(provider.url, { maxZoom: 19, attribution: provider.attribution, crossOrigin: true }).addTo(leafletMap);
        tileLayer.on("tileerror", () => {
          tileFailures += 1;
          if (tileFailures < 4) return;
          if (disposed || !leafletMap || activeTileIndex >= tileProviders.length - 1) {
            if (!fallbackLoggedRef.current) {
              trackEvent("exception", { source: "leadgen_public_map_tiles", fatal: false, context: "scanner_map" });
              fallbackLoggedRef.current = true;
            }
            setMapError("Live map tiles are blocked on this network/browser. Review list and export still work.");
            return;
          }
          activeTileIndex += 1;
          tileFailures = 0;
          leafletMap.removeLayer(tileLayer);
          mountTileLayer();
        });
      };

      leafletMap = L.map(mapRef.current, { attributionControl: false, scrollWheelZoom: false, zoomControl: true });
      mountTileLayer();
      L.control.attribution({ prefix: false }).addTo(leafletMap);

      const bounds = [];
      mappedRows.forEach(({ row, index, point }, position) => {
        bounds.push([point.lat, point.lng]);
        const marker = L.marker([point.lat, point.lng], {
          icon: L.divIcon({
            className: "leadgen-map-pin",
            html: `<span style="--pin-i:${position < 16 ? position : 16}"></span>`,
            iconSize: [30, 30],
            iconAnchor: [15, 30],
            popupAnchor: [0, -30],
          }),
        }).addTo(leafletMap);
        const href = row.website ? websiteHref(row.website) : row.source_url || "";
        const host = hostnameOf(row.website || row.source_url) || "Source record";
        marker.bindPopup(`
          <div class="leadgen-map-popup">
            <strong>${escapeMapHtml(row.name)}</strong>
            <span>${escapeMapHtml([row.sub_industry || row.industry_group, row.city || row.address].filter(Boolean).join(" · "))}</span>
            ${href ? `<a href="${escapeMapHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeMapHtml(host)}</a>` : ""}
          </div>
        `);
        marker.on("click", () => {
          const target = document.getElementById(`leadgen-prospect-${index}`);
          if (target) target.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
        });
      });

      if (bounds.length > 1) leafletMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
      else leafletMap.setView(bounds[0] || [centroid?.lat || 27.3364, centroid?.lng || -82.5307], 14);
      window.setTimeout(() => { if (!disposed && leafletMap) leafletMap.invalidateSize(); }, 80);
    }).catch(() => {
      if (!disposed) setMapError("Map runtime failed to initialize. You can still use filters, reviewed list, and export.");
    });

    return () => {
      disposed = true;
      if (leafletMap) leafletMap.remove();
    };
  }, [centroid?.lat, centroid?.lng, mappedRows, themeMode]);

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
            {fallbackPoints.map((point, index) => <span key={`${point.label}-${index}`} className="leadgen-map-fallback__dot" style={{ left: `${point.x}%`, top: `${point.y}%` }} title={point.label} />)}
          </div>
        ) : null}
        {!mappedRows.length || mapError ? (
          <div className="leadgen-map-empty">
            <span>{mapError || "Run a scan to plot public business records in this market."}</span>
            {mapError ? (
              <div className="leadgen-map-empty__actions">
                {openMapsSearch ? <a className="btn btn-secondary btn-sm" href={openMapsSearch} target="_blank" rel="noopener noreferrer">Open in Google Maps</a> : null}
                {openMapsCenter ? <a className="btn btn-secondary btn-sm" href={openMapsCenter} target="_blank" rel="noopener noreferrer">Open market center</a> : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function LeadgenScanApp() {
  const { user, loading: authLoading } = useAuth();
  const currentPlan = String(user?.plan || "").toLowerCase();
  const canEnrichOne = Boolean(user?.isAdmin || ["growth", "pro", "lifetime"].includes(currentPlan));
  const canBulkEnrich = Boolean(user?.isAdmin || ["pro", "lifetime"].includes(currentPlan));
  const [zip, setZip] = useState("");
  const [zipSource, setZipSource] = useState(null); // "geo" | "manual" | null
  const [geoState, setGeoState] = useState("idle"); // idle | asking | granted | denied | unavailable | error
  const [geoHelp, setGeoHelp] = useState(""); // per-platform re-enable instructions when denied
  const [niche, setNiche] = useState("All");
  const [scan, setScan] = useState(null);
  const [review, setReview] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortMode, setSortMode] = useState("fit");
  const [destinations, setDestinations] = useState([]);
  const [pushTarget, setPushTarget] = useState("");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState(null);
  const [extractedEmails, setExtractedEmails] = useState({});
  const [websiteIntel, setWebsiteIntel] = useState({});
  const [extracting, setExtracting] = useState(false);
  const [extractMsg, setExtractMsg] = useState(null);
  const [siteBusy, setSiteBusy] = useState({});
  const [siteMessages, setSiteMessages] = useState({});
  const [saveMsg, setSaveMsg] = useState(null);
  const [openGroups, setOpenGroups] = useState({});
  const [activeSubs, setActiveSubs] = useState({});
  const [openProspects, setOpenProspects] = useState({});

  const deferredSearchTerm = useDeferredValue(searchTerm);
  const validZip = /^\d{5}$/.test(zip);

  // First-visit geolocation prompt: if the user hasn't decided yet and
  // the browser supports it, ask for permission, reverse-geocode to ZIP,
  // and prefill. Silent if denied or unavailable — they can type a ZIP
  // or click "Use my location" later. We remember the decision so we
  // don't pester them on every visit.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("geolocation" in navigator)) {
      setGeoState("unavailable");
      return;
    }
    const stored = getStoredZipPref();
    if (stored === "denied" || stored === "unavailable") {
      setGeoState(stored);
      return;
    }
    if (stored === "granted" && zip) return; // already have ZIP from a prior visit (component already initialized it)
    let cancelled = false;
    const ac = new AbortController();
    setGeoState("asking");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (cancelled) return;
        try {
          const found = await reverseGeocodeZip(pos.coords.latitude, pos.coords.longitude, { signal: ac.signal });
          if (cancelled) return;
          if (found) {
            setZip((current) => current || found);
            setZipSource((src) => src || "geo");
            setGeoState("granted");
            setStoredZipPref("granted");
            trackEvent("leadgen_zip_autofilled", { source: "geolocation" });
          } else {
            setGeoState("error");
          }
        } catch (err) {
          if (cancelled || err?.name === "AbortError") return;
          setGeoState("error");
        }
      },
      (err) => {
        if (cancelled) return;
        if (err?.code === 1) {
          setGeoState("denied");
          setStoredZipPref("denied");
        } else if (err?.code === 2) {
          setGeoState("unavailable");
          setStoredZipPref("unavailable");
        } else if (err?.code === 3) {
          setGeoState("error");
        }
      },
      { enableHighAccuracy: false, maximumAge: 60 * 60 * 1000, timeout: 8000 },
    );
    return () => { cancelled = true; ac.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestGeolocation = () => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setGeoState("unavailable");
      return;
    }
    // IMPORTANT: call getCurrentPosition synchronously within the click
    // gesture. Geolocation requires "transient user activation" — awaiting
    // anything before this (e.g. the Permissions API) consumes that gesture,
    // so the browser silently skips the prompt and "Try location again"
    // appears to do nothing. The prompt itself triggers on first use; if the
    // browser already has a sticky denial it fires the error callback
    // (code 1) below, which shows the per-platform re-enable help instead.
    setGeoHelp("");
    setGeoState("asking");
    const ac = new AbortController();
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const found = await reverseGeocodeZip(pos.coords.latitude, pos.coords.longitude, { signal: ac.signal });
          if (found) {
            setZip(found);
            setZipSource("geo");
            setGeoState("granted");
            setStoredZipPref("granted");
            trackEvent("leadgen_zip_autofilled", { source: "geolocation_manual_retry" });
          } else {
            setGeoState("error");
          }
        } catch (err) {
          if (err?.name !== "AbortError") setGeoState("error");
        }
      },
      (err) => {
        if (err?.code === 1) { setGeoState("denied"); setStoredZipPref("denied"); setGeoHelp(geoDeniedHelp()); }
        else if (err?.code === 2) { setGeoState("unavailable"); setStoredZipPref("unavailable"); }
        else { setGeoState("error"); }
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 8000 },
    );
  };
  const rows = scan?.rows || [];
  const bestEmail = (row) => row.email || row.emails?.[0]?.email || extractedEmails[row.website] || "";

  const reviewedRows = useMemo(
    () => rows.map((row, index) => ({
      ...row,
      status: review[index] || "unreviewed",
      __scanIndex: index,
      website_intel: websiteIntel[row.website] || null,
    })),
    [rows, review, websiteIntel],
  );

  const visibleRows = useMemo(() => {
    const query = deferredSearchTerm.trim().toLowerCase();
    const filtered = query ? reviewedRows.filter((row) => [
      row.name,
      row.city,
      row.industry_group,
      row.sub_industry,
      row.website,
      row.phone,
      ...(row.fit_reasons || []),
      ...contactInsightLabels(row.website_intel),
    ].filter(Boolean).join(" ").toLowerCase().includes(query)) : [...reviewedRows];

    return filtered.sort((a, b) => {
      if (sortMode === "coverage") return dataCoverage(b, bestEmail(b)).percent - dataCoverage(a, bestEmail(a)).percent || fitRank(b) - fitRank(a);
      if (sortMode === "name") return String(a.name || "").localeCompare(String(b.name || ""));
      if (sortMode === "gaps") {
        const aGaps = Number(!a.website) + Number(!a.phone) + Number(!bestEmail(a));
        const bGaps = Number(!b.website) + Number(!b.phone) + Number(!bestEmail(b));
        return bGaps - aGaps || fitRank(b) - fitRank(a);
      }
      return fitRank(b) - fitRank(a) || dataCoverage(b, bestEmail(b)).percent - dataCoverage(a, bestEmail(a)).percent || String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [reviewedRows, deferredSearchTerm, sortMode, extractedEmails]);

  const groupedRows = useMemo(() => {
    const groups = new Map();
    for (const row of visibleRows) {
      const industry = row.industry_group || row.industry || "Other";
      const sub = row.sub_industry || "Other";
      if (!groups.has(industry)) {
        groups.set(industry, { name: industry, rows: [], subs: new Map(), withWebsite: 0, withPhone: 0, withEmail: 0, enriched: 0, digitalGaps: 0, coverageTotal: 0, strong: 0 });
      }
      const group = groups.get(industry);
      group.rows.push(row);
      if (row.website) group.withWebsite += 1;
      if (row.phone) group.withPhone += 1;
      if (bestEmail(row)) group.withEmail += 1;
      if (row.website_intel) group.enriched += 1;
      if (!row.website || !row.phone || !bestEmail(row)) group.digitalGaps += 1;
      if (fitLabel(row) === "Strong fit") group.strong += 1;
      group.coverageTotal += dataCoverage(row, bestEmail(row)).percent;
      if (!group.subs.has(sub)) group.subs.set(sub, []);
      group.subs.get(sub).push(row);
    }
    return Array.from(groups.values()).map((group) => ({
      ...group,
      avgCoverage: group.rows.length ? Math.round(group.coverageTotal / group.rows.length) : 0,
      contactable: group.rows.length ? Math.round((group.rows.filter((row) => row.phone || bestEmail(row)).length / group.rows.length) * 100) : 0,
    })).sort((a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name));
  }, [visibleRows, extractedEmails]);

  const selectedRows = reviewedRows.filter((row) => row.status === "keep");
    const contactCheckedCount = reviewedRows.filter((row) => row.website_intel).length;
  const averageCoverage = reviewedRows.length ? Math.round(reviewedRows.reduce((sum, row) => sum + dataCoverage(row, bestEmail(row)).percent, 0) / reviewedRows.length) : 0;
  const insights = scan?.market_insights || null;

  useEffect(() => {
    fetch("/api/leadgen-integrations", { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data?.integrations?.length) {
          const supported = data.integrations.filter((integration) => integration.kind === "hubspot" || integration.kind === "webhook");
          setDestinations(supported);
          setPushTarget(supported[0] ? String(supported[0].id) : "");
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!scan || !groupedRows.length) return;
    setOpenGroups((current) => {
      if (Object.keys(current).length) return current;
      return Object.fromEntries(groupedRows.slice(0, 2).map((group) => [group.name, true]));
    });
  }, [scan, groupedRows]);

  const runScan = async () => {
    if (!validZip || busy) return;
    setBusy(true);
    setErr("");
    setScan(null);
    setReview({});
    setOpenGroups({});
    setActiveSubs({});
    setOpenProspects({});
    setWebsiteIntel({});
    setExtractedEmails({});
    setSiteMessages({});
    try {
      const response = await csrfFetch("/api/leadgen", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ zip, niche, limit: SCAN_LIMIT }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${response.status}`);
      setScan(data);
      trackEvent("search", { search_term: `${zip}:${niche}`, source: "leadgen_scanner", result_count: Number(data.matched || data.rows?.length || 0) });
    } catch (error) {
      setErr(error.message || "Scan failed.");
    } finally {
      setBusy(false);
    }
  };

  const setSelected = (row, checked) => {
    setReview((current) => {
      const next = { ...current };
      if (checked) next[row.__scanIndex] = "keep";
      else delete next[row.__scanIndex];
      return next;
    });
  };

  const selectBest = () => {
    const next = {};
    rows.forEach((row, index) => {
      if (fitLabel(row) === "Strong fit") next[index] = "keep";
    });
    setReview(next);
  };

  const qualifyGroup = (group) => {
    setReview((current) => {
      const next = { ...current };
      group.rows.forEach((row) => {
        if (fitLabel(row) === "Strong fit") next[row.__scanIndex] = "keep";
        else delete next[row.__scanIndex];
      });
      return next;
    });
  };

  const clearGroup = (group) => {
    setReview((current) => {
      const next = { ...current };
      group.rows.forEach((row) => { delete next[row.__scanIndex]; });
      return next;
    });
  };

  const enrichSelected = async () => {
    const targets = selectedRows.filter((row) => row.website).slice(0, 30);
    if (!targets.length) return setExtractMsg({ ok: true, text: "Select prospects with websites first." });
    setExtracting(true);
    setExtractMsg(null);
    const foundEmails = { ...extractedEmails };
    const foundIntel = { ...websiteIntel };
    let emailCount = 0;
    let checkedCount = 0;
    try {
      for (let index = 0; index < targets.length; index += 10) {
        const batch = targets.slice(index, index + 10);
        const response = await csrfFetch("/api/leadgen-emails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domains: batch.map((row) => row.website) }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
        (data.results || []).forEach((result, resultIndex) => {
          const key = batch[resultIndex]?.website;
          if (!key) return;
          const email = result.emails?.[0]?.email;
          if (email && !foundEmails[key]) {
            foundEmails[key] = email;
            emailCount += 1;
          }
          if (result.websiteSignals) {
            foundIntel[key] = result.websiteSignals;
            checkedCount += 1;
          }
        });
      }
      setExtractedEmails(foundEmails);
      setWebsiteIntel(foundIntel);
      setExtractMsg({ ok: true, text: `Checked ${checkedCount} website${checkedCount === 1 ? "" : "s"}${emailCount ? ` · found ${emailCount} email${emailCount === 1 ? "" : "s"}` : " · no new public email found"}.` });
    } catch (error) {
      setExtractMsg({ ok: false, text: error.message || "Contact lookup failed." });
    } finally {
      setExtracting(false);
    }
  };

  const findProspectContacts = async (row) => {
    if (!row.website) return;
    const key = row.website;
    setSiteBusy((current) => ({ ...current, [key]: true }));
    setSiteMessages((current) => ({ ...current, [key]: null }));
    try {
      const response = await csrfFetch("/api/leadgen-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ domain: row.website }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${response.status}`);
      const email = data.emails?.[0]?.email;
      if (email) setExtractedEmails((current) => ({ ...current, [key]: email }));
      if (data.websiteSignals) setWebsiteIntel((current) => ({ ...current, [key]: data.websiteSignals }));
      setOpenProspects((current) => ({ ...current, [prospectKey(row)]: true }));
      setSiteMessages((current) => ({ ...current, [key]: { ok: true, text: "Contacts updated." } }));
      trackEvent("generate_lead", { source: "leadgen_contact_enrichment", company: row.name || "prospect" });
    } catch (error) {
      setSiteMessages((current) => ({ ...current, [key]: { ok: false, text: error.message || "Could not check this website for contacts." } }));
    } finally {
      setSiteBusy((current) => ({ ...current, [key]: false }));
    }
  };

  const pushSelected = async () => {
    if (!pushTarget || !selectedRows.length) return;
    setPushBusy(true);
    setPushMsg(null);
    try {
      const leads = selectedRows.map((row) => ({ ...row, email: bestEmail(row) || undefined, website_intel: row.website_intel || undefined }));
      const response = await csrfFetch("/api/leadgen-integrations?action=push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: Number(pushTarget), leads }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${response.status}`);
      setPushMsg({ ok: true, text: `Sent ${data.sent ?? leads.length} lead${(data.sent ?? leads.length) === 1 ? "" : "s"}.` });
    } catch (error) {
      setPushMsg({ ok: false, text: error.message || "CRM push failed." });
    } finally {
      setPushBusy(false);
    }
  };

  const saveMarket = async () => {
    if (!validZip) return;
    setSaveMsg(null);
    try {
      const response = await csrfFetch("/api/leadgen-workspace?action=save-market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${niche} ${zip}`, zip, industry_group: niche === "All" ? null : niche, schedule: null }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${response.status}`);
      setSaveMsg({ ok: true, text: "Search saved to your workspace." });
    } catch (error) {
      setSaveMsg({ ok: false, text: error.message || "Could not save this search." });
    }
  };

  const toggleGroup = (name) => setOpenGroups((current) => ({ ...current, [name]: !current[name] }));
  const toggleProspect = (key) => setOpenProspects((current) => ({ ...current, [key]: !current[key] }));
  const expandAllGroups = () => setOpenGroups(Object.fromEntries(groupedRows.map((group) => [group.name, true])));
  const collapseAllGroups = () => setOpenGroups(Object.fromEntries(groupedRows.map((group) => [group.name, false])));
  const stage = !scan ? 0 : selectedRows.length === 0 ? 1 : selectedRows.some((row) => row.website && !row.website_intel) ? 2 : 3;
  const workflow = [
    { id: "leadgen-discover", number: "1", label: "Find", body: "Pick a ZIP and industry." },
    { id: "leadgen-qualify", number: "2", label: "Shortlist", body: "See the businesses and mark the ones worth working." },
    { id: "leadgen-enrich", number: "3", label: "Get contacts", body: "Check a business's website for public email and social links." },
    { id: "leadgen-use", number: "4", label: "Export", body: "Download the ones you picked, or push them to a CRM." },
  ];

  return (
    <section className="leadgen-app-shell" aria-label="Leadgen local market scanner">
      <div className="leadgen-app-panel leadgen-app-panel--control">
        <div className="leadgen-app-topline">
          <span className="leadgen-app-live"><span /> Local business research</span>
          <span className="leadgen-app-portal-link">Built for the Suncoast</span>
        </div>

        <div className="leadgen-app-title">
          <h2 className="title-2">Look up a ZIP, see who's there.</h2>
          <p>Enter a ZIP code and industry, and we'll pull the local businesses, their websites, phones, and what's missing from their online presence. You pick who's worth contacting.</p>
        </div>

        <nav className="leadgen-product-steps" aria-label="Leadgen workflow">
          {workflow.map((step, index) => (
            <a
              key={step.id}
              href={`#${step.id}`}
              className={`leadgen-product-step${index === stage ? " is-active" : ""}`}
              aria-current={index === stage ? "step" : undefined}
            >
              <span className="leadgen-product-step__index">{step.number}</span>
              <span className="leadgen-product-step__copy">
                <strong>{step.label}</strong>
                <span>{step.body}</span>
              </span>
              <span className="leadgen-product-step__arrow" aria-hidden="true">›</span>
            </a>
          ))}
        </nav>

        <section id="leadgen-discover" className="leadgen-scan-card leadgen-workflow-target" aria-labelledby="leadgen-discover-title">
          <nav className="leadgen-section-breadcrumbs" aria-label="Discover section">
            <a href="#leadgen-discover">Leadgen</a><span aria-hidden="true">›</span><strong id="leadgen-discover-title">Find</strong>
          </nav>
          <div className="leadgen-join" role="search" aria-label="Search local businesses">
            <label className="leadgen-join__field leadgen-join__zip">
              <span className="sr-only">ZIP code</span>
              <input inputMode="numeric" value={zip} onChange={(event) => { setZip(event.target.value.replace(/\D/g, "").slice(0, 5)); setZipSource("manual"); }} placeholder="ZIP" aria-label="ZIP code" />
            </label>
            <label className="leadgen-join__field leadgen-join__industry">
              <span className="sr-only">Industry</span>
              <select value={niche} onChange={(event) => setNiche(event.target.value)} aria-label="Industry">
                {PUBLIC_NICHES.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <button type="button" className="leadgen-join__btn btn btn-primary" onClick={runScan} disabled={!validZip || busy}>
              {busy ? "…" : <><Search size={15} aria-hidden="true" /> <span>Search</span></>}
            </button>
          </div>
          {zipSource === "geo" && validZip ? (
            <p className="leadgen-zip-source" aria-live="polite">
              <MapPin size={13} aria-hidden="true" /> Using your location ({zip}) —
              <button type="button" className="link-btn" onClick={() => { setZip(""); setZipSource(null); }}>change</button>
            </p>
          ) : null}
          {zipSource !== "geo" && geoState === "asking" ? (
            <p className="leadgen-zip-source" aria-live="polite">Detecting your location…</p>
          ) : null}
          {zipSource !== "geo" && (geoState === "denied" || geoState === "unavailable" || geoState === "error") && !zip ? (
            <p className="leadgen-zip-source">
              <button type="button" className="link-btn" onClick={requestGeolocation}>
                <MapPin size={13} aria-hidden="true" /> {geoState === "denied" ? "Try location again" : "Use my location"}
              </button>
            </p>
          ) : null}
          {geoHelp ? (
            <p className="leadgen-zip-source" role="status" style={{ maxWidth: 420, lineHeight: 1.5 }}>
              {geoHelp}
            </p>
          ) : null}
          {validZip ? (
            <div className="leadgen-product-save">
              {authLoading ? (
              <button type="button" className="btn btn-secondary btn-sm" disabled>Save this search</button>
            ) : user ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={saveMarket}>Save this search</button>
            ) : (
              <Link className="btn btn-secondary btn-sm" to="/portal">Sign in to save searches</Link>
            )}
              {saveMsg ? <span className={saveMsg.ok ? "" : "is-error"}>{saveMsg.text}</span> : null}
            </div>
          ) : null}
          {err ? <p className="form-error" role="alert">{err}</p> : null}
        </section>

        {scan ? (
          <>
            <section id="leadgen-qualify" className="leadgen-workflow-target leadgen-workflow-section" aria-labelledby="leadgen-qualify-title">
              <nav className="leadgen-section-breadcrumbs" aria-label="Qualify section">
                <a href="#leadgen-discover">Discover</a><span aria-hidden="true">›</span><strong id="leadgen-qualify-title">Qualify</strong>
              </nav>
            <div className="leadgen-results-scorecard" aria-label="Current result set">
              <article><strong>{reviewedRows.length}</strong><span>businesses in this result set</span></article>
              <article><strong>{selectedRows.length}</strong><span>prospects currently selected</span></article>
              <article><strong>{averageCoverage}%</strong><span>average public-data coverage</span></article>
              <article><strong>{contactCheckedCount}</strong><span>websites checked for contacts</span></article>
            </div>

            {insights ? (
              <div className="leadgen-intel-strip" aria-label="Market intelligence">
                <article><strong>{insights.total}</strong><span>businesses mapped</span></article>
                <article><strong>{insights.contactable_rate}%</strong><span>contactable</span></article>
                <article><strong>{insights.independent_rate}%</strong><span>likely independent</span></article>
                <article><strong>{insights.digital_gap_count}</strong><span>digital gaps</span></article>
                <article><strong>{rows.filter((row) => fitLabel(row) === "Strong fit").length}</strong><span>strong-fit prospects</span></article>
                {insights.top_industry ? (
                  <article className="is-wide">
                    <strong>{insights.top_industry.name}</strong>
                    <span>largest category · {insights.top_industry.share}% of market</span>
                  </article>
                ) : null}
              </div>
            ) : null}

            <LeadgenMap rows={visibleRows} scan={scan} />
            {scan.attribution ? <p className="leadgen-data-attribution">Business data © {scan.attribution.businesses}. Map data © {scan.attribution.map}.</p> : null}
            </section>

            <section id="leadgen-enrich" className="leadgen-workflow-target leadgen-workflow-section" aria-labelledby="leadgen-enrich-title">
              <nav className="leadgen-section-breadcrumbs" aria-label="Enrich section">
                <a href="#leadgen-discover">Discover</a><span aria-hidden="true">›</span><a href="#leadgen-qualify">Qualify</a><span aria-hidden="true">›</span><strong id="leadgen-enrich-title">Enrich</strong>
              </nav>
            <div className="leadgen-product-toolbar leadgen-product-toolbar--realized">
              <label>
                <span>Search results</span>
                <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Company, city, industry, signal…" />
              </label>
              <label className="leadgen-toolbar-field">
                <span>Sort by</span>
                <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
                  <option value="fit">Fit</option>
                  <option value="coverage">Data quality</option>
                  <option value="gaps">Digital gaps</option>
                  <option value="name">Company name</option>
                </select>
              </label>
              <button type="button" className="btn btn-secondary btn-sm" onClick={selectBest}><Check size={14} /> Auto-select strong fits</button>
              {authLoading ? (
                <button type="button" className="btn btn-secondary btn-sm" disabled><Sparkles size={14} /> Enrich contacts</button>
              ) : !user ? (
                <Link className="btn btn-secondary btn-sm" to="/portal"><Sparkles size={14} /> Sign in to enrich</Link>
              ) : canBulkEnrich ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={enrichSelected} disabled={extracting}>
                  <Sparkles size={14} /> {extracting ? "Checking websites…" : "Enrich all contacts"}
                </button>
              ) : (
                <a className="btn btn-secondary btn-sm" href="#leadgen-plans"><Sparkles size={14} /> Unlock bulk enrichment</a>
              )}
            </div>
            {extractMsg ? <p className={extractMsg.ok ? "leadgen-product-message" : "form-error"} aria-live="polite">{extractMsg.text}</p> : null}
            </section>

            <section id="leadgen-use" className="leadgen-workflow-target leadgen-use-card" aria-labelledby="leadgen-use-title">
              <nav className="leadgen-section-breadcrumbs" aria-label="Use section">
                <a href="#leadgen-discover">Discover</a><span aria-hidden="true">›</span><a href="#leadgen-qualify">Qualify</a><span aria-hidden="true">›</span><a href="#leadgen-enrich">Enrich</a><span aria-hidden="true">›</span><strong id="leadgen-use-title">Use</strong>
              </nav>
              <div className="leadgen-use-card__body">
                <div>
                  <strong>{selectedRows.length ? `${selectedRows.length} prospect${selectedRows.length === 1 ? "" : "s"} ready` : "Select prospects to continue"}</strong>
                  <span>Download the list as a CSV, or send it to HubSpot or a webhook.</span>
                </div>
                <div className="leadgen-use-card__actions">
                  <button type="button" className="btn btn-secondary btn-sm" disabled={!selectedRows.length} onClick={() => downloadCsv(`leadgen-${zip}.csv`, selectedRows.map((row) => ({ ...row, email: bestEmail(row) })))}>Download CSV</button>
                  {destinations.length ? <select value={pushTarget} onChange={(event) => setPushTarget(event.target.value)} aria-label="CRM destination">{destinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.label || destination.kind}</option>)}</select> : null}
                  {destinations.length ? <button type="button" className="btn btn-primary btn-sm" onClick={pushSelected} disabled={!selectedRows.length || pushBusy}>{pushBusy ? "Sending to CRM…" : "Push to CRM"}</button> : <span className="leadgen-app-private-note">Connect HubSpot or a webhook in your account to send selected records.</span>}
                </div>
              </div>
              {pushMsg ? <p className={pushMsg.ok ? "leadgen-product-message" : "form-error"} aria-live="polite">{pushMsg.text}</p> : null}
            </section>

            <div className="leadgen-explorer-head">
              <div>
                <span className="eyebrow">What's in the ZIP</span>
                <h3>{groupedRows.length} industries in ZIP {zip}</h3>
                <p>Businesses are grouped by type. Open a group to compare them, then expand one for contact details.</p>
              </div>
              <div className="leadgen-explorer-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={expandAllGroups}>Expand all</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={collapseAllGroups}>Collapse all</button>
              </div>
            </div>

            <div className="leadgen-category-stack">
              {groupedRows.map((group) => {
                const open = openGroups[group.name] === true;
                const subEntries = Array.from(group.subs.entries()).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
                const activeSub = activeSubs[group.name] || "All";
                const activeRows = activeSub === "All" ? group.rows : (group.subs.get(activeSub) || []);
                return (
                  <section className={`leadgen-category${open ? " is-open" : ""}`} key={group.name}>
                    <button type="button" className="leadgen-category__toggle" onClick={() => toggleGroup(group.name)} aria-expanded={open}>
                      <div className="leadgen-category__identity">
                        <strong>{group.name}</strong>
                        <span>{group.rows.length} businesses · {group.subs.size} subcategories</span>
                      </div>
                      <div className="leadgen-category__quickstats" aria-hidden="true">
                        <span><b>{group.strong}</b> strong fit</span>
                        <span><b>{group.contactable}%</b> contactable</span>
                        <span><b>{group.avgCoverage}%</b> data quality</span>
                        <span><b>{group.enriched}</b> enriched</span>
                      </div>
                      <ChevronDown size={20} aria-hidden="true" />
                    </button>

                    <div className="leadgen-category__drawer" aria-hidden={!open}>
                      <div className="leadgen-category__drawer-inner">
                        <div className="leadgen-category__dashboard">
                          <article><strong>{group.rows.length}</strong><span>businesses</span></article>
                          <article><strong>{group.withWebsite}</strong><span>websites</span></article>
                          <article><strong>{group.withPhone}</strong><span>phones</span></article>
                          <article><strong>{group.withEmail}</strong><span>emails found</span></article>
                          <article><strong>{group.contactable}%</strong><span>contactable</span></article>
                        </div>

                        <div className="leadgen-category__tools">
                          <label className="leadgen-subcategory-select">
                            <span className="leadgen-subcategory-select__label">Type</span>
                            <select
                              aria-label={`${group.name} subcategories`}
                              value={activeSub}
                              onChange={(event) => setActiveSubs((current) => ({ ...current, [group.name]: event.target.value }))}
                            >
                              <option value="All">All {group.rows.length} businesses</option>
                              {subEntries.map(([sub, subRows]) => (
                                <option key={sub} value={sub}>{sub} ({subRows.length})</option>
                              ))}
                            </select>
                          </label>
                          <div className="leadgen-category__qualify">
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => qualifyGroup(group)}>Select strong fits</button>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => clearGroup(group)}>Clear selections</button>
                          </div>
                        </div>

                        <div className="leadgen-prospect-grid">
                          {activeRows.map((row) => {
                            const key = prospectKey(row);
                            const expanded = openProspects[key] === true;
                            const selected = row.status === "keep";
                            const email = bestEmail(row);
                            const coverage = dataCoverage(row, email);
                            const contactSignals = contactInsightLabels(row.website_intel);
                            const analyzing = Boolean(siteBusy[row.website]);
                            const siteMessage = siteMessages[row.website];
                            return (
                              <article id={`leadgen-prospect-${row.__scanIndex}`} className={`leadgen-prospect-card${selected ? " is-selected" : ""}${expanded ? " is-expanded" : ""}`} key={key}>
                                {/* ── Header: avatar + title + select + expand ───────── */}
                                <header className="leadgen-card-header">
                                  <div className="leadgen-card-header__lead">
                                    <label className="leadgen-card-checkbox" aria-label={`Select ${row.name}`}>
                                      <input type="checkbox" checked={selected} onChange={(event) => setSelected(row, event.target.checked)} />
                                    </label>
                                    <BusinessFavicon brandAsset={row.website_intel?.brand_asset} name={row.name} />
                                    <div className="leadgen-card-title">
                                      <h3 className="leadgen-card-title__name">{row.name}</h3>
                                      <p className="leadgen-card-title__meta">{[row.sub_industry || row.industry_group, row.city, row.zip].filter(Boolean).join(" · ")}</p>
                                    </div>
                                  </div>
                                  <div className="leadgen-card-header__trail">
                                    <span className={`leadgen-fit-badge is-${fitLabel(row).toLowerCase().replace(/\s+/g, "-")}`}>{fitLabel(row)}</span>
                                    <button type="button" className="leadgen-card-expand" onClick={() => toggleProspect(key)} aria-expanded={expanded} aria-label={expanded ? "Collapse details" : "Expand details"}>
                                      <ChevronDown size={18} aria-hidden="true" />
                                    </button>
                                  </div>
                                </header>

                                {/* ── Stats row: daisyUI stats — coverage + opportunity ── */}
                                <div className="leadgen-card-stats" role="group" aria-label="Lead summary">
                                  <div className="leadgen-card-stat">
                                    <div className="leadgen-card-stat__label">Data coverage</div>
                                    <div className="leadgen-card-stat__value">{coverage.percent}<span className="leadgen-card-stat__unit">%</span></div>
                                    <div className="leadgen-card-meter" aria-hidden="true">
                                      <span className="leadgen-card-meter__fill" style={{ width: `${coverage.percent}%` }} />
                                    </div>
                                  </div>
                                  <div className="leadgen-card-stat">
                                    <div className="leadgen-card-stat__label">Opportunity</div>
                                    <div className={`leadgen-card-stat__caption is-${fitLabel(row).toLowerCase().replace(/\s+/g, "-")}`}>
                                      {row.is_chain ? "Brand or chain signal detected" : coverage.missing.length ? `Missing: ${coverage.missing.slice(0, 2).join(", ")}` : "Core public fields are present"}
                                    </div>
                                  </div>
                                </div>

                                {/* ── Signal chips: website / phone / email / evidence ── */}
                                <div className="leadgen-card-badges">
                                  <span className={`leadgen-card-badge ${row.website ? "is-positive" : "is-gap"}`}>
                                    <Globe2 size={12} aria-hidden="true" /> {row.website ? hostnameOf(row.website) : "No website"}
                                  </span>
                                  <span className={`leadgen-card-badge ${row.phone ? "is-positive" : "is-gap"}`}>
                                    <Phone size={12} aria-hidden="true" /> {row.phone ? "Phone" : "Phone missing"}
                                  </span>
                                  <span className={`leadgen-card-badge ${email ? "is-positive" : "is-gap"}`}>
                                    <Mail size={12} aria-hidden="true" /> {email ? "Email" : "Email not found"}
                                  </span>
                                  {row.website_intel ? <span className="leadgen-card-badge is-intel"><Check size={12} aria-hidden="true" /> Evidence</span> : null}
                                </div>

                                {/* ── Actions: daisyUI card-actions justify-end ────────── */}
                                <div className="leadgen-card-actions">
                                  {row.phone ? <a className="leadgen-card-btn" href={telHref(row.phone)}><Phone size={13} /> Call</a> : null}
                                  {email ? <a className="leadgen-card-btn" href={`mailto:${email}`}><Mail size={13} /> Email</a> : null}
                                  {row.website ? <a className="leadgen-card-btn" href={websiteHref(row.website)} target="_blank" rel="noopener noreferrer"><Globe2 size={13} /> Visit site</a> : null}
                                  {row.website ? (
                                    authLoading ? (
                                      <button type="button" className="leadgen-card-btn is-primary" disabled><Sparkles size={13} /> Enrich contacts</button>
                                    ) : !user ? (
                                      <Link className="leadgen-card-btn is-primary" to="/portal"><Sparkles size={13} /> Sign in to enrich</Link>
                                    ) : canEnrichOne ? (
                                      <button type="button" className="leadgen-card-btn is-primary" onClick={() => findProspectContacts(row)} disabled={analyzing}>
                                        <Sparkles size={13} /> {analyzing ? "Checking website…" : row.website_intel ? "Re-check contacts" : "Find contacts"}
                                      </button>
                                    ) : (
                                      <a className="leadgen-card-btn is-primary" href="#leadgen-plans"><Sparkles size={13} /> Upgrade to enrich</a>
                                    )
                                  ) : null}
                                </div>
                                {siteMessage ? <p className={`leadgen-card-action-message${siteMessage.ok ? "" : " is-error"}`} aria-live="polite">{siteMessage.text}</p> : null}

                                {/* ── Drawer: detail grid (collapsed by default) ─────────── */}
                                <div className="leadgen-prospect-card__drawer" aria-hidden={!expanded}>
                                  <div className="leadgen-prospect-card__drawer-inner">
                                    <div className="leadgen-prospect-detail-grid leadgen-prospect-detail-grid--realized">
                                      <section>
                                        <strong>Fit</strong>
                                        <div className="leadgen-signal-chips">
                                          {(row.fit_reasons?.length ? row.fit_reasons : [row.is_chain ? "Brand or chain signal" : "Likely independent", row.sub_industry ? "Specific category available" : "Category needs review"]).map((reason) => <span key={reason}>{reason}</span>)}
                                        </div>
                                        <p className="leadgen-evidence-note">Fit is a rough read of business type and whether it looks independent. It's not a promise that they're looking to buy.</p>
                                      </section>

                                      <section>
                                        <strong>Contact profile</strong>
                                        <div className="leadgen-card-contact-grid">
                                          <div className="leadgen-card-contact-row"><span>Coverage</span><span>{coverage.filled} of {coverage.total} core fields · {coverage.percent}%</span></div>
                                          <div className="leadgen-card-contact-row"><span>Address</span><span>{row.address ? `${row.address}${row.city ? `, ${row.city}` : ""}${row.state ? `, ${row.state}` : ""} ${row.zip || ""}` : "Not available"}</span></div>
                                          <div className="leadgen-card-contact-row"><span>Phone</span>{row.phone ? <a href={telHref(row.phone)}>{row.phone}</a> : <span>Not available</span>}</div>
                                          <div className="leadgen-card-contact-row"><span>Email</span>{email ? <a href={`mailto:${email}`}>{email}</a> : <span>Not available</span>}</div>
                                        </div>
                                      </section>

                                      <section className="is-wide">
                                        <strong>Contact enrichment</strong>
                                        {row.website_intel ? (
                                          <>
                                            {contactSignals.length ? <div className="leadgen-signal-chips is-intel">{contactSignals.map((label) => <span key={label}>{label}</span>)}</div> : null}
                                            <p className="leadgen-evidence-note">We checked the business website for a public email, a contact form, and social links. If something's missing, we left it unknown rather than guessing.</p>
                                          </>
                                        ) : (
                                          <p className="leadgen-card-empty">Hit "Find contacts" to check the public pages on this business's website for an email or contact form.</p>
                                        )}
                                      </section>

                                      <section className="is-wide">
                                        <strong>Evidence &amp; provenance</strong>
                                        <div className="leadgen-prospect-links">
                                          {row.website ? <a href={websiteHref(row.website)} target="_blank" rel="noopener noreferrer">Website <ExternalLink size={12} /></a> : null}
                                          {row.source_url ? <a href={row.source_url} target="_blank" rel="noopener noreferrer">Source record <ExternalLink size={12} /></a> : null}
                                        </div>
                                        <p className="leadgen-evidence-note">Where this record came from: {row.source_label || scan.scan_source || "public business data"}{Number.isFinite(Number(row.source_confidence)) ? ` · we trust it ${Math.round(Number(row.source_confidence) * 100)}%` : ""}. Contact details only come from the public pages you ask us to check.</p>
                                      </section>
                                    </div>
                                  </div>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </section>
                );
              })}
              {!groupedRows.length ? <p className="leadgen-category-empty">Nothing in this ZIP matches that search. Try a different industry.</p> : null}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

export default function Leadgen() {
  useSEO({
    title: "Local Business Lead Research & Enrichment | Leadgen",
    description: "Research local businesses by ZIP code and industry, compare records, find public contact details, and export only the prospects you choose.",
    canonical: `${SITE_URL}/leadgen`,
    image: `${SITE_URL}/og-image.png`,
    breadcrumbs: [
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Leadgen", url: `${SITE_URL}/leadgen` },
    ],
    products: [
      {
        title: "Leadgen Growth",
        description: "Scan ZIP codes and industries, compare prospects by data quality, and export the ones worth contacting. Built for repeat local-market prospecting.",
        slug: "growth",
        price: 99,
        buyLink: LEADGEN_STRIPE_LINKS.growth.monthly,
      },
      {
        title: "Leadgen Pro",
        description: "Adds saved searches, contact enrichment from public business websites, HubSpot and webhook delivery, suppression, and attribution.",
        slug: "pro",
        price: 249,
        buyLink: LEADGEN_STRIPE_LINKS.pro.monthly,
      },
    ],
    productBasePath: "/leadgen",
  });

  return (
    <main id="main" className="leadgen-public">
      <div className="container leadgen-product-page">
        <nav className="leadgen-breadcrumbs" aria-label="Breadcrumb">
          <ol>
            <li><Link to="/">Home</Link></li>
            <li aria-current="page">Leadgen</li>
          </ol>
        </nav>
        <LeadgenScanApp />
        <section id="leadgen-plans" className="leadgen-product-upgrade">
          <div>
            <span className="eyebrow">For repeat prospecting</span>
            <h2>Save the searches you come back to.</h2>
            <p>Pro adds saved searches, contact enrichment, HubSpot or webhook delivery, suppression, and attribution so you can work from a repeatable prospecting process instead of rebuilding lists.</p>
          </div>
          <a className="btn btn-primary" href={withLeadgenCheckoutParams(LEADGEN_STRIPE_LINKS.pro.monthly, { tierId: "pro", source: "leadgen_workspace" })}>
            Compare plans <ArrowRight size={16} />
          </a>
        </section>
      </div>
    </main>
  );
}
