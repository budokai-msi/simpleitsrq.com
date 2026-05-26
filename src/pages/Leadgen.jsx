import { useEffect, useMemo, useState } from "react";
import { Link } from "../lib/Link";
import {
  ArrowRight, Check, MapPin, Database, Mail, ShieldCheck,
  Filter, Send, BarChart3, Building2,
  Search,
} from "lucide-react";
import { useSEO, SITE_URL } from "../lib/seo";

const TIERS = [
  {
    id: "growth",
    name: "Growth",
    monthly: 19,
    annual: 15,
    blurb: "The focused paid test: one local niche, reviewed before sending.",
    cta: "Start Growth",
    ctaHref: "/book?topic=leadgen-growth",
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
    ctaHref: "/book?topic=leadgen-free",
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
    ctaHref: "/book?topic=leadgen-pro",
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

const DEFAULT_SCAN_ROWS = [
  {
    name: "Run a scan to load public records",
    address: "Try 34237, 34236, 34205, 34285, or your target zip",
    city: "OpenStreetMap",
    industry_group: "Public source",
    sub_industry: "No purchased list",
    website: "",
    phone: "",
    source_url: "https://www.openstreetmap.org",
  },
];

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

function LeadgenPlanLink({ tierId = "growth", billing = "monthly", className = "btn btn-primary", children }) {
  const tier = TIERS.find((t) => t.id === tierId) || TIERS[1];
  const stripeUrl = billing === "annual" ? tier.stripeAnnual : tier.stripeMonthly;
  if (stripeUrl) {
    return (
      <a href={stripeUrl} className={className} rel="noopener">
        {children || tier.cta} <ArrowRight size={16} />
      </a>
    );
  }
  return (
    <Link to={tier.ctaHref} className={className}>
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

function LeadgenScanApp() {
  const [zip, setZip] = useState("34237");
  const [niche, setNiche] = useState("Healthcare");
  const [offer, setOffer] = useState("Managed IT cleanup for small offices");
  const [dailyCap, setDailyCap] = useState(35);
  const [scan, setScan] = useState(null);
  const [review, setReview] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const rows = scan?.rows?.length ? scan.rows : DEFAULT_SCAN_ROWS;
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

  const runScan = async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/leadgen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zip, niche, limit: 60 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.message || data.error || `Scan failed (${res.status})`);
      }
      setScan(data);
      setReview(Object.fromEntries((data.rows || []).map((_, index) => [index, index < 20 ? "keep" : "maybe"])));
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const exportRows = () => {
    if (!reviewedRows.length) return;
    downloadCsv(`leadgen-${zip}-${niche.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`, reviewedRows);
  };

  return (
    <section className="leadgen-app-shell" aria-label="Leadgen local market scanner">
      <div className="leadgen-app-panel leadgen-app-panel--control">
        <div className="leadgen-app-topline">
          <span className="leadgen-app-live"><span /> Live public-record scanner</span>
          <Link to="/portal/leadgen" className="leadgen-app-portal-link">Open campaign workspace</Link>
        </div>

        <div className="leadgen-app-title">
          <h1 className="display">Build a local prospect list before you buy anything.</h1>
          <p>
            Pick a zip and niche. Leadgen pulls public business records, shows the source,
            lets you review the list, and exports the segment for the real campaign workspace.
          </p>
        </div>

        <div className="leadgen-app-controls">
          <label>
            <span>Zip code</span>
            <input
              value={zip}
              onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
              inputMode="numeric"
              placeholder="34237"
              aria-label="Target zip code"
            />
          </label>
          <label>
            <span>Niche</span>
            <select value={niche} onChange={(e) => setNiche(e.target.value)} aria-label="Target niche">
              {PUBLIC_NICHES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="leadgen-app-controls__wide">
            <span>Offer angle</span>
            <input
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              placeholder="Wi-Fi cleanup, backups, account lockouts..."
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
              aria-label="Daily send cap"
            />
          </label>
          <button type="button" className="btn btn-primary" onClick={runScan} disabled={busy || !/^\d{5}$/.test(zip)}>
            <Search size={16} aria-hidden="true" />
            {busy ? "Scanning..." : "Run scan"}
          </button>
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
            <strong>{niche} in {zip}</strong>
            <p>{offer || "Add an offer angle before sending."}</p>
          </div>
          <div>
            <span>Send rule</span>
            <strong>{dailyCap || 35}/day max</strong>
            <p>{kept.length ? `${Math.ceil(kept.length / Math.max(1, Number(dailyCap) || 35))} sending day estimate for kept rows.` : "Run and review a scan first."}</p>
          </div>
        </div>
      </div>

      <div className="leadgen-app-panel leadgen-app-panel--results">
        <div className="leadgen-app-results-head">
          <div>
            <span>{scan ? `${scan.returned} shown / ${scan.matched} matched` : "Ready to scan"}</span>
            <h2>Review list</h2>
          </div>
          <div className="leadgen-app-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={exportRows} disabled={!reviewedRows.length}>Export CSV</button>
            <Link to="/portal/leadgen" className="btn btn-primary btn-sm">Use in workspace</Link>
          </div>
        </div>

        <div className="leadgen-review-summary">
          <span>{kept.length} keep</span>
          <span>{maybe.length} maybe</span>
          <span>{rejected.length} reject</span>
        </div>

        <div className="leadgen-result-list">
          {rows.map((row, index) => (
            <article key={`${row.source_id || row.name}-${index}`} className="leadgen-result-row">
              <div className="leadgen-result-row__main">
                <strong>{row.name}</strong>
                <span>{[row.sub_industry || row.industry_group, row.city || row.address, row.zip].filter(Boolean).join(" - ")}</span>
              </div>
              <div className="leadgen-result-row__meta">
                <a href={row.website || row.source_url} target="_blank" rel="noreferrer">{hostFor(row.website || row.source_url)}</a>
                {row.phone ? <span>{row.phone}</span> : <span>Phone missing</span>}
              </div>
              {scan ? (
                <select
                  value={review[index] || "keep"}
                  onChange={(e) => setReview((current) => ({ ...current, [index]: e.target.value }))}
                  aria-label={`Review status for ${row.name}`}
                >
                  <option value="keep">Keep</option>
                  <option value="maybe">Maybe</option>
                  <option value="reject">Reject</option>
                </select>
              ) : (
                <span className="leadgen-result-row__placeholder">No scan yet</span>
              )}
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
                      <a
                        href={stripeUrl}
                        className={`btn ${t.highlight ? "btn-primary" : "btn-secondary"} leadgen-tier__cta`}
                        rel="noopener"
                      >
                        {t.cta} <ArrowRight size={14} />
                      </a>
                    );
                  }
                  return (
                    <Link
                      to={t.ctaHref}
                      className={`btn ${t.highlight ? "btn-primary" : "btn-secondary"} leadgen-tier__cta`}
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
            <LeadgenPlanLink tierId="growth" billing="monthly" className="btn btn-primary btn-lg">
              Start Growth
            </LeadgenPlanLink>
            <Link to="/book?topic=leadgen-demo" className="btn btn-secondary btn-lg">
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
            <Link to="/portal/leadgen" className="btn btn-primary">
              Open workspace <ArrowRight size={16} />
            </Link>
            <Link to="/book?topic=leadgen-demo" className="btn btn-secondary">
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

