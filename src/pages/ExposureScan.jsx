import { useState, useCallback } from "react";
import {
  Shield, ShieldCheck, Mail, Loader2, AlertTriangle, CheckCircle,
  ArrowRight, Globe, Search, Info,
} from "lucide-react";
import { useSEO, SITE_URL } from "../lib/seo";
import { csrfFetch } from "../lib/csrf";
import { track } from "../lib/analytics";
import AdUnit from "../components/AdSense";

const SEVERITY_STYLE = {
  critical: { bg: "rgba(220, 38, 38, 0.08)",  border: "#DC2626", label: "Critical" },
  high:     { bg: "rgba(217, 119, 6, 0.08)",  border: "#D97706", label: "Important" },
  medium:   { bg: "rgba(245, 158, 11, 0.08)", border: "#F59E0B", label: "Medium" },
  low:      { bg: "rgba(100, 116, 139, 0.08)",border: "#64748B", label: "Low" },
  info:     { bg: "rgba(17, 24, 39, 0.06)", border: "#111827", label: "FYI" },
};

const GRADE_COLORS = {
  A: "#107C10", B: "#059669", C: "#D97706", D: "#DC2626", F: "#7C2D12",
};

export default function ExposureScan() {
  const [domain, setDomain] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  const [status, setStatus] = useState("idle"); // idle | scanning | ok | error
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);

  useSEO({
    title: "Free External Exposure Scan - DNS, SPF, DMARC, Subdomain Audit | Simple IT SRQ",
    description:
      "Free passive-OSINT scan of your domain. Checks MX, SPF, DMARC, DKIM, IPv6, and exposed subdomains from Certificate Transparency logs. Plain-English grade and recommendations. No signup required to get the preview.",
    canonical: `${SITE_URL}/exposure-scan`,
    image: `${SITE_URL}/og-image.png`,
    breadcrumbs: [
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Exposure Scan", url: `${SITE_URL}/exposure-scan` },
    ],
  });

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError("");

    const cleaned = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!cleaned) { setError("Enter a domain (e.g. yourcompany.com)."); return; }
    if (!email.trim()) { setError("Enter your email so we can send the report."); return; }

    setStatus("scanning");
    try {
      const res = await csrfFetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "exposure_scan",
          domain: cleaned,
          email: email.trim(),
          name: name.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(
          data.error === "invalid_domain" ? "That doesn't look like a valid domain."
          : data.error === "email_invalid" ? "That email address doesn't look right."
          : data.error === "rate_limited"  ? "Too many scans from this network - wait an hour and try again."
          : "Scan failed. Try again in a minute."
        );
      }
      setReport(data);
      setStatus("ok");
      track.lead("exposure-scan", 50, { domain: data.domain, grade: data.grade });
    } catch (err) {
      setStatus("error");
      setError(err.message || "Scan failed.");
    }
  }, [domain, email, name]);

  const scanning = status === "scanning";

  return (
    <main id="main">
      <section className="section exposure-scan-page" aria-labelledby="scan-title">
        <div className="container">
          <div className="exposure-scan-hero">
            <div className="exposure-scan-copy">
              <span className="eyebrow">
                <Shield size={14} aria-hidden="true" />
                Free Exposure Scan
              </span>
              <h1 id="scan-title" className="display">
                See what attackers can already see.
              </h1>
              <p className="lede">
                Run a passive outside-in check of a business domain. We grade
                email authentication, exposed subdomains, DNS records, and
                modern-readiness without touching your servers.
              </p>
              <div className="exposure-scan-trust" aria-label="Scan guarantees">
                <span><CheckCircle size={15} aria-hidden="true" /> No port scans</span>
                <span><CheckCircle size={15} aria-hidden="true" /> Public records only</span>
                <span><CheckCircle size={15} aria-hidden="true" /> Report in about 10 seconds</span>
              </div>
            </div>

            {status !== "ok" && (
              <div className="exposure-scan-card">
                <div className="exposure-scan-card__head">
                  <div>
                    <span className="eyebrow">Run scan</span>
                    <h2>Check a domain</h2>
                  </div>
                  <span className="exposure-scan-badge">Passive OSINT</span>
                </div>

                <form onSubmit={handleSubmit} className="exposure-scan-form" noValidate>
                  <label className="field">
                    <span className="field-label">Business domain *</span>
                    <input
                      type="text"
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      placeholder="yourcompany.com"
                      required
                      autoComplete="url"
                      disabled={scanning}
                    />
                  </label>
                  <div className="exposure-scan-form__grid">
                    <label className="field">
                      <span className="field-label">Your name</span>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={120}
                        autoComplete="name"
                        disabled={scanning}
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">Email for the report *</span>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        maxLength={320}
                        autoComplete="email"
                        disabled={scanning}
                      />
                    </label>
                  </div>

                  {error && (
                    <div role="alert" className="exposure-scan-alert">
                      <AlertTriangle size={16} aria-hidden="true" />
                      {error}
                    </div>
                  )}

                  <button type="submit" className="btn btn-primary btn-lg" disabled={scanning}>
                    {scanning ? (
                      <><Loader2 size={18} className="spin" /> Scanning {domain.trim() || "domain"}...</>
                    ) : (
                      <><Search size={16} /> Run free scan</>
                    )}
                  </button>

                  <p className="exposure-scan-fineprint">
                    Safe to run against any domain you own. No authenticated
                    requests, no server login, and no traffic beyond public DNS
                    and Certificate Transparency lookups.
                  </p>
                </form>
              </div>
            )}
          </div>

          {status !== "ok" && (
            <div className="exposure-check-grid" aria-label="Exposure scan checks">
              <article>
                <Mail size={18} aria-hidden="true" />
                <h2>Email spoofing</h2>
                <p>SPF, DMARC, DKIM selectors, and MX records.</p>
              </article>
              <article>
                <Globe size={18} aria-hidden="true" />
                <h2>Public exposure</h2>
                <p>Certificate Transparency subdomains and visible DNS.</p>
              </article>
              <article>
                <ShieldCheck size={18} aria-hidden="true" />
                <h2>Plain-English fixes</h2>
                <p>A grade, prioritized findings, and what to fix first.</p>
              </article>
            </div>
          )}

          {status === "ok" && report && (
            <ReportView report={report} onNew={() => { setStatus("idle"); setReport(null); setDomain(""); }} />
          )}

          <AdUnit format="auto" className="ad-in-article" />

          <div className="exposure-details-card">
            <h2 className="title-2">
              <Info size={18} aria-hidden="true" /> What this scan checks
            </h2>
            <ul>
              <li><strong>MX records</strong> - can your domain receive email at all?</li>
              <li><strong>SPF</strong> - can attackers forge mail claiming to be from you?</li>
              <li><strong>DMARC</strong> - are you telling Gmail/Outlook what to do with spoofed mail?</li>
              <li><strong>DKIM</strong> - is your outgoing mail cryptographically signed? We check the common SaaS selectors.</li>
              <li><strong>Subdomain exposure</strong> - Certificate Transparency records reveal public subdomains.</li>
              <li><strong>Modern readiness</strong> - IPv6 presence and nameserver setup.</li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}

