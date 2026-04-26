import { Link } from "../lib/Link";
import { ArrowRight, FileText } from "lucide-react";
import { products } from "../data/products";

// Category → preferred product slug. Maps each blog category to the
// playbook that's most likely to convert for a reader of that category.
// When there's no good match we fall back to the top-seller picked below.
const CATEGORY_TO_PRODUCT = {
  "Cybersecurity": "wisp-template",
  "Compliance": "hipaa-starter-kit",
  "Cloud": "saas-incident-response-playbook",
  "Privacy": "compliance-library",
  "Business Tech": "it-budget-calendar",
  "Industry News": "cyber-insurance-answers",
  "AI & Productivity": "onboarding-runbook",
};

// Fallback when the category has no explicit mapping. Picked for
// broad appeal + mid-range price.
const FALLBACK_SLUG = "cyber-insurance-answers";

function pickProduct(postCategory) {
  const slug = CATEGORY_TO_PRODUCT[postCategory] || FALLBACK_SLUG;
  return products.find((p) => p.slug === slug) || products[0];
}

export default function StoreCrossSell({ post }) {
  const product = pickProduct(post?.category);
  if (!product) return null;
  const priceLabel = product.priceSuffix
    ? `$${product.price}${product.priceSuffix}`
    : `$${product.price}`;
  return (
    <aside className="store-cross-sell" aria-label="Related playbook">
      <div className="store-cross-sell-badge">
        <FileText size={14} />
        <span>Playbook</span>
      </div>
      <div className="store-cross-sell-body">
        <h3 className="store-cross-sell-title">{product.title}</h3>
        <p className="store-cross-sell-tagline">{product.tagline}</p>
      </div>
      <div className="store-cross-sell-cta">
        <div className="store-cross-sell-price">{priceLabel}</div>
        <Link
          to={`/store/${product.slug}`}
          className="btn btn-primary store-cross-sell-btn"
        >
          See it <ArrowRight size={14} />
        </Link>
      </div>
    </aside>
  );
}
