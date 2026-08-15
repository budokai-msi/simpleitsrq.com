import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import "../styles/leadgen.css";
import "../styles/leadgen-product.css";
import "../styles/leadgen-cards.css";
import { Link } from "../lib/Link";
import { ArrowRight, Check, ChevronDown, ExternalLink, Globe2, Mail, Phone, Search, Sparkles } from "lucide-react";
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
const PUBLIC_NICHES = ["All", "Healthcare", "Trades", "Professional Services", "Automotive", "Hospitality", "Personal Services", "Retail", "Food & Drink", "Education", "Real Estate", "Cleaning & Maintenance", "Media & Creative", "Recreation"];
const SCAN_LIMIT = 80;

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

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function technicalSnapshot(signal) {
  const domainIntel = signal?.domain_intel || {};
  const dns = signal?.dns || domainIntel.dns || {};
  const registration = signal?.registration || domainIntel.registration || {};
  const pagespeed = signal?.pagespeed || domainIntel.pagespeed || {};
  const quality = signal?.technical_quality_score ?? domainIntel.technical_quality_score;
  const evidence = signal?.evidence_sources || domainIntel.evidence_sources || [];
  return {
    quality: isFiniteNumber(quality) ? Number(quality) : null,
    domainAge: isFiniteNumber(registration.domain_age_years) ? Number(registration.domain_age_years) : null,
    mx: dns.has_mx === true ? "Ready" : dns.has_mx === false ? "Not found" : "Unknown",
    performance: isFiniteNumber(pagespeed.performance) ? Number(pagespeed.performance) : null,
    seo: isFiniteNumber(pagespeed.seo) ? Number(pagespeed.seo) : null,
    evidenceCount: Array.isArray(evidence) ? evidence.length : 0,
  };
}