function ReportView({ report, onNew }) {
  const gradeColor = GRADE_COLORS[report.grade] || "#6b7280";

  return (
    <div style={{ marginTop: 16 }}>
      {/* Grade header */}
      <div className="form-shell" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 72, fontWeight: 800, color: gradeColor, lineHeight: 1 }}>{report.grade}</div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280", marginTop: 4 }}>Grade</div>
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Globe size={16} color="#111827" />
              <strong style={{ fontSize: 16 }}>{report.domain}</strong>
            </div>
            <p style={{ margin: 0, lineHeight: 1.6, fontSize: 15 }}>{report.gradeNarrative}</p>
          </div>
        </div>
      </div>

      {/* Findings */}
      {report.findings?.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 className="title-2" style={{ margin: "0 0 12px", fontSize: 18 }}>Findings</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {report.findings.map((f, i) => {
              const s = SEVERITY_STYLE[f.severity] || SEVERITY_STYLE.info;
              return (
                <div key={i} style={{
                  padding: "16px 18px",
                  borderRadius: 10,
                  background: s.bg,
                  border: `1px solid ${s.border}40`,
                  borderLeft: `4px solid ${s.border}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                      padding: "3px 8px", borderRadius: 4,
                      background: s.border, color: "#fff", textTransform: "uppercase",
                    }}>{s.label}</span>
                    <span style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{f.area}</span>
                  </div>
                  <h3 style={{ margin: "0 0 6px", fontSize: 15 }}>{f.title}</h3>
                  <p style={{ margin: 0, lineHeight: 1.55, fontSize: 14, color: "#374151" }}>{f.detail}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {report.findings?.length === 0 && (
        <div style={{
          padding: "16px 18px",
          borderRadius: 10,
          background: "rgba(16, 124, 16, 0.08)",
          border: "1px solid rgba(16, 124, 16, 0.3)",
          borderLeft: "4px solid #107C10",
          marginBottom: 24,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <CheckCircle size={20} color="#107C10" />
            <strong>No findings — your domain is well-configured.</strong>
          </div>
        </div>
      )}

      {/* DNS records summary */}
      <div className="form-shell" style={{ marginBottom: 24 }}>
        <h2 className="title-2" style={{ margin: "0 0 12px", fontSize: 16 }}>What your DNS looks like</h2>
        <div style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13, lineHeight: 1.8, color: "#374151" }}>
          <div><strong style={{ color: "#111827" }}>A:</strong>    {report.records.a?.length > 0 ? report.records.a.join(", ") : <em style={{ color: "#6b7280" }}>none</em>}</div>
          <div><strong style={{ color: "#111827" }}>AAAA:</strong> {report.records.aaaa?.length > 0 ? report.records.aaaa.join(", ") : <em style={{ color: "#6b7280" }}>none (IPv6 missing)</em>}</div>
          <div><strong style={{ color: "#111827" }}>MX:</strong>   {report.records.mx?.length > 0 ? report.records.mx.join(", ") : <em style={{ color: "#dc2626" }}>none — can't receive email</em>}</div>
          <div style={{ wordBreak: "break-all" }}><strong style={{ color: "#111827" }}>SPF:</strong>  {report.records.spf || <em style={{ color: "#dc2626" }}>missing</em>}</div>
          <div style={{ wordBreak: "break-all" }}><strong style={{ color: "#111827" }}>DMARC:</strong> {report.records.dmarc || <em style={{ color: "#dc2626" }}>missing</em>}</div>
          <div><strong style={{ color: "#111827" }}>DKIM:</strong> {report.records.dkimSelectors?.length > 0 ? report.records.dkimSelectors.join(", ") : <em style={{ color: "#6b7280" }}>none (common selectors checked)</em>}</div>
          <div><strong style={{ color: "#111827" }}>NS:</strong>   {report.records.ns?.join(", ") || <em style={{ color: "#6b7280" }}>none</em>}</div>
        </div>
      </div>

      {/* Subdomains */}
      {report.subdomains?.length > 0 && (
        <div className="form-shell" style={{ marginBottom: 24 }}>
          <h2 className="title-2" style={{ margin: "0 0 6px", fontSize: 16 }}>
            Subdomains visible in Certificate Transparency ({report.subdomains.length})
          </h2>
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "#6b7280" }}>
            These are every subdomain that's ever had a TLS certificate issued for it. Every scanner on the internet can pull this same list. Review for anything that shouldn't be discoverable.
          </p>
          <div style={{
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: 12,
            lineHeight: 1.6,
            color: "#374151",
            maxHeight: 280,
            overflowY: "auto",
            padding: "8px 12px",
            background: "#f9fafb",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
          }}>
            {report.subdomains.map((s) => <div key={s}>{s}</div>)}
          </div>
        </div>
      )}

      {/* CTA */}
      <div style={{
        padding: "24px",
        borderRadius: 12,
        background: "linear-gradient(180deg, #111827 0%, #000000 100%)",
        color: "#fff",
        marginBottom: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <ShieldCheck size={20} />
          <strong style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.9 }}>Fix this properly</strong>
        </div>
        <h3 style={{ margin: "0 0 8px", fontSize: 20 }}>Want these findings fixed?</h3>
        <p style={{ margin: "0 0 16px", fontSize: 14, lineHeight: 1.55, opacity: 0.95 }}>
          We fix DNS + email authentication for Florida small businesses. One-time flat fee, no retainer.
          Reply to the email we just sent, or book a free consult.
        </p>
        <a href="/book" className="btn" style={{
          background: "#fff", color: "#111827", fontWeight: 600,
          display: "inline-flex", alignItems: "center", gap: 8,
        }}>
          Book a free consult <ArrowRight size={14} />
        </a>
      </div>

      <div style={{ textAlign: "center", marginTop: 24 }}>
        <button type="button" className="btn btn-secondary" onClick={onNew} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Search size={14} /> Scan another domain
        </button>
      </div>
    </div>
  );
}
