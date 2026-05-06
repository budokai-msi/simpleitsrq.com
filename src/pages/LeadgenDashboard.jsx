// Lead-generation admin dashboard. Mounted at /portal/leadgen and gated
// behind admin role (the API enforces; the UI just hides itself if the
// status call returns 401/403).
//
// Three tabs:
//   - Discover  — enter zip → queue OSM crawl, list discovered businesses,
//                 batch-queue email crawls per zip
//   - Campaigns — list / create / start / monitor outreach campaigns
//   - Jobs      — recent crawl_jobs queue (diagnostics)
//
// All mutations go through csrfFetch (double-submit cookie) and POST to
// /api/portal?action=leadgen-...
//
// Styling reuses the .admin-aff-* token-driven classes from App.css so
// the page sits inside the same visual system as /admin/affiliates.

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
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function Stat({ label, value, hint }) {
  return (
    <div className="admin-aff-stat">
      <span className="admin-aff-stat-label">{label}</span>
      <span className="admin-aff-stat-value">{value ?? "—"}</span>
      {hint ? <span className="admin-aff-stat-hint">{hint}</span> : null}
    </div>
  );
}

// ---------- main ----------

export default function LeadgenDashboard() {
  const [tab, setTab] = useState("discover");
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
          <p><Link to="/portal" className="admin-aff-back">← Back to portal</Link></p>
        </div>
      </section>
    );
  }

  return (
    <section className="section admin-affiliates admin-leadgen">
      <div className="container">
        <header className="admin-aff-head">
          <Link to="/portal" className="admin-aff-back">← Portal</Link>
          <h1 className="title-1">Lead generation</h1>
          <p className="admin-aff-sub">
            Discover local businesses → enrich with verified emails → run
            CAN-SPAM-compliant outreach with throttling and one-click
            unsubscribe.
          </p>
        </header>

        <div className="admin-aff-strip">
          <Stat
            label="Businesses"
            value={status?.businesses?.total}
            hint={`${status?.businesses?.with_website ?? 0} with website`}
          />
          <Stat
            label="Deliverable emails"
            value={status?.emails?.deliverable}
            hint={`across ${status?.emails?.businesses_with_email ?? 0} biz`}
          />
          <Stat
            label="Campaigns"
            value={status?.campaigns?.total}
            hint={`${status?.campaigns?.running ?? 0} running`}
          />
          <Stat label="Sent"    value={status?.sends?.sent} />
          <Stat label="Opened"  value={status?.sends?.opened} />
          <Stat label="Clicked" value={status?.sends?.clicked} />
          <Stat label="Replied" value={status?.sends?.replied} />
        </div>

        <nav className="admin-leadgen-tabs" aria-label="Lead-gen sections">
          {[
            ["discover", "Discover"],
            ["campaigns", "Campaigns"],
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
          {tab === "discover" && <DiscoverTab onStatusChange={loadStatus} />}
          {tab === "campaigns" && <CampaignsTab />}
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
// Discover tab
// ============================================================

function DiscoverTab({ onStatusChange }) {
  const [zip, setZip] = useState("");
  const [filter, setFilter] = useState({ zip: "", status: "active", q: "" });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const limit = 50;

  const loadList = async (overridePage) => {
    const p = overridePage ?? page;
    const url = new URL("/api/portal", window.location.origin);
    url.searchParams.set("action", "leadgen-businesses");
    if (filter.zip)    url.searchParams.set("zip", filter.zip);
    if (filter.status) url.searchParams.set("status", filter.status);
    if (filter.q)      url.searchParams.set("q", filter.q);
    url.searchParams.set("page", String(p));
    url.searchParams.set("limit", String(limit));
    try {
      const r = await getJson(url.pathname + url.search);
      setRows(r.rows || []);
      setTotal(r.total || 0);
    } catch (e) {
      setErr(String(e.message || e));
    }
  };

  // Re-load whenever the filter changes.
  useEffect(() => { loadList(page); /* eslint-disable-next-line */ }, [filter, page]);

  const queueDiscover = async () => {
    if (!/^\d{5}$/.test(zip)) {
      setErr("Enter a 5-digit US zip code.");
      return;
    }
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await postJson("/api/portal?action=leadgen-discover", { zip });
      if (r.deduped) {
        setMsg(`Already queued as job #${r.job_id}. Running pending jobs…`);
      } else {
        setMsg(`Queued OSM crawl for ${zip} (job #${r.job_id}). Running…`);
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
      setMsg(`Queued ${r.queued} email-crawl jobs for ${filter.zip}. Running…`);
      const run = await postJson("/api/portal?action=leadgen-run-jobs", {});
      const s = run.summary || {};
      setMsg(`Email crawl finished: ${s.completed || 0}/${s.picked || 0} jobs ok` +
             (s.failed ? `, ${s.failed} failed` : "") +
             (s.budget_exhausted ? ". Budget exhausted — click Crawl again to continue." : ".") +
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
          {busy ? "Queuing…" : "Discover businesses"}
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
          value={filter.status}
          onChange={(e) => { setFilter((f) => ({ ...f, status: e.target.value })); setPage(1); }}
          className="admin-leadgen-input"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="rejected">Rejected</option>
          <option value="do_not_contact">Do not contact</option>
        </select>
        <input
          placeholder="search name or website"
          value={filter.q}
          onChange={(e) => { setFilter((f) => ({ ...f, q: e.target.value })); setPage(1); }}
          className="admin-leadgen-input admin-leadgen-input--grow"
        />
        <span className="admin-leadgen-count">{total} matches</span>
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
              <th>Status</th>
              <th aria-label="actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td className="admin-leadgen-muted">{r.industry || "—"}</td>
                <td>{r.zip || "—"}</td>
                <td>
                  {r.website ? (
                    <a href={r.website} target="_blank" rel="noreferrer">
                      {(() => { try { return new URL(r.website).host; } catch { return r.website; } })()}
                    </a>
                  ) : "—"}
                </td>
                <td style={{ textAlign: "right" }}>{r.deliverable_emails}</td>
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
              <tr><td colSpan={7} className="admin-leadgen-empty">No results yet. Discover a zip to get started.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {total > limit ? (
        <div className="admin-leadgen-pager">
          <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Prev</button>
          <span>Page {page} of {Math.ceil(total / limit)}</span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page * limit >= total} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      ) : null}
    </div>
  );
}

// ============================================================
// Campaigns tab
// ============================================================

const DEFAULT_TEMPLATE = `Hi {{first_name}},

I'm reaching out from Simple IT SRQ — we run lean, no-fluff IT support
for small offices in {{city}}. Saw {{business_name}} and thought you
might be a fit for our flat-rate help-desk + monitoring offering.

Would a 15-min call next week make sense?

— [Your name]
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
              <tr><td colSpan={7} className="admin-leadgen-empty">No campaigns yet — click <strong>+ New campaign</strong>.</td></tr>
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

  return (
    <div className="admin-leadgen-editor">
      <h2 className="title-2">{c.id ? `Edit campaign #${c.id}` : "New campaign"}</h2>

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
      <Field label="Body template — placeholders: {{business_name}} {{first_name}} {{city}} {{custom_intro}}" full>
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