function websiteInsightLabels(signal) {
  if (!signal) return [];
  const labels = [];
  if (signal.intelligence_labels?.length) labels.push(...signal.intelligence_labels);
  if (signal.technologies?.length) labels.push(...signal.technologies.slice(0, 6));
  if (signal.has_contact_form) labels.push("Contact form");
  if (signal.has_booking_signal) labels.push("Online booking");
  if (signal.has_careers_signal) labels.push("Hiring signal");
  if (signal.has_schema) labels.push("Schema markup");
  if (signal.social?.linkedin) labels.push("LinkedIn");
  if (signal.social?.facebook) labels.push("Facebook");
  if (signal.social?.instagram) labels.push("Instagram");
  if (signal.secure === false) labels.push("No HTTPS");
  if (signal.has_viewport === false) labels.push("No mobile viewport");
  return Array.from(new Set(labels.filter(Boolean))).slice(0, 12);
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

function opportunityLabel(score) {
  const n = Number(score || 0);
  if (n >= 80) return "High-priority opportunity";
  if (n >= 65) return "Strong match";
  if (n >= 45) return "Worth reviewing";
  return "Low evidence / fit";
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
  const headers = ["status", "name", "industry", "sub_industry", "address", "city", "state", "zip", "website", "phone", "email", "opportunity_score", "opportunity_grade", "data_coverage", "technical_quality_score", "domain_age_years", "pagespeed_performance", "pagespeed_seo", "source_url"];
  const lines = [headers.map(csvCell).join(",")];
  rows.forEach((row) => {
    const tech = technicalSnapshot(row.website_intel);
    const coverage = dataCoverage(row, row.email || row.emails?.[0]?.email || "");
    const record = {
      ...row,
      data_coverage: coverage.percent,
      technical_quality_score: tech.quality ?? "",
      domain_age_years: tech.domainAge ?? "",
      pagespeed_performance: tech.performance ?? "",
      pagespeed_seo: tech.seo ?? "",
    };
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

function BusinessFavicon({ website, name }) {
  const host = hostnameOf(website);
  const [failed, setFailed] = useState(false);
  const initials = String(name || "Business").trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "B";

  if (!host || failed) {
    return <span className="leadgen-business-favicon is-fallback" aria-hidden="true">{initials}</span>;
  }

  const domainUrl = `https://${host}`;
  const src = `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(domainUrl)}&sz=64`;
  return (
    <span className="leadgen-business-favicon" aria-hidden="true">
      <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
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
  const [zip, setZip] = useState("");
  const [niche, setNiche] = useState("All");
  const [scan, setScan] = useState(null);
  const [review, setReview] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortMode, setSortMode] = useState("opportunity");
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
      ...(row.opportunity_reasons || []),
      ...websiteInsightLabels(row.website_intel),
    ].filter(Boolean).join(" ").toLowerCase().includes(query)) : [...reviewedRows];

    return filtered.sort((a, b) => {
      if (sortMode === "coverage") return dataCoverage(b, bestEmail(b)).percent - dataCoverage(a, bestEmail(a)).percent || Number(b.opportunity_score || 0) - Number(a.opportunity_score || 0);
      if (sortMode === "name") return String(a.name || "").localeCompare(String(b.name || ""));
      if (sortMode === "gaps") {
        const aGaps = Number(!a.website) + Number(!a.phone) + Number(!bestEmail(a));
        const bGaps = Number(!b.website) + Number(!b.phone) + Number(!bestEmail(b));
        return bGaps - aGaps || Number(b.opportunity_score || 0) - Number(a.opportunity_score || 0);
      }
      return Number(b.opportunity_score || 0) - Number(a.opportunity_score || 0) || String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [reviewedRows, deferredSearchTerm, sortMode, extractedEmails]);

  const groupedRows = useMemo(() => {
    const groups = new Map();
    for (const row of visibleRows) {
      const industry = row.industry_group || row.industry || "Other";
      const sub = row.sub_industry || "Other";
      if (!groups.has(industry)) {
        groups.set(industry, { name: industry, rows: [], subs: new Map(), withWebsite: 0, withPhone: 0, withEmail: 0, enriched: 0, digitalGaps: 0, scoreTotal: 0, coverageTotal: 0, strong: 0 });
      }
      const group = groups.get(industry);
      group.rows.push(row);
      if (row.website) group.withWebsite += 1;
      if (row.phone) group.withPhone += 1;
      if (bestEmail(row)) group.withEmail += 1;
      if (row.website_intel) group.enriched += 1;
      if (!row.website || !row.phone || !bestEmail(row)) group.digitalGaps += 1;
      if (Number(row.opportunity_score || 0) >= 65) group.strong += 1;
      group.scoreTotal += Number(row.opportunity_score || 0);
      group.coverageTotal += dataCoverage(row, bestEmail(row)).percent;
      if (!group.subs.has(sub)) group.subs.set(sub, []);
      group.subs.get(sub).push(row);
    }
    return Array.from(groups.values()).map((group) => ({
      ...group,
      avgScore: group.rows.length ? Math.round(group.scoreTotal / group.rows.length) : 0,
      avgCoverage: group.rows.length ? Math.round(group.coverageTotal / group.rows.length) : 0,
      contactable: group.rows.length ? Math.round((group.rows.filter((row) => row.phone || bestEmail(row)).length / group.rows.length) * 100) : 0,
    })).sort((a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name));
  }, [visibleRows, extractedEmails]);

  const selectedRows = reviewedRows.filter((row) => row.status === "keep");
  const selectedWithEmail = selectedRows.filter((row) => bestEmail(row));
  const enrichedCount = reviewedRows.filter((row) => row.website_intel).length;
  const averageCoverage = reviewedRows.length ? Math.round(reviewedRows.reduce((sum, row) => sum + dataCoverage(row, bestEmail(row)).percent, 0) / reviewedRows.length) : 0;
  const insights = scan?.market_insights || null;

  useEffect(() => {
    fetch("/api/leadgen-integrations", { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data?.integrations?.length) {
          setDestinations(data.integrations);
          setPushTarget(String(data.integrations[0].id));
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
      if (Number(row.opportunity_score || 0) >= 65) next[index] = "keep";
    });
    setReview(next);
  };

  const qualifyGroup = (group) => {
    setReview((current) => {
      const next = { ...current };
      group.rows.forEach((row) => {
        if (Number(row.opportunity_score || 0) >= 65) next[row.__scanIndex] = "keep";
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
    let intelCount = 0;
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
            intelCount += 1;
          }
        });
      }
      setExtractedEmails(foundEmails);
      setWebsiteIntel(foundIntel);
      setExtractMsg({ ok: true, text: `Checked ${intelCount} website${intelCount === 1 ? "" : "s"}${emailCount ? ` · found ${emailCount} email${emailCount === 1 ? "" : "s"}` : ""}.` });
    } catch (error) {
      setExtractMsg({ ok: false, text: error.message || "Website enrichment failed." });
    } finally {
      setExtracting(false);
    }
  };

  const analyzeProspect = async (row) => {
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
      setSiteMessages((current) => ({ ...current, [key]: { ok: true, text: "Deep website analysis updated." } }));
      trackEvent("generate_lead", { source: "leadgen_site_analysis", company: row.name || "prospect" });
    } catch (error) {
      setSiteMessages((current) => ({ ...current, [key]: { ok: false, text: error.message || "Could not analyze this website." } }));
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
        body: JSON.stringify({ name: `${niche} ${zip}`, zip, industry_group: niche === "All" ? null : niche, schedule: "weekly" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${response.status}`);
      setSaveMsg({ ok: true, text: "This market will be checked weekly." });
    } catch (error) {
      setSaveMsg({ ok: false, text: error.message || "Could not save this market." });
    }
  };

  const toggleGroup = (name) => setOpenGroups((current) => ({ ...current, [name]: !current[name] }));
  const toggleProspect = (key) => setOpenProspects((current) => ({ ...current, [key]: !current[key] }));
  const expandAllGroups = () => setOpenGroups(Object.fromEntries(groupedRows.map((group) => [group.name, true])));
  const collapseAllGroups = () => setOpenGroups(Object.fromEntries(groupedRows.map((group) => [group.name, false])));
  const stage = !scan ? 0 : selectedRows.length === 0 ? 1 : selectedRows.some((row) => row.website && !row.website_intel) ? 2 : 3;
  const workflow = [
    ["1. Discover", "Choose the ZIP code and industry you want to study."],
    ["2. Qualify", "Compare opportunity and data coverage before selecting prospects."],
    ["3. Enrich", "Add email, domain, DNS and website evidence where available."],
    ["4. Use", "Download the list or send selected records to a connected CRM."],
  ];

  return (
    <section className="leadgen-app-shell" aria-label="Leadgen local market scanner">
      {scan && selectedRows.length ? (
        <div className="leadgen-selbar">
          <span className="leadgen-selbar__count"><strong>{selectedRows.length}</strong> selected <button type="button" className="leadgen-selected-clear" onClick={() => setReview({})}>Clear</button></span>
          <div className="leadgen-selbar__actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => downloadCsv(`leadgen-${zip}.csv`, selectedRows.map((row) => ({ ...row, email: bestEmail(row) })))}>Download CSV</button>
            {destinations.length ? (
              <select value={pushTarget} onChange={(event) => setPushTarget(event.target.value)} aria-label="CRM destination">
                {destinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.label || destination.kind}</option>)}
              </select>
            ) : null}
            {destinations.length ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={pushSelected} disabled={pushBusy}>{pushBusy ? "Sending…" : "Send to CRM"}</button>
            ) : (
              <span className="leadgen-app-private-note">CRM sync unlocks after account setup.</span>
            )}
          </div>
        </div>
      ) : null}

      <div className="leadgen-app-panel leadgen-app-panel--control">
        <div className="leadgen-app-topline">
          <span className="leadgen-app-live"><span /> Local business research</span>
          <span className="leadgen-app-portal-link">Evidence-backed market view</span>
        </div>

        <div className="leadgen-app-title">
          <h2 className="title-2">Start with a market. Find the businesses worth a closer look.</h2>
          <p>Scan by ZIP code and industry, compare opportunity with data quality, inspect the evidence behind each record, then enrich and export only the prospects you choose.</p>
        </div>

        <div className="leadgen-product-steps">
          {workflow.map(([title, body], index) => (
            <div key={title} className={`leadgen-product-step${index === stage ? " is-active" : ""}`}>
              <strong>{title}</strong>
              <span>{body}</span>
            </div>
          ))}
        </div>

        <div className="leadgen-scan-card">
          <div className="leadgen-app-controls leadgen-app-controls--primary">
            <label>
              <span>ZIP code</span>
              <input inputMode="numeric" value={zip} onChange={(event) => setZip(event.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="34236" />
            </label>
            <label>
              <span>Industry</span>
              <select value={niche} onChange={(event) => setNiche(event.target.value)}>
                {PUBLIC_NICHES.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <button type="button" className="btn btn-primary" onClick={runScan} disabled={!validZip || busy}>
              <Search size={16} /> {busy ? "Searching…" : "Find businesses"}
            </button>
          </div>
          {validZip ? (
            <div className="leadgen-product-save">
              <button type="button" className="btn btn-secondary btn-sm" onClick={saveMarket}>Watch this market</button>
              {saveMsg ? <span className={saveMsg.ok ? "" : "is-error"}>{saveMsg.text}</span> : null}
            </div>
          ) : null}
          {err ? <p className="form-error" role="alert">{err}</p> : null}
        </div>

        {scan ? (
          <>
            <div className="leadgen-results-scorecard" aria-label="Current result set">
              <article><strong>{reviewedRows.length}</strong><span>businesses in this result set</span></article>
              <article><strong>{selectedRows.length}</strong><span>prospects currently selected</span></article>
              <article><strong>{averageCoverage}%</strong><span>average public-data coverage</span></article>
              <article><strong>{enrichedCount}</strong><span>websites with added intelligence</span></article>
            </div>

            {insights ? (
              <div className="leadgen-intel-strip" aria-label="Market intelligence">
                <article><strong>{insights.total}</strong><span>businesses mapped</span></article>
                <article><strong>{insights.contactable_rate}%</strong><span>contactable</span></article>
                <article><strong>{insights.independent_rate}%</strong><span>likely independent</span></article>
                <article><strong>{insights.digital_gap_count}</strong><span>digital gaps</span></article>
                <article><strong>{insights.high_opportunity_count}</strong><span>strong-score prospects</span></article>
                {insights.top_industry ? (
                  <article className="is-wide">
                    <strong>{insights.top_industry.name}</strong>
                    <span>largest category · {insights.top_industry.share}% of market · average opportunity {insights.top_industry.avg_score}</span>
                  </article>
                ) : null}
              </div>
            ) : null}

            <LeadgenMap rows={visibleRows} scan={scan} />

            <div className="leadgen-product-toolbar leadgen-product-toolbar--realized">
              <label>
                <span>Search results</span>
                <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Company, city, industry, signal…" />
              </label>
              <label className="leadgen-toolbar-field">
                <span>Sort by</span>
                <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
                  <option value="opportunity">Opportunity</option>
                  <option value="coverage">Data coverage</option>
                  <option value="gaps">Digital gaps</option>
                  <option value="name">Company name</option>
                </select>
              </label>
              <button type="button" className="btn btn-secondary btn-sm" onClick={selectBest}><Check size={14} /> Select strong matches</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={enrichSelected} disabled={extracting}>
                <Sparkles size={14} /> {extracting ? "Checking sites…" : "Enrich selected"}
              </button>
            </div>
            {extractMsg ? <p className={extractMsg.ok ? "leadgen-product-message" : "form-error"} aria-live="polite">{extractMsg.text}</p> : null}
            {pushMsg ? <p className={pushMsg.ok ? "leadgen-product-message" : "form-error"} aria-live="polite">{pushMsg.text}</p> : null}

            <div className="leadgen-explorer-head">
              <div>
                <span className="eyebrow">Market explorer</span>
                <h3>{groupedRows.length} industries in ZIP {zip}</h3>
                <p>Open a category, compare its businesses, then expand a prospect for contact coverage, website intelligence and source evidence.</p>
              </div>
              <div className="leadgen-explorer-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={expandAllGroups}>Open all</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={collapseAllGroups}>Close all</button>
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
                        <span><b>{group.strong}</b> strong</span>
                        <span><b>{group.avgScore}</b> avg opportunity</span>
                        <span><b>{group.avgCoverage}%</b> data coverage</span>
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
                          <div className="leadgen-subcategory-tabs" role="group" aria-label={`${group.name} subcategories`}>
                            <button type="button" className={activeSub === "All" ? "is-active" : ""} onClick={() => setActiveSubs((current) => ({ ...current, [group.name]: "All" }))}>
                              All <span>{group.rows.length}</span>
                            </button>
                            {subEntries.map(([sub, subRows]) => (
                              <button type="button" key={sub} className={activeSub === sub ? "is-active" : ""} onClick={() => setActiveSubs((current) => ({ ...current, [group.name]: sub }))}>
                                {sub} <span>{subRows.length}</span>
                              </button>
                            ))}
                          </div>
                          <div className="leadgen-category__qualify">
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => qualifyGroup(group)}>Select strong matches</button>
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
                            const tech = technicalSnapshot(row.website_intel);
                            const intel = websiteInsightLabels(row.website_intel);
                            const analyzing = Boolean(siteBusy[row.website]);
                            const siteMessage = siteMessages[row.website];
                            return (
                              <article id={`leadgen-prospect-${row.__scanIndex}`} className={`leadgen-prospect-card${selected ? " is-selected" : ""}${expanded ? " is-expanded" : ""}`} key={key}>
                                <div className="leadgen-prospect-card__top">
                                  <label className="leadgen-product-check" aria-label={`Select ${row.name}`}>
                                    <input type="checkbox" checked={selected} onChange={(event) => setSelected(row, event.target.checked)} />
                                  </label>
                                  <button type="button" className="leadgen-prospect-card__toggle" onClick={() => toggleProspect(key)} aria-expanded={expanded}>
                                    <div className="leadgen-prospect-card__name">
                                      <BusinessFavicon website={row.website} name={row.name} />
                                      <div className="leadgen-prospect-card__name-copy">
                                        <strong>{row.name}</strong>
                                        <span>{[row.sub_industry || row.industry_group, row.city, row.zip].filter(Boolean).join(" · ")}</span>
                                      </div>
                                    </div>
                                    <span className={`leadgen-grade leadgen-grade-${String(row.opportunity_grade || "d").toLowerCase()}`}>
                                      {row.opportunity_grade || "D"} · {row.opportunity_score || 0}
                                    </span>
                                    <ChevronDown size={18} aria-hidden="true" />
                                  </button>
                                </div>

                                <div className="leadgen-prospect-card__health">
                                  <div className="leadgen-card-meter" aria-label={`Data coverage ${coverage.percent}%`}>
                                    <div className="leadgen-card-meter__label"><span>Data coverage</span><strong>{coverage.percent}%</strong></div>
                                    <div className="leadgen-card-meter__track"><span className="leadgen-card-meter__fill" style={{ width: `${coverage.percent}%` }} /></div>
                                  </div>
                                  <div className="leadgen-card-opportunity"><strong>{opportunityLabel(row.opportunity_score)}</strong><br />{coverage.missing.length ? `Missing ${coverage.missing.slice(0, 2).join(" + ")}` : "Core public fields are present"}</div>
                                </div>

                                <div className="leadgen-prospect-card__signals">
                                  <span className={row.website ? "is-positive" : "is-gap"}>{row.website ? hostnameOf(row.website) : "No website"}</span>
                                  <span className={row.phone ? "is-positive" : "is-gap"}>{row.phone ? "Phone" : "Phone missing"}</span>
                                  <span className={email ? "is-positive" : "is-gap"}>{email ? "Email" : "Email not found"}</span>
                                  {tech.quality !== null ? <span className="is-intel">Tech quality {tech.quality}</span> : row.website_intel ? <span className="is-intel">Website checked</span> : null}
                                </div>

                                <div className="leadgen-prospect-card__actions">
                                  {row.phone ? <a className="leadgen-card-action" href={telHref(row.phone)}><Phone size={13} /> Call</a> : null}
                                  {email ? <a className="leadgen-card-action" href={`mailto:${email}`}><Mail size={13} /> Email</a> : null}
                                  {row.website ? <a className="leadgen-card-action" href={websiteHref(row.website)} target="_blank" rel="noopener noreferrer"><Globe2 size={13} /> Website</a> : null}
                                  {row.website ? (
                                    <button type="button" className="leadgen-card-action is-primary" onClick={() => analyzeProspect(row)} disabled={analyzing}>
                                      <Sparkles size={13} /> {analyzing ? "Analyzing…" : row.website_intel ? "Refresh analysis" : "Analyze site"}
                                    </button>
                                  ) : null}
                                  {siteMessage ? <p className={`leadgen-card-action-message${siteMessage.ok ? "" : " is-error"}`} aria-live="polite">{siteMessage.text}</p> : null}
                                </div>

                                <div className="leadgen-prospect-card__drawer" aria-hidden={!expanded}>
                                  <div className="leadgen-prospect-card__drawer-inner">
                                    <div className="leadgen-prospect-detail-grid leadgen-prospect-detail-grid--realized">
                                      <section>
                                        <strong>Opportunity evidence</strong>
                                        <div className="leadgen-signal-chips">
                                          {(row.opportunity_reasons?.length ? row.opportunity_reasons : ["Basic public business record"]).map((reason) => <span key={reason}>{reason}</span>)}
                                        </div>
                                        <p className="leadgen-evidence-note">The opportunity score is a prioritization aid. It is based on observable record signals, not revenue or purchase intent.</p>
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
                                        <strong>Website intelligence</strong>
                                        {row.website_intel ? (
                                          <>
                                            <div className="leadgen-card-metrics">
                                              <div className="leadgen-card-metric"><strong>{tech.quality ?? "—"}</strong><span>technical quality</span></div>
                                              <div className="leadgen-card-metric"><strong>{tech.domainAge !== null ? `${tech.domainAge}y` : "—"}</strong><span>domain age</span></div>
                                              <div className="leadgen-card-metric"><strong>{tech.mx}</strong><span>mail / MX status</span></div>
                                              <div className="leadgen-card-metric"><strong>{tech.performance ?? "—"}</strong><span>mobile performance</span></div>
                                              <div className="leadgen-card-metric"><strong>{tech.seo ?? "—"}</strong><span>PageSpeed SEO</span></div>
                                              <div className="leadgen-card-metric"><strong>{tech.evidenceCount || "—"}</strong><span>evidence sources</span></div>
                                            </div>
                                            {intel.length ? <div className="leadgen-signal-chips is-intel" style={{ marginTop: 10 }}>{intel.map((label) => <span key={label}>{label}</span>)}</div> : null}
                                          </>
                                        ) : (
                                          <p className="leadgen-card-empty">Run Analyze site for this prospect to check public website signals, DNS/MX, domain registration data and PageSpeed/Lighthouse when available.</p>
                                        )}
                                      </section>

                                      <section className="is-wide">
                                        <strong>Evidence & provenance</strong>
                                        <div className="leadgen-prospect-links">
                                          {row.website ? <a href={websiteHref(row.website)} target="_blank" rel="noopener noreferrer">Website <ExternalLink size={12} /></a> : null}
                                          {row.source_url ? <a href={row.source_url} target="_blank" rel="noopener noreferrer">Source record <ExternalLink size={12} /></a> : null}
                                        </div>
                                        <p className="leadgen-evidence-note">Discovery source: {scan.scan_source || "public business data"}{row.source_id ? ` · record ${row.source_id}` : ""}. Website intelligence is added only when you run enrichment; unavailable metrics remain unknown rather than being inferred.</p>
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
              {!groupedRows.length ? <p className="leadgen-category-empty">No businesses match this search.</p> : null}
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
    description: "Research local businesses by ZIP code and industry, compare opportunity and data coverage, analyze website signals, enrich contact data, and export the prospects you choose.",
    canonical: `${SITE_URL}/leadgen`,
    image: `${SITE_URL}/og-image.png`,
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
        <section className="leadgen-product-upgrade">
          <div>
            <span className="eyebrow">For repeat prospecting</span>
            <h2>Keep the markets you care about under watch.</h2>
            <p>Pro adds saved markets, recurring monitoring, deeper enrichment, CRM sync, suppression, and attribution so you can work from a repeatable prospecting process instead of rebuilding lists.</p>
          </div>
          <a className="btn btn-primary" href={withLeadgenCheckoutParams(LEADGEN_STRIPE_LINKS.pro.monthly, { tierId: "pro", source: "leadgen_workspace" })}>
            Compare plans <ArrowRight size={16} />
          </a>
        </section>
      </div>
    </main>
  );
}
