import { Link } from "../lib/Link";
import { Check, FileText, ArrowRight, ShieldCheck, Printer, Download } from "lucide-react";
import { useSEO } from "../lib/seo";
import NewsletterSignup from "../components/NewsletterSignup";

// /wisp-starter — public Florida-flavored Written Information Security
// Program starter template. Functions as:
//   1. SEO target for "Florida WISP template", "free WISP template",
//      "small business WISP", "cyber-insurance WISP requirement"
//   2. Lead magnet delivery surface — newsletter signup at the top promises
//      this page; the page is also the public landing page for the same
//      content (better UX than a gated download)
//   3. Funnel toward the $149 fully-drafted WISP at /store/wisp-template
//
// Content is intentionally usable as-is — a 5-person Sarasota law firm
// can fill in the bracketed fields and have a real (if minimal) WISP for
// a 2026 cyber-insurance renewal. The $149 upgrade adds attorney-reviewed
// clauses, the fillable risk-assessment matrix, the BAA appendix, the
// vendor-risk template, and lifetime updates.

const SECTIONS = [
  {
    n: "1",
    h: "Information Security Program Statement",
    body: "[COMPANY NAME] (\"the Company\") maintains a written information security program designed to protect the confidentiality, integrity, and availability of all Company and customer information. This program complies with applicable Florida law (including FIPA, Fla. Stat. § 501.171), HIPAA where applicable, and the requirements of the Company's cyber-insurance carrier as of the policy effective date. The program is reviewed at least annually and after any material change to the Company's systems, services, or risk profile.",
  },
  {
    n: "2",
    h: "Program Scope",
    body: "This program covers all information assets owned, leased, or processed by the Company including: workstations and laptops, mobile devices, on-premise servers, cloud services, email and messaging platforms, point-of-sale and payment systems, paper records, and all third-party service providers with access to Company or customer data. The program applies to all employees, contractors, temporary workers, and authorized volunteers regardless of work location.",
  },
  {
    n: "3",
    h: "Roles and Responsibilities",
    rows: [
      ["Information Security Officer (ISO)", "[NAME / TITLE — typically the owner, office manager, or designated principal]", "Annual review, vendor approval, incident response coordination"],
      ["IT Operations", "[INTERNAL TECH OR MSP NAME]", "Daily operations, patch management, backup verification, access provisioning"],
      ["Legal / Compliance", "[NAME / OUTSIDE COUNSEL]", "Breach notification, regulatory reporting, contract review"],
      ["All Workforce Members", "All staff", "Adherence to acceptable use, prompt incident reporting, completion of annual training"],
    ],
  },
  {
    n: "4",
    h: "Risk Assessment",
    body: "The Company conducts a written risk assessment annually and after any material change. The assessment identifies threats, vulnerabilities, and impact for each category of information asset. Risks are scored on a 1–5 scale for likelihood and impact; combined scores of 12 or higher receive a documented mitigation plan. The most recent risk assessment is on file dated [DATE] and signed by the ISO.",
  },
  {
    n: "5",
    h: "Administrative Safeguards",
    bullets: [
      "Background checks on all hires with access to non-public information",
      "Documented onboarding/offboarding procedures (account creation, key issuance, NDA execution; account suspension within one business day of termination)",
      "Role-based access — least privilege, reviewed quarterly",
      "Annual security awareness training tracked per user",
      "Vendor due diligence + signed Business Associate Agreement / Data Processing Addendum on file for every vendor with access to Company or customer data",
    ],
  },
  {
    n: "6",
    h: "Physical Safeguards",
    bullets: [
      "Locked storage for all paper records containing non-public information",
      "Visitor log at the front desk; visitor escort policy in non-public areas",
      "Hurricane procedure: laptops, servers, and paper PHI/PII are relocated to [LOCATION] when a named storm is forecast within 72 hours",
      "Vehicle storage prohibition: no unencrypted device may be left unattended in a parked vehicle (this is the #1 cause of HIPAA breaches in Florida)",
      "Server room temperature and humidity log retained for 12 months",
    ],
  },
  {
    n: "7",
    h: "Technical Safeguards",
    bullets: [
      "Multi-factor authentication enforced on all email accounts, remote access, and admin consoles. SMS-only MFA is prohibited for admin roles.",
      "Full-disk encryption (BitLocker / FileVault) on every laptop and workstation. Recovery keys escrowed with [LOCATION].",
      "Endpoint protection deployed on every device with central reporting. [VENDOR / SOLUTION].",
      "Patch management: critical OS and application patches deployed within 14 days of release; emergency CVEs within 48 hours.",
      "Network segmentation: guest Wi-Fi isolated from production network; payment systems on a separate VLAN where applicable.",
      "Logging and monitoring: 90-day retention minimum on authentication, firewall, and endpoint logs.",
    ],
  },
  {
    n: "8",
    h: "Backups and Disaster Recovery",
    body: "All Company data is backed up daily to an off-site location at least 50 miles inland from the Company's primary office. Backup integrity is verified by a documented restore test at least quarterly. The Company maintains a written business continuity and disaster recovery plan with a recovery time objective (RTO) of [X HOURS] and recovery point objective (RPO) of [X HOURS]. The plan is tested annually with a tabletop exercise documented in the audit file.",
  },
  {
    n: "9",
    h: "Incident Response",
    body: "The Company maintains a written incident response plan that defines: detection mechanisms, escalation paths, notification timelines, evidence preservation, and post-incident review. Florida Information Protection Act (Fla. Stat. § 501.171) breach notification (30 days for affected individuals; 30 days plus the AG for events affecting 500+ Florida residents) is built into the plan. The plan is reviewed annually and after every incident, regardless of severity.",
  },
  {
    n: "10",
    h: "Training and Awareness",
    bullets: [
      "All workforce members complete security awareness training within 30 days of hire and at least annually thereafter",
      "Quarterly phishing simulations with completion tracked per user",
      "Acceptable use policy signed by every workforce member at onboarding and re-affirmed annually",
      "Incident reporting procedure posted in plain English in every workspace",
    ],
  },
  {
    n: "11",
    h: "Vendor and Third-Party Risk Management",
    body: "Before any vendor receives Company or customer non-public information, the Company verifies: a current SOC 2 Type II report (or equivalent) where applicable, an executed Business Associate Agreement (HIPAA-covered vendors) or Data Processing Addendum (all others), data residency in the United States or an adequate jurisdiction, and the vendor's incident notification commitment. The vendor inventory is reviewed annually with off-boarding procedures executed for any vendor relationship terminated.",
  },
  {
    n: "12",
    h: "Audit, Review, and Version Control",
    body: "This document is reviewed at least annually. Each revision is logged with: date, revising party, sections changed, and approval signature. Material changes — including but not limited to: a change in cyber-insurance carrier, a change in primary IT provider, the addition of a new line of business, or a substantive change to applicable law — trigger an off-cycle review. The current version is [VERSION], effective [DATE], approved by [ISO NAME].",
  },
];

