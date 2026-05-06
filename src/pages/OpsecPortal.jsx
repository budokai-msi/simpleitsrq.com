// Defensive personal ops dashboard. Admin-only. Mounted at /portal/opsec.
//
// Four sections, all polished with the .table-polish / .chip / .display-2
// utilities shipped in src/index.css:
//
//   1. Threat watch  — read-only summary of /api/cron/report's threat_feeds
//                      (Spamhaus DROP/EDROP, ET compromised IPs).
//   2. Domain watch  — list of domains the operator is monitoring; add/disable.
//   3. IOC notebook  — indicators of compromise (IPs, domains, hashes, etc.)
//                      with severity tags + active toggle.
//   4. Defender notes — free-form Markdown-ish notebook entries.
//
// All mutations go through csrfFetch (same-origin double-submit cookie).
// On 401/403 the page renders an access-denied screen.
//
// This is *defensive* tooling only — passive watchlists, IOC tracking, and
// notes. No outbound scanning beyond what /api/exposure already does on the
// public-facing exposure scanner page.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { csrfFetch } from "../lib/csrf";

async function getJson(url) {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error || `HTTP ${r.status}`);
  }
  return r.json();
}

async function postJson(url, body) {
  const r = await csrfFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

function fmtTime(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function severityChip(sev) {
  const cls = sev === "critical" ? "chip chip-error"
    : sev === "high"   ? "chip chip-amber"
    : sev === "low"    ? "chip"
    : "chip chip-violet"; // medium
  return <span className={cls}>{sev}</span>;
}

export default function OpsecPortal() {
  const [tab, setTab] = useState("threats");
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  const reload = async () => {
    try {
      const r = await getJson("/api/portal?action=opsec-data");
      setData(r);
      setErr(null);
    } catch (e) {
      setErr(String(e.message || e));
    }
  };

  useEffect(() => { reload(); }, []);

  if (err && /401|403|forbidden|admin/i.test(err)) {
    return (
      <section className="section">
        <div className="container">
          <h1 className="display-2">OpSec</h1>
          <p>This area is restricted to administrators.</p>
          <p><Link to="/portal" className="link-btn">← Back to portal</Link></p>
        </div>
      </section>
    );
  }

  return (
    <section className="section admin-affiliates">
      <div className="container">
        <header className="admin-aff-head">
          <Link to="/portal" className="admin-aff-back">← Portal</Link>
          <div className="sec-head" style={{ marginTop: "0.5rem" }}>
            <span className="eyebrow eyebrow-brand">Defensive Ops</span>
            <h1 className="display-2">OpSec dashboard</h1>
            <p>Threat watch, domain monitoring, IOC notebook, and defender notes — all in one place.</p>
          </div>
        </header>

        <nav className="admin-aff-tabs" role="tablist" aria-label="OpSec sections" style={{ margin: "1.25rem 0" }}>
          {[
            ["threats", "Threat watch"],
            ["domains", "Domains"],
            ["iocs",    "IOCs"],
            ["notes",   "Notes"],
          ].map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? "btn-tonal" : "btn-ghost"}
              onClick={() => setTab(key)}
              style={{ marginRight: "0.5rem" }}
            >
              {label}
            </button>
          ))}
        </nav>

        {!data && !err && <p>Loading…</p>}
        {err && !/401|403|forbidden|admin/i.test(err) && (
          <p className="chip chip-error">Error: {err}</p>
        )}

        {data && tab === "threats" && <ThreatsTab data={data.threats} />}
        {data && tab === "domains" && <DomainsTab domains={data.domains} onChange={reload} />}
        {data && tab === "iocs"    && <IocsTab    iocs={data.iocs}       onChange={reload} />}
        {data && tab === "notes"   && <NotesTab   notes={data.notes}     onChange={reload} />}
      </div>
    </section>
  );
}

