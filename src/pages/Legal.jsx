import { Link } from "../lib/Link";
import { ArrowLeft } from "lucide-react";
import { useSEO } from "../lib/seo";

// Keep this in sync with the underlying privacy / data-flow changes. Any
// material change (new sub-processor, new cookie category, new retention
// window) should bump this date and be announced on the home page.
const LAST_UPDATED = "April 22, 2026";
const EFFECTIVE_DATE = "April 22, 2026";

function LegalShell({ title, lede, children }) {
  return (
    <main id="main" className="blog-post-main">
      <article className="blog-post">
        <div className="container blog-post-container">
          <Link to="/" className="blog-back"><ArrowLeft size={14} /> Back to home</Link>
          <h1 className="blog-post-title">{title}</h1>
          {lede && <p className="blog-post-lede">{lede}</p>}
          <div className="blog-post-meta">
            <span>Last updated: {LAST_UPDATED}</span>
            <span style={{ marginLeft: 12 }}>Effective: {EFFECTIVE_DATE}</span>
          </div>
          <div className="blog-post-content">
            {children}
          </div>
        </div>
      </article>
    </main>
  );
}

/* ============================================================
   Privacy Policy
   ============================================================ */

export function PrivacyPage() {
  useSEO({
    title: "Privacy Policy | Simple IT SRQ",
    description: "How Simple IT SRQ handles visitor and client data on simpleitsrq.com — what we collect, the lawful basis, our sub-processors, your rights under GDPR / CCPA / FIPA, and our retention schedule.",
    canonical: "https://simpleitsrq.com/privacy",
    image: "https://simpleitsrq.com/og-image.png",
    breadcrumbs: [
      { name: "Home", url: "https://simpleitsrq.com/" },
      { name: "Privacy Policy", url: "https://simpleitsrq.com/privacy" },
    ],
  });
  return (
    <LegalShell
      title="Privacy Policy"
      lede="Simple IT SRQ is committed to handling your data the way we expect our clients to handle their own. This policy is the specifics — what we collect, why, who processes it, how long we keep it, and what you can do about it."
    >
      <h2>1. Who we are</h2>
      <p>
        Simple IT SRQ is a managed IT services provider based in Bradenton, Florida
        (Manatee County). The data controller for this website and any direct
        inquiries is Simple IT SRQ. Contact:{" "}
        <a href="mailto:hello@simpleitsrq.com">hello@simpleitsrq.com</a>.
      </p>
      <p>
        For active managed-services clients, data processing is additionally
        governed by your signed Master Services Agreement (MSA) and Business
        Associate Agreement (BAA), which supersede this policy where they
        conflict for client-owned data.
      </p>

      <h2>2. What we collect</h2>

      <h3>2.1 Data you give us directly</h3>
      <ul>
        <li>
          <strong>Contact / inquiry / quote forms:</strong> name, company,
          email, phone (optional), and whatever you type into the message
          field. Also the source tag (e.g. <code>cyber-insurance-quote</code>,
          <code> sponsor-inquiry</code>, <code>compliance-audit-soc-2</code>).
        </li>
        <li>
          <strong>Newsletter subscription:</strong> email address and an
          opt-in timestamp. Double-opt-in via a confirmation link; you must
          click the link before any subsequent newsletter is sent.
        </li>
        <li>
          <strong>Support tickets (client portal):</strong> name, email,
          ticket subject and body, priority, attachments, and the signed-in
          account identifier.
        </li>
        <li>
          <strong>Account sign-in:</strong> when you log into the client
          portal via Google or GitHub, we receive your name, email, and avatar
          URL from the identity provider.
        </li>
      </ul>

      <h3>2.2 Data collected automatically</h3>
      <ul>
        <li>
          <strong>Server logs</strong> (essential, legitimate interest): IP
          address, user agent, request path, referrer, HTTP status, and
          timestamp. Used for security, fraud prevention, abuse mitigation,
          and performance diagnostics. Retained 12 months.
        </li>
        <li>
          <strong>Geolocation from IP</strong> (country + region) derived via
          Vercel edge headers. Used for hostile-geo detection and
          location-relevant content. No precise location is collected.
        </li>
        <li>
          <strong>Honeypot beacons</strong> (security, legitimate interest):
          if an automated scanner hits a fake admin path or submits a fake
          login, we log the attempt and any volunteered credentials — only
          for threat intelligence, never used to authenticate.
        </li>
        <li>
          <strong>Cookies and local storage</strong> — see §3.
        </li>
      </ul>

      <h3>2.3 What we do NOT collect</h3>
      <ul>
        <li>We don't fingerprint your browser across sites.</li>
        <li>
          We don't read the contents of managed endpoints (client data)
          without explicit authorization in the MSA.
        </li>
        <li>
          We don't rent, sell, or share contact data with any party outside
          the documented processors in §5.
        </li>
        <li>
          We don't train AI models on your messages or client data.
        </li>
      </ul>

      <h2>3. Cookies and local storage</h2>
      <p>
        This site uses the minimum practical set. Categories are defined and
        controlled by the consent banner on first visit; your choice persists
        in your browser under <code>sirq_consent_v1</code>.
      </p>
      <table>
        <thead>
          <tr>
            <th>Purpose</th>
            <th>Name</th>
            <th>Category</th>
            <th>Lifetime</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>CSRF protection</td><td><code>sit_csrf</code></td><td>Essential</td><td>Session</td></tr>
          <tr><td>Authenticated session (signed-in clients)</td><td><code>sirq_session</code></td><td>Essential</td><td>7 days (rolling)</td></tr>
          <tr><td>Consent choice</td><td><code>sirq_consent_v1</code> (localStorage)</td><td>Essential</td><td>12 months</td></tr>
          <tr><td>Theme preference (dark / light)</td><td><code>theme</code> (localStorage)</td><td>Essential</td><td>12 months</td></tr>
          <tr><td>Anonymous visitor correlation</td><td><code>sirq_anon</code></td><td>Analytics (opt-in)</td><td>12 months</td></tr>
          <tr><td>Google Analytics 4</td><td><code>_ga</code>, <code>_ga_*</code></td><td>Analytics (opt-in)</td><td>Up to 24 months</td></tr>
          <tr><td>Google AdSense ad personalization</td><td>Google-set (e.g. <code>__gads</code>, <code>__gpi</code>)</td><td>Marketing (opt-in)</td><td>Per Google retention</td></tr>
          <tr><td>Cloudflare Turnstile</td><td><code>cf_chl_*</code></td><td>Essential (bot protection)</td><td>Session</td></tr>
        </tbody>
      </table>
      <p>
        Google Analytics is configured with <strong>Consent Mode v2</strong>:
        until you opt in to analytics, GA runs in cookieless-ping mode and
        does not persist any identifiers. Opt-in is revocable at any time —
        re-open the banner from the footer link and choose again.
      </p>

      <h2>4. Why we process your data (lawful basis)</h2>
      <ul>
        <li>
          <strong>Contract</strong> — to perform services you've signed up for
          (client portal, ticketing, managed IT, digital product delivery).
        </li>
        <li>
          <strong>Legitimate interest</strong> — website operation, security,
          fraud prevention, server logging, abuse mitigation, honeypot
          intelligence, rate limiting, audit trail.
        </li>
        <li>
          <strong>Consent</strong> — analytics, marketing cookies, AdSense,
          marketing emails beyond transactional replies. Withdrawable in one
          click.
        </li>
        <li>
          <strong>Legal obligation</strong> — HIPAA documentation retention,
          Florida tax-record retention, subpoena response.
        </li>
      </ul>

      <h2>5. Sub-processors</h2>
      <p>
        The companies below process data on our behalf. Each has a signed
        Data Processing Addendum where applicable. We review this list
        annually and when a processor changes.
      </p>
      <table>
        <thead>
          <tr><th>Processor</th><th>Purpose</th><th>Data region</th></tr>
        </thead>
        <tbody>
          <tr><td>Vercel, Inc.</td><td>Hosting, edge functions, analytics, speed insights, BotID</td><td>US</td></tr>
          <tr><td>Neon (Databricks)</td><td>Primary PostgreSQL database — tickets, sessions, security events, newsletter</td><td>US</td></tr>
          <tr><td>Resend, Inc.</td><td>Outbound transactional and newsletter email</td><td>US</td></tr>
          <tr><td>Cloudflare</td><td>Turnstile bot challenge</td><td>Global edge</td></tr>
          <tr><td>Google LLC</td><td>Google Analytics 4 (cookieless until you opt in via the consent banner), Google AdSense (only renders ads when you opt in to marketing cookies), and OAuth sign-in</td><td>US / Global</td></tr>
          <tr><td>Stripe, Inc.</td><td>Payment processing for store products (handled entirely by Stripe — we never see your card number)</td><td>US / Global</td></tr>
          <tr><td>GitHub, Inc.</td><td>OAuth sign-in (optional)</td><td>US</td></tr>
          <tr><td>AbuseIPDB / IPinfo / Spamhaus / Emerging Threats</td><td>Threat intelligence feeds queried against incoming IPs</td><td>US / EU</td></tr>
        </tbody>
      </table>
      <p>
        For EU / UK visitors: transfers to the US rely on the EU-US Data
        Privacy Framework or Standard Contractual Clauses in each vendor's
        DPA. No EU-specific processor is used for servicing EU clients — if
        you require EU-regional hosting (data residency), contact us before
        engaging.
      </p>

      <h2>6. Affiliate and referral disclosures</h2>
      <p>
        Some pages include affiliate links to third-party products
        (1Password, Gusto, Acronis, HoneyBook, Amazon, cyber-insurance
        brokers, compliance-audit firms). If you click through and purchase
        or sign up, Simple IT SRQ may receive a referral commission. This
        never changes the price you pay. Pages with affiliate content display
        an FTC-compliant disclosure banner at the top. Clicks are logged for
        attribution; see §3 for the cookies involved.
      </p>

      <h2>7. Your rights</h2>
      <p>
        You can request any of the following by emailing
        {" "}<a href="mailto:hello@simpleitsrq.com">hello@simpleitsrq.com</a>{" "}
        with the subject line <em>Privacy Request</em>:
      </p>
      <ul>
        <li><strong>Access</strong> — a copy of the personal information we hold about you.</li>
        <li><strong>Rectification</strong> — correction of inaccurate data.</li>
        <li><strong>Deletion</strong> — removal of your data, subject to legal retention obligations.</li>
        <li><strong>Portability</strong> — a structured, machine-readable export.</li>
        <li><strong>Objection</strong> — opt out of marketing, analytics, or any legitimate-interest processing you disagree with.</li>
        <li><strong>Withdraw consent</strong> — reopen the cookie banner from the footer link; your choice takes effect immediately.</li>
      </ul>
      <p>
        We verify requests by asking for information that matches what we
        already hold (so we don't disclose your data to an impersonator). We
        respond within 30 days for GDPR / CCPA / FIPA requests, or longer if
        we notify you of a reasonable extension.
      </p>
      <p>
        California residents have additional CCPA/CPRA rights including the
        right to know, delete, correct, limit use of sensitive personal
        information, and opt out of sale / sharing. We do not sell personal
        information and we do not share it for cross-context behavioral
        advertising in the CCPA sense.
      </p>
      <p>
        Florida residents have rights under the Florida Information Protection
        Act (FIPA) — primarily breach-notification requirements we observe on
        our side; FIPA does not itself grant consumer access / deletion
        rights the way FDBR / GDPR / CCPA do.
      </p>

      <h2>8. Data retention</h2>
      <ul>
        <li><strong>Contact / inquiry forms:</strong> 24 months.</li>
        <li><strong>Newsletter subscribers:</strong> until you unsubscribe. Every newsletter includes a one-click unsubscribe link.</li>
        <li><strong>Security events + audit log:</strong> 12 months by default; high-severity events retained 24 months. Audit chain hashes are immutable by design.</li>
        <li><strong>Server logs:</strong> 12 months.</li>
        <li><strong>Honeypot intelligence:</strong> indefinite — used for threat modeling and blocklist lineage.</li>
        <li><strong>Client records (managed services):</strong> duration of engagement plus 7 years, or longer where required (e.g. HIPAA-covered practices).</li>
        <li><strong>Stripe payment records:</strong> per Stripe's retention policy, which we have no control over; usually 7 years for tax records.</li>
      </ul>

      <h2>9. Security</h2>
      <p>
        Controls in place today include:
      </p>
      <ul>
        <li>Mandatory MFA on every administrative account.</li>
        <li>CSRF double-submit cookie on every mutating request.</li>
        <li>Rate limiting on public endpoints, augmented by Cloudflare Turnstile + Vercel BotID.</li>
        <li>Signed, hash-chained audit log for security-relevant events.</li>
        <li>Encrypted transport (TLS 1.3) for every page and API call.</li>
        <li>Least-privilege access controls internally; no shared accounts.</li>
        <li>Outbound OAuth + third-party fetches guarded by timeouts and allowlisted destinations.</li>
        <li>Content Security Policy with nonce-based inline-style allowance, <code>object-src 'none'</code>, <code>frame-ancestors 'self'</code>, and per-request nonces.</li>
      </ul>
      <p>
        No system is perfect. If you believe you've found a security issue,
        please email{" "}
        <a href="mailto:hello@simpleitsrq.com">hello@simpleitsrq.com</a>{" "}
        with the subject line <em>Security</em>. We respond within one
        business day and won't pursue researchers who report responsibly.
      </p>

      <h2>10. Children</h2>
      <p>
        This site is directed to business owners and IT decision-makers.
        We do not knowingly collect personal information from children under
        13 (COPPA) or under 16 where GDPR applies. If you believe a child
        has submitted data here, contact us and we'll delete it.
      </p>

      <h2>11. Changes to this policy</h2>
      <p>
        Material changes — new sub-processors, new cookie categories, new
        retention windows — are announced on the home page for at least 14
        days before taking effect, and the "Last updated" date at the top of
        this page is bumped. Non-material clarifications may be made silently.
      </p>

      <h2>12. Contact</h2>
      <p>
        Email <a href="mailto:hello@simpleitsrq.com">hello@simpleitsrq.com</a>.
        Mailing address: Simple IT SRQ, Bradenton, Florida. If you are an EU
        resident with an unresolved complaint, you may also contact your
        local supervisory authority.
      </p>
    </LegalShell>
  );
}

/* ============================================================
   Terms of Service
   ============================================================ */

export function TermsPage() {
  useSEO({
    title: "Terms of Service | Simple IT SRQ",
    description: "Terms governing use of simpleitsrq.com — website use, store products, affiliate disclosures, newsletter, referrals, and the standard limitations of liability. Paid engagements are governed separately by a signed MSA.",
    canonical: "https://simpleitsrq.com/terms",
    image: "https://simpleitsrq.com/og-image.png",
    breadcrumbs: [
      { name: "Home", url: "https://simpleitsrq.com/" },
      { name: "Terms of Service", url: "https://simpleitsrq.com/terms" },
    ],
  });
  return (
    <LegalShell
      title="Terms of Service"
      lede="These terms govern simpleitsrq.com, the digital products sold on our store, our newsletter, and our referral programs. Paid managed-services engagements are governed separately by a signed Master Services Agreement (MSA)."
    >
      <h2>1. Acceptance</h2>
      <p>
        By accessing simpleitsrq.com or using any feature on it (store, newsletter,
        referral forms, client portal) you accept these terms. If you don't
        agree, don't use the site. We may update these terms; the revised
        version takes effect when posted, and the "Last updated" date at the
        top of this page reflects the change.
      </p>

      <h2>2. Website use</h2>
      <p>
        You may browse, share, and link to public pages for personal,
        educational, and non-commercial business research. You may NOT:
      </p>
      <ul>
        <li>Scrape, mirror, or systematically harvest content.</li>
        <li>Attempt to bypass security controls or access data you're not authorized to access.</li>
        <li>Submit fake credentials, forged Turnstile tokens, or any content designed to trigger our honeypot or abuse-mitigation systems (we'll log it and share the intelligence with threat feeds).</li>
        <li>Impersonate us or any client.</li>
      </ul>

      <h2>3. Intellectual property</h2>
      <p>
        All content, code, images, and trademarks on this site are the
        property of Simple IT SRQ or used with permission. You may quote a
        reasonable excerpt of a blog post with attribution and a link back to
        the original page. You may NOT republish full articles, repackage our
        templates as your own product, or remove our copyright notices.
      </p>

      <h2>4. Digital product purchases (Store)</h2>

      <h3>4.1 What you're buying</h3>
      <p>
        Products sold at <Link to="/store">simpleitsrq.com/store</Link> are
        digital templates, playbooks, spreadsheets, and evidence binders
        delivered as file downloads. Each product page describes the specific
        files included. Prices are in USD; taxes where applicable are added
        at checkout.
      </p>

      <h3>4.2 License</h3>
      <p>
        Your purchase grants you a perpetual, non-exclusive, non-transferable
        license to use the product internally within your organization,
        including customizing and filling in the templates. You may NOT resell,
        republish, or redistribute the raw template files outside your
        organization. "Your organization" means one legal entity; multi-entity
        use requires an additional license per entity.
      </p>

      <h3>4.3 Lifetime updates</h3>
      <p>
        Every store product ships with lifetime updates. When a template is
        revised — because regulations change, carriers update their
        questionnaires, or we improve the format — existing buyers receive
        the new version by email at no charge.
      </p>

      <h3>4.4 Refund policy</h3>
      <p>
        30 days, no questions asked. If a product doesn't match what you
        expected, reply to your receipt email and we will refund you. You
        keep the files. Refunds are processed through Stripe and typically
        post to your card within 5–10 business days.
      </p>

      <h3>4.5 Not professional advice</h3>
      <p>
        Templates are starting points. For HIPAA, cyber-insurance,
        compliance, or legal filings you still need a qualified advisor
        (attorney, CPA, auditor, or compliance consultant) to tailor the
        documents to your specific situation. Simple IT SRQ is not a law firm,
        accounting firm, or licensed compliance attester.
      </p>

      <h2>5. Newsletter ("The Simple IT Brief")</h2>
      <p>
        You subscribe by entering your email and confirming via the
        double-opt-in link we send. Every issue includes a one-click
        unsubscribe link. We don't sell, rent, or trade the list. Frequency
        is typically monthly — we stop sending if you unsubscribe, hard-bounce,
        or mark a message as spam.
      </p>

      <h2>6. Referral programs and affiliate links</h2>
      <p>
        Some outbound links to third-party products (1Password, Gusto,
        Acronis, HoneyBook, Amazon, cyber-insurance brokers,
        compliance-audit firms) are affiliate or referral links. If you
        click and purchase or bind a service, Simple IT SRQ may receive a
        commission. This never changes your price. Pages with affiliate
        content render an FTC-required disclosure banner. See the{" "}
        <Link to="/privacy">Privacy Policy</Link>
        {" "}§6 for related data handling.
      </p>

      <h2>7. Sponsor / advertiser program</h2>
      <p>
        Sponsor placements (purchased via <Link to="/advertise">/advertise</Link>)
        are clearly labeled as sponsored content. We retain editorial control
        over which sponsors we accept and reserve the right to decline or
        remove any placement that conflicts with our audience's interests.
        Refund and make-good terms are spelled out on the /advertise page
        and supersede any informal expectation.
      </p>

      <h2>8. Client portal</h2>
      <p>
        The client portal at <Link to="/portal">/portal</Link> is for
        authenticated clients and admin staff. Do not attempt to access
        areas or data you're not authorized to see. Sign-in sessions are
        subject to session timeout, IP-change reauthentication, and MFA
        where configured. Violations are logged and may trigger automatic
        suspension pending manual review.
      </p>

      <h2>9. Managed services (MSA supersedes)</h2>
      <p>
        When you engage Simple IT SRQ for managed IT services, the terms of
        the engagement are governed by the signed Master Services Agreement
        and (for HIPAA-covered entities) a Business Associate Agreement.
        Those contracts supersede these terms for any overlap.
      </p>

      <h2>10. Third-party links and content</h2>
      <p>
        We link to external sites, articles, and vendors. We do not control
        those sites, their content, their security, or their privacy
        practices. Linking is not endorsement unless we explicitly say so.
      </p>

      <h2>11. Disclaimers</h2>
      <p>
        The site and digital products are provided <strong>"as is"</strong>{" "}
        without warranties of any kind — express or implied — including
        merchantability, fitness for a particular purpose, and
        non-infringement. We don't warrant that the site will be
        uninterrupted, secure, or error-free.
      </p>

      <h2>12. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by Florida law, Simple IT SRQ is not
        liable for indirect, incidental, special, consequential, or punitive
        damages arising from your use of the site or a digital product. Total
        liability for any claim related to the site or a digital product is
        limited to the greater of (a) the amount you paid for the product
        giving rise to the claim, or (b) one hundred US dollars. This
        limitation does not apply to liability that cannot be excluded under
        applicable law.
      </p>

      <h2>13. Indemnification</h2>
      <p>
        You agree to indemnify Simple IT SRQ against any third-party claim
        arising out of your misuse of the site, violation of these terms, or
        violation of any applicable law — including attorneys' fees and
        costs. This clause survives termination.
      </p>

      <h2>14. Governing law and venue</h2>
      <p>
        These terms are governed by Florida law without regard to its
        conflict-of-law principles. Any dispute must be brought in the state
        or federal courts located in Manatee County, Florida, and you consent
        to personal jurisdiction there.
      </p>

      <h2>15. Severability</h2>
      <p>
        If any provision is found unenforceable, the remaining provisions
        stay in effect.
      </p>

      <h2>16. Contact</h2>
      <p>
        Questions: <a href="mailto:hello@simpleitsrq.com">hello@simpleitsrq.com</a>.
        Mailing address: Simple IT SRQ, Bradenton, Florida.
      </p>
    </LegalShell>
  );
}

/* ============================================================
   Accessibility Statement
   ============================================================ */

export function AccessibilityPage() {
  useSEO({
    title: "Accessibility Statement | Simple IT SRQ",
    description: "simpleitsrq.com's WCAG 2.2 Level AA conformance approach — what we do, how we test (axe-core + Playwright), known limitations, and how to report a barrier.",
    canonical: "https://simpleitsrq.com/accessibility",
    image: "https://simpleitsrq.com/og-image.png",
    breadcrumbs: [
      { name: "Home", url: "https://simpleitsrq.com/" },
      { name: "Accessibility", url: "https://simpleitsrq.com/accessibility" },
    ],
  });
  return (
    <LegalShell
      title="Accessibility Statement"
      lede="Simple IT SRQ is committed to making simpleitsrq.com usable for everyone, including visitors who rely on screen readers, keyboard navigation, high-contrast modes, or other assistive technology."
    >
      <h2>1. Conformance target</h2>
      <p>
        We design and build simpleitsrq.com to meet{" "}
        <a
          href="https://www.w3.org/TR/WCAG22/"
          target="_blank"
          rel="noopener noreferrer"
        >Web Content Accessibility Guidelines (WCAG) 2.2 Level AA</a>. This
        covers perceivability (text alternatives, color contrast, captioned
        media), operability (keyboard navigation, no seizure-inducing motion),
        understandability (clear labels, consistent navigation), and
        robustness (valid markup, compatibility with assistive tech).
      </p>

      <h2>2. What we do</h2>
      <ul>
        <li>
          <strong>Semantic HTML</strong> — every page uses proper landmarks
          (<code>&lt;header&gt;</code>, <code>&lt;nav&gt;</code>,
          <code>&lt;main&gt;</code>, <code>&lt;footer&gt;</code>), heading
          hierarchy, and form labels.
        </li>
        <li>
          <strong>Color contrast</strong> — primary text, buttons, and focus
          states are verified against WCAG AA contrast ratios in both light
          and dark themes.
        </li>
        <li>
          <strong>Keyboard navigation</strong> — every interactive element is
          reachable and operable with Tab / Shift-Tab / Enter / Space / Esc.
          Focus indicators are visible and distinct.
        </li>
        <li>
          <strong>Alt text and ARIA</strong> — decorative images are marked
          <code>aria-hidden</code>; meaningful images have descriptive alt
          text; icons inside interactive elements have <code>aria-label</code>
          or accessible text.
        </li>
        <li>
          <strong>Form handling</strong> — labels are programmatically
          associated with inputs, required fields are announced, and
          validation errors are conveyed via <code>role="alert"</code>.
        </li>
        <li>
          <strong>Responsive layout</strong> — content reflows from 320 px
          mobile up to large desktop displays without horizontal scrolling
          or clipped content.
        </li>
        <li>
          <strong>Motion and animation</strong> — we respect
          <code>prefers-reduced-motion</code>; any decorative animation
          stops when the user's OS requests it.
        </li>
        <li>
          <strong>Dark mode</strong> — a full dark theme is available; color
          tokens are verified for AA contrast in both modes.
        </li>
      </ul>

      <h2>3. How we test</h2>
      <ul>
        <li>
          <strong>Automated:</strong> <code>@axe-core/playwright</code> runs
          against <code>/</code>, <code>/store</code>, <code>/blog</code>,
          <code>/support</code>, and <code>/book</code> on every major change.
          We fail the build on any <em>critical</em> or <em>serious</em> axe
          violation; we log and triage <em>moderate</em> and <em>minor</em>{" "}
          findings.
        </li>
        <li>
          <strong>Manual:</strong> every new page is keyboard-navigated
          before release. Screen-reader smoke tests use VoiceOver on
          macOS / iOS and NVDA on Windows for forms and dialogs.
        </li>
        <li>
          <strong>Browser matrix:</strong> Chromium (via Playwright),
          Safari (macOS + iOS), Firefox, Edge.
        </li>
      </ul>

      <h2>4. Known limitations</h2>
      <p>
        Honest list — these are on our backlog; the rest are periodically
        re-audited:
      </p>
      <ul>
        <li>
          Some Fluent UI components in the admin client portal
          (<Link to="/portal">/portal</Link>) have contrast that passes but
          doesn't always meet our internal tighter target; we're migrating
          the affected components.
        </li>
        <li>
          Embedded third-party content (Cal.com booking embed, Cloudflare
          Turnstile challenge, AdSense ad units when you opt in to marketing
          cookies, Vercel Live preview banner) comes from external providers
          whose accessibility we don't control. We turn off optional
          third-party components that don't meet AA.
        </li>
        <li>
          Blog-post MDX bodies are authored; if an author omits alt text on
          an inline image it would slip through lint. Every published post
          goes through an alt-text review before merge, but a gap is possible.
        </li>
      </ul>

      <h2>5. Reporting a barrier</h2>
      <p>
        If you encounter any difficulty using this site — or if you'd like
        specific content in an alternative format — please contact us:
      </p>
      <ul>
        <li>Email: <a href="mailto:hello@simpleitsrq.com">hello@simpleitsrq.com</a> (subject line: <em>Accessibility</em>)</li>
        <li>Phone: <a href="tel:+14072421456">(407) 242-1456</a></li>
        <li>Mailing address: Simple IT SRQ, Bradenton, Florida</li>
      </ul>
      <p>
        We aim to respond to accessibility feedback within <strong>two
        business days</strong> and to resolve confirmed issues within{" "}
        <strong>ten business days</strong>. Critical barriers (something
        blocks use of the site with assistive tech) jump the queue.
      </p>

      <h2>6. Formal conformance assessment</h2>
      <p>
        We have not engaged a third-party auditor for a formal VPAT / ACR at
        this time. If you need a formal statement for vendor onboarding,
        contact us and we'll prepare a self-assessment in the VPAT 2.4 format.
      </p>

      <h2>7. Enforcement procedures</h2>
      <p>
        If we can't resolve your concern directly, US visitors may file a
        complaint with the Department of Justice Civil Rights Division or
        a state attorney general; EU visitors may contact their local
        accessibility monitoring body under the European Accessibility Act.
      </p>
    </LegalShell>
  );
}
