from pathlib import Path

page = Path('src/pages/Leadgen.jsx')
text = page.read_text()

old_workflow = '''  const workflow = [
    ["1. Discover", "Choose the ZIP code and industry you want to study."],
    ["2. Qualify", "Compare opportunity and data coverage before selecting prospects."],
    ["3. Enrich", "Add email, domain, DNS and website evidence where available."],
    ["4. Use", "Download the list or send selected records to a connected CRM."],
  ];'''
new_workflow = '''  const workflow = [
    { id: "leadgen-discover", number: "1", label: "Discover", body: "Choose the ZIP code and industry you want to study." },
    { id: "leadgen-qualify", number: "2", label: "Qualify", body: "Compare the businesses and select the ones worth working." },
    { id: "leadgen-enrich", number: "3", label: "Enrich", body: "Add useful contact details from the business website." },
    { id: "leadgen-use", number: "4", label: "Use", body: "Download selected prospects or send them to your CRM." },
  ];'''
if old_workflow not in text:
    raise SystemExit('workflow definition anchor missing')
text = text.replace(old_workflow, new_workflow, 1)

old_steps = '''        <div className="leadgen-product-steps">
          {workflow.map(([title, body], index) => (
            <div key={title} className={`leadgen-product-step${index === stage ? " is-active" : ""}`}>
              <strong>{title}</strong>
              <span>{body}</span>
            </div>
          ))}
        </div>'''
new_steps = '''        <nav className="leadgen-product-steps" aria-label="Leadgen workflow">
          {workflow.map((step, index) => (
            <a
              key={step.id}
              href={`#${step.id}`}
              className={`leadgen-product-step${index === stage ? " is-active" : ""}`}
              aria-current={index === stage ? "step" : undefined}
            >
              <span className="leadgen-product-step__index">{step.number}</span>
              <span className="leadgen-product-step__copy">
                <strong>{step.label}</strong>
                <span>{step.body}</span>
              </span>
              <span className="leadgen-product-step__arrow" aria-hidden="true">›</span>
            </a>
          ))}
        </nav>'''
if old_steps not in text:
    raise SystemExit('workflow cards anchor missing')
text = text.replace(old_steps, new_steps, 1)

old_scan = '''        <div className="leadgen-scan-card">
          <div className="leadgen-app-controls leadgen-app-controls--primary">'''
new_scan = '''        <section id="leadgen-discover" className="leadgen-scan-card leadgen-workflow-target" aria-labelledby="leadgen-discover-title">
          <nav className="leadgen-section-breadcrumbs" aria-label="Discover section">
            <a href="#leadgen-discover">Leadgen</a><span aria-hidden="true">›</span><strong id="leadgen-discover-title">Discover</strong>
          </nav>
          <div className="leadgen-app-controls leadgen-app-controls--primary">'''
if old_scan not in text:
    raise SystemExit('scan card anchor missing')
text = text.replace(old_scan, new_scan, 1)
text = text.replace('''          {err ? <p className="form-error" role="alert">{err}</p> : null}\n        </div>\n\n        {scan ? (''', '''          {err ? <p className="form-error" role="alert">{err}</p> : null}\n        </section>\n\n        {scan ? (''', 1)

old_score = '''            <div className="leadgen-results-scorecard" aria-label="Current result set">'''
new_score = '''            <section id="leadgen-qualify" className="leadgen-workflow-target leadgen-workflow-section" aria-labelledby="leadgen-qualify-title">
              <nav className="leadgen-section-breadcrumbs" aria-label="Qualify section">
                <a href="#leadgen-discover">Discover</a><span aria-hidden="true">›</span><strong id="leadgen-qualify-title">Qualify</strong>
              </nav>
            <div className="leadgen-results-scorecard" aria-label="Current result set">'''
if old_score not in text:
    raise SystemExit('qualify scorecard anchor missing')
text = text.replace(old_score, new_score, 1)