// ───────────── threats tab ─────────────
function ThreatsTab({ data }) {
  const feeds = data?.feeds || [];
  const total = data?.total || 0;
  return (
    <div>
      <p>
        <strong>{total.toLocaleString()}</strong> total CIDRs cached across{" "}
        <strong>{feeds.length}</strong> feeds. Refreshed daily by{" "}
        <code>/api/cron/report</code>.
      </p>
      {feeds.length === 0 ? (
        <p>No threat feeds cached yet. Run the daily report cron to populate.</p>
      ) : (
        <table className="table-polish" style={{ marginTop: "1rem" }}>
          <thead>
            <tr><th>Feed</th><th>CIDRs</th><th>Last fetched</th></tr>
          </thead>
          <tbody>
            {feeds.map((f) => (
              <tr key={f.feed_name}>
                <td>{f.feed_name}</td>
                <td>{Number(f.n).toLocaleString()}</td>
                <td>{fmtTime(f.fetched_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ───────────── domains tab ─────────────
function DomainsTab({ domains, onChange }) {
  const [domain, setDomain] = useState("");
  const [label, setLabel]   = useState("");
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await postJson("/api/portal?action=opsec-domain-add", { domain, label });
      setDomain(""); setLabel("");
      await onChange();
    } catch (e2) { setErr(String(e2.message || e2)); }
    finally { setBusy(false); }
  };

  const toggle = async (id, isActive) => {
    try {
      await postJson("/api/portal?action=opsec-domain-toggle", { id, is_active: !isActive });
      await onChange();
    } catch (e) { setErr(String(e.message || e)); }
  };

  return (
    <div>
      <form onSubmit={submit} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <input
          type="text"
          placeholder="example.com"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          required
          style={{ flex: "1 1 220px" }}
        />
        <input
          type="text"
          placeholder="label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          style={{ flex: "1 1 220px" }}
        />
        <button type="submit" className="btn-tonal" disabled={busy}>
          {busy ? "Adding…" : "Add domain"}
        </button>
      </form>
      {err && <p className="chip chip-error">{err}</p>}
      {domains.length === 0 ? (
        <p>No domains being watched yet.</p>
      ) : (
        <table className="table-polish">
          <thead>
            <tr><th>Domain</th><th>Label</th><th>Status</th><th>Added</th><th></th></tr>
          </thead>
          <tbody>
            {domains.map((d) => (
              <tr key={d.id}>
                <td><code>{d.domain}</code></td>
                <td>{d.label || "—"}</td>
                <td>{d.is_active ? <span className="chip chip-success">active</span> : <span className="chip">paused</span>}</td>
                <td>{fmtTime(d.created_at)}</td>
                <td>
                  <button className="btn-ghost" onClick={() => toggle(d.id, d.is_active)}>
                    {d.is_active ? "Pause" : "Resume"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ───────────── iocs tab ─────────────
function IocsTab({ iocs, onChange }) {
  const [type, setType]     = useState("ip");
  const [value, setValue]   = useState("");
  const [severity, setSev]  = useState("medium");
  const [source, setSource] = useState("");
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await postJson("/api/portal?action=opsec-ioc-add", {
        ioc_type: type, value, severity, source,
      });
      setValue(""); setSource("");
      await onChange();
    } catch (e2) { setErr(String(e2.message || e2)); }
    finally { setBusy(false); }
  };

  const toggle = async (id, isActive) => {
    try {
      await postJson("/api/portal?action=opsec-ioc-toggle", { id, is_active: !isActive });
      await onChange();
    } catch (e) { setErr(String(e.message || e)); }
  };

  return (
    <div>
      <form onSubmit={submit} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {["ip","domain","url","email","hash","cidr","user_agent","other"].map((t) =>
            <option key={t} value={t}>{t}</option>
          )}
        </select>
        <input
          type="text"
          placeholder="indicator value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
          style={{ flex: "1 1 260px" }}
        />
        <select value={severity} onChange={(e) => setSev(e.target.value)}>
          {["low","medium","high","critical"].map((s) =>
            <option key={s} value={s}>{s}</option>
          )}
        </select>
        <input
          type="text"
          placeholder="source (optional)"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          style={{ flex: "1 1 200px" }}
        />
        <button type="submit" className="btn-tonal" disabled={busy}>
          {busy ? "Saving…" : "Add IOC"}
        </button>
      </form>
      {err && <p className="chip chip-error">{err}</p>}
      {iocs.length === 0 ? (
        <p>No IOCs tracked yet.</p>
      ) : (
        <table className="table-polish">
          <thead>
            <tr><th>Type</th><th>Value</th><th>Severity</th><th>Source</th><th>Last seen</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {iocs.map((i) => (
              <tr key={i.id}>
                <td><span className="chip">{i.ioc_type}</span></td>
                <td><code style={{ wordBreak: "break-all" }}>{i.value}</code></td>
                <td>{severityChip(i.severity)}</td>
                <td>{i.source || "—"}</td>
                <td>{fmtTime(i.last_seen_at)}</td>
                <td>{i.is_active ? <span className="chip chip-success">active</span> : <span className="chip">archived</span>}</td>
                <td>
                  <button className="btn-ghost" onClick={() => toggle(i.id, i.is_active)}>
                    {i.is_active ? "Archive" : "Reactivate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ───────────── notes tab ─────────────
function NotesTab({ notes, onChange }) {
  const [title, setTitle]   = useState("");
  const [body, setBody]     = useState("");
  const [tags, setTags]     = useState("");
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState(null);

  const reset = () => { setTitle(""); setBody(""); setTags(""); setEditingId(null); };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
      await postJson("/api/portal?action=opsec-note-save", {
        id: editingId, title, body, tags: tagList,
      });
      reset();
      await onChange();
    } catch (e2) { setErr(String(e2.message || e2)); }
    finally { setBusy(false); }
  };

  const edit = (n) => {
    setEditingId(n.id);
    setTitle(n.title || "");
    setBody(n.body || "");
    setTags((n.tags || []).join(", "));
  };

  const del = async (id) => {
    if (!window.confirm("Delete this note?")) return;
    try {
      await postJson("/api/portal?action=opsec-note-delete", { id });
      if (editingId === id) reset();
      await onChange();
    } catch (e) { setErr(String(e.message || e)); }
  };

  return (
    <div>
      <form onSubmit={submit} style={{ display: "grid", gap: "0.5rem", marginBottom: "1.5rem" }}>
        <input
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          placeholder="Body (Markdown-ish; plain text is fine)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={6}
          style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
        />
        <input
          type="text"
          placeholder="tags, comma, separated"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="submit" className="btn-tonal" disabled={busy}>
            {busy ? "Saving…" : (editingId ? "Update note" : "Save note")}
          </button>
          {editingId && (
            <button type="button" className="btn-ghost" onClick={reset}>Cancel</button>
          )}
        </div>
      </form>
      {err && <p className="chip chip-error">{err}</p>}
      {notes.length === 0 ? (
        <p>No notes yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.75rem" }}>
          {notes.map((n) => (
            <li key={n.id} className="card" style={{
              padding: "1rem",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              background: "var(--surface)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <strong>{n.title || "(untitled)"}</strong>
                <span style={{ color: "var(--muted, #666)", fontSize: "0.85em" }}>
                  {fmtTime(n.updated_at)}
                </span>
              </div>
              <pre style={{
                whiteSpace: "pre-wrap", wordBreak: "break-word",
                margin: 0, fontFamily: "inherit",
              }}>{n.body}</pre>
              {n.tags?.length > 0 && (
                <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                  {n.tags.map((t) => <span key={t} className="chip chip-violet">#{t}</span>)}
                </div>
              )}
              <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
                <button className="btn-ghost" onClick={() => edit(n)}>Edit</button>
                <button className="btn-ghost" onClick={() => del(n.id)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
