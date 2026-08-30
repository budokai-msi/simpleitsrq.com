import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { SignalPill, Table, fmtNumber, getJson, postJson } from "./shared";
import { ZeroState } from "./ZeroState";

// One-click campaign builder. Walks the operator through segment → message →
// throttle → launch, then shows existing campaigns. Uses postJson directly
// (not runAction) for the steps that need the returned campaign id or the AI
// draft text; the action names and request bodies match the backend handlers
// in api/_lib/portal/leadgen.js exactly.
export default function CampaignBuilderTab({ data, busy, runAction }) {
  const status = data["leadgen-status"] || {};
  const readySegments = status.ready_segments || [];
  const [campaigns, setCampaigns] = useState(data["leadgen-campaigns"]?.rows || []);
  const [campaignsError, setCampaignsError] = useState(null);
  const [deliverability, setDeliverability] = useState(null);
  const [deliverabilityError, setDeliverabilityError] = useState(null);

  const [step, setStep] = useState(1);
  const [zip, setZip] = useState("");
  const [industry, setIndustry] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [dailyCap, setDailyCap] = useState(200);
  const [throttle, setThrottle] = useState(30);
  const [testEmail, setTestEmail] = useState("");
  const [savedId, setSavedId] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState(null);

  // Duplicate detection (fuzzy dedup pass). Scan is read-only; the operator
  // reviews the candidate pairs and explicitly confirms which to merge.
  const [dedupPairs, setDedupPairs] = useState(null);
  const [dedupBusy, setDedupBusy] = useState(false);
  const [dedupError, setDedupError] = useState(null);
  const [dedupResult, setDedupResult] = useState(null);
  const [dedupSelected, setDedupSelected] = useState({});

  useEffect(() => {
    if (!data["leadgen-campaigns"]) {
      getJson("leadgen-campaigns")
        .then((res) => setCampaigns(res.rows || []))
        .catch((e) => setCampaignsError(String(e.message || e)));
    }
  }, [data]);

  useEffect(() => {
    getJson("leadgen-deliverability")
      .then((res) => setDeliverability(res))
      .catch((e) => setDeliverabilityError(String(e.message || e)));
  }, []);

  const industries = [...new Set(readySegments.map((s) => s.industry_group).filter(Boolean))].sort();

  // Client-side deliverable estimate: sum with_email across ready_segments
  // matching the chosen zip/industry. Exact count is out of scope.
  const matchCount = readySegments
    .filter((s) => (!zip || s.zip === zip) && (!industry || s.industry_group === industry))
    .reduce((sum, s) => sum + Number(s.with_email || 0), 0);

  const campaignBody = () => ({
    name: subject ? subject.slice(0, 60) : "Untitled campaign",
    subject_template: subject,
    body_template: body,
    from_email: "hello@simpleitsrq.com",
    throttle_per_hour: Number(throttle) || 30,
    daily_cap: Number(dailyCap) || 200,
    segment: { zip: zip || null, industry: industry || null },
  });

  const saveCampaign = async () => {
    const res = await postJson("leadgen-campaign-save", campaignBody());
    setSavedId(res.id);
    return res.id;
  };

  const draftWithAi = async () => {
    setAiBusy(true);
    setLocalError(null);
    try {
      const res = await postJson("leadgen-ai", {
        mode: "campaign",
        prompt: body || "Write a cold outreach email for a Sarasota/Bradenton IT services company.",
      });
      if (res.result?.subject) setSubject(res.result.subject);
      if (res.result?.body) setBody(res.result.body);
    } catch (e) {
      setLocalError(String(e.message || e));
    } finally {
      setAiBusy(false);
    }
  };

  const sendTest = async () => {
    setLocalError(null);
    try {
      const id = savedId || (await saveCampaign());
      await postJson("leadgen-campaign-test", { id, to: testEmail });
    } catch (e) {
      setLocalError(String(e.message || e));
    }
  };

  const previewSegment = async () => {
    setPreviewBusy(true);
    setPreviewError(null);
    try {
      const res = await getJson("leadgen-segment-preview", { zip, min_confidence: 0.5 });
      setPreview(res);
    } catch (e) {
      setPreviewError(String(e.message || e));
    } finally {
      setPreviewBusy(false);
    }
  };

  const launch = async () => {
    setLocalError(null);
    try {
      const id = savedId || (await saveCampaign());
      await postJson("leadgen-campaign-start", { id });
    } catch (e) {
      setLocalError(String(e.message || e));
    }
  };

  const scanDuplicates = async () => {
    setDedupBusy(true);
    setDedupError(null);
    setDedupResult(null);
    try {
      const res = await getJson("leadgen-dedup-scan");
      const pairs = res.pairs || [];
      setDedupPairs(pairs);
      // Default every pair to selected for the merge.
      const sel = {};
      pairs.forEach((p) => { sel[`${p.a_id}:${p.b_id}`] = true; });
      setDedupSelected(sel);
    } catch (e) {
      setDedupError(String(e.message || e));
    } finally {
      setDedupBusy(false);
    }
  };

  const toggleDedupPair = (key) => {
    setDedupSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const mergeDuplicates = async () => {
    setDedupBusy(true);
    setDedupError(null);
    setDedupResult(null);
    try {
      const pairs = (dedupPairs || [])
        .filter((p) => dedupSelected[`${p.a_id}:${p.b_id}`])
        .map((p) => ({ canonical_id: p.a_id, duplicate_id: p.b_id, matched_on: p.matched_on }));
      if (!pairs.length) {
        setDedupError("No pairs selected to merge.");
        return;
      }
      const res = await postJson("leadgen-dedup-apply", { pairs });
      setDedupResult(res);
      // Refresh the scan so merged pairs drop out of the candidate list.
      await scanDuplicates();
    } catch (e) {
      setDedupError(String(e.message || e));
    } finally {
      setDedupBusy(false);
    }
  };

  const steps = ["Segment", "Message", "Throttle", "Launch"];

  return (
    <div className="ops-grid">
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Campaign builder</h2></div>

        <div className="ops-wizard-steps" style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {steps.map((label, i) => (
            <button
              key={label}
              type="button"
              className={`btn btn-sm ${step === i + 1 ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setStep(i + 1)}
            >
              {i + 1}. {label}
            </button>
          ))}
        </div>

        {localError ? <div className="ops-notice">{localError}</div> : null}

        {step === 1 && (
          <div>
            <label className="ops-field-label" htmlFor="cb-zip">ZIP code</label>
            <input
              id="cb-zip"
              className="ops-input"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              placeholder="e.g. 34232"
              style={{ width: 200 }}
            />
            <label className="ops-field-label" htmlFor="cb-industry">Industry</label>
            <select
              id="cb-industry"
              className="ops-input"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              style={{ width: 240 }}
            >
              <option value="">Any industry</option>
              {industries.map((ind) => <option key={ind} value={ind}>{ind}</option>)}
            </select>
            <p style={{ marginTop: 12, fontSize: 14 }}>
              <strong>{fmtNumber(matchCount)}</strong> deliverable emails match this segment (client-side estimate).
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button className="btn btn-secondary btn-sm" type="button" disabled={previewBusy} onClick={previewSegment}>
                {previewBusy ? "Previewing…" : "Preview segment"}
              </button>
              <button className="btn btn-primary btn-sm" type="button" onClick={() => setStep(2)}>Next</button>
            </div>
            {previewError ? <div className="ops-notice" style={{ marginTop: 12 }}>{previewError}</div> : null}
            {preview ? (
              <div style={{ marginTop: 12 }}>
                <p style={{ fontSize: 14 }}>
                  <strong>{fmtNumber(preview.count)}</strong> deliverable emails would be queued for this segment.
                </p>
                {preview.sample?.length ? (
                  <Table
                    columns={["Business", "City", "State", "ZIP", "Email"]}
                    rows={preview.sample}
                    empty="No matching businesses."
                    renderRow={(r) => (
                      <tr key={r.email}>
                        <td>{r.business_name}</td>
                        <td>{r.city}</td>
                        <td>{r.state}</td>
                        <td>{r.zip}</td>
                        <td>{r.email}</td>
                      </tr>
                    )}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        {step === 2 && (
          <div>
            <label className="ops-field-label" htmlFor="cb-subject">Subject</label>
            <input
              id="cb-subject"
              className="ops-input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject line"
              style={{ width: "100%" }}
            />
            <label className="ops-field-label" htmlFor="cb-body">Body</label>
            <textarea
              id="cb-body"
              className="ops-input"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="Email body with {{first_name}}, {{business_name}}, {{city}} placeholders"
              style={{ width: "100%" }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button className="btn btn-secondary btn-sm" type="button" disabled={aiBusy} onClick={draftWithAi}>
                {aiBusy ? "Drafting…" : "Draft with AI"}
              </button>
              <input
                className="ops-input"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="test@example.com"
                style={{ width: 220 }}
              />
              <button className="btn btn-secondary btn-sm" type="button" onClick={sendTest}>Send test to me</button>
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary btn-sm" type="button" onClick={() => setStep(3)}>Next</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <label className="ops-field-label" htmlFor="cb-cap">Daily cap</label>
            <input
              id="cb-cap"
              className="ops-input"
              type="number"
              min={1}
              value={dailyCap}
              onChange={(e) => setDailyCap(e.target.value)}
              style={{ width: 160 }}
            />
            <label className="ops-field-label" htmlFor="cb-throttle">Per-hour throttle</label>
            <input
              id="cb-throttle"
              className="ops-input"
              type="number"
              min={1}
              value={throttle}
              onChange={(e) => setThrottle(e.target.value)}
              style={{ width: 160 }}
            />
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary btn-sm" type="button" onClick={() => setStep(4)}>Next</button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <p style={{ fontSize: 14, marginBottom: 12 }}>
              Segment: {zip || "all zips"} · {industry || "all industries"} · {fmtNumber(matchCount)} deliverable emails.
            </p>
            <button className="btn btn-primary btn-sm" type="button" disabled={busy === "leadgen-campaign-start"} onClick={launch}>
              Start campaign
            </button>
          </div>
        )}
      </section>

      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Existing campaigns</h2></div>
        {campaignsError ? <div className="ops-notice">{campaignsError}</div> : null}
        <Table
          columns={["Name", "Status", "Sends", "Sent", "Opened", "Replied"]}
          rows={campaigns}
          empty="No campaigns yet."
          emptyNode={
            <ZeroState
              title="No campaigns yet"
              description="Build your first outreach campaign to start converting the lead pipeline."
              icon={Send}
              disclosures={[
                "Campaign emails are sent to businesses that have not opted out.",
                "Review the segment preview before launching to avoid duplicate outreach.",
              ]}
            />
          }
          renderRow={(c) => (
            <tr key={c.id}>
              <td><strong>{c.name}</strong></td>
              <td><SignalPill state={c.status === "running" ? "good" : c.status === "draft" ? "warn" : "neutral"}>{c.status}</SignalPill></td>
              <td>{fmtNumber(c.total_sends)}</td>
              <td>{fmtNumber(c.sent)}</td>
              <td>{fmtNumber(c.opened)}</td>
              <td>{fmtNumber(c.replied)}</td>
            </tr>
          )}
        />
      </section>

      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Deliverability</h2></div>
        {deliverabilityError ? <div className="ops-notice">{deliverabilityError}</div> : null}
        {deliverability ? (
          <div>
            <p style={{ fontSize: 14, marginBottom: 12 }}>
              <strong>{fmtNumber(deliverability.totals?.sent)}</strong> sent ·{" "}
              <strong>{fmtNumber(deliverability.totals?.bounced)}</strong> bounced ·{" "}
              <strong>{deliverability.totals?.bounce_rate ?? 0}%</strong> overall bounce rate
            </p>
            <Table
              columns={["Domain", "Sent", "Bounced", "Open rate", "Reply rate", "Reputation", "Status"]}
              rows={deliverability.domains}
              empty="No sends recorded yet."
              renderRow={(d) => (
                <tr key={d.domain}>
                  <td><strong>{d.domain}</strong></td>
                  <td>{fmtNumber(d.sent_count)}</td>
                  <td>{fmtNumber(d.bounce_count)}</td>
                  <td>{d.open_rate}%</td>
                  <td>{d.reply_rate}%</td>
                  <td>
                    <SignalPill state={d.reputation >= 95 ? "good" : d.reputation >= 90 ? "warn" : "bad"}>
                      {d.reputation}
                    </SignalPill>
                  </td>
                  <td>
                    <SignalPill state={d.status === "ok" ? "good" : d.status === "warn" ? "warn" : "bad"}>
                      {d.status}
                    </SignalPill>
                  </td>
                </tr>
              )}
            />
          </div>
        ) : null}
      </section>

      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head"><h2>Duplicate detection</h2></div>
        <p className="ops-panel__copy">
          Finds likely duplicate businesses before the first campaign launches so we never email the
          same company twice. A pair is only flagged when the names are similar AND they share a
          matching phone, website, or address — so chain-store branches in the same zip are not merged.
          Review the candidates and confirm which to merge; duplicates are marked rejected, never deleted.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button className="btn btn-primary btn-sm" type="button" disabled={dedupBusy} onClick={scanDuplicates}>
            {dedupBusy ? "Scanning…" : "Scan for duplicates"}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            disabled={dedupBusy || !dedupPairs?.length}
            onClick={mergeDuplicates}
          >
            Merge selected
          </button>
        </div>
        {dedupError ? <div className="ops-notice" style={{ marginTop: 12 }}>{dedupError}</div> : null}
        {dedupResult ? (
          <div className="ops-notice" style={{ marginTop: 12 }}>
            Merged {fmtNumber(dedupResult.applied)} duplicate pair(s).
          </div>
        ) : null}
        {dedupPairs ? (
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 14, marginBottom: 12 }}>
              <strong>{fmtNumber(dedupPairs.length)}</strong> candidate duplicate pair(s) found.
            </p>
            {dedupPairs.length ? (
              <Table
                columns={["", "Business A", "Business B", "Zip", "Similarity", "Matched on"]}
                rows={dedupPairs}
                empty="No duplicate candidates found."
                renderRow={(p) => {
                  const key = `${p.a_id}:${p.b_id}`;
                  return (
                    <tr key={key}>
                      <td>
                        <input
                          type="checkbox"
                          checked={!!dedupSelected[key]}
                          onChange={() => toggleDedupPair(key)}
                          aria-label={`Include ${p.a_name} / ${p.b_name} in merge`}
                        />
                      </td>
                      <td><strong>{p.a_name}</strong></td>
                      <td><strong>{p.b_name}</strong></td>
                      <td>{p.zip}</td>
                      <td>{Number(p.similarity).toFixed(4)}</td>
                      <td><SignalPill state="warn">{p.matched_on}</SignalPill></td>
                    </tr>
                  );
                }}
              />
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