old_map = '''            <LeadgenMap rows={visibleRows} scan={scan} />

            <div className="leadgen-product-toolbar leadgen-product-toolbar--realized">'''
new_map = '''            <LeadgenMap rows={visibleRows} scan={scan} />
            </section>

            <section id="leadgen-enrich" className="leadgen-workflow-target leadgen-workflow-section" aria-labelledby="leadgen-enrich-title">
              <nav className="leadgen-section-breadcrumbs" aria-label="Enrich section">
                <a href="#leadgen-discover">Discover</a><span aria-hidden="true">›</span><a href="#leadgen-qualify">Qualify</a><span aria-hidden="true">›</span><strong id="leadgen-enrich-title">Enrich</strong>
              </nav>
            <div className="leadgen-product-toolbar leadgen-product-toolbar--realized">'''
if old_map not in text:
    raise SystemExit('enrich toolbar anchor missing')
text = text.replace(old_map, new_map, 1)

old_messages = '''            {extractMsg ? <p className={extractMsg.ok ? "leadgen-product-message" : "form-error"} aria-live="polite">{extractMsg.text}</p> : null}
            {pushMsg ? <p className={pushMsg.ok ? "leadgen-product-message" : "form-error"} aria-live="polite">{pushMsg.text}</p> : null}

            <div className="leadgen-explorer-head">'''
new_messages = '''            {extractMsg ? <p className={extractMsg.ok ? "leadgen-product-message" : "form-error"} aria-live="polite">{extractMsg.text}</p> : null}
            </section>

            <section id="leadgen-use" className="leadgen-workflow-target leadgen-use-card" aria-labelledby="leadgen-use-title">
              <nav className="leadgen-section-breadcrumbs" aria-label="Use section">
                <a href="#leadgen-discover">Discover</a><span aria-hidden="true">›</span><a href="#leadgen-qualify">Qualify</a><span aria-hidden="true">›</span><a href="#leadgen-enrich">Enrich</a><span aria-hidden="true">›</span><strong id="leadgen-use-title">Use</strong>
              </nav>
              <div className="leadgen-use-card__body">
                <div>
                  <strong>{selectedRows.length ? `${selectedRows.length} prospect${selectedRows.length === 1 ? "" : "s"} ready` : "Select prospects to continue"}</strong>
                  <span>Download a clean CSV or send the selected records to a connected CRM.</span>
                </div>
                <div className="leadgen-use-card__actions">
                  <button type="button" className="btn btn-secondary btn-sm" disabled={!selectedRows.length} onClick={() => downloadCsv(`leadgen-${zip}.csv`, selectedRows.map((row) => ({ ...row, email: bestEmail(row) })))}>Download CSV</button>
                  {destinations.length ? <select value={pushTarget} onChange={(event) => setPushTarget(event.target.value)} aria-label="CRM destination">{destinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.label || destination.kind}</option>)}</select> : null}
                  {destinations.length ? <button type="button" className="btn btn-primary btn-sm" onClick={pushSelected} disabled={!selectedRows.length || pushBusy}>{pushBusy ? "Sending…" : "Send to CRM"}</button> : <span className="leadgen-app-private-note">CRM sync unlocks after account setup.</span>}
                </div>
              </div>
              {pushMsg ? <p className={pushMsg.ok ? "leadgen-product-message" : "form-error"} aria-live="polite">{pushMsg.text}</p> : null}
            </section>

            <div className="leadgen-explorer-head">'''
if old_messages not in text:
    raise SystemExit('use section anchor missing')
text = text.replace(old_messages, new_messages, 1)

page.write_text(text)

