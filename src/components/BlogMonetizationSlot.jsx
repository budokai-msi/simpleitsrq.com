import { ArrowRight, Search, Wrench } from "lucide-react";
import { Link } from "../lib/Link";
import AdUnit from "./AdSense";

const ADSENSE_ENABLED = import.meta.env.VITE_ADSENSE_ENABLED === "true";

function bannerKind(post, context = "") {
  const text = `${post?.title || ""} ${post?.category || ""} ${post?.tags?.join(" ") || ""} ${context}`.toLowerCase();
  if (/leadgen|lead generation|prospect|pipeline|crm|sales|marketing|customer acquisition|local business data/.test(text)) return "leadgen";
  return "service";
}

function HouseBanner({ post, context = "", placement = "mid" }) {
  const kind = bannerKind(post, context);
  if (kind === "leadgen") {
    return (
      <aside className={`blog-house-banner is-leadgen is-${placement}`} aria-label="Leadgen">
        <div className="blog-house-banner__icon"><Search size={20} /></div>
        <div className="blog-house-banner__copy">
          <span>Simple IT SRQ · Leadgen</span>
          <strong>Research a local market before you build the list.</strong>
          <p>Scan a ZIP code and industry, compare business signals, enrich the records you choose, and export a cleaner prospect list.</p>
        </div>
        <Link className="btn btn-primary btn-sm" to="/leadgen">Try Leadgen <ArrowRight size={14} /></Link>
      </aside>
    );
  }

  return (
    <aside className={`blog-house-banner is-service is-${placement}`} aria-label="Computer repair and business IT">
      <div className="blog-house-banner__icon"><Wrench size={20} /></div>
      <div className="blog-house-banner__copy">
        <span>Simple IT SRQ · Sarasota & Bradenton</span>
        <strong>Have the same problem in your office?</strong>
        <p>We handle computer diagnostics, workstation repair, Wi-Fi and network troubleshooting, Microsoft 365 issues, and ongoing business IT.</p>
      </div>
      <Link className="btn btn-primary btn-sm" to="/services">See IT services <ArrowRight size={14} /></Link>
    </aside>
  );
}

export default function BlogMonetizationSlot({ post, context = "", slot, format = "auto", className = "", placement = "mid" }) {
  if (ADSENSE_ENABLED && slot) {
    return <AdUnit slot={slot} format={format} className={className} />;
  }
  return <HouseBanner post={post} context={context} placement={placement} />;
}
