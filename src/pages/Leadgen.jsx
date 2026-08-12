import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import "leaflet/dist/leaflet.css";
import "../styles/leadgen.css";
import "../styles/leadgen-product.css";
import { Link } from "../lib/Link";
import {
  ArrowRight, Check, Database, Mail, Building2,
  Search, Phone, FileText, Filter, Lock
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
  const parts = ["lg", stripeSafeParam(tierId), stripeSafeParam(billing)];
  const zip = String(checkoutContext.zip || "").replace(/\D/g, "").slice(0, 5);
  if (zip) parts.push("zip", zip);
  if (checkoutContext.niche && checkoutContext.niche !== "All") parts.push("niche", stripeSafeParam(checkoutContext.niche));
  const kept = Number(checkoutContext.kept);
  if (Number.isFinite(kept) && kept >= 0) parts.push("kept", String(Math.round(kept)));
  const dailyCap = Number(checkoutContext.dailyCap);
  if (Number.isFinite(dailyCap) && dailyCap > 0) parts.push("cap", String(Math.round(dailyCap)));
  parts.push("src", stripeSafeParam(source));
  return parts.join("_").slice(0, 150);
}

function withLeadgenCheckoutParams(url, options = {}) {
  if (!url) return "";
  try {
    const next = new URL(url);
    if (!next.searchParams.has("prefilled_promo_code")) next.searchParams.set("prefilled_promo_code", LEADGEN_PROMO_CODE);
    const reference = leadgenCheckoutReference(options);
    next.searchParams.set("client_reference_id", reference.slice(0, 200));
    next.searchParams.set("utm_source", "simpleitsrq_com");
    next.searchParams.set("utm_medium", "leadgen");
    next.searchParams.set("utm_campaign", "leadgen_checkout");
    next.searchParams.set("utm_content", reference.slice(0, 150));
    return next.toString();
  } catch {
    const glue = url.includes("?") ? "&" : "?";
    return url.includes("prefilled_promo_code=") ? url : `${url}${glue}prefilled_promo_code=${encodeURIComponent(LEADGEN_PROMO_CODE)}`;
  }
}

const TIERS = [
  { id: "growth", name: "Growth", monthly: 19, annual: 15, blurb: "One zip, one service category, reviewed before outreach.", cta: "Start Growth", ctaHref: "/book?topic=leadgen-growth", stripeMonthly: import.meta.env.VITE_LEADGEN_GROWTH_MONTHLY_URL || LEADGEN_STRIPE_LINKS.growth.monthly, stripeAnnual: import.meta.env.VITE_LEADGEN_GROWTH_ANNUAL_URL || LEADGEN_STRIPE_LINKS.growth.annual },
  { id: "free", name: "Sample", monthly: 0, annual: 0, blurb: "A quick look before you pay.", cta: "Request sample", ctaHref: "/book?topic=leadgen-free", stripeMonthly: null, stripeAnnual: null },
  { id: "pro", name: "Pro", monthly: 99, annual: 79, blurb: "For repeated scans across several local markets.", cta: "Start Pro", ctaHref: "/book?topic=leadgen-pro", stripeMonthly: import.meta.env.VITE_LEADGEN_PRO_MONTHLY_URL || LEADGEN_STRIPE_LINKS.pro.monthly, stripeAnnual: import.meta.env.VITE_LEADGEN_PRO_ANNUAL_URL || LEADGEN_STRIPE_LINKS.pro.annual },
];

