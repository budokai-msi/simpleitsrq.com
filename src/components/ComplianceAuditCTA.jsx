import { FileCheck, ArrowRight } from "lucide-react";
import { Link } from "../lib/Link";
import { trackAffiliateClick } from "../lib/trackClick";

// Generic partner URL at module scope so Vite can tree-shake the affiliate
// branch when the env var isn't set at build time. Per-audit-type URLs
// aren't consulted here — that routing lives on the landing page so the
// CTA can carry one stable destination.
const PARTNER_URL = import.meta.env.VITE_AUDIT_PARTNER_URL || "";
const PARTNER_NAME =
  import.meta.env.VITE_AUDIT_PARTNER_NAME || "our audit partner";

/**
 * Auto-injected at the bottom of blog posts covering SOC 2, HIPAA, PCI,
 * or FTC Safeguards topics. Mirror of CyberInsuranceCTA — when the env
 * var is set, clicks go to the partner via a tracked referral link ($500-
 * $2,000 per engagement). Otherwise, clicks route to the internal
 * /compliance-audit-referral page where the lead-capture form emails
 * hello@simpleitsrq.com.
 *
 * The caller optionally passes `audit` ("SOC 2" | "HIPAA" | "PCI" | "FTC
 * Safeguards") so the destination page can pre-select the audit-type
 * field for the reader.
 */
export default function ComplianceAuditCTA({ slug = null, audit = null, variant = "full" }) {
  const partnerLive = Boolean(PARTNER_URL);
  const internalHref = audit
    ? `/compliance-audit-referral?audit=${encodeURIComponent(audit)}`
    : "/compliance-audit-referral";
  const href = partnerLive ? PARTNER_URL : internalHref;

  const handleClick = () => {
    if (!partnerLive) return;
    trackAffiliateClick({
      slug,
      destination: PARTNER_URL,
      label: audit ? `compliance-audit-${audit.toLowerCase()}` : "compliance-audit",
      network: PARTNER_NAME,
    });
  };

  const Button = partnerLive ? "a" : Link;
  const buttonProps = partnerLive
    ? { href, target: "_blank", rel: "sponsored noopener noreferrer", onClick: handleClick }
    : { to: href };

  const ctaLabel = audit
    ? `Get a ${audit} audit quote`
    : "Get a compliance-audit quote";

  if (variant === "inline") {
    return (
      <div className="audit-cta audit-cta--inline">
        <FileCheck size={16} />
        <span>Audit on the calendar?</span>
        <Button className="audit-cta__btn" {...buttonProps}>
          {ctaLabel} <ArrowRight size={14} />
        </Button>
      </div>
    );
  }

  return (
    <aside
      className="audit-cta audit-cta--full"
      aria-labelledby="audit-cta-heading"
    >
      <div className="audit-cta__icon" aria-hidden="true">
        <FileCheck size={28} />
      </div>
      <div className="audit-cta__body">
        <h3 id="audit-cta-heading" className="audit-cta__title">
          {audit ? `Need a ${audit} audit in 2026?` : "Compliance audit on the horizon?"}
        </h3>
        <p className="audit-cta__desc">
          Most Florida small offices go through a SOC 2, HIPAA, PCI, or FTC
          Safeguards audit every 12-24 months. Picking the right firm on
          the first try saves weeks of re-work. We'll intro you to a firm
          that audits Florida small businesses every week — free, no
          obligation.
        </p>
        <Button
          className="btn btn-primary audit-cta__btn"
          {...buttonProps}
        >
          {ctaLabel} <ArrowRight size={16} />
        </Button>
        {partnerLive && (
          <p className="audit-cta__disclosure">
            Referral link — Simple IT SRQ earns a fee when an engagement
            starts through {PARTNER_NAME}. The audit fee is unchanged
            either way.
          </p>
        )}
      </div>
    </aside>
  );
}
