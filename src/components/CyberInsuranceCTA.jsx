import { ShieldCheck, ArrowRight } from "lucide-react";
import { Link } from "../lib/Link";
import { trackAffiliateClick } from "../lib/trackClick";

// Partner link is read at module scope so Vite can tree-shake the affiliate
// branch when the env var isn't set at build time.
const PARTNER_URL = import.meta.env.VITE_CYBER_INSURANCE_PARTNER_URL || "";
const PARTNER_NAME =
  import.meta.env.VITE_CYBER_INSURANCE_PARTNER_NAME || "our insurance partner";

/**
 * Auto-injected below every blog post about cyber insurance, and rendered
 * on product pages that touch insurance themes (Evidence Binder, Answer Kit,
 * WISP, HIPAA Starter Kit). Two behaviors:
 *   - If VITE_CYBER_INSURANCE_PARTNER_URL is set, clicks go to the broker
 *     via a tracked affiliate link ($300-$2,000 per bound policy).
 *   - Otherwise, clicks route to the internal /cyber-insurance-quote page
 *     where a lead-capture form emails hello@simpleitsrq.com.
 *
 * The caller optionally passes `slug` so the tracking beacon can attribute
 * conversions back to the referring post — used by the ProfitDashboard
 * revenue-per-post breakdown.
 */
export default function CyberInsuranceCTA({ slug = null, variant = "full" }) {
  const partnerLive = Boolean(PARTNER_URL);
  const href = partnerLive ? PARTNER_URL : "/cyber-insurance-quote";

  const handleClick = () => {
    if (!partnerLive) return; // internal nav, no affiliate beacon
    trackAffiliateClick({
      slug,
      destination: PARTNER_URL,
      label: "cyber-insurance-quote",
      network: PARTNER_NAME,
    });
  };

  const Button = partnerLive ? "a" : Link;
  const buttonProps = partnerLive
    ? { href, target: "_blank", rel: "sponsored noopener noreferrer", onClick: handleClick }
    : { to: href };

  if (variant === "inline") {
    return (
      <div className="cyber-ins-cta cyber-ins-cta--inline">
        <ShieldCheck size={16} />
        <span>Renewal coming up?</span>
        <Button className="cyber-ins-cta__btn" {...buttonProps}>
          Get a free quote <ArrowRight size={14} />
        </Button>
      </div>
    );
  }

  return (
    <aside
      className="cyber-ins-cta cyber-ins-cta--full"
      aria-labelledby="cyber-ins-cta-heading"
    >
      <div className="cyber-ins-cta__icon" aria-hidden="true">
        <ShieldCheck size={28} />
      </div>
      <div className="cyber-ins-cta__body">
        <h3 id="cyber-ins-cta-heading" className="cyber-ins-cta__title">
          Cyber-insurance renewal in the next 120 days?
        </h3>
        <p className="cyber-ins-cta__desc">
          2026 premiums are up double-digits for offices that can't show
          written controls. We'll connect you with a broker who quotes
          Florida small businesses every day — no obligation, no cost to
          compare. Takes five minutes.
        </p>
        <Button
          className="btn btn-primary cyber-ins-cta__btn"
          {...buttonProps}
        >
          Get my free quote <ArrowRight size={16} />
        </Button>
        {partnerLive && (
          <p className="cyber-ins-cta__disclosure">
            Referral link — Simple IT SRQ earns a fee when a policy binds
            through {PARTNER_NAME}. You pay the same either way.
          </p>
        )}
      </div>
    </aside>
  );
}
