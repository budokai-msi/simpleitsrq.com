from pathlib import Path

page = Path("src/pages/Leadgen.jsx")
text = page.read_text()

old_import = 'import { useDeferredValue, useEffect, useMemo, useState } from "react";\n'
new_import = 'import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";\nimport "leaflet/dist/leaflet.css";\n'
if old_import not in text:
    raise SystemExit("Leadgen React import anchor missing")
text = text.replace(old_import, new_import, 1)

helpers = r'''
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

'''
anchor = 'function LeadgenScanApp() {\n'
if anchor not in text:
    raise SystemExit("LeadgenScanApp anchor missing")
text = text.replace(anchor, helpers + anchor, 1)

toolbar_anchor = '            <div className="leadgen-product-toolbar leadgen-product-toolbar--realized">\n'
if toolbar_anchor not in text:
    raise SystemExit("Leadgen toolbar anchor missing")
text = text.replace(toolbar_anchor, '            <LeadgenMap rows={visibleRows} scan={scan} />\n\n' + toolbar_anchor, 1)

card_anchor = '                              <article className={`leadgen-prospect-card${selected ? " is-selected" : ""}${expanded ? " is-expanded" : ""}`} key={key}>\n'
if card_anchor not in text:
    raise SystemExit("Prospect card anchor missing")
text = text.replace(card_anchor, '                              <article id={`leadgen-prospect-${row.__scanIndex}`} className={`leadgen-prospect-card${selected ? " is-selected" : ""}${expanded ? " is-expanded" : ""}`} key={key}>\n', 1)

name_anchor = '''                                    <div className="leadgen-prospect-card__name">
                                      <strong>{row.name}</strong>
                                      <span>{[row.sub_industry || row.industry_group, row.city, row.zip].filter(Boolean).join(" · ")}</span>
                                    </div>'''
name_replacement = '''                                    <div className="leadgen-prospect-card__name">
                                      <BusinessFavicon website={row.website} name={row.name} />
                                      <div className="leadgen-prospect-card__name-copy">
                                        <strong>{row.name}</strong>
                                        <span>{[row.sub_industry || row.industry_group, row.city, row.zip].filter(Boolean).join(" · ")}</span>
                                      </div>
                                    </div>'''
if name_anchor not in text:
    raise SystemExit("Prospect name anchor missing")
text = text.replace(name_anchor, name_replacement, 1)
page.write_text(text)

cards = Path("src/styles/leadgen-cards.css")
css = cards.read_text()
css_anchor = '.leadgen-prospect-card__health {\n'
if css_anchor not in css:
    raise SystemExit("Prospect card CSS anchor missing")

favicon_css = r'''
.leadgen-prospect-card__name {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.leadgen-prospect-card__name-copy {
  min-width: 0;
}

.leadgen-business-favicon {
  display: inline-flex;
  flex: 0 0 30px;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid var(--aura-border);
  border-radius: 9px;
  background: var(--aura-surface-strong);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.05);
}

.leadgen-business-favicon img {
  display: block;
  width: 22px;
  height: 22px;
  object-fit: contain;
}

.leadgen-business-favicon.is-fallback {
  color: var(--lg-muted);
  font-size: .62rem;
  font-weight: 850;
  letter-spacing: .02em;
}

'''
css = css.replace(css_anchor, favicon_css + css_anchor, 1)
cards.write_text(css)
