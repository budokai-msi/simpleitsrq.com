import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Shield, ShieldAlert, Activity, Zap, Globe2, ArrowRight, Search, Clock, Skull, Loader2,
} from "lucide-react";
import { useSEO, SITE_URL } from "../lib/seo";
import AdUnit from "../components/AdSense";

const THREAT_LABELS = {
  scanner:         { label: "Scanner probe",      color: "#D97706", icon: Search },
  exploit_attempt: { label: "Exploit attempt",    color: "#DC2626", icon: Skull },
  hostile_geo:     { label: "Hostile-geo visit",  color: "#7C3AED", icon: Globe2 },
  osint_match:     { label: "Known-bad IP",       color: "#0F6CBD", icon: ShieldAlert },
};

function ago(iso) {
  if (!iso) return "";
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60_000) return `${Math.round(d / 1000)}s ago`;
  if (d < 3_600_000) return `${Math.round(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.round(d / 3_600_000)}h ago`;
  return `${Math.round(d / 86_400_000)}d ago`;
}

export default function LiveThreats() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  // Ref so the unmount cleanup can abort an in-flight fetch instead of
  // letting it land on a stale component (and React-warn on setState).
  const abortRef = useRef(null);

  useSEO({
    title: "Live Threat Wall — Real-time attacks blocked by Simple IT SRQ",
    description:
      "See live attacks being blocked right now. Scanner probes, CVE exploit attempts, credential stuffing — every hit from the last 48 hours that our auto-defense caught. Updates every 15 seconds.",
    canonical: `${SITE_URL}/live-threats`,
    image: `${SITE_URL}/og-image.png`,
    breadcrumbs: [
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Live Threats", url: `${SITE_URL}/live-threats` },
    ],
  });

  const load = useCallback(async () => {
    // Abort any in-flight request before starting the next poll — keeps
    // a slow earlier response from clobbering a fresher one.
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/contact?action=threats", { signal: ctrl.signal });
      if (res.ok) setData(await res.json());
    } catch (err) {
      if (err?.name === "AbortError") return; // expected on unmount/refresh
      // best effort — silent on other errors
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    const onFocus = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onFocus);
      abortRef.current?.abort();
    };
  }, [load]);

  const items = data?.items || [];
  const stats = data?.stats || {};

  const countries = useMemo(() => {
    const m = new Map();
    for (const it of items) {
      if (!it.country) continue;
      m.set(it.country, (m.get(it.country) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [items]);

  return (
    <main id="main">
      <section className="section" aria-labelledby="threats-title">
        <div className="container" style={{ maxWidth: 960 }}>
          <div className="section-head">
            <span className="eyebrow" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{
                display: "inline-block", width: 8, height: 8, borderRadius: 999,
                background: "#DC2626", animation: "pulse-red 1.6s infinite",
              }} />
              Live Threat Wall
            </span>
            <h1 id="threats-title" className="display">
              Attacks we blocked for simpleitsrq.com — live
            </h1>
            <p className="lede">
              Every row below is a real attack our middleware caught in the last
              48 hours. The same engine powers the Security panel inside our own
              admin portal — and it's the same defense layer we'd deploy on a
              client site. Updates every 15 seconds.
            </p>
          </div>

          {/* Stat strip */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 10,
            marginBottom: 20,
          }}>
            <StatTile icon={Activity} label="Attacks · last 48h" value={stats.hits48h} color="#DC2626" />
            <StatTile icon={Zap}      label="Exploit attempts"    value={stats.exploitAttempts48h} color="#D97706" />
            <StatTile icon={Globe2}   label="Unique IPs"           value={stats.uniqueIps48h}  color="#0F6CBD" />
            <StatTile icon={Shield}   label="Total blocklist"      value={stats.blocklistTotal} color="#107C10" />
          </div>

          {/* Top countries */}
          {countries.length > 0 && (
            <div style={{ marginBottom: 20, padding: "12px 16px", borderRadius: 10, background: "var(--syn-surface, #f9fafb)", border: "1px solid var(--syn-border, #e5e7eb)" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--syn-text-muted, #6b7280)", marginBottom: 6, fontWeight: 600 }}>
                Where attacks came from
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {countries.map(([country, count]) => (
                  <span key={country} style={{
                    padding: "4px 10px", borderRadius: 999, fontSize: 12,
                    background: "var(--syn-surface-2, #fff)", border: "1px solid var(--syn-border, #e5e7eb)",
                  }}>
                    <strong>{country}</strong> <span style={{ color: "var(--syn-text-muted, #6b7280)" }}>· {count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <AdUnit format="auto" className="ad-in-article" />

          {/* Live list */}
          <h2 className="title-2" style={{ marginTop: 24, marginBottom: 8, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <Clock size={16} /> Recent events
          </h2>

          {loading && items.length === 0 && (
            <div style={{
              padding: 40, textAlign: "center", color: "var(--syn-text-muted, #6b7280)",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
            }}>
              <Loader2 size={22} className="spin" aria-hidden="true" />
              <span>Loading live feed…</span>
            </div>
          )}

          {!loading && items.length === 0 && (
            <div style={{ padding: 32, textAlign: "center", borderRadius: 10, background: "rgba(16, 124, 16, 0.06)", border: "1px solid rgba(16, 124, 16, 0.25)" }}>
              <Shield size={28} color="#107C10" style={{ marginBottom: 6 }} />
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>All clear the last 48 hours.</div>
              <div style={{ fontSize: 13, color: "var(--syn-text-muted, #6b7280)" }}>No notable attack activity — rare on the internet these days.</div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {items.map((it, i) => {
              const kind = THREAT_LABELS[it.threatClass] || THREAT_LABELS.scanner;
              const Icon = kind.icon;
              return (
                <div key={i} style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "10px 14px",
                  background: "var(--syn-surface-2, #fff)",
                  border: "1px solid var(--syn-border, #e5e7eb)",
                  borderLeft: `3px solid ${kind.color}`,
                  borderRadius: 8,
                  fontSize: 13,
                }}>
                  <Icon size={16} color={kind.color} style={{ flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                      <strong style={{ color: kind.color }}>{kind.label}</strong>
                      <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12, color: "var(--syn-text-muted, #6b7280)" }}>{it.ip}</span>
                      {it.country && (
                        <span style={{ fontSize: 11, color: "var(--syn-text-muted, #6b7280)" }}>
                          {it.city ? `${it.city}, ` : ""}{it.country}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--syn-text-muted, #6b7280)", marginTop: 2, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {it.cve && <span style={{ color: "#DC2626", fontWeight: 600 }}>{it.cveName || it.cve}</span>}
                      {it.tool && it.tool !== "unknown" && <span>tool: <strong>{it.tool}</strong></span>}
                      {it.cms && <span>target: <strong>{it.cms}</strong></span>}
                      <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11 }}>{it.pathSummary}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--syn-text-muted, #6b7280)", whiteSpace: "nowrap" }}>
                    {ago(it.ts)}
                  </span>
                </div>
              );
            })}
          </div>

          <AdUnit format="auto" className="ad-in-article" />

          {/* CTA — funnel to exposure scan + consult */}
          <div style={{
            marginTop: 32,
            padding: "24px",
            borderRadius: 12,
            background: "linear-gradient(180deg, #0F6CBD 0%, #0A4E8F 100%)",
            color: "#fff",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <ShieldAlert size={20} />
              <strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.9 }}>Your turn</strong>
            </div>
            <h3 style={{ margin: "0 0 8px", fontSize: 22 }}>Is your company this protected?</h3>
            <p style={{ margin: "0 0 18px", fontSize: 14, lineHeight: 1.55, opacity: 0.95, maxWidth: 560 }}>
              Every attack above is being blocked automatically — no team watching, no alerts to triage.
              Run a free passive scan of your own domain to see what attackers already know about you,
              or book a consult to deploy the same defense layer on your site.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link to="/exposure-scan" className="btn" style={{ background: "#fff", color: "#0F6CBD", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Search size={14} /> Free exposure scan
              </Link>
              <Link to="/book" className="btn" style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.5)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
                Book a consult <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </section>
      <style>{`
        @keyframes pulse-red {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.7); }
          50% { box-shadow: 0 0 0 6px rgba(220, 38, 38, 0); }
        }
      `}</style>
    </main>
  );
}

function StatTile({ icon: Icon, label, value, color }) {
  return (
    <div style={{
      padding: "14px 16px",
      borderRadius: 10,
      background: "var(--syn-surface-2, #fff)",
      border: "1px solid var(--syn-border, #e5e7eb)",
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <Icon size={14} color={color} />
        <span style={{ fontSize: 11, color: "var(--syn-text-muted, #6b7280)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>
        {value == null ? "—" : value.toLocaleString()}
      </div>
    </div>
  );
}