const PUBLIC_NICHES = ["All","Healthcare","Trades","Professional Services","Automotive","Hospitality","Personal Services","Retail","Food & Drink","Education","Real Estate","Cleaning & Maintenance","Media & Creative","Recreation"];
const SCAN_LIMIT = 80;
const ROLE_EMAIL_RE = /^(sales|info|contact|hello|support|admin|office|reception|team|enquiries|enquiry|inquiries|marketing|hr|careers|jobs|help|service|billing|accounts)@/i;
function isRoleEmail(email) { return typeof email === "string" && ROLE_EMAIL_RE.test(email.trim()); }
function hostFor(url) { if (!url) return "No website"; try { return new URL(url).host.replace(/^www\./, ""); } catch { return url; } }
function sourceFor(row) { if (!row?.source_url) return "Source pending"; try { return new URL(row.source_url).host.replace(/^www\./, ""); } catch { return "Source record"; } }
function csvCell(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
function downloadCsv(filename, rows) {
  const headers = ["status","name","industry","sub_industry","address","city","state","zip","website","phone","email","source_url"];
  const lines = [headers.map(csvCell).join(","), ...rows.map((row) => headers.map((key) => csvCell(key === "email" ? (row.email || row.emails?.[0]?.email || "") : row[key])).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function LeadgenPlanLink({ tierId="growth", billing="monthly", children, className="btn btn-primary", source="leadgen_pricing", checkoutContext={} }) {
  const tier = TIERS.find((t) => t.id === tierId) || TIERS[0];
  const raw = billing === "annual" ? tier.stripeAnnual : tier.stripeMonthly;
  const href = withLeadgenCheckoutParams(raw || tier.ctaHref, { tierId, billing, source, checkoutContext });
  if (raw) return <a href={href} className={className} rel="noopener noreferrer" data-leadgen-cta={source}>{children || tier.cta} <ArrowRight size={16}/></a>;
  return <Link to={tier.ctaHref} className={className} data-leadgen-cta={source}>{children || tier.cta} <ArrowRight size={16}/></Link>;
}

function LeadgenScanApp() {
  const [zip, setZip] = useState("");
  const [niche, setNiche] = useState("All");
  const [scan, setScan] = useState(null);
  const [review, setReview] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [destinations, setDestinations] = useState([]);
  const [pushTarget, setPushTarget] = useState("");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState(null);
  const [extractedEmails, setExtractedEmails] = useState({});
  const [extracting, setExtracting] = useState(false);
  const [extractMsg, setExtractMsg] = useState(null);
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const validZip = /^\d{5}$/.test(zip);
  const rows = scan?.rows || [];
  const reviewedRows = useMemo(() => rows.map((row, index) => ({ ...row, status: review[index] || "keep", __scanIndex: index })), [rows, review]);
  const visibleRows = useMemo(() => reviewedRows.filter((row) => !deferredSearchTerm.trim() || [row.name,row.city,row.industry_group,row.website,row.phone].filter(Boolean).join(" ").toLowerCase().includes(deferredSearchTerm.trim().toLowerCase())), [reviewedRows, deferredSearchTerm]);
  const kept = reviewedRows.filter((r) => r.status === "keep");
  const bestEmail = (r) => r.email || r.emails?.[0]?.email || extractedEmails[r.website] || "";
  const keptWithEmail = kept.filter((r) => bestEmail(r));

  useEffect(() => {
    fetch("/api/leadgen-integrations", { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then((r) => r.ok ? r.json() : null)
      .then((j) => { if (j?.integrations?.length) { setDestinations(j.integrations); setPushTarget(String(j.integrations[0].id)); } })
      .catch(() => {});
  }, []);

  const runScan = async () => {
    if (!validZip || busy) return;
    setBusy(true); setErr(""); setScan(null); setReview({});
    try {
      const qs = new URLSearchParams({ zip, niche, limit: String(SCAN_LIMIT) });
      const res = await fetch(`/api/leadgen?${qs.toString()}`, { headers: { Accept: "application/json" }, cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      setScan(data);
      trackEvent("search", { search_term: `${zip}:${niche}`, source: "leadgen_scanner", result_count: Number(data.matched || data.rows?.length || 0) });
    } catch (e) { setErr(e.message || "Scan failed."); }
    finally { setBusy(false); }
  };

  const selectBest = () => {
    const next = {};
    rows.forEach((r, i) => { next[i] = r.website && (r.phone || r.email || r.emails?.length) ? "keep" : "reject"; });
    setReview(next);
  };

  const findEmails = async () => {
    const targets = kept.filter((r) => r.website && !bestEmail(r)).slice(0, 30);
    if (!targets.length) return setExtractMsg({ ok: true, text: "Selected leads already have emails or no crawlable websites." });
    setExtracting(true); setExtractMsg(null); const found = { ...extractedEmails }; let count = 0;
    try {
      for (let i=0;i<targets.length;i+=10) {
        const batch = targets.slice(i,i+10);
        const res = await csrfFetch("/api/leadgen-emails", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ domains: batch.map((r)=>r.website) }) });
        const j = await res.json().catch(()=>({}));
        if (!res.ok) throw new Error(j.message || j.error || `HTTP ${res.status}`);
        (j.results || []).forEach((result, idx) => { const email = result.emails?.[0]?.email; if (email) { found[batch[idx].website] = email; count += 1; } });
      }
      setExtractedEmails(found); setExtractMsg({ ok:true, text:`Found ${count} additional email${count===1?"":"s"}.` });
    } catch (e) { setExtractMsg({ ok:false, text:e.message || "Email enrichment failed." }); }
    finally { setExtracting(false); }
  };

  const pushSelected = async () => {
    if (!pushTarget || !kept.length) return;
    setPushBusy(true); setPushMsg(null);
    try {
      const leads = kept.map((r) => ({ ...r, email: bestEmail(r) || undefined }));
      const res = await csrfFetch("/api/leadgen-integrations?action=push", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id:Number(pushTarget), leads }) });
      const j = await res.json().catch(()=>({})); if (!res.ok || j.ok === false) throw new Error(j.message || j.error || `HTTP ${res.status}`);
      setPushMsg({ ok:true, text:`Pushed ${j.sent ?? leads.length} lead${(j.sent ?? leads.length)===1?"":"s"}.` });
    } catch (e) { setPushMsg({ ok:false, text:e.message || "CRM push failed." }); }
    finally { setPushBusy(false); }
  };

  const productStage = !scan ? 0 : kept.length === 0 ? 1 : keptWithEmail.length < kept.length ? 2 : 3;
  const workflow = [
    ["1. Discover", "Choose a market and industry."],
    ["2. Qualify", "Keep the businesses worth pursuing."],
    ["3. Enrich", "Add reachable emails and contact data."],
    ["4. Sync", "Export or push directly into your stack."],
  ];

  return (
    <section className="leadgen-app-shell" aria-label="Leadgen local market scanner">
      {scan && kept.length ? (
        <div className="leadgen-selbar" role="region" aria-label="Selected lead actions">
          <span className="leadgen-selbar__count"><strong>{kept.length}</strong> selected</span>
          <div className="leadgen-selbar__actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => downloadCsv(`leadgen-${zip}.csv`, kept)}>Export CSV</button>
            {destinations.length ? <select value={pushTarget} onChange={(e)=>setPushTarget(e.target.value)} aria-label="CRM destination">{destinations.map((d)=><option key={d.id} value={d.id}>{d.label || d.kind}</option>)}</select> : null}
            {destinations.length ? <button type="button" className="btn btn-primary btn-sm" onClick={pushSelected} disabled={pushBusy}>{pushBusy ? "Pushing…" : "Push to CRM"}</button> : <Link to="/portal/leadgen" className="btn btn-primary btn-sm">Connect CRM</Link>}
          </div>
        </div>
      ) : null}

      <div className="leadgen-app-panel leadgen-app-panel--control">
        <div className="leadgen-app-topline"><span className="leadgen-app-live"><span/> Live local-market data engine</span><Link to="/portal/leadgen" className="leadgen-app-portal-link">Campaign workspace</Link></div>
        <div className="leadgen-app-title">
          <h2 className="title-2">Build a qualified local pipeline, not another spreadsheet.</h2>
          <p>Discover businesses, qualify them, enrich contact data, then send the final list into your CRM or automation stack.</p>
        </div>

        <div className="leadgen-product-steps" aria-label="Leadgen workflow">
          {workflow.map(([title, body], i) => <div key={title} className={`leadgen-product-step${i===productStage?" is-active":""}`}><strong>{title}</strong><span>{body}</span></div>)}
        </div>

        <div className="leadgen-scan-card">
          <div className="leadgen-app-controls leadgen-app-controls--primary">
            <label><span>ZIP code</span><input value={zip} onChange={(e)=>setZip(e.target.value.replace(/\D/g,"").slice(0,5))} inputMode="numeric" placeholder="34236" /></label>
            <label><span>Industry</span><select value={niche} onChange={(e)=>setNiche(e.target.value)}>{PUBLIC_NICHES.map((n)=><option key={n}>{n}</option>)}</select></label>
            <button type="button" className="btn btn-primary" onClick={runScan} disabled={!validZip || busy}><Search size={16}/>{busy ? "Scanning…" : "Find prospects"}</button>
          </div>
          {err ? <p className="form-error" role="alert">{err}</p> : null}
          <div className="leadgen-premium-strip" aria-label="Product capabilities">
            <div><strong>Public market discovery</strong><span>Local businesses organized by geography and industry.</span></div>
            <div><strong>Email enrichment</strong><span>Crawl selected websites for reachable business inboxes.</span></div>
            <div><strong>Human qualification</strong><span>Keep, reject, and export only the prospects you actually want.</span></div>
            <div><strong>CRM + automation sync</strong><span>HubSpot, Mailchimp, ActiveCampaign, GoHighLevel, Salesforce, Pipedrive, webhook/Zapier and SMTP.</span></div>
          </div>
        </div>

        {scan ? (
          <>
            <div className="leadgen-app-kpis" aria-label="Scan metrics">
              <div className="leadgen-app-kpis__hero"><Building2 size={15}/><strong>{scan.matched ?? rows.length}</strong><span>businesses</span></div>
              <div><Database size={15}/><strong>{rows.filter((r)=>r.website).length}</strong><span>websites</span></div>
              <div><Phone size={15}/><strong>{rows.filter((r)=>r.phone).length}</strong><span>phones</span></div>
              <div><Mail size={15}/><strong>{reviewedRows.filter((r)=>bestEmail(r)).length}</strong><span>emails</span></div>
              <div><Check size={15}/><strong>{kept.length}</strong><span>selected</span></div>
            </div>

            <div className="leadgen-results-toolbar">
              <input value={searchTerm} onChange={(e)=>setSearchTerm(e.target.value)} placeholder="Filter businesses…" aria-label="Filter businesses" />
              <button type="button" className="btn btn-secondary btn-sm" onClick={selectBest}><Filter size={14}/> Select best</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={findEmails} disabled={extracting || !kept.length}><Mail size={14}/>{extracting ? "Enriching…" : "Find emails"}</button>
            </div>
            {extractMsg ? <p className={`leadgen-selected-emails__msg${extractMsg.ok?"":" is-error"}`}>{extractMsg.text}</p> : null}
            {pushMsg ? <p className={`leadgen-selected-emails__msg${pushMsg.ok?"":" is-error"}`}>{pushMsg.text}</p> : null}

            <div className="leadgen-results-list">
              {visibleRows.map((row) => {
                const index = row.__scanIndex;
                const selected = (review[index] || "keep") === "keep";
                const email = bestEmail(row);
                return <article key={`${row.source_id || row.name}-${index}`} className="leadgen-result-row">
                  <label className="leadgen-result-row__select"><input type="checkbox" checked={selected} onChange={(e)=>setReview((cur)=>({ ...cur, [index]: e.target.checked ? "keep" : "reject" }))} aria-label={`Include ${row.name}`} /></label>
                  <div className="leadgen-result-row__main"><strong>{row.name}</strong><span>{[row.sub_industry || row.industry_group,row.city || row.address,row.zip].filter(Boolean).join(" - ")}</span></div>
                  <div className="leadgen-result-row__meta">
                    {row.website || row.source_url ? <a href={row.website || row.source_url} target="_blank" rel="noopener noreferrer">{hostFor(row.website || row.source_url)}</a> : <span>No website</span>}
                    {email ? <a href={`mailto:${email}`} className="leadgen-result-row__email"><Mail size={12}/>{email}{isRoleEmail(email)?" · corporate":""}</a> : <span>Email not enriched</span>}
                    {row.phone ? <span>{row.phone}</span> : <span>Phone missing</span>}
                    <span className="leadgen-result-row__source">{sourceFor(row)}</span>
                  </div>
                </article>;
              })}
            </div>

            <div className="leadgen-selected-emails">
              <div className="leadgen-selected-emails__head"><strong>{kept.length} qualified leads</strong><span>{keptWithEmail.length} ready with email</span></div>
              <p className="leadgen-selected-emails__empty">This is the handoff point: export the qualified set or sync it into your connected CRM/automation destination.</p>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

export default function Leadgen() {
  useSEO({
    title: "Local Lead Generation & CRM Sync | Simple IT SRQ",
    description: "Discover local businesses by ZIP and industry, qualify prospects, enrich business emails, and sync the final list to your CRM or automation stack.",
    canonical: `${SITE_URL}/leadgen`,
    image: `${SITE_URL}/og-image.png`,
  });
  return <main id="main" className="leadgen-public" style={{ padding:"40px 0", minHeight:"100vh", backgroundColor:"var(--c-bg-subtle)" }}><div className="container"><LeadgenScanApp/></div></main>;
}
