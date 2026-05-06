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

import { useEffect, useMemo, useState } from "react";
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

// Two-line stat tile.
function Stat({ label, value, hint }) {
  return (
    <div className="leadgen-stat" style={{
      background: "var(--surface-1, #fff)",
      border: "1px solid var(--border, #e5e7eb)",
      borderRadius: 8,
      padding: 14,
      minWidth: 140,
    }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", color: "#6b7280", letterSpacing: ".06em" }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 2 }}>{value ?? "—"}</div>
      {hint ? <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{hint}</div> : null}
    </div>
  );
}

// ---------- main ----------

export default function LeadgenDashboard() {
  const [tab, setTab] = useState("discover");
  const [status, setStatus] = useState(null);
  const [statusErr, setStatusErr] = useState(null);

  // Initial status fetch + 30s refresh while the page is open. Doubles as
  // the admin gate: a 401/403 here renders the access-denied message.
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
      <div style={{ maxWidth: 720, margin: "60px auto", padding: 24 }}>
        <h1>Lead generation</h1>
        <p>This area is restricted to administrators.</p>
        <p><Link to="/portal">Back to portal</Link></p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: "30px auto", padding: "0 18px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0 }}>Lead generation</h1>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 14 }}>
            Discover local businesses → enrich with emails → run compliant outreach.
          </p>
        </div>
        <Link to="/portal" style={{ fontSize: 14 }}>← Portal</Link>
      </header>

      {/* Top-line stats */}
      <section style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
        <Stat
          label="Businesses"
          value={status?.businesses?.total}
          hint={`${status?.businesses?.with_website ?? 0} with website`}
        />
        <Stat
          label="Deliverable emails"
          value={status?.emails?.deliverable}
          hint={`across ${status?.emails?.businesses_with_email ?? 0} businesses`}
        />
        <Stat
          label="Campaigns"
          value={status?.campaigns?.total}
          hint={`${status?.campaigns?.running ?? 0} running`}
        />
        <Stat label="Sent"     value={status?.sends?.sent} />
        <Stat label="Opened"   value={status?.sends?.opened} />
        <Stat label="Clicked"  value={status?.sends?.clicked} />
        <Stat label="Replied"  value={status?.sends?.replied} />
      </section>

      {/* Tabs */}
      <nav style={{ borderBottom: "1px solid var(--border, #e5e7eb)", display: "flex", gap: 4, marginBottom: 18 }}>
        {[
          ["discover", "Discover"],
          ["campaigns", "Campaigns"],
          ["jobs", "Jobs"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: tab === id ? "2px solid #0F6CBD" : "2px solid transparent",
              padding: "10px 14px",
              cursor: "pointer",
              color: tab === id ? "#0F6CBD" : "inherit",
              fontWeight: tab === id ? 600 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "discover" && <DiscoverTab onJobQueued={() => { /* status auto-refreshes */ }} />}
      {tab === "campaigns" && <CampaignsTab />}
      {tab === "jobs" && <JobsTab recent={status?.recent_jobs || []} />}

      {statusErr && !/401|403/.test(statusErr) ? (
        <p style={{ color: "#b91c1c", fontSize: 13, marginTop: 18 }}>Status: {statusErr}</p>
      ) : null}
    </div>
  );
}

// ============================================================
// Discover tab
// ============================================================

function DiscoverTab({ onJobQueued }) {
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

  // Re-load whenever the filter changes (page is reset by setPage(1)).
  useEffect(() => { loadList(page); /* eslint-disable-next-line */ }, [filter, page]);

  const queueDiscover = async () => {
    if (!/^\d{5}$/.test(zip)) {
      setErr("Enter a 5-digit US zip code.");
      return;
    }
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await postJson("/api/portal?action=leadgen-discover", { zip });
      setMsg(r.deduped ? `Already queued as job #${r.job_id}.` : `Queued OSM crawl for ${zip} (job #${r.job_id}).`);
      onJobQueued?.();
      // Auto-fill the filter so the operator sees results when they land.
      setFilter((f) => ({ ...f, zip }));
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
      setMsg(`Queued ${r.queued} email-crawl jobs for ${filter.zip}.`);
      onJobQueued?.();
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
    <div>
      <section style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", fontSize: 12 }}>
          <span style={{ color: "#6b7280" }}>Zip code</span>
          <input
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            inputMode="numeric"
            pattern="\d{5}"
            placeholder="34236"
            style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, width: 120 }}
          />
        </label>
        <button
          onClick={queueDiscover}
          disabled={busy}
          style={{ padding: "10px 14px", borderRadius: 6, border: "1px solid #0F6CBD", background: "#0F6CBD", color: "#fff", cursor: "pointer" }}
        >
          {busy ? "Queuing…" : "Discover businesses"}
        </button>
        <button
          onClick={queueEmailCrawls}
          disabled={busy || !/^\d{5}$/.test(filter.zip)}
          style={{ padding: "10px 14px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}
          title={!/^\d{5}$/.test(filter.zip) ? "Filter by a zip first" : ""}
        >
          Crawl emails for filtered zip (up to 100)
        </button>
      </section>

      {msg ? <p style={{ color: "#047857", fontSize: 13 }}>{msg}</p> : null}
      {err ? <p style={{ color: "#b91c1c", fontSize: 13 }}>{err}</p> : null}

      <section style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          placeholder="filter zip"
          value={filter.zip}
          onChange={(e) => { setFilter((f) => ({ ...f, zip: e.target.value })); setPage(1); }}
          style={{ padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 6, width: 100 }}
        />
        <select
          value={filter.status}
          onChange={(e) => { setFilter((f) => ({ ...f, status: e.target.value })); setPage(1); }}
          style={{ padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 6 }}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="rejected">Rejected</option>
          <option value="do_not_contact">Do not contact</option>
        </select>
        <input
          placeholder="search name/website"
          value={filter.q}
          onChange={(e) => { setFilter((f) => ({ ...f, q: e.target.value })); setPage(1); }}
          style={{ padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 6, flex: 1, minWidth: 180 }}
        />
        <span style={{ color: "#6b7280", fontSize: 13, alignSelf: "center" }}>{total} matches</span>
      </section>

      <div style={{ overflowX: "auto", border: "1px solid var(--border, #e5e7eb)", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead style={{ background: "#f9fafb" }}>
            <tr>
              <th style={{ textAlign: "left", padding: "8px 10px" }}>Name</th>
              <th style={{ textAlign: "left", padding: "8px 10px" }}>Industry</th>
              <th style={{ textAlign: "left", padding: "8px 10px" }}>Zip</th>
              <th style={{ textAlign: "left", padding: "8px 10px" }}>Website</th>
              <th style={{ textAlign: "right", padding: "8px 10px" }}>Emails</th>
              <th style={{ textAlign: "left", padding: "8px 10px" }}>Status</th>
              <th style={{ padding: "8px 10px" }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid var(--border, #e5e7eb)" }}>
                <td style={{ padding: "8px 10px" }}>{r.name}</td>
                <td style={{ padding: "8px 10px", color: "#6b7280", fontSize: 12 }}>{r.industry || "—"}</td>
                <td style={{ padding: "8px 10px" }}>{r.zip || "—"}</td>
                <td style={{ padding: "8px 10px" }}>
                  {r.website ? (
                    <a href={r.website} target="_blank" rel="noreferrer">{new URL(r.website).host}</a>
                  ) : "—"}
                </td>
                <td style={{ padding: "8px 10px", textAlign: "right" }}>{r.deliverable_emails}</td>
                <td style={{ padding: "8px 10px", fontSize: 12 }}>{r.status}</td>
                <td style={{ padding: "8px 10px", textAlign: "right" }}>
                  <select
                    value={r.status}
                    onChange={(e) => setRowStatus(r.id, e.target.value)}
                    style={{ padding: "4px 6px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 12 }}
                  >
                    <option value="active">active</option>
                    <option value="rejected">rejected</option>
                    <option value="do_not_contact">do_not_contact</option>
                  </select>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 30, textAlign: "center", color: "#6b7280" }}>No results yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Pager */}
      {total > limit ? (
        <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "flex-end", fontSize: 13 }}>
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Prev</button>
          <span>Page {page} of {Math.ceil(total / limit)}</span>
          <button disabled={page * limit >= total} onClick={() => setPage((p) => p + 1)}>Next →</button>
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
  const [editing, setEditing] = useState(null); // { id?, name, ... }
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

  return (
    <div>
      {!editing ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Campaigns</h2>
            <button
              onClick={newCampaign}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #0F6CBD", background: "#0F6CBD", color: "#fff", cursor: "pointer" }}
            >
              + New campaign
            </button>
          </div>
          {msg ? <p style={{ color: "#047857", fontSize: 13 }}>{msg}</p> : null}
          {err ? <p style={{ color: "#b91c1c", fontSize: 13 }}>{err}</p> : null}

          <div style={{ overflowX: "auto", border: "1px solid var(--border, #e5e7eb)", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead style={{ background: "#f9fafb" }}>
                <tr>
                  <th style={{ textAlign: "left", padding: "8px 10px" }}>Name</th>
                  <th style={{ textAlign: "left", padding: "8px 10px" }}>Status</th>
                  <th style={{ textAlign: "right", padding: "8px 10px" }}>Total</th>
                  <th style={{ textAlign: "right", padding: "8px 10px" }}>Sent</th>
                  <th style={{ textAlign: "right", padding: "8px 10px" }}>Opens</th>
                  <th style={{ textAlign: "right", padding: "8px 10px" }}>Replies</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id} style={{ borderTop: "1px solid var(--border, #e5e7eb)" }}>
                    <td style={{ padding: "8px 10px" }}>{c.name}</td>
                    <td style={{ padding: "8px 10px", fontSize: 12 }}>{c.status}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>{c.total_sends}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>{c.sent}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>{c.opened}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>{c.replied}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <button onClick={() => setEditing(c)} style={{ marginRight: 4 }}>Edit</button>
                      {["draft", "paused", "scheduled"].includes(c.status) ? (
                        <button onClick={() => start(c.id)}>Start</button>
                      ) : c.status === "running" ? (
                        <button onClick={() => setStatus(c.id, "paused")}>Pause</button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {list.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 30, textAlign: "center", color: "#6b7280" }}>No campaigns yet.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <CampaignEditor
          campaign={editing}
          onChange={setEditing}
          onSave={save}
          onCancel={() => setEditing(null)}
          err={err}
        />
      )}
    </div>
  );
}

function CampaignEditor({ campaign, onChange, onSave, onCancel, err }) {
  const c = campaign;
  const set = (patch) => onChange({ ...c, ...patch });
  const setSegment = (patch) => onChange({ ...c, segment: { ...(c.segment || {}), ...patch } });

  const seg = c.segment || {};

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>{c.id ? `Edit campaign #${c.id}` : "New campaign"}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, maxWidth: 900 }}>
        <Field label="Name">
          <input value={c.name || ""} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="From email">
          <input value={c.from_email || ""} onChange={(e) => set({ from_email: e.target.value })} placeholder="outreach@simpleitsrq.com" />
        </Field>
        <Field label="Reply-to (optional)">
          <input value={c.reply_to || ""} onChange={(e) => set({ reply_to: e.target.value })} />
        </Field>
        <Field label="Consent basis">
          <select value={c.consent_basis || "legitimate_interest"} onChange={(e) => set({ consent_basis: e.target.value })}>
            <option value="legitimate_interest">legitimate_interest</option>
            <option value="public_record">public_record</option>
            <option value="opted_in">opted_in</option>
          </select>
        </Field>
        <Field label="Throttle / hour">
          <input type="number" min={1} max={500} value={c.throttle_per_hour ?? 30} onChange={(e) => set({ throttle_per_hour: e.target.value })} />
        </Field>
        <Field label="Daily cap">
          <input type="number" min={1} max={5000} value={c.daily_cap ?? 200} onChange={(e) => set({ daily_cap: e.target.value })} />
        </Field>
        <Field label="Segment: zip">
          <input value={seg.zip || ""} onChange={(e) => setSegment({ zip: e.target.value })} placeholder="34236" />
        </Field>
        <Field label="Segment: min email confidence">
          <input type="number" step="0.1" min={0} max={1} value={seg.min_confidence ?? 0.7} onChange={(e) => setSegment({ min_confidence: Number(e.target.value) })} />
        </Field>
      </div>

      <Field label="Subject template" style={{ marginTop: 12 }}>
        <input value={c.subject_template || ""} onChange={(e) => set({ subject_template: e.target.value })} placeholder="Quick question about IT at {{business_name}}" />
      </Field>
      <Field label="Body template (plain text supported; placeholders: {{business_name}} {{first_name}} {{city}} {{custom_intro}})" style={{ marginTop: 12 }}>
        <textarea
          rows={14}
          value={c.body_template || ""}
          onChange={(e) => set({ body_template: e.target.value })}
          style={{ width: "100%", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13 }}
        />
      </Field>

      {err ? <p style={{ color: "#b91c1c", fontSize: 13 }}>{err}</p> : null}

      <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
        <button onClick={onSave} style={{ padding: "10px 14px", borderRadius: 6, border: "1px solid #0F6CBD", background: "#0F6CBD", color: "#fff", cursor: "pointer" }}>
          Save
        </button>
        <button onClick={onCancel} style={{ padding: "10px 14px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Field({ label, children, style }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", fontSize: 12, ...style }}>
      <span style={{ color: "#6b7280", marginBottom: 4 }}>{label}</span>
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
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Recent jobs</h2>
        <button onClick={reload}>Refresh</button>
      </div>
      {err ? <p style={{ color: "#b91c1c", fontSize: 13 }}>{err}</p> : null}
      <div style={{ overflowX: "auto", border: "1px solid var(--border, #e5e7eb)", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead style={{ background: "#f9fafb" }}>
            <tr>
              <th style={{ textAlign: "left", padding: "8px 10px" }}>#</th>
              <th style={{ textAlign: "left", padding: "8px 10px" }}>Kind</th>
              <th style={{ textAlign: "left", padding: "8px 10px" }}>Status</th>
              <th style={{ textAlign: "right", padding: "8px 10px" }}>Progress</th>
              <th style={{ textAlign: "left", padding: "8px 10px" }}>Created</th>
              <th style={{ textAlign: "left", padding: "8px 10px" }}>Finished</th>
              <th style={{ textAlign: "left", padding: "8px 10px" }}>Error</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((j) => (
              <tr key={j.id} style={{ borderTop: "1px solid var(--border, #e5e7eb)" }}>
                <td style={{ padding: "6px 10px" }}>{j.id}</td>
                <td style={{ padding: "6px 10px" }}>{j.kind}</td>
                <td style={{ padding: "6px 10px" }}>{j.status}</td>
                <td style={{ padding: "6px 10px", textAlign: "right" }}>
                  {j.progress ?? 0}{j.total ? ` / ${j.total}` : ""}
                </td>
                <td style={{ padding: "6px 10px" }}>{fmtTime(j.created_at)}</td>
                <td style={{ padding: "6px 10px" }}>{fmtTime(j.finished_at)}</td>
                <td style={{ padding: "6px 10px", color: "#b91c1c", fontSize: 12 }}>{j.error || ""}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 30, textAlign: "center", color: "#6b7280" }}>No jobs yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
