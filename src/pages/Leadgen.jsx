import { useDeferredValue, useEffect, useMemo, useState } from "react";
import "../styles/leadgen.css";
import "../styles/leadgen-product.css";
import { Link } from "../lib/Link";
import { ArrowRight, ChevronDown, Mail, Search, Sparkles } from "lucide-react";
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
    const ref = leadgenCheckoutReference(options);
    next.searchParams.set("client_reference_id", ref);
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

function downloadCsv(filename, rows) {
  const headers = ["status", "name", "industry", "sub_industry", "address", "city", "state", "zip", "website", "phone", "email", "opportunity_score", "opportunity_grade", "source_url"];
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((key) => csvCell(key === "email" ? (row.email || row.emails?.[0]?.email || "") : row[key])).join(",")),
  ];
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

function websiteInsightLabels(signal) {
  if (!signal) return [];
  const labels = [];
  if (signal.technologies?.length) labels.push(...signal.technologies.slice(0, 4));
  if (signal.has_contact_form) labels.push("Contact form");
  if (signal.has_booking_signal) labels.push("Online booking");
  if (signal.has_careers_signal) labels.push("Hiring signal");
  if (signal.has_schema) labels.push("Schema markup");
  if (signal.social?.linkedin) labels.push("LinkedIn");
  if (signal.social?.facebook) labels.push("Facebook");
  if (signal.social?.instagram) labels.push("Instagram");
  if (signal.secure === false) labels.push("No HTTPS");
  if (signal.has_viewport === false) labels.push("No mobile viewport");
  return Array.from(new Set(labels)).slice(0, 10);
}

function hostnameOf(value) {
  if (!value) return "";
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return String(value).replace(/^https?:\/\//, "").split("/")[0];
  }
}

