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
    title: "Free DNS, SPF & DMARC Exposure Scan | Simple IT SRQ",
    description:
      "Run a passive external scan for DNS, MX, SPF, DMARC, DKIM, IPv6, and exposed subdomains, with a plain-English grade and next steps.",
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
  const findings = report.findings || [];
  const records = report.records || {};
  const subdomains = report.subdomains || [];
  const urgentFindings = findings.filter((f) => ["critical", "high"].includes(f.severity)).length;
  const emailAuthReady = Boolean(records.spf && records.dmarc && records.dkimSelectors?.length);
  const dnsRows = [
    { label: "A", value: records.a?.length ? records.a.join(", ") : "none", tone: records.a?.length ? "ok" : "muted" },
    { label: "AAAA", value: records.aaaa?.length ? records.aaaa.join(", ") : "none (IPv6 missing)", tone: records.aaaa?.length ? "ok" : "muted" },
    { label: "MX", value: records.mx?.length ? records.mx.join(", ") : "none - cannot receive email", tone: records.mx?.length ? "ok" : "bad" },
    { label: "SPF", value: records.spf || "missing", tone: records.spf ? "ok" : "bad" },
    { label: "DMARC", value: records.dmarc || "missing", tone: records.dmarc ? "ok" : "bad" },
    { label: "DKIM", value: records.dkimSelectors?.length ? records.dkimSelectors.join(", ") : "none from common selectors", tone: records.dkimSelectors?.length ? "ok" : "muted" },
    { label: "NS", value: records.ns?.length ? records.ns.join(", ") : "none", tone: records.ns?.length ? "ok" : "muted" },
  ];
  const fixOrder = findings.slice(0, 4);

  return (
    <div className="exposure-report">
      <section className="exposure-report-hero" style={{ "--grade-color": gradeColor }}>
        <div className="exposure-grade-card">
          <span className="exposure-grade-card__label">Exposure grade</span>
          <strong>{report.grade}</strong>
          <span>{report.domain}</span>
        </div>
        <div className="exposure-report-summary">
          <div className="exposure-report-summary__title">
            <Globe size={18} aria-hidden="true" />
            <h2>{report.domain}</h2>
          </div>
          <p>{report.gradeNarrative}</p>
          <div className="exposure-report-actions">
            <a href="/book" className="btn btn-primary">
              Fix these findings <ArrowRight size={15} aria-hidden="true" />
            </a>
            <button type="button" className="btn btn-secondary" onClick={onNew}>
              <Search size={14} aria-hidden="true" /> Scan another domain
            </button>
          </div>
        </div>
      </section>

      <section className="exposure-report-metrics" aria-label="Scan summary">
        <article>
          <span>Total findings</span>
          <strong>{findings.length}</strong>
          <em>{urgentFindings} urgent</em>
        </article>
        <article>
          <span>Email auth</span>
          <strong>{emailAuthReady ? "Ready" : "Needs work"}</strong>
          <em>SPF, DMARC, DKIM</em>
        </article>
        <article>
          <span>Subdomains</span>
          <strong>{subdomains.length}</strong>
          <em>visible in public cert logs</em>
        </article>
        <article>
          <span>Mail routing</span>
          <strong>{records.mx?.length ? "MX found" : "No MX"}</strong>
          <em>{records.mx?.length || 0} mail records</em>
        </article>
      </section>

      <div className="exposure-report-grid">
        <section className="exposure-panel exposure-panel--primary">
          <div className="exposure-panel__head">
            <div>
              <h2>Fix order</h2>
              <p>Start here. This is the shortest path from scary report to cleaner domain posture.</p>
            </div>
            <ShieldCheck size={20} aria-hidden="true" />
          </div>
          {fixOrder.length ? (
            <ol className="exposure-fix-list">
              {fixOrder.map((finding, index) => {
                const s = SEVERITY_STYLE[finding.severity] || SEVERITY_STYLE.info;
                return (
                  <li key={finding.area + "-" + finding.title + "-" + index}>
                    <span style={{ "--severity-color": s.border }}>{index + 1}</span>
                    <div>
                      <strong>{finding.title}</strong>
                      <em>{s.label} - {finding.area}</em>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="exposure-clear-state">
              <CheckCircle size={20} aria-hidden="true" />
              <strong>No findings. The public DNS and email posture looks clean.</strong>
            </div>
          )}
        </section>

        <section className="exposure-panel">
          <div className="exposure-panel__head">
            <div>
              <h2>Business impact</h2>
              <p>What a non-technical owner should take away from this scan.</p>
            </div>
          </div>
          <div className="exposure-impact-list">
            <div>
              <strong>{records.dmarc ? "Spoofing policy exists" : "Spoofing policy is missing"}</strong>
              <span>{records.dmarc ? "Your domain tells receivers how to handle spoofed mail." : "Attackers may have an easier time impersonating your domain."}</span>
            </div>
            <div>
              <strong>{subdomains.length ? "Public assets found" : "No public subdomains returned"}</strong>
              <span>{subdomains.length ? "Review these names for old apps, forgotten portals, and vendor systems." : "Certificate Transparency did not return a visible subdomain list."}</span>
            </div>
            <div>
              <strong>{records.mx?.length ? "Email routing is visible" : "Email routing needs attention"}</strong>
              <span>{records.mx?.length ? "Mail records exist; the next concern is authentication quality." : "No MX records means normal business email may not route correctly."}</span>
            </div>
          </div>
        </section>
      </div>

      <section className="exposure-panel exposure-findings-panel">
        <div className="exposure-panel__head">
          <div>
            <h2>Findings</h2>
            <p>Prioritized by severity, with the exact area that triggered each result.</p>
          </div>
        </div>
        {findings.length ? (
          <div className="exposure-findings-list">
            {findings.map((finding, index) => {
              const s = SEVERITY_STYLE[finding.severity] || SEVERITY_STYLE.info;
              return (
                <article key={finding.area + "-" + finding.title + "-" + index} className="exposure-finding" style={{ "--severity-color": s.border, "--severity-bg": s.bg }}>
                  <div className="exposure-finding__meta">
                    <span>{s.label}</span>
                    <em>{finding.area}</em>
                  </div>
                  <h3>{finding.title}</h3>
                  <p>{finding.detail}</p>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="exposure-clear-state">
            <CheckCircle size={20} aria-hidden="true" />
            <strong>No findings - your domain is well-configured.</strong>
          </div>
        )}
      </section>

      <div className="exposure-report-grid">
        <section className="exposure-panel">
          <div className="exposure-panel__head">
            <div>
              <h2>DNS evidence</h2>
              <p>The public records behind the grade.</p>
            </div>
          </div>
          <div className="exposure-dns-table">
            {dnsRows.map((row) => (
              <div key={row.label} className={"exposure-dns-row exposure-dns-row--" + row.tone}>
                <strong>{row.label}</strong>
                <span>{row.value}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="exposure-panel">
          <div className="exposure-panel__head">
            <div>
              <h2>Public subdomains</h2>
              <p>Names visible through Certificate Transparency.</p>
            </div>
            <span className="exposure-count-pill">{subdomains.length}</span>
          </div>
          {subdomains.length ? (
            <div className="exposure-subdomain-list">
              {subdomains.slice(0, 80).map((subdomain) => <code key={subdomain}>{subdomain}</code>)}
              {subdomains.length > 80 ? <span className="exposure-subdomain-more">+{subdomains.length - 80} more in the emailed report</span> : null}
            </div>
          ) : (
            <p className="exposure-empty-copy">No public subdomains were returned by the scan.</p>
          )}
        </section>
      </div>

      <section className="exposure-repair-cta">
        <div>
          <span><ShieldCheck size={18} aria-hidden="true" /> Fix this properly</span>
          <h2>Turn the report into a cleaned-up domain.</h2>
          <p>
            Simple IT SRQ fixes DNS, SPF, DMARC, DKIM, mail routing, and stale
            public exposure for Florida small businesses. One-time cleanup,
            plain-language proof, no retainer required.
          </p>
        </div>
        <a href="/book" className="btn">
          Book a cleanup call <ArrowRight size={15} aria-hidden="true" />
        </a>
      </section>
    </div>
  );
}
