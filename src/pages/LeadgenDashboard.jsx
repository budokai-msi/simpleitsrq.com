// Lead-generation command center. Mounted at /portal/leadgen and gated
// behind admin role (the API enforces; the UI just hides itself if the
// status call returns 401/403).
//
// Three tabs:
//   - Discover  - enter zip -> queue OSM crawl, list discovered businesses,
//                 batch-queue email crawls per zip
//   - Campaigns - list / create / start / monitor outreach campaigns
//   - Jobs      - recent crawl_jobs queue (diagnostics)
//
// All mutations go through csrfFetch (double-submit cookie) and POST to
// /api/portal?action=leadgen-...
//
// Styling reuses the .admin-aff-* token-driven dashboard primitives from
// App.css so the leadgen command center stays visually aligned.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { csrfFetch } from "../lib/csrf";

// ---------- helpers ----------

async function getJson(url) {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function postJson(url, body) {
  const r = await csrfFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) {
    throw new Error(j.error || `HTTP ${r.status}`);
  }
  return j;
}

function fmtTime(iso) {
  if (!iso) return "-";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function Stat({ label, value, hint, accent }) {
  return (
    <div className={`leadgen-kpi${accent ? ` leadgen-kpi--${accent}` : ""}`}>
      <span className="leadgen-kpi__label">{label}</span>
      <span className="leadgen-kpi__value">{value ?? "-"}</span>
      {hint ? <span className="leadgen-kpi__hint">{hint}</span> : null}
    </div>
  );
}

const WORKFLOW_STEPS = [
  ["Audience", "Pick city, niche, and public-source records."],
  ["Offer", "Choose one clean promise and one landing page."],
  ["Channels", "Launch email, Google search, Meta, and socials in one plan."],
  ["Follow-up", "Track replies, calls, booked jobs, and next actions."],
];

const ACTIVE_PLAYS = [
  { name: "Sarasota computer repair", channel: "Google + email", stage: "Ready to launch", metric: "28 verified shops" },
  { name: "Bradenton IT support", channel: "Search ads", stage: "Needs budget", metric: "$32 suggested daily" },
  { name: "Venice network setup", channel: "Email + GBP post", stage: "Drafted", metric: "14 warm prospects" },
];

const SAMPLE_INBOX = [
  { name: "Coastal Dental Group", city: "Sarasota", need: "WiFi drops in operatories", value: "$1.8k setup", stage: "New reply" },
  { name: "Manatee Builders", city: "Bradenton", need: "Jobsite camera quote", value: "$2.4k install", stage: "Qualified" },
  { name: "Venice CPA Office", city: "Venice", need: "UPS + backup review", value: "$650 visit", stage: "Book call" },
];

// ---------- main ----------

export default function LeadgenDashboard() {
  const [tab, setTab] = useState("command");
  const [status, setStatus] = useState(null);
  const [statusErr, setStatusErr] = useState(null);

  // Refresh the top-of-page counts. Extracted so post-action handlers
  // (queueDiscover, queueEmailCrawls) can pull fresh numbers immediately
  // without waiting for the 30s background tick.
  const loadStatus = async () => {
    try {
      const r = await getJson("/api/portal?action=leadgen-status");
      setStatus(r);
      setStatusErr(null);
    } catch (e) {
      setStatusErr(String(e.message || e));
    }
  };

  // Initial status fetch + 30s refresh while the page is open. Doubles
  // as the admin gate: a 401/403 here renders the access-denied screen.
  useEffect(() => {
    let alive = true;
    let timer;
    const tick = async () => {
      try {
        const r = await getJson("/api/portal?action=leadgen-status");
        if (!alive) return;
        setStatus(r);
        setStatusErr(null);
      } catch (e) {
        if (!alive) return;
        setStatusErr(String(e.message || e));
      } finally {
        if (alive) timer = setTimeout(tick, 30_000);
      }
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  if (statusErr && /401|403|unauthorized|admin/i.test(statusErr)) {
    return (
      <section className="section admin-affiliates">
        <div className="container">
          <h1 className="title-1">Lead generation</h1>
          <p className="admin-aff-sub">This area is restricted to administrators.</p>
          <p><Link to="/portal" className="admin-aff-back">Back to portal</Link></p>
        </div>
      </section>
    );
  }

  return (
    <section className="section admin-affiliates admin-leadgen">
      <div className="container">
        <header className="admin-aff-head leadgen-admin-hero">
          <Link to="/portal" className="admin-aff-back">Portal</Link>
          <div className="leadgen-admin-hero__row">
            <div>
              <span className="eyebrow">Powered by Simple IT SRQ</span>
              <h1 className="display-2">Leadgen Command Center</h1>
              <p className="leadgen-admin-hero__sub">
                Find local buyers, build an offer, launch email and ad drafts,
                track replies, and hand hot leads to the next follow-up.
              </p>
            </div>
            <div className="leadgen-admin-hero__actions">
              <span className="leadgen-powered-pill">Customer workspace</span>
              <Link to="/leadgen" className="btn btn-secondary btn-sm" target="_blank" rel="noopener">
                View product page
              </Link>
            </div>
          </div>
        </header>

        <div className="leadgen-kpi-grid">
          <Stat
            accent="blue"
            label="Businesses"
            value={status?.businesses?.total?.toLocaleString?.() ?? status?.businesses?.total}
            hint={`${(status?.businesses?.with_website ?? 0).toLocaleString?.() ?? 0} with website`}
          />
          <Stat
            accent="teal"
            label="Deliverable emails"
            value={status?.emails?.deliverable?.toLocaleString?.() ?? status?.emails?.deliverable}
            hint={`across ${(status?.emails?.businesses_with_email ?? 0).toLocaleString?.() ?? 0} biz`}
          />
          <Stat
            accent="violet"
            label="Campaigns"
            value={status?.campaigns?.total}
            hint={`${status?.campaigns?.running ?? 0} running`}
          />
          <Stat label="Sent"    value={status?.sends?.sent?.toLocaleString?.() ?? status?.sends?.sent} />
          <Stat label="Opened"  value={status?.sends?.opened?.toLocaleString?.() ?? status?.sends?.opened} />
          <Stat label="Clicked" value={status?.sends?.clicked?.toLocaleString?.() ?? status?.sends?.clicked} />
          <Stat accent="amber" label="Replied" value={status?.sends?.replied?.toLocaleString?.() ?? status?.sends?.replied} />
        </div>

        <nav className="admin-leadgen-tabs" aria-label="Lead-gen sections">
          {[
            ["command", "Command"],
            ["discover", "Discover"],
            ["campaigns", "Email"],
            ["ads", "Ads"],
            ["social", "Social"],
            ["inbox", "Inbox"],
            ["insights", "Reports"],
            ["jobs", "Jobs"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`admin-leadgen-tab${tab === id ? " is-active" : ""}`}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="admin-leadgen-tab-body">
          {tab === "command" && <CommandTab status={status} onSelectTab={setTab} />}
          {tab === "discover" && <DiscoverTab onStatusChange={loadStatus} />}
          {tab === "campaigns" && <CampaignsTab />}
          {tab === "ads" && <AdsTab />}
          {tab === "social" && <SocialTab />}
          {tab === "inbox" && <InboxTab />}
          {tab === "insights" && <InsightsTab />}
          {tab === "jobs" && <JobsTab recent={status?.recent_jobs || []} />}
        </div>

        {statusErr && !/401|403/.test(statusErr) ? (
          <p className="admin-leadgen-err">Status: {statusErr}</p>
        ) : null}
      </div>
    </section>
  );
}

// ============================================================
// Command tab
// ============================================================

function CommandTab({ status, onSelectTab }) {
  const businesses = status?.businesses?.total ?? 0;
  const emails = status?.emails?.deliverable ?? 0;
  const replies = status?.sends?.replied ?? 0;

  return (
    <div className="leadgen-command">
      <section className="leadgen-command-hero">
        <div>
          <span className="eyebrow">Local growth cockpit</span>
          <h2>One place to find buyers, run campaigns, and turn replies into booked work.</h2>
          <p>
            Built for Sarasota, Bradenton, Venice, Lakewood Ranch, and Nokomis
            operators who do not want five disconnected marketing tabs.
          </p>
          <div className="leadgen-command-actions">
            <button type="button" className="btn btn-primary" onClick={() => onSelectTab("discover")}>Find leads</button>
            <button type="button" className="btn btn-secondary" onClick={() => onSelectTab("ads")}>Plan ads</button>
            <button type="button" className="btn btn-secondary" onClick={() => onSelectTab("campaigns")}>Launch email</button>
          </div>
        </div>
        <div className="leadgen-command-scorecard" aria-label="Workspace snapshot">
          <div><strong>{Number(businesses).toLocaleString()}</strong><span>local records</span></div>
          <div><strong>{Number(emails).toLocaleString()}</strong><span>deliverable emails</span></div>
          <div><strong>{Number(replies).toLocaleString()}</strong><span>tracked replies</span></div>
        </div>
      </section>

      <div className="leadgen-workflow">
        {WORKFLOW_STEPS.map(([title, body], index) => (
          <article key={title} className="leadgen-workflow-step">
            <span>{index + 1}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>

      <div className="leadgen-command-grid">
        <section className="admin-aff-card leadgen-launch-board">
          <div className="admin-leadgen-section-head">
            <h2 className="title-2">Active plays</h2>
            <span className="leadgen-powered-pill">Powered by Simple IT SRQ</span>
          </div>
          {ACTIVE_PLAYS.map((play) => (
            <article key={play.name} className="leadgen-play-row">
              <div>
                <strong>{play.name}</strong>
                <span>{play.channel}</span>
              </div>
              <div>
                <strong>{play.stage}</strong>
                <span>{play.metric}</span>
              </div>
            </article>
          ))}
        </section>

        <section className="admin-aff-card leadgen-launch-board">
          <div className="admin-leadgen-section-head">
            <h2 className="title-2">Next best moves</h2>
          </div>
          <ol className="leadgen-task-list">
            <li>Pick one buyer intent page: computer repair, IT support, or network setup.</li>
            <li>Attach one verified lead segment from Discover.</li>
            <li>Generate the email, Google ad, Meta ad, and GBP post together.</li>
            <li>Route replies into Inbox and book the first qualified call.</li>
          </ol>
        </section>
      </div>
    </div>
  );
}

function AdsTab() {
  const [city, setCity] = useState("Sarasota");
  const [service, setService] = useState("computer repair");
  const [budget, setBudget] = useState(450);
  const [saved, setSaved] = useState(false);
  const dailyBudget = Math.max(5, Math.round(Number(budget || 0) / 30));

  const headline = `${city} ${service} help`;
  const description = `Local Simple IT SRQ team for ${service}, office visits, and practical follow-up. Call or book this week.`;

  return (
    <div className="leadgen-channel">
      <div className="admin-leadgen-section-head">
        <div>
          <h2 className="title-2">Ads launch desk</h2>
          <p className="admin-leadgen-muted">Draft Google and Meta campaigns from the same local offer before API publishing is connected.</p>
        </div>
        <span className="leadgen-powered-pill">Customer ad brief</span>
      </div>

      <div className="leadgen-builder-grid">
        <section className="admin-aff-card leadgen-builder-panel">
          <Field label="City">
            <select className="admin-leadgen-input" value={city} onChange={(e) => setCity(e.target.value)}>
              {["Sarasota", "Bradenton", "Venice", "Lakewood Ranch", "Nokomis"].map((name) => <option key={name}>{name}</option>)}
            </select>
          </Field>
          <Field label="Buyer intent">
            <select className="admin-leadgen-input" value={service} onChange={(e) => setService(e.target.value)}>
              {["computer repair", "IT support", "network setup", "WiFi repair", "camera install", "backup setup"].map((name) => <option key={name}>{name}</option>)}
            </select>
          </Field>
          <Field label="Monthly test budget">
            <input className="admin-leadgen-input" type="number" min="150" step="50" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </Field>
          <div className="leadgen-builder-actions">
            <button type="button" className="btn btn-primary" onClick={() => setSaved(true)}>Save ad brief</button>
            <button type="button" className="btn btn-secondary" onClick={() => window.print()}>Export brief</button>
          </div>
          {saved ? <p className="admin-leadgen-ok">Ad brief saved locally in this workspace view.</p> : null}
        </section>

        <section className="admin-aff-card leadgen-ad-preview">
          <span className="eyebrow">Google Search</span>
          <h3>{headline}</h3>
          <p>{description}</p>
          <dl>
            <div><dt>Daily budget</dt><dd>${dailyBudget}</dd></div>
            <div><dt>Landing page</dt><dd>/services or city money page</dd></div>
            <div><dt>Conversion</dt><dd>Call, text, booking, form</dd></div>
          </dl>
          <div className="leadgen-ad-copy">
            <strong>Meta angle</strong>
            <p>Before the next office tech emergency, get a local IT person who can show up, fix the mess, and document what changed.</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function SocialTab() {
  const [channel, setChannel] = useState("Google Business Profile");
  const [topic, setTopic] = useState("small office UPS check");
  const [draft, setDraft] = useState("We are checking small office battery backups in Sarasota and Bradenton this week. If your front desk PC, modem, or network closet dies when power blinks, book a quick UPS check before storm season gets rude.");

  return (
    <div className="leadgen-channel">
      <div className="admin-leadgen-section-head">
        <div>
          <h2 className="title-2">Social planner</h2>
          <p className="admin-leadgen-muted">Write simple local posts that support the same offer your ads and email are pushing.</p>
        </div>
        <span className="leadgen-powered-pill">Powered by Simple IT SRQ</span>
      </div>

      <div className="leadgen-builder-grid">
        <section className="admin-aff-card leadgen-builder-panel">
          <Field label="Channel">
            <select className="admin-leadgen-input" value={channel} onChange={(e) => setChannel(e.target.value)}>
              {["Google Business Profile", "Facebook", "LinkedIn", "Instagram"].map((name) => <option key={name}>{name}</option>)}
            </select>
          </Field>
          <Field label="Topic">
            <input className="admin-leadgen-input" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </Field>
          <Field label="Post draft" full>
            <textarea className="admin-leadgen-input admin-leadgen-textarea" rows={8} value={draft} onChange={(e) => setDraft(e.target.value)} />
          </Field>
          <div className="leadgen-builder-actions">
            <button type="button" className="btn btn-primary">Save draft</button>
            <button type="button" className="btn btn-secondary">Add to calendar</button>
          </div>
        </section>

        <section className="admin-aff-card leadgen-social-preview">
          <span className="eyebrow">{channel}</span>
          <h3>{topic}</h3>
          <p>{draft}</p>
          <div className="leadgen-calendar-strip">
            <span>Mon: GBP</span>
            <span>Wed: Facebook</span>
            <span>Fri: LinkedIn</span>
          </div>
        </section>
      </div>
    </div>
  );
}

function InboxTab() {
  return (
    <div className="leadgen-channel">
      <div className="admin-leadgen-section-head">
        <div>
          <h2 className="title-2">Unified inbox</h2>
          <p className="admin-leadgen-muted">Replies, calls, form fills, and ad leads should land in one qualification board.</p>
        </div>
        <button type="button" className="btn btn-primary btn-sm">New follow-up task</button>
      </div>

      <div className="leadgen-inbox-board">
        {["New reply", "Qualified", "Book call"].map((stage) => (
          <section key={stage} className="leadgen-inbox-column">
            <h3>{stage}</h3>
            {SAMPLE_INBOX.filter((lead) => lead.stage === stage).map((lead) => (
              <article key={lead.name} className="leadgen-inbox-card">
                <strong>{lead.name}</strong>
                <span>{lead.city}</span>
                <p>{lead.need}</p>
                <em>{lead.value}</em>
              </article>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Insights tab
// ============================================================

function InsightsTab() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await getJson("/api/portal?action=leadgen-insights");
      setData(r);
    } catch (e) { setErr(String(e.message || e)); }
    finally { setBusy(false); }
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  if (busy && !data) return <p className="admin-leadgen-ok">Loading insights...</p>;
  if (err) return <p className="admin-leadgen-err">{err}</p>;
  if (!data) return null;

  const { geography, industries, emailHealth, discoveryVelocity, campaignStats, topSegments } = data;

  return (
    <div className="admin-leadgen-insights">
      <div className="admin-leadgen-section-head">
        <h2 className="title-2">Insights</h2>
        <button type="button" className="btn btn-secondary btn-sm" onClick={load} disabled={busy}>
          {busy ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="leadgen-kpi-grid">
        <Stat label="Total businesses" value={data.totalBusinesses?.toLocaleString?.()} accent="blue" />
        <Stat label="With website" value={`${data.websiteRate ?? 0}%`} hint={`${data.withWebsite ?? 0} records`} accent="teal" />
        <Stat label="With email" value={`${data.emailRate ?? 0}%`} hint={`${data.withEmail ?? 0} records`} accent="violet" />
        <Stat label="Avg emails / biz" value={data.avgEmailsPerBiz?.toFixed?.(1)} accent="amber" />
      </div>

      <div className="admin-leadgen-insights-grid">
        {/* Geography */}
        <div className="admin-aff-card">
          <h3 className="title-3" style={{ margin: "0 0 12px" }}>Top zip codes</h3>
          {geography?.length ? (
            <table className="admin-aff-table">
              <thead><tr><th>Zip</th><th>City</th><th style={{ textAlign: "right" }}>Businesses</th><th style={{ textAlign: "right" }}>With email</th></tr></thead>
              <tbody>
                {geography.map((g) => (
                  <tr key={g.zip}>
                    <td><strong>{g.zip}</strong></td>
                    <td>{g.city || "-"}</td>
                    <td style={{ textAlign: "right" }}>{g.count}</td>
                    <td style={{ textAlign: "right" }}>{g.with_email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="admin-leadgen-empty">No data yet.</p>}
        </div>

        {/* Industries */}
        <div className="admin-aff-card">
          <h3 className="title-3" style={{ margin: "0 0 12px" }}>Industry breakdown</h3>
          {industries?.length ? (
            <table className="admin-aff-table">
              <thead><tr><th>Industry</th><th style={{ textAlign: "right" }}>Businesses</th><th style={{ textAlign: "right" }}>% of total</th></tr></thead>
              <tbody>
                {industries.map((ind) => (
                  <tr key={ind.industry_group}>
                    <td>{ind.industry_group}</td>
                    <td style={{ textAlign: "right" }}>{ind.count}</td>
                    <td style={{ textAlign: "right" }}>{ind.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="admin-leadgen-empty">No data yet.</p>}
        </div>

        {/* Email health */}
        <div className="admin-aff-card">
          <h3 className="title-3" style={{ margin: "0 0 12px" }}>Email health by industry</h3>
          {emailHealth?.length ? (
            <table className="admin-aff-table">
              <thead><tr><th>Industry</th><th style={{ textAlign: "right" }}>Emails</th><th style={{ textAlign: "right" }}>Deliverable</th><th style={{ textAlign: "right" }}>Rate</th></tr></thead>
              <tbody>
                {emailHealth.map((h) => (
                  <tr key={h.industry_group}>
                    <td>{h.industry_group}</td>
                    <td style={{ textAlign: "right" }}>{h.total_emails}</td>
                    <td style={{ textAlign: "right" }}>{h.deliverable}</td>
                    <td style={{ textAlign: "right" }}><strong>{h.rate}%</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="admin-leadgen-empty">No data yet.</p>}
        </div>

        {/* Discovery velocity */}
        <div className="admin-aff-card">
          <h3 className="title-3" style={{ margin: "0 0 12px" }}>Discovery velocity</h3>
          {discoveryVelocity?.length ? (
            <table className="admin-aff-table">
              <thead><tr><th>Period</th><th style={{ textAlign: "right" }}>Discovered</th><th style={{ textAlign: "right" }}>With email</th></tr></thead>
              <tbody>
                {discoveryVelocity.map((d) => (
                  <tr key={d.period}>
                    <td>{d.period}</td>
                    <td style={{ textAlign: "right" }}>{d.count}</td>
                    <td style={{ textAlign: "right" }}>{d.with_email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="admin-leadgen-empty">No data yet.</p>}
        </div>

        {/* Campaign stats */}
        <div className="admin-aff-card">
          <h3 className="title-3" style={{ margin: "0 0 12px" }}>Campaign performance</h3>
          {campaignStats?.length ? (
            <table className="admin-aff-table">
              <thead><tr><th>Campaign</th><th style={{ textAlign: "right" }}>Sent</th><th style={{ textAlign: "right" }}>Open</th><th style={{ textAlign: "right" }}>Reply</th></tr></thead>
              <tbody>
                {campaignStats.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td style={{ textAlign: "right" }}>{c.sent}</td>
                    <td style={{ textAlign: "right" }}>{c.open_rate}%</td>
                    <td style={{ textAlign: "right" }}>{c.reply_rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="admin-leadgen-empty">No campaigns yet.</p>}
        </div>

        {/* Top segments */}
        <div className="admin-aff-card">
          <h3 className="title-3" style={{ margin: "0 0 12px" }}>Top segments (zip + industry)</h3>
          {topSegments?.length ? (
            <table className="admin-aff-table">
              <thead><tr><th>Segment</th><th style={{ textAlign: "right" }}>Businesses</th><th style={{ textAlign: "right" }}>With email</th></tr></thead>
              <tbody>
                {topSegments.map((s) => (
                  <tr key={`${s.zip}-${s.industry_group}`}>
                    <td>{s.zip} - {s.industry_group}</td>
                    <td style={{ textAlign: "right" }}>{s.count}</td>
                    <td style={{ textAlign: "right" }}>{s.with_email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="admin-leadgen-empty">No data yet.</p>}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Discover tab
// ============================================================

function DiscoverTab({ onStatusChange }) {
  const [zip, setZip] = useState("");
  const [filter, setFilter] = useState({
    zip: "", status: "active", q: "",
    industry_group: "", sub_industry: "",
    has_website: false, has_email: false,
    tag: "", min_emails: "", max_emails: "",
    created_after: "", created_before: "",
  });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState({ groups: [], subs: [] });
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const limit = 50;

  // Build the query string used for both list-load and export so the
  // download always matches the current view exactly.
  const buildQuery = (extra = {}) => {
    const url = new URL("/api/portal", window.location.origin);
    url.searchParams.set("action", extra.action || "leadgen-businesses");
    if (filter.zip)            url.searchParams.set("zip", filter.zip);
    if (filter.status)         url.searchParams.set("status", filter.status);
    if (filter.q)              url.searchParams.set("q", filter.q);
    if (filter.industry_group) url.searchParams.set("industry_group", filter.industry_group);
    if (filter.sub_industry)   url.searchParams.set("sub_industry", filter.sub_industry);
    if (filter.has_website)    url.searchParams.set("has_website", "1");
    if (filter.has_email)      url.searchParams.set("has_email", "1");
    if (filter.tag)            url.searchParams.set("tag", filter.tag);
    if (filter.min_emails)     url.searchParams.set("min_emails", filter.min_emails);
    if (filter.max_emails)     url.searchParams.set("max_emails", filter.max_emails);
    if (filter.created_after)  url.searchParams.set("created_after", filter.created_after);
    if (filter.created_before) url.searchParams.set("created_before", filter.created_before);
    if (extra.format)          url.searchParams.set("format", extra.format);
    return url;
  };

  const loadList = async (overridePage) => {
    const p = overridePage ?? page;
    const url = buildQuery();
    url.searchParams.set("page", String(p));
    url.searchParams.set("limit", String(limit));
    try {
      const r = await getJson(url.pathname + url.search);
      setRows(r.rows || []);
      setTotal(r.total || 0);
      setFacets(r.facets || { groups: [], subs: [] });
    } catch (e) {
      setErr(String(e.message || e));
    }
  };

  // Re-load whenever the filter changes. Fetch-on-mount is a legitimate
  // effect use; the lint rule is overly strict here.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { loadList(page); }, [filter, page]);

  const queueDiscover = async () => {
    if (!/^\d{5}$/.test(zip)) {
      setErr("Enter a 5-digit US zip code.");
      return;
    }
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await postJson("/api/portal?action=leadgen-discover", { zip });
      if (r.deduped) {
        setMsg(`Already queued as job #${r.job_id}. Running pending jobs...`);
      } else {
        setMsg(`Queued OSM crawl for ${zip} (job #${r.job_id}). Running...`);
      }
      setFilter((f) => ({ ...f, zip }));
      // Drain the queue inline so the operator sees results immediately
      // instead of waiting until the next 11:15 UTC cron tick.
      const run = await postJson("/api/portal?action=leadgen-run-jobs", {});
      const s = run.summary || {};
      setMsg(`OSM crawl finished: ${s.completed || 0}/${s.picked || 0} jobs ok` +
             (s.failed ? `, ${s.failed} failed` : "") + ". Refreshing list.");
      await loadList();
      if (onStatusChange) await onStatusChange();
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const queueEmailCrawls = async () => {
    if (!/^\d{5}$/.test(filter.zip)) {
      setErr("Filter by a 5-digit zip first, then queue.");
      return;
    }
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await postJson("/api/portal?action=leadgen-crawl-emails", { zip: filter.zip, limit: 100 });
      setMsg(`Queued ${r.queued} email-crawl jobs for ${filter.zip}. Running...`);
      const run = await postJson("/api/portal?action=leadgen-run-jobs", {});
      const s = run.summary || {};
      setMsg(`Email crawl finished: ${s.completed || 0}/${s.picked || 0} jobs ok` +
             (s.failed ? `, ${s.failed} failed` : "") +
             (s.budget_exhausted ? ". Budget exhausted - click Crawl again to continue." : ".") +
             " Refreshing list.");
      await loadList();
      if (onStatusChange) await onStatusChange();
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const setRowStatus = async (id, newStatus) => {
    try {
      await postJson("/api/portal?action=leadgen-business-update", { id, status: newStatus });
      await loadList();
    } catch (e) {
      setErr(String(e.message || e));
    }
  };

  // Free-form tags: prompt() is intentionally low-fi here; full editor
  // would need a per-row inline form. Comma-separated input -> text[].
  const editRowTags = async (row) => {
    const next = prompt(`Tags for "${row.name}" (comma separated, lowercase):`, (row.tags || []).join(", "));
    if (next === null) return;
    try {
      await postJson("/api/portal?action=leadgen-business-update", { id: row.id, tags: next });
      await loadList();
    } catch (e) {
      setErr(String(e.message || e));
    }
  };

  const reclassify = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await postJson("/api/portal?action=leadgen-reclassify", {});
      setMsg(`Reclassified ${r.updated} businesses with the latest taxonomy.`);
      await loadList();
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const exportData = (format) => {
    const url = buildQuery({ action: "leadgen-export", format });
    window.location.href = url.pathname + url.search;
  };

  return (
    <div className="admin-leadgen-discover">
      <div className="admin-leadgen-toolbar">
        <label className="admin-leadgen-field">
          <span>Zip code</span>
          <input
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            inputMode="numeric"
            pattern="\d{5}"
            placeholder="34207"
            className="admin-leadgen-input admin-leadgen-input--zip"
          />
        </label>
        <button
          type="button"
          onClick={queueDiscover}
          disabled={busy}
          className="btn btn-primary"
        >
          {busy ? "Queuing..." : "Discover businesses"}
        </button>
        <button
          type="button"
          onClick={queueEmailCrawls}
          disabled={busy || !/^\d{5}$/.test(filter.zip)}
          className="btn btn-secondary"
          title={!/^\d{5}$/.test(filter.zip) ? "Filter by a zip first" : ""}
        >
          Crawl emails for filtered zip
        </button>
      </div>

      {msg ? <p className="admin-leadgen-ok">{msg}</p> : null}
      {err ? <p className="admin-leadgen-err">{err}</p> : null}

      <div className="admin-leadgen-filters">
        <input
          placeholder="filter zip"
          value={filter.zip}
          onChange={(e) => { setFilter((f) => ({ ...f, zip: e.target.value })); setPage(1); }}
          className="admin-leadgen-input admin-leadgen-input--zip"
        />
        <select
          value={filter.industry_group}
          onChange={(e) => { setFilter((f) => ({ ...f, industry_group: e.target.value, sub_industry: "" })); setPage(1); }}
          className="admin-leadgen-input"
        >
          <option value="">All industries</option>
          {(facets.groups || []).map((g) => (
            <option key={g.industry_group} value={g.industry_group}>{g.industry_group} ({g.n})</option>
          ))}
        </select>
        <select
          value={filter.sub_industry}
          onChange={(e) => { setFilter((f) => ({ ...f, sub_industry: e.target.value })); setPage(1); }}
          className="admin-leadgen-input"
          disabled={!filter.industry_group}
          title={!filter.industry_group ? "Pick an industry first" : ""}
        >
          <option value="">All sub-industries</option>
          {(facets.subs || []).map((s) => (
            <option key={s.sub_industry} value={s.sub_industry}>{s.sub_industry} ({s.n})</option>
          ))}
        </select>
        <select
          value={filter.status}
          onChange={(e) => { setFilter((f) => ({ ...f, status: e.target.value })); setPage(1); }}
          className="admin-leadgen-input"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="rejected">Rejected</option>
          <option value="do_not_contact">Do not contact</option>
        </select>
        <label className="admin-leadgen-check">
          <input type="checkbox" checked={filter.has_website}
            onChange={(e) => { setFilter((f) => ({ ...f, has_website: e.target.checked })); setPage(1); }} />
          Has website
        </label>
        <label className="admin-leadgen-check">
          <input type="checkbox" checked={filter.has_email}
            onChange={(e) => { setFilter((f) => ({ ...f, has_email: e.target.checked })); setPage(1); }} />
          Has email
        </label>
        <input
          placeholder="tag"
          value={filter.tag}
          onChange={(e) => { setFilter((f) => ({ ...f, tag: e.target.value })); setPage(1); }}
          className="admin-leadgen-input admin-leadgen-input--zip"
          title="Filter by tag"
        />
        <input
          placeholder="min emails"
          type="number"
          min={0}
          value={filter.min_emails}
          onChange={(e) => { setFilter((f) => ({ ...f, min_emails: e.target.value })); setPage(1); }}
          className="admin-leadgen-input admin-leadgen-input--zip"
          title="Minimum deliverable emails"
        />
        <input
          placeholder="max emails"
          type="number"
          min={0}
          value={filter.max_emails}
          onChange={(e) => { setFilter((f) => ({ ...f, max_emails: e.target.value })); setPage(1); }}
          className="admin-leadgen-input admin-leadgen-input--zip"
          title="Maximum deliverable emails"
        />
        <input
          type="date"
          value={filter.created_after}
          onChange={(e) => { setFilter((f) => ({ ...f, created_after: e.target.value })); setPage(1); }}
          className="admin-leadgen-input"
          title="Created after"
        />
        <input
          type="date"
          value={filter.created_before}
          onChange={(e) => { setFilter((f) => ({ ...f, created_before: e.target.value })); setPage(1); }}
          className="admin-leadgen-input"
          title="Created before"
        />
        <input
          placeholder="search name or website"
          value={filter.q}
          onChange={(e) => { setFilter((f) => ({ ...f, q: e.target.value })); setPage(1); }}
          className="admin-leadgen-input admin-leadgen-input--grow"
        />
        <span className="admin-leadgen-count">{total} matches</span>
        <div className="admin-leadgen-export-group">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => exportData("csv")} disabled={total === 0}>Export CSV</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => exportData("json")} disabled={total === 0}>Export JSON</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={reclassify} disabled={busy} title="Backfill industry_group + sub_industry from raw OSM tags">Reclassify</button>
        </div>
      </div>

      <div className="admin-aff-card">
        <table className="admin-aff-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Industry</th>
              <th>Zip</th>
              <th>Website</th>
              <th style={{ textAlign: "right" }}>Emails</th>
              <th>Tags</th>
              <th>Status</th>
              <th aria-label="actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td className="admin-leadgen-muted">
                  {r.industry_group ? <strong>{r.industry_group}</strong> : (r.industry || "-")}
                  {r.sub_industry ? <><br /><span style={{ fontSize: 11 }}>{r.sub_industry}</span></> : null}
                </td>
                <td>{r.zip || "-"}</td>
                <td>
                  {r.website ? (
                    <a href={r.website} target="_blank" rel="noreferrer">
                      {(() => { try { return new URL(r.website).host; } catch { return r.website; } })()}
                    </a>
                  ) : "-"}
                </td>
                <td style={{ textAlign: "right" }}>{r.deliverable_emails}</td>
                <td>
                  <button type="button" className="admin-leadgen-tag-btn" onClick={() => editRowTags(r)} title="Edit tags">
                    {(r.tags && r.tags.length) ? r.tags.map((t) => <span key={t} className="admin-leadgen-tag">{t}</span>) : <em style={{ fontSize: 11, opacity: 0.6 }}>+ tag</em>}
                  </button>
                </td>
                <td className="admin-leadgen-muted">{r.status}</td>
                <td style={{ textAlign: "right" }}>
                  <select
                    value={r.status}
                    onChange={(e) => setRowStatus(r.id, e.target.value)}
                    className="admin-leadgen-input admin-leadgen-input--sm"
                  >
                    <option value="active">active</option>
                    <option value="rejected">rejected</option>
                    <option value="do_not_contact">do_not_contact</option>
                  </select>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="admin-leadgen-empty">No results yet. Discover a zip to get started.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {total > limit ? (
        <div className="admin-leadgen-pager">
          <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
          <span>Page {page} of {Math.ceil(total / limit)}</span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page * limit >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      ) : null}
    </div>
  );
}

// ============================================================
// Campaigns tab
// ============================================================

const DEFAULT_TEMPLATE = `Hi {{first_name}},

I'm reaching out from Simple IT SRQ. We help small offices in {{city}}
fix the practical IT problems that interrupt work: slow WiFi, dead backups,
password chaos, office moves, and machines that keep breaking.

Would it be worth a 15-minute call next week to see what is slowing
{{business_name}} down?

[Your name]
Simple IT SRQ | https://simpleitsrq.com`;

function CampaignsTab() {
  const [list, setList] = useState([]);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  const reload = async () => {
    try {
      const r = await getJson("/api/portal?action=leadgen-campaigns");
      setList(r.rows || []);
    } catch (e) { setErr(String(e.message || e)); }
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reload(); }, []);

  const newCampaign = () => setEditing({
    name: "",
    subject_template: "",
    body_template: DEFAULT_TEMPLATE,
    from_email: "",
    reply_to: "",
    throttle_per_hour: 30,
    daily_cap: 200,
    consent_basis: "legitimate_interest",
    segment: { zip: "", min_confidence: 0.7 },
  });

  const save = async () => {
    setErr(null); setMsg(null);
    const payload = {
      ...editing,
      throttle_per_hour: Number(editing.throttle_per_hour) || 30,
      daily_cap: Number(editing.daily_cap) || 200,
      segment: editing.segment || {},
    };
    try {
      const r = await postJson("/api/portal?action=leadgen-campaign-save", payload);
      setMsg(`Saved campaign #${r.id}.`);
      setEditing(null);
      reload();
    } catch (e) { setErr(String(e.message || e)); }
  };

  const setStatus = async (id, status) => {
    try {
      await postJson("/api/portal?action=leadgen-campaign-status", { id, status });
      reload();
    } catch (e) { setErr(String(e.message || e)); }
  };

  const start = async (id) => {
    if (!confirm("Materialize sends and start this campaign? Cron will begin sending immediately within throttle.")) return;
    try {
      const r = await postJson("/api/portal?action=leadgen-campaign-start", { id });
      setMsg(`Queued ${r.queued} sends for campaign #${id}.`);
      reload();
    } catch (e) { setErr(String(e.message || e)); }
  };

  const sendTest = async (id) => {
    const to = prompt("Send a test of this template to which email?");
    if (!to) return;
    setMsg(""); setErr("");
    try {
      const r = await postJson("/api/portal?action=leadgen-campaign-test", { id, to });
      if (r.ok) setMsg(`Test sent to ${to} (message id ${r.messageId || "?"}). Check inbox + spam.`);
      else setErr(`Test failed: ${r.error}${r.permanent ? " (permanent)" : ""}`);
    } catch (e) { setErr(String(e.message || e)); }
  };

  if (editing) {
    return (
      <CampaignEditor
        campaign={editing}
        onChange={setEditing}
        onSave={save}
        onCancel={() => setEditing(null)}
        err={err}
      />
    );
  }

  return (
    <div className="admin-leadgen-campaigns">
      <div className="admin-leadgen-section-head">
        <h2 className="title-2">Campaigns</h2>
        <button type="button" onClick={newCampaign} className="btn btn-primary">+ New campaign</button>
      </div>
      {msg ? <p className="admin-leadgen-ok">{msg}</p> : null}
      {err ? <p className="admin-leadgen-err">{err}</p> : null}

      <div className="admin-aff-card">
        <table className="admin-aff-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th style={{ textAlign: "right" }}>Total</th>
              <th style={{ textAlign: "right" }}>Sent</th>
              <th style={{ textAlign: "right" }}>Opens</th>
              <th style={{ textAlign: "right" }}>Replies</th>
              <th aria-label="actions" />
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td className="admin-leadgen-muted">{c.status}</td>
                <td style={{ textAlign: "right" }}>{c.total_sends}</td>
                <td style={{ textAlign: "right" }}>{c.sent}</td>
                <td style={{ textAlign: "right" }}>{c.opened}</td>
                <td style={{ textAlign: "right" }}>{c.replied}</td>
                <td className="admin-leadgen-row-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(c)}>Edit</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => sendTest(c.id)}>Test send</button>
                  {["draft", "paused", "scheduled"].includes(c.status) ? (
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => start(c.id)}>Start</button>
                  ) : c.status === "running" ? (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStatus(c.id, "paused")}>Pause</button>
                  ) : null}
                </td>
              </tr>
            ))}
            {list.length === 0 ? (
              <tr><td colSpan={7} className="admin-leadgen-empty">No campaigns yet - click <strong>+ New campaign</strong>.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CampaignEditor({ campaign, onChange, onSave, onCancel, err }) {
  const c = campaign;
  const set = (patch) => onChange({ ...c, ...patch });
  const setSegment = (patch) => onChange({ ...c, segment: { ...(c.segment || {}), ...patch } });

  const seg = c.segment || {};

  // ── AI panel state ──────────────────────────────────────────
  // Calls /api/portal?action=leadgen-ai which proxies Groq's free
  // Llama 3.3 70B endpoint. Three modes: write fresh, rewrite draft,
  // generate per-business opener (handled in Discover tab - this one
  // only does campaign + rewrite).
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState(null);
  const [aiNote, setAiNote] = useState(null);

  const aiCall = async (mode) => {
    setAiBusy(true); setAiErr(null); setAiNote(null);
    try {
      const r = await postJson("/api/portal?action=leadgen-ai", {
        mode,
        prompt: aiPrompt,
        draft_subject: c.subject_template || "",
        draft_body: c.body_template || "",
      });
      const out = r.result || {};
      if (out.subject) set({ subject_template: out.subject, body_template: out.body || c.body_template });
      else if (out.body) set({ body_template: out.body });
      setAiNote(`Updated by AI (${mode}). Tokens: ${r.usage?.total_tokens || "?"}`);
    } catch (e) {
      const m = String(e.message || e);
      if (m.includes("groq_not_configured")) {
        setAiErr("GROQ_API_KEY isn't set in Vercel. Get a free key from console.groq.com and run: vercel env add GROQ_API_KEY production");
      } else {
        setAiErr(m);
      }
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="admin-leadgen-editor">
      <h2 className="title-2">{c.id ? `Edit campaign #${c.id}` : "New campaign"}</h2>

      {/* AI assistant - collapsible-feeling card above the form */}
      <div className="admin-leadgen-ai-panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <strong>AI assistant (free, via Groq)</strong>
          <span style={{ fontSize: 11, opacity: 0.7 }}>Llama 3.3 70B - keeps placeholders intact</span>
        </div>
        <textarea
          className="admin-leadgen-input admin-leadgen-textarea"
          rows={3}
          placeholder="Describe the campaign. e.g. 'Write a 120-word cold email to Sarasota auto-repair shops about our flat-rate IT helpdesk and security camera install. Friendly, mention storm-season backups.'"
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary btn-sm" disabled={aiBusy || aiPrompt.trim().length < 10} onClick={() => aiCall("campaign")}>
            {aiBusy ? "Writing..." : "Write subject + body from prompt"}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={aiBusy || !c.body_template} onClick={() => aiCall("rewrite")}>
            {aiBusy ? "Rewriting..." : "Rewrite my current draft"}
          </button>
        </div>
        {aiNote ? <p className="admin-leadgen-ok" style={{ marginTop: 8 }}>{aiNote}</p> : null}
        {aiErr ? <p className="admin-leadgen-err" style={{ marginTop: 8 }}>{aiErr}</p> : null}
      </div>

      <div className="admin-leadgen-grid">
        <Field label="Name">
          <input className="admin-leadgen-input" value={c.name || ""} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="From email">
          <input className="admin-leadgen-input" value={c.from_email || ""} onChange={(e) => set({ from_email: e.target.value })} placeholder="outreach@outreach.simpleitsrq.com" />
        </Field>
        <Field label="Reply-to (optional)">
          <input className="admin-leadgen-input" value={c.reply_to || ""} onChange={(e) => set({ reply_to: e.target.value })} />
        </Field>
        <Field label="Consent basis">
          <select className="admin-leadgen-input" value={c.consent_basis || "legitimate_interest"} onChange={(e) => set({ consent_basis: e.target.value })}>
            <option value="legitimate_interest">legitimate_interest</option>
            <option value="public_record">public_record</option>
            <option value="opted_in">opted_in</option>
          </select>
        </Field>
        <Field label="Throttle / hour">
          <input className="admin-leadgen-input" type="number" min={1} max={500} value={c.throttle_per_hour ?? 30} onChange={(e) => set({ throttle_per_hour: e.target.value })} />
        </Field>
        <Field label="Daily cap">
          <input className="admin-leadgen-input" type="number" min={1} max={5000} value={c.daily_cap ?? 200} onChange={(e) => set({ daily_cap: e.target.value })} />
        </Field>
        <Field label="Segment: zip">
          <input className="admin-leadgen-input" value={seg.zip || ""} onChange={(e) => setSegment({ zip: e.target.value })} placeholder="34207" />
        </Field>
        <Field label="Segment: min email confidence">
          <input className="admin-leadgen-input" type="number" step="0.1" min={0} max={1} value={seg.min_confidence ?? 0.7} onChange={(e) => setSegment({ min_confidence: Number(e.target.value) })} />
        </Field>
      </div>

      <Field label="Subject template" full>
        <input className="admin-leadgen-input" value={c.subject_template || ""} onChange={(e) => set({ subject_template: e.target.value })} placeholder="Quick question about IT at {{business_name}}" />
      </Field>
      <Field label="Body template - placeholders: {{business_name}} {{first_name}} {{city}} {{custom_intro}}" full>
        <textarea
          className="admin-leadgen-input admin-leadgen-textarea"
          rows={14}
          value={c.body_template || ""}
          onChange={(e) => set({ body_template: e.target.value })}
        />
      </Field>

      {err ? <p className="admin-leadgen-err">{err}</p> : null}

      <div className="admin-leadgen-actions">
        <button type="button" className="btn btn-primary" onClick={onSave}>Save</button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function Field({ label, children, full }) {
  return (
    <label className={`admin-leadgen-field${full ? " admin-leadgen-field--full" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

// ============================================================
// Jobs tab
// ============================================================

function JobsTab({ recent }) {
  const [rows, setRows] = useState(recent);
  const [err, setErr] = useState(null);

  const reload = async () => {
    try {
      const r = await getJson("/api/portal?action=leadgen-jobs");
      setRows(r.rows || []);
    } catch (e) { setErr(String(e.message || e)); }
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reload(); }, []);

  return (
    <div className="admin-leadgen-jobs">
      <div className="admin-leadgen-section-head">
        <h2 className="title-2">Recent jobs</h2>
        <button type="button" className="btn btn-secondary btn-sm" onClick={reload}>Refresh</button>
      </div>
      {err ? <p className="admin-leadgen-err">{err}</p> : null}
      <div className="admin-aff-card">
        <table className="admin-aff-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Kind</th>
              <th>Status</th>
              <th style={{ textAlign: "right" }}>Progress</th>
              <th>Created</th>
              <th>Finished</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((j) => (
              <tr key={j.id}>
                <td>{j.id}</td>
                <td>{j.kind}</td>
                <td>{j.status}</td>
                <td style={{ textAlign: "right" }}>{j.progress ?? 0}{j.total ? ` / ${j.total}` : ""}</td>
                <td className="admin-leadgen-muted">{fmtTime(j.created_at)}</td>
                <td className="admin-leadgen-muted">{fmtTime(j.finished_at)}</td>
                <td className="admin-leadgen-err-cell">{j.error || ""}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="admin-leadgen-empty">No jobs yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
