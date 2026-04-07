import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useSEO } from "../lib/seo";

const LAST_UPDATED = "April 6, 2026";

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
          </div>
          <div className="blog-post-content">
            {children}
          </div>
        </div>
      </article>
    </main>
  );
}

export function PrivacyPage() {
  useSEO({
    title: "Privacy Policy | Simple IT SRQ",
    description: "How Simple IT SRQ collects, uses, and protects information from visitors and clients in Sarasota, Bradenton, and the SRQ region.",
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
      lede="Simple IT SRQ is committed to protecting the privacy of every visitor, client, and prospective client. This policy explains what we collect, why we collect it, and how we keep it safe."
    >
      <h2>Information We Collect</h2>
      <p>
        When you visit simpleitsrq.com or contact us, we may collect information you
        provide directly - your name, email address, phone number, company name, and
        any details you include in a message or form submission. We also collect
        standard server log data such as IP address, browser type, referring page, and
        timestamps for security and troubleshooting.
      </p>
      <p>
        For active managed-services clients, we additionally process technical
        telemetry from endpoints, servers, and network devices we manage on your
        behalf. The exact data is governed by your signed Master Services Agreement.
      </p>

      <h2>How We Use Information</h2>
      <ul>
        <li>To respond to inquiries, schedule consultations, and send proposals.</li>
        <li>To deliver and support contracted IT, security, and cloud services.</li>
        <li>To meet legal, regulatory, and cyber-insurance documentation requirements.</li>
        <li>To improve the security, reliability, and content of our website.</li>
      </ul>
      <p>
        We do not sell personal information. We do not rent or trade contact lists. We
        do not use the data of one client to benefit another.
      </p>

      <h2>Cookies and Analytics</h2>
      <p>
        Our website uses a minimal set of first-party cookies required for navigation
        and basic analytics. We do not use third-party advertising cookies or
        cross-site trackers. You can disable cookies in your browser settings without
        losing access to the site.
      </p>

      <h2>How We Protect Information</h2>
      <p>
        Simple IT SRQ practices what we sell. Internal systems use multi-factor
        authentication, endpoint detection and response, encrypted backups, and
        least-privilege access controls. Client systems we manage are protected with
        the same standards documented in our HIPAA and cyber-insurance playbooks.
      </p>

      <h2>Your Rights</h2>
      <p>
        You can request a copy of the personal information we hold about you, ask us
        to correct it, or ask us to delete it - subject to any legal or contractual
        record-keeping obligations. To make a request, email
        <a href="mailto:hello@simpleitsrq.com"> hello@simpleitsrq.com</a> with the
        subject line "Privacy Request." We respond within 30 days.
      </p>

      <h2>Data Retention</h2>
      <p>
        Inquiry messages are retained for up to 24 months. Client records are retained
        for the duration of the engagement plus seven years, or longer where required
        by law (for example, HIPAA documentation for medical clients).
      </p>

      <h2>Children</h2>
      <p>
        Our services are not directed to children under 13, and we do not knowingly
        collect personal information from children.
      </p>

      <h2>Changes to This Policy</h2>
      <p>
        We may update this policy as our practices, services, or legal obligations
        change. The "last updated" date at the top of this page reflects the most
        recent revision. Material changes will be highlighted on our home page for at
        least 14 days.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy? Email
        <a href="mailto:hello@simpleitsrq.com"> hello@simpleitsrq.com</a>.
        Mailing address: Simple IT SRQ, Bradenton, Florida.
      </p>
    </LegalShell>
  );
}

export function TermsPage() {
  useSEO({
    title: "Terms of Service | Simple IT SRQ",
    description: "Terms of service governing the use of simpleitsrq.com and the marketing content provided by Simple IT SRQ.",
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
      lede="These terms govern your use of simpleitsrq.com and the public content we publish. Paid managed-services engagements are governed separately by a signed Master Services Agreement."
    >
      <h2>Acceptance of Terms</h2>
      <p>
        By accessing or using simpleitsrq.com you agree to these terms. If you do not
        agree, please do not use the site. We may update these terms at any time and
        the revised version takes effect when posted.
      </p>

      <h2>Use of the Website</h2>
      <p>
        You may view, share, and link to public pages for personal, educational, and
        non-commercial business research. You may not scrape, mirror, or
        systematically harvest content. You may not attempt to disrupt the site,
        bypass security controls, or access data you are not authorized to access.
      </p>

      <h2>Intellectual Property</h2>
      <p>
        All content, code, images, and trademarks on this site are the property of
        Simple IT SRQ or used with permission. You may quote a reasonable excerpt of a
        blog post with attribution and a link back to the original page.
      </p>

      <h2>No Professional Advice</h2>
      <p>
        Articles published on this site are for general information only. They are
        not legal, accounting, compliance, or engineering advice for your specific
        environment. Always validate recommendations with a qualified professional
        before applying them in production. A signed engagement is required before
        Simple IT SRQ provides binding technical or compliance guidance.
      </p>

      <h2>Third-Party Links</h2>
      <p>
        We sometimes link to articles, vendors, and tools we find useful. We do not
        control those sites and are not responsible for their content, security, or
        privacy practices.
      </p>

      <h2>Disclaimers</h2>
      <p>
        The site is provided "as is" without warranties of any kind, express or
        implied. We do not warrant that the site will be uninterrupted, secure, or
        error-free, or that any information is current or accurate at the moment you
        view it.
      </p>

      <h2>Limitation of Liability</h2>
      <p>
        To the fullest extent permitted by Florida law, Simple IT SRQ is not liable
        for indirect, incidental, special, consequential, or punitive damages arising
        from your use of the site. Total liability for any claim related to the site
        is limited to one hundred US dollars.
      </p>

      <h2>Governing Law</h2>
      <p>
        These terms are governed by the laws of the State of Florida, without regard
        to conflict-of-law principles. Disputes will be resolved in the state or
        federal courts located in Manatee County, Florida.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms? Email
        <a href="mailto:hello@simpleitsrq.com"> hello@simpleitsrq.com</a>.
      </p>
    </LegalShell>
  );
}

export function AccessibilityPage() {
  useSEO({
    title: "Accessibility Statement | Simple IT SRQ",
    description: "Simple IT SRQ is committed to keeping simpleitsrq.com usable for everyone, including visitors who rely on assistive technology.",
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
      lede="Simple IT SRQ is committed to making simpleitsrq.com usable for everyone, including visitors who rely on screen readers, keyboard navigation, or other assistive technology."
    >
      <h2>Our Commitment</h2>
      <p>
        We design and build this site to align with the
        <a href="https://www.w3.org/TR/WCAG22/" target="_blank" rel="noopener noreferrer"> Web Content Accessibility Guidelines (WCAG) 2.2 Level AA</a>.
        Accessibility is treated as a baseline requirement, not an afterthought.
      </p>

      <h2>What We Do</h2>
      <ul>
        <li>Semantic HTML structure with clear headings, landmarks, and form labels.</li>
        <li>Color contrast targeted at WCAG AA on every primary text and button surface.</li>
        <li>Keyboard navigation for every interactive element, with visible focus states.</li>
        <li>Descriptive alt text and ARIA labels for icons, images, and decorative elements.</li>
        <li>Responsive layouts that scale cleanly from mobile to large desktop displays.</li>
        <li>Forms that announce required fields and validation errors to assistive technology.</li>
      </ul>

      <h2>Known Limitations</h2>
      <p>
        Despite our best efforts, some content may not yet be fully accessible. If you
        find a barrier, please let us know so we can fix it. We treat accessibility
        defects with the same priority as security defects.
      </p>

      <h2>Feedback</h2>
      <p>
        If you encounter any difficulty using this site, or if you would like content
        in an alternative format, please contact us:
      </p>
      <ul>
        <li>Email: <a href="mailto:hello@simpleitsrq.com">hello@simpleitsrq.com</a></li>
      </ul>
      <p>
        We aim to respond to accessibility feedback within two business days and to
        resolve confirmed issues within ten business days.
      </p>
    </LegalShell>
  );
}
