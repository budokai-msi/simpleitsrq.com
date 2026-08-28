import { useState } from "react";
import {
  Eye,
  RadioTower,
  Search,
  Shield,
  RefreshCw,
} from "lucide-react";
import { Metric, SignalPill, Table, fmtNumber, fmtTime } from "./shared";

function OpsecTab({ data, busy, runAction }) {
  const hunt = data?.huntBrief;
  const [domain, setDomain] = useState("");
  const [ioc, setIoc] = useState({ ioc_type: "domain", value: "", severity: "medium" });
  const [note, setNote] = useState({ title: "", body: "", tags: "" });
  const certChecks = data?.certChecks || [];

  return (
    <div className="ops-grid">
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head">
          <h2>Hunt brief</h2>
          <SignalPill state={hunt?.level === "critical" ? "bad" : hunt?.level === "elevated" ? "warn" : "good"}>
            {hunt?.level || "loading"}
          </SignalPill>
        </div>
        <p className="ops-panel__copy">{hunt?.headline || "Building defensive brief from recent security telemetry."}</p>
        <div className="ops-metric-grid">
          <Metric label="24h threats" value={fmtNumber(hunt?.metrics?.threats24h)} hint={`${fmtNumber(hunt?.metrics?.threatIps24h)} IPs`} />
          <Metric label="Campaigns" value={fmtNumber(hunt?.campaigns?.length)} hint="rotating fingerprints" />
          <Metric label="Exploit events" value={fmtNumber(hunt?.metrics?.exploitEvents24h)} />
          <Metric label="Honeypot creds" value={fmtNumber(hunt?.metrics?.honeypotCredentials24h)} />
          <Metric label="Threat feeds" value={fmtNumber(hunt?.metrics?.threatFeedEntries)} hint={`${fmtNumber(hunt?.metrics?.threatFeedSources)} sources`} />
          <Metric label="Active IOCs" value={fmtNumber(hunt?.metrics?.activeIocs)} />
        </div>
      </section>
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head">
          <h2>Watched-domain cert health</h2>
          <button
            className="btn btn-primary btn-sm"
            disabled={busy === "opsec-scan"}
            onClick={() => runAction("opsec-scan", {}, "Domain sweep complete.")}
          >
            <RefreshCw size={14} style={{ marginRight: 6 }} />
            {busy === "opsec-scan" ? "Scanning…" : "Scan now"}
          </button>
        </div>
        <Table
          columns={["Domain", "Cert expires", "Days left", "Issuer", "Status"]}
          rows={certChecks}
          empty="No cert checks yet. Add watched domains and run a scan."
          renderRow={(row) => (
            <tr key={`${row.domain}-${row.ts}`}>
              <td className="ops-mono">{row.domain}</td>
              <td>{row.not_after ? new Date(row.not_after).toLocaleDateString() : "—"}</td>
              <td>{row.days_left != null ? row.days_left : "—"}</td>
              <td>{row.issuer || "—"}</td>
              <td>
                <SignalPill state={row.ok ? "good" : "bad"}>
                  {row.ok ? "ok" : "alert"}
                </SignalPill>
              </td>
            </tr>
          )}
        />
      </section>
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Action queue</h2><Shield size={16} /></div>
        <Table
          columns={["Priority", "Action", "Reason"]}
          rows={hunt?.actionQueue || []}
          empty="No hunt actions yet."
          renderRow={(row) => (
            <tr key={`${row.priority}-${row.action}`}>
              <td><SignalPill state={row.priority === "P0" || row.priority === "P1" ? "bad" : row.priority === "P2" ? "warn" : "neutral"}>{row.priority}</SignalPill></td>
              <td><strong>{row.action}</strong></td>
              <td>{row.reason}</td>
            </tr>
          )}
        />
      </section>
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Top attackers</h2><RadioTower size={16} /></div>
        <Table
          columns={["IP", "Hits", "Country", "Classes", "Last seen"]}
          rows={hunt?.topAttackers || []}
          empty="No attacker telemetry in the selected window."
          renderRow={(row) => (
            <tr key={row.ip}>
              <td className="ops-mono">{row.ip}</td>
              <td>{fmtNumber(row.hits)}</td>
              <td>{row.country || "-"}</td>
              <td>{(row.classes || []).join(", ") || "-"}</td>
              <td>{fmtTime(row.lastSeen)}</td>
            </tr>
          )}
        />
      </section>
      <section className="admin-aff-card ops-panel">
        <div className="ops-panel__head"><h2>Add watch</h2><Eye size={16} /></div>
        <div className="ops-form-row">
          <input className="admin-leadgen-input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="domain.com" />
          <button className="btn btn-primary btn-sm" disabled={busy === "opsec-domain-add"} onClick={() => runAction("opsec-domain-add", { domain }, "Domain added to watch list.").then((ok) => { if (ok) setDomain(""); })}>Add</button>
        </div>
      </section>
      <section className="admin-aff-card ops-panel">
        <div className="ops-panel__head"><h2>Add IOC</h2><RadioTower size={16} /></div>
        <div className="ops-form-grid">
          <select className="admin-leadgen-input" value={ioc.ioc_type} onChange={(e) => setIoc({ ...ioc, ioc_type: e.target.value })}>
            {["ip", "domain", "url", "email", "hash", "cidr", "user_agent", "other"].map((type) => <option key={type}>{type}</option>)}
          </select>
          <select className="admin-leadgen-input" value={ioc.severity} onChange={(e) => setIoc({ ...ioc, severity: e.target.value })}>
            {["low", "medium", "high", "critical"].map((severity) => <option key={severity}>{severity}</option>)}
          </select>
          <input className="admin-leadgen-input ops-form-grid__full" value={ioc.value} onChange={(e) => setIoc({ ...ioc, value: e.target.value })} placeholder="indicator value" />
          <button className="btn btn-primary btn-sm ops-form-grid__full" disabled={busy === "opsec-ioc-add"} onClick={() => runAction("opsec-ioc-add", ioc, "IOC saved.").then((ok) => { if (ok) setIoc({ ...ioc, value: "" }); })}>Save IOC</button>
        </div>
      </section>
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Watched domains</h2></div>
        <Table
          columns={["Domain", "Label", "Active", "Last scanned"]}
          rows={data?.domains || []}
          empty="No watched domains yet."
          renderRow={(row) => (
            <tr key={row.id}>
              <td>{row.domain}</td>
              <td>{row.label || "-"}</td>
              <td><SignalPill state={row.is_active ? "good" : "neutral"}>{row.is_active ? "active" : "paused"}</SignalPill></td>
              <td>{fmtTime(row.last_scanned_at)}</td>
            </tr>
          )}
        />
      </section>
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Indicators</h2></div>
        <Table
          columns={["Type", "Value", "Severity", "Source", "Last seen"]}
          rows={data?.iocs || []}
          empty="No indicators saved."
          renderRow={(row) => (
            <tr key={row.id}>
              <td>{row.ioc_type}</td>
              <td className="ops-mono">{row.value}</td>
              <td><SignalPill state={row.severity === "critical" || row.severity === "high" ? "bad" : row.severity === "medium" ? "warn" : "neutral"}>{row.severity}</SignalPill></td>
              <td>{row.source || "-"}</td>
              <td>{fmtTime(row.last_seen_at)}</td>
            </tr>
          )}
        />
      </section>
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Notes</h2><Search size={16} /></div>
        <div className="ops-note-editor">
          <input className="admin-leadgen-input" value={note.title} onChange={(e) => setNote({ ...note, title: e.target.value })} placeholder="Title" />
          <input className="admin-leadgen-input" value={note.tags} onChange={(e) => setNote({ ...note, tags: e.target.value })} placeholder="tags, comma separated" />
          <textarea className="admin-leadgen-input admin-leadgen-textarea" rows={5} value={note.body} onChange={(e) => setNote({ ...note, body: e.target.value })} placeholder="Investigation note" />
          <button className="btn btn-primary btn-sm" disabled={busy === "opsec-note-save"} onClick={() => runAction("opsec-note-save", { ...note, tags: note.tags.split(",").map((t) => t.trim()).filter(Boolean) }, "Note saved.").then((ok) => { if (ok) setNote({ title: "", body: "", tags: "" }); })}>Save note</button>
        </div>
        <Table
          columns={["Title", "Tags", "Updated"]}
          rows={data?.notes || []}
          empty="No OpSec notes yet."
          renderRow={(row) => (
            <tr key={row.id}>
              <td>{row.title || "(untitled)"}<div className="ops-muted">{String(row.body || "").slice(0, 120)}</div></td>
              <td>{(row.tags || []).join(", ")}</td>
              <td>{fmtTime(row.updated_at)}</td>
            </tr>
          )}
        />
      </section>
    </div>
  );
}


