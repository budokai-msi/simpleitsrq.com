import { useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, CalendarClock, RefreshCw, ShieldBan, Sparkles, Target, Users } from "lucide-react";
import { csrfFetch } from "../../lib/csrf";

async function getJson(url) {
  const r = await fetch(url, { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.message || j.error || `HTTP ${r.status}`);
  return j;
}

export default function LeadgenWorkspace() {
  const [overview, setOverview] = useState(null);
  const [scores, setScores] = useState([]);
  const [changes, setChanges] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true); setError("");
    try {
      const [o, s, c] = await Promise.all([
        getJson("/api/leadgen-workspace?action=overview"),
        getJson("/api/leadgen-workspace?action=scores"),
        getJson("/api/leadgen-workspace?action=changes"),
      ]);
      setOverview(o); setScores(s.leads || []); setChanges(c.changes || []);
    } catch (e) { setError(e.message || "Workspace unavailable"); }
    finally { setBusy(false); }
  };

  useEffect(() => { load(); }, []);

  const pipelineValue = useMemo(() => (overview?.attribution || []).reduce((sum, row) => sum + Number(row.value_cents || 0), 0), [overview]);
  const healthy = (overview?.health || []).filter((h) => h.status === "healthy").length;
  const unhealthy = (overview?.health || []).filter((h) => h.status === "degraded" || h.status === "down").length;

  if (!overview && !error) return <section className="lgx"><p>Loading workspace…</p></section>;
  if (error) return <section className="lgx lgx-error"><strong>Workspace unavailable</strong><span>{error}</span></section>;

  return (
    <section className="lgx" aria-label="Leadgen intelligence workspace">
      <header className="lgx-head">
        <div><span className="eyebrow">Revenue intelligence</span><h2>{overview.workspace?.name || "Leadgen workspace"}</h2></div>
        <button className="btn btn-secondary btn-sm" type="button" onClick={load} disabled={busy}><RefreshCw size={15} /> {busy ? "Refreshing…" : "Refresh"}</button>
      </header>

      <div className="lgx-kpis">
        <article><Target size={17}/><strong>{scores.filter(x=>x.grade==="A").length}</strong><span>A-grade prospects</span></article>
        <article><CalendarClock size={17}/><strong>{overview.markets?.length || 0}</strong><span>saved markets</span></article>
        <article><ShieldBan size={17}/><strong>{overview.exclusions || 0}</strong><span>suppression rules</span></article>
        <article><BarChart3 size={17}/><strong>${(pipelineValue/100).toLocaleString()}</strong><span>attributed pipeline</span></article>
        <article><Activity size={17}/><strong>{healthy}/{healthy+unhealthy || 0}</strong><span>healthy integrations</span></article>
      </div>

      <div className="lgx-grid">
        <section className="lgx-panel">
          <div className="lgx-panel-head"><div><Sparkles size={16}/><strong>Highest-value prospects</strong></div><span>rule-scored with explainable reasons</span></div>
          <div className="lgx-table">
            {scores.slice(0,12).map((lead) => (
              <div className="lgx-row" key={lead.id}>
                <span className={`lgx-grade lgx-grade-${lead.grade.toLowerCase()}`}>{lead.grade}</span>
                <div><strong>{lead.name}</strong><small>{[lead.industry_group,lead.city,lead.zip].filter(Boolean).join(" · ")}</small></div>
                <div className="lgx-score"><strong>{lead.score}</strong><small>{(lead.reasons || []).slice(0,2).join(" · ")}</small></div>
              </div>
            ))}
          </div>
        </section>

        <section className="lgx-panel">
          <div className="lgx-panel-head"><div><CalendarClock size={16}/><strong>Saved markets & recurring discovery</strong></div><span>territory intelligence that compounds</span></div>
          {(overview.markets || []).length ? overview.markets.slice(0,8).map((m)=><div className="lgx-market" key={m.id}><div><strong>{m.name}</strong><small>{m.industry_group || "All industries"} · {m.zip}</small></div><span>{m.schedule || "manual"}</span></div>) : <p className="lgx-empty">Save a market to make discovery recurring instead of one-off.</p>}
          {changes.length ? <div className="lgx-changes"><strong>Recent changes</strong>{changes.slice(0,5).map(c=><span key={c.id}>{c.change_type} · {c.market_name}</span>)}</div> : null}
        </section>

        <section className="lgx-panel">
          <div className="lgx-panel-head"><div><Activity size={16}/><strong>Integration health</strong></div><span>sync failures become visible operations, not silent loss</span></div>
          {(overview.health || []).length ? overview.health.map((h)=><div className="lgx-health" key={h.integration_id}><span className={`lgx-health-dot is-${h.status}`}/><div><strong>{h.provider}</strong><small>{h.last_error || (h.last_success_at ? `Last success ${new Date(h.last_success_at).toLocaleString()}` : "Awaiting first health check")}</small></div><span>{h.latency_ms ? `${h.latency_ms}ms` : h.status}</span></div>) : <p className="lgx-empty">Connected integrations will report health here after sync/test activity.</p>}
        </section>

        <section className="lgx-panel">
          <div className="lgx-panel-head"><div><Users size={16}/><strong>Campaign & revenue history</strong></div><span>close the loop from discovery to dollars</span></div>
          {(overview.campaigns || []).slice(0,8).map(c=><div className="lgx-market" key={c.id}><div><strong>{c.name}</strong><small>{c.status} · {c.daily_cap}/day</small></div><span>{c.completed_at ? "complete" : c.started_at ? "live" : "draft"}</span></div>)}
        </section>
      </div>
    </section>
  );
}
