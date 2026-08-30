import { useEffect, useState } from "react";
import { SignalPill, Table, fmtNumber, getJson } from "./shared";

// Affiliate configuration & link coverage. Shows the 9 affiliate programs and
// whether their VITE_* env var is set, plus how many posts link each program.
// affiliate-setup is a GET action, so "Re-check" re-fetches via getJson rather
// than runAction.
export default function AffiliateSetupTab({ data }) {
  const [setup, setSetup] = useState(data["affiliate-setup"] || null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);

  const load = async () => {
    setError(null);
    try {
      setSetup(await getJson("affiliate-setup"));
    } catch (e) {
      setError(String(e.message || e));
    }
  };

  useEffect(() => {
    if (!setup) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const programs = setup?.programs || [];
  const linkCoverage = setup?.linkCoverage || [];

  const copyEnv = async (envVar) => {
    try {
      await navigator.clipboard.writeText(envVar);
      setCopied(envVar);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setError("Clipboard unavailable.");
    }
  };

  return (
    <div className="ops-grid">
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>Affiliate programs</h2>
          <button className="btn btn-primary btn-sm" type="button" onClick={load}>Re-check</button>
        </div>
        {error ? <div className="ops-notice">{error}</div> : null}
        <Table
          columns={["Program", "Env var", "Status", ""]}
          rows={programs}
          empty="No affiliate programs."
          renderRow={(p) => (
            <tr key={p.code}>
              <td><strong>{p.name}</strong></td>
              <td className="ops-mono">{p.envVar}</td>
              <td><SignalPill state={p.configured ? "good" : "bad"}>{p.configured ? "configured" : "missing"}</SignalPill></td>
              <td>
                <button className="btn btn-secondary btn-sm" type="button" onClick={() => copyEnv(p.envVar)}>
                  {copied === p.envVar ? "Copied" : "Copy env var name"}
                </button>
              </td>
            </tr>
          )}
        />
      </section>

      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Link coverage</h2></div>
        <Table
          columns={["Program", "Posts linked"]}
          rows={linkCoverage}
          empty="No link coverage data."
          renderRow={(p) => (
            <tr key={p.code}>
              <td>{p.code}</td>
              <td>{fmtNumber(p.postsLinked)}</td>
            </tr>
          )}
        />
      </section>
    </div>
  );
}