export default function WispStarter() {
  useSEO({
    title: "Free Starter WISP Template (Florida) — Written Information Security Program | Simple IT SRQ",
    description: "Free Florida-flavored starter Written Information Security Program template for cyber-insurance renewal questionnaires. 12 sections covering admin/physical/technical safeguards, FIPA breach notification, hurricane procedure, and vendor risk. Drop-in fields for company name, ISO, and dates.",
    canonical: "https://simpleitsrq.com/wisp-starter",
    image: "https://simpleitsrq.com/og-image.png",
    breadcrumbs: [
      { name: "Home", url: "https://simpleitsrq.com/" },
      { name: "Free WISP Starter", url: "https://simpleitsrq.com/wisp-starter" },
    ],
  });

  return (
    <main id="main" className="wisp-main">
      <section className="section wisp-hero">
        <div className="container">
          <span className="eyebrow">Free Resource · No paywall · No PDF gate</span>
          <h1 className="display">A free starter WISP template — Florida-flavored, ready to fill in.</h1>
          <p className="lede">
            Twelve sections covering everything a 2026 cyber-insurance renewal
            questionnaire asks about. Fill in the bracketed fields for your
            company, sign it, and you have a real (if minimal) Written
            Information Security Program. Copy-paste, save-as-PDF, done.
          </p>
          <div className="wisp-hero-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => window.print()}
            >
              <Printer size={16} /> Print / save as PDF
            </button>
            <a href="#wisp-1" className="btn btn-primary">
              <FileText size={16} /> Jump to the template
            </a>
          </div>
          <ul className="wisp-trust-row" aria-label="What's in the starter">
            <li><Check size={14} /> 12 sections, plain English</li>
            <li><Check size={14} /> Florida law cited (FIPA § 501.171)</li>
            <li><Check size={14} /> Hurricane + barrier-island specifics</li>
            <li><Check size={14} /> Drop-in fields for company name + ISO</li>
          </ul>
        </div>
      </section>

      <section className="section wisp-newsletter-wrap">
        <div className="container">
          <NewsletterSignup
            variant="inline"
            headline="Want the monthly Florida small-business IT brief too?"
            subhead="One email a month — same plain-English style as this template. Confirm your subscription and we'll add you to the list. Already on this page, so no extra unlock needed."
            source="wisp-starter-page"
          />
        </div>
      </section>

      <article className="section wisp-doc">
        <div className="container">
          <h2 className="title-1">WRITTEN INFORMATION SECURITY PROGRAM</h2>
          <p className="wisp-doc-meta">
            <strong>Company:</strong> [COMPANY NAME]<br />
            <strong>Effective Date:</strong> [DATE]<br />
            <strong>Version:</strong> 1.0<br />
            <strong>Approved By:</strong> [INFORMATION SECURITY OFFICER NAME / TITLE]
          </p>

          {SECTIONS.map((s) => (
            <section key={s.n} id={`wisp-${s.n}`} className="wisp-section">
              <h3 className="title-2">{s.n}. {s.h}</h3>
              {s.body && <p>{s.body}</p>}
              {s.bullets && (
                <ul className="wisp-bullets">
                  {s.bullets.map((b) => <li key={b}><Check size={14} /> <span>{b}</span></li>)}
                </ul>
              )}
              {s.rows && (
                <table className="wisp-table">
                  <thead>
                    <tr><th>Role</th><th>Holder</th><th>Responsibilities</th></tr>
                  </thead>
                  <tbody>
                    {s.rows.map(([role, holder, resp]) => (
                      <tr key={role}><td><strong>{role}</strong></td><td>{holder}</td><td>{resp}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          ))}

          <section className="wisp-section wisp-signature">
            <h3 className="title-2">Approval and Annual Review Log</h3>
            <p>
              I, the undersigned Information Security Officer for [COMPANY NAME], affirm
              that the above program reflects the current information security practices
              of the Company and has been reviewed within the last twelve months.
            </p>
            <table className="wisp-table">
              <thead>
                <tr><th>Date</th><th>ISO Name</th><th>Signature</th><th>Material Changes</th></tr>
              </thead>
              <tbody>
                <tr><td>[DATE]</td><td>[NAME]</td><td>__________________</td><td>Initial version</td></tr>
                <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
                <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
              </tbody>
            </table>
          </section>
        </div>
      </article>

      <section className="section wisp-upgrade">
        <div className="container">
          <div className="wisp-upgrade-card">
            <div>
              <span className="eyebrow"><ShieldCheck size={14} /> The full version</span>
              <h2 className="title-2">Need it cyber-insurance-ready, not starter-grade?</h2>
              <p>
                The starter above gets you to ~60% of what a 2026 cyber-insurance
                renewal questionnaire asks for. The fully-drafted Florida WISP at
                <strong> /store</strong> adds attorney-reviewed clauses, the
                fillable 42-question risk-assessment matrix, the Business
                Associate Agreement template, the vendor-risk register, and
                lifetime updates whenever the law or carrier expectations
                change. One-time $149.
              </p>
              <ul className="wisp-upgrade-bullets">
                <li><Check size={14} /> 28 pages instead of 4</li>
                <li><Check size={14} /> Attorney-reviewed clauses</li>
                <li><Check size={14} /> 42-question risk matrix with model answers</li>
                <li><Check size={14} /> Lifetime updates emailed when the law changes</li>
                <li><Check size={14} /> Credits toward your first month if you become a managed-IT client within 90 days</li>
              </ul>
            </div>
            <div className="wisp-upgrade-actions">
              <Link to="/store/wisp-template" className="btn btn-primary btn-lg">
                See the full version — $149 <ArrowRight size={16} />
              </Link>
              <Link to="/services" className="btn btn-secondary">
                Or get help building a custom one
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section wisp-print-note">
        <div className="container" style={{ textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
          <Download size={14} style={{ verticalAlign: "middle" }} /> &nbsp;
          To save this as a PDF, use Print → Save as PDF in your browser.
          Mac: Cmd+P. Windows: Ctrl+P.
        </div>
      </section>
    </main>
  );
}