css_path = Path('src/styles/leadgen-product.css')
css = css_path.read_text()
marker = '/* Leadgen workflow navigation v2 */'
if marker not in css:
    css += r'''

/* Leadgen workflow navigation v2 */
.leadgen-workflow-target { scroll-margin-top: 104px; }
.leadgen-product-steps { align-items: stretch; }
.leadgen-product-step {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0,1fr) auto;
  align-items: center;
  gap: 10px;
  color: inherit;
  text-decoration: none;
  cursor: pointer;
  transition: transform .16s ease, border-color .16s ease, background .16s ease, box-shadow .16s ease;
}
.leadgen-product-step:hover { transform: translateY(-1px); border-color: var(--aura-border-strong, var(--lg-text)); background: var(--lg-panel); }
.leadgen-product-step:focus-visible { outline: 2px solid var(--aura-accent, var(--lg-blue)); outline-offset: 2px; }
.leadgen-product-step__index {
  display: grid !important;
  place-items: center;
  width: 28px;
  height: 28px;
  margin: 0 !important;
  border: 1px solid var(--lg-border-soft);
  border-radius: 999px;
  background: var(--lg-panel);
  color: var(--lg-text) !important;
  font-size: .72rem !important;
  font-weight: 850;
}
.leadgen-product-step.is-active .leadgen-product-step__index { border-color: var(--aura-border-strong, var(--lg-text)); background: var(--aura-accent-soft, var(--lg-panel-soft)); }
.leadgen-product-step__copy { min-width: 0; margin: 0 !important; }
.leadgen-product-step__copy > strong { display: block; }
.leadgen-product-step__copy > span { display: block; }
.leadgen-product-step__arrow { margin: 0 !important; color: var(--lg-faint) !important; font-size: 1.15rem !important; line-height: 1; }
.leadgen-section-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  margin: 0 0 12px;
  overflow-x: auto;
  scrollbar-width: none;
  color: var(--lg-faint);
  font-size: .68rem;
  font-weight: 750;
  white-space: nowrap;
}
.leadgen-section-breadcrumbs::-webkit-scrollbar { display: none; }
.leadgen-section-breadcrumbs a { color: var(--lg-muted); text-decoration: none; text-underline-offset: 3px; }
.leadgen-section-breadcrumbs a:hover { color: var(--lg-text); text-decoration: underline; }
.leadgen-section-breadcrumbs strong { color: var(--lg-text); font-size: inherit; }
.leadgen-workflow-section { margin-top: 16px; padding-top: 2px; }
.leadgen-use-card {
  margin: 18px 0 4px;
  padding: 14px;
  border: 1px solid var(--aura-border, var(--lg-border-soft));
  border-radius: 14px;
  background: var(--aura-surface, var(--lg-panel));
}
.leadgen-use-card__body { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
.leadgen-use-card__body > div:first-child { min-width: 0; }
.leadgen-use-card__body strong { display: block; color: var(--lg-text); font-size: .9rem; }
.leadgen-use-card__body span { display: block; margin-top: 3px; color: var(--lg-faint); font-size: .72rem; line-height: 1.4; }
.leadgen-use-card__actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.leadgen-use-card__actions select { min-height: 34px; max-width: 190px; border: 1px solid var(--lg-border-soft); border-radius: 9px; background: var(--lg-panel); color: var(--lg-text); padding: 0 8px; }
html[data-theme="dark"] .leadgen-product-step.is-active,
html[data-theme="dark"] .leadgen-use-card { box-shadow: inset 0 1px 0 rgba(255,255,255,.05); }
@media (max-width: 760px) {
  .leadgen-product-steps {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x proximity;
    overscroll-behavior-inline: contain;
    scrollbar-width: none;
    padding: 2px 1px 8px;
  }
  .leadgen-product-steps::-webkit-scrollbar { display: none; }
  .leadgen-product-step { flex: 0 0 min(82vw, 300px); scroll-snap-align: start; }
  .leadgen-use-card__body { align-items: stretch; flex-direction: column; }
  .leadgen-use-card__actions { display: grid; grid-template-columns: 1fr; justify-content: stretch; }
  .leadgen-use-card__actions > * { width: 100%; max-width: 100%; }
  .leadgen-workflow-target { scroll-margin-top: 88px; }
}
'''
css_path.write_text(css)

print('Leadgen workflow navigation patched')