function prospectKey(row) {
  return row.source_id || `${row.name || "prospect"}-${row.__scanIndex}`;
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
  const [websiteIntel, setWebsiteIntel] = useState({});
  const [extracting, setExtracting] = useState(false);
  const [extractMsg, setExtractMsg] = useState(null);
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
    if (!query) return reviewedRows;
    return reviewedRows.filter((row) => [
      row.name,
      row.city,
      row.industry_group,
      row.sub_industry,
      row.website,
      row.phone,
      ...(row.opportunity_reasons || []),
      ...websiteInsightLabels(row.website_intel),
    ].filter(Boolean).join(" ").toLowerCase().includes(query));
  }, [reviewedRows, deferredSearchTerm]);

  const groupedRows = useMemo(() => {
    const groups = new Map();
    for (const row of visibleRows) {
      const industry = row.industry_group || row.industry || "Other";
      const sub = row.sub_industry || "Other";
      if (!groups.has(industry)) {
        groups.set(industry, {
          name: industry,
          rows: [],
          subs: new Map(),
          withWebsite: 0,
          withPhone: 0,
          withEmail: 0,
          enriched: 0,
          digitalGaps: 0,
          scoreTotal: 0,
        });
      }
      const group = groups.get(industry);
      group.rows.push(row);
      if (row.website) group.withWebsite += 1;
      if (row.phone) group.withPhone += 1;
      if (bestEmail(row)) group.withEmail += 1;
      if (row.website_intel) group.enriched += 1;
      if (!row.website || !row.phone) group.digitalGaps += 1;
      group.scoreTotal += Number(row.opportunity_score || 0);
      if (!group.subs.has(sub)) group.subs.set(sub, []);
      group.subs.get(sub).push(row);
    }
    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        avgScore: group.rows.length ? Math.round(group.scoreTotal / group.rows.length) : 0,
        contactable: group.rows.length ? Math.round((group.rows.filter((row) => row.phone || bestEmail(row)).length / group.rows.length) * 100) : 0,
      }))
      .sort((a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name));
  }, [visibleRows, extractedEmails]);

  const kept = reviewedRows.filter((row) => row.status === "keep");
  const keptWithEmail = kept.filter((row) => bestEmail(row));
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
      const next = {};
      groupedRows.slice(0, 2).forEach((group) => { next[group.name] = true; });
      return next;
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
    try {
      const response = await csrfFetch("/api/leadgen", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ zip, niche, limit: SCAN_LIMIT }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${response.status}`);
      setScan(data);
      trackEvent("search", {
        search_term: `${zip}:${niche}`,
        source: "leadgen_scanner",
        result_count: Number(data.matched || data.rows?.length || 0),
      });
    } catch (error) {
      setErr(error.message || "Scan failed.");
    } finally {
      setBusy(false);
    }
  };

  const selectBest = () => {
    const next = {};
    rows.forEach((row, index) => { next[index] = Number(row.opportunity_score || 0) >= 65 ? "keep" : "reject"; });
    setReview(next);
  };

  const qualifyGroup = (group) => {
    setReview((current) => {
      const next = { ...current };
      group.rows.forEach((row) => { next[row.__scanIndex] = Number(row.opportunity_score || 0) >= 65 ? "keep" : "reject"; });
      return next;
    });
  };

  const clearGroup = (group) => {
    setReview((current) => {
      const next = { ...current };
      group.rows.forEach((row) => { next[row.__scanIndex] = "reject"; });
      return next;
    });
  };

  const enrichSelected = async () => {
    const targets = kept.filter((row) => row.website).slice(0, 30);
    if (!targets.length) return setExtractMsg({ ok: true, text: "Select prospects with websites to enrich." });
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
          const key = batch[resultIndex].website;
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
      setExtractMsg({
        ok: true,
        text: `Enriched ${intelCount} website${intelCount === 1 ? "" : "s"}${emailCount ? ` · found ${emailCount} email${emailCount === 1 ? "" : "s"}` : ""}.`,
      });
    } catch (error) {
      setExtractMsg({ ok: false, text: error.message || "Website enrichment failed." });
    } finally {
      setExtracting(false);
    }
  };

  const pushSelected = async () => {
    if (!pushTarget || !kept.length) return;
    setPushBusy(true);
    setPushMsg(null);
    try {
      const leads = kept.map((row) => ({
        ...row,
        email: bestEmail(row) || undefined,
        website_intel: row.website_intel || undefined,
      }));
      const response = await csrfFetch("/api/leadgen-integrations?action=push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: Number(pushTarget), leads }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${response.status}`);
      setPushMsg({ ok: true, text: `Pushed ${data.sent ?? leads.length} lead${(data.sent ?? leads.length) === 1 ? "" : "s"}.` });
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
        body: JSON.stringify({
          name: `${niche} ${zip}`,
          zip,
          industry_group: niche === "All" ? null : niche,
          schedule: "weekly",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${response.status}`);
      setSaveMsg({ ok: true, text: "Saved as a weekly monitored market." });
    } catch (error) {
      setSaveMsg({ ok: false, text: error.message || "Could not save market." });
    }
  };

  const toggleGroup = (name) => setOpenGroups((current) => ({ ...current, [name]: !current[name] }));
  const toggleProspect = (key) => setOpenProspects((current) => ({ ...current, [key]: !current[key] }));
  const expandAllGroups = () => setOpenGroups(Object.fromEntries(groupedRows.map((group) => [group.name, true])));
  const collapseAllGroups = () => setOpenGroups(Object.fromEntries(groupedRows.map((group) => [group.name, false])));
  const stage = !scan ? 0 : kept.length === 0 ? 1 : keptWithEmail.length < kept.length ? 2 : 3;
  const workflow = [
    ["1. Discover", "Choose the ZIP code and industry you want to study."],
    ["2. Qualify", "Review the evidence and keep the prospects that fit."],
    ["3. Enrich", "Fill in contact and website signals where data is available."],
    ["4. Sync", "Export the list or send selected records to a connected CRM."],
  ];

  return (
    <section className="leadgen-app-shell" aria-label="Leadgen local market scanner">
      {scan && kept.length ? (
        <div className="leadgen-selbar">
          <span className="leadgen-selbar__count"><strong>{kept.length}</strong> selected</span>
          <div className="leadgen-selbar__actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => downloadCsv(`leadgen-${zip}.csv`, kept)}>Download CSV</button>
            {destinations.length ? (
              <select value={pushTarget} onChange={(event) => setPushTarget(event.target.value)}>
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
          <p>Scan by ZIP code and industry, compare useful business signals, expand the records that stand out, enrich what is missing, and export only the prospects you choose.</p>
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
            {insights ? (
              <div className="leadgen-intel-strip" aria-label="Market intelligence">
                <article><strong>{insights.total}</strong><span>businesses mapped</span></article>
                <article><strong>{insights.contactable_rate}%</strong><span>contactable</span></article>
                <article><strong>{insights.independent_rate}%</strong><span>likely independent</span></article>
                <article><strong>{insights.digital_gap_count}</strong><span>digital gaps</span></article>
                <article><strong>{insights.high_opportunity_count}</strong><span>B-grade or better</span></article>
                {insights.top_industry ? (
                  <article className="is-wide">
                    <strong>{insights.top_industry.name}</strong>
                    <span>largest category · {insights.top_industry.share}% of market · avg score {insights.top_industry.avg_score}</span>
                  </article>
                ) : null}
              </div>
            ) : null}

            <div className="leadgen-product-toolbar">
              <label>
                <span>Search results</span>
                <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Company, city, industry, signal…" />
              </label>
              <button type="button" className="btn btn-secondary btn-sm" onClick={selectBest}>Select strong matches</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={enrichSelected} disabled={extracting}>
                <Sparkles size={14} /> {extracting ? "Checking sites…" : "Add website signals"}
              </button>
            </div>
            {extractMsg ? <p className={extractMsg.ok ? "leadgen-product-message" : "form-error"}>{extractMsg.text}</p> : null}
            {pushMsg ? <p className={pushMsg.ok ? "leadgen-product-message" : "form-error"}>{pushMsg.text}</p> : null}

            <div className="leadgen-explorer-head">
              <div>
                <span className="eyebrow">Market explorer</span>
                <h3>{groupedRows.length} industries in ZIP {zip}</h3>
                <p>Open a category to compare the businesses inside it. Narrow by subcategory, then expand a record to see the evidence behind its score.</p>
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
                        <span><b>{group.avgScore}</b> avg score</span>
                        <span><b>{group.contactable}%</b> contactable</span>
                        <span><b>{group.digitalGaps}</b> digital gaps</span>
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
                          <article><strong>{group.avgScore}</strong><span>avg opportunity</span></article>
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
                            const intel = websiteInsightLabels(row.website_intel);
                            const email = bestEmail(row);
                            return (
                              <article className={`leadgen-prospect-card is-${row.status}${expanded ? " is-expanded" : ""}`} key={key}>
                                <div className="leadgen-prospect-card__top">
                                  <label className="leadgen-product-check" aria-label={`Select ${row.name}`}>
                                    <input type="checkbox" checked={row.status === "keep"} onChange={(event) => setReview((current) => ({ ...current, [row.__scanIndex]: event.target.checked ? "keep" : "reject" }))} />
                                  </label>
                                  <button type="button" className="leadgen-prospect-card__toggle" onClick={() => toggleProspect(key)} aria-expanded={expanded}>
                                    <div className="leadgen-prospect-card__name">
                                      <strong>{row.name}</strong>
                                      <span>{[row.sub_industry || row.industry_group, row.city, row.zip].filter(Boolean).join(" · ")}</span>
                                    </div>
                                    <span className={`leadgen-grade leadgen-grade-${String(row.opportunity_grade || "d").toLowerCase()}`}>
                                      {row.opportunity_grade || "D"} · {row.opportunity_score || 0}
                                    </span>
                                    <ChevronDown size={18} aria-hidden="true" />
                                  </button>
                                </div>

                                <div className="leadgen-prospect-card__signals">
                                  <span className={row.website ? "is-positive" : "is-gap"}>{row.website ? hostnameOf(row.website) : "No website"}</span>
                                  <span className={row.phone ? "is-positive" : "is-gap"}>{row.phone ? "Phone" : "Phone missing"}</span>
                                  <span className={email ? "is-positive" : "is-gap"}>{email ? "Email" : "Email not enriched"}</span>
                                  {row.website_intel ? <span className="is-intel">Website enriched</span> : null}
                                </div>

                                <div className="leadgen-prospect-card__drawer" aria-hidden={!expanded}>
                                  <div className="leadgen-prospect-card__drawer-inner">
                                    <div className="leadgen-prospect-detail-grid">
                                      <section>
                                        <strong>Why this prospect ranks</strong>
                                        <div className="leadgen-signal-chips">
                                          {(row.opportunity_reasons?.length ? row.opportunity_reasons : ["Basic public business record"]).map((reason) => <span key={reason}>{reason}</span>)}
                                        </div>
                                      </section>
                                      <section>
                                        <strong>Website intelligence</strong>
                                        {intel.length ? (
                                          <div className="leadgen-signal-chips is-intel">{intel.map((label) => <span key={label}>{label}</span>)}</div>
                                        ) : (
                                          <p>{row.website ? "Select this prospect and run Enrich intelligence for website signals." : "No website available to enrich."}</p>
                                        )}
                                      </section>
                                      <section>
                                        <strong>Contact & location</strong>
                                        <div className="leadgen-prospect-contact">
                                          {row.address ? <span>{row.address}{row.city ? `, ${row.city}` : ""}{row.state ? `, ${row.state}` : ""} {row.zip || ""}</span> : <span>Address not available</span>}
                                          {row.phone ? <a href={`tel:${String(row.phone).replace(/[^+\d]/g, "")}`}>{row.phone}</a> : <span>Phone not available</span>}
                                          {email ? <a href={`mailto:${email}`}><Mail size={13} /> {email}</a> : <span>Email not enriched</span>}
                                        </div>
                                      </section>
                                      <section>
                                        <strong>Evidence & actions</strong>
                                        <div className="leadgen-prospect-links">
                                          {row.website ? <a href={row.website} target="_blank" rel="noopener noreferrer">Open website ↗</a> : null}
                                          {row.source_url ? <a href={row.source_url} target="_blank" rel="noopener noreferrer">View source record ↗</a> : null}
                                        </div>
                                        <p>Signals shown here come from the public business record and any website enrichment you run.</p>
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
    description: "Research local businesses by ZIP code and industry, compare prospect signals, enrich available contact data, save markets, and export the businesses you choose.",
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
            <p>Pro adds saved markets, recurring monitoring, enrichment history, CRM sync, suppression, and attribution so you can work from a repeatable prospecting process instead of rebuilding lists.</p>
          </div>
          <a className="btn btn-primary" href={withLeadgenCheckoutParams(LEADGEN_STRIPE_LINKS.pro.monthly, { tierId: "pro", source: "leadgen_workspace" })}>
            Compare plans <ArrowRight size={16} />
          </a>
        </section>
      </div>
    </main>
  );
}
