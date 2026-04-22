// Central affiliate registry. Each entry maps a stable internal key (used in
// blog post markdown via the [[affiliate:key]] shortcode) to the actual
// outbound URL, vendor name, and a one-line "what it is" hook.
//
// Tracking IDs come from Vite-prefixed env vars so they can be rotated in
// Vercel without a code change. Adding a new program is two steps:
//   1. Add VITE_AFF_<NAME> in Vercel env (Production + Development).
//   2. Add an entry to the AFFILIATES map below referencing the env var.
//
// FTC compliance: any post that renders an affiliate link gets an automatic
// disclosure banner via BlogPost.jsx. Do not bypass it.

const env = import.meta.env;

const AMAZON_TAG  = env.VITE_AFF_AMAZON_TAG  || "";
const GUSTO_REF   = env.VITE_AFF_GUSTO_REF   || "";
const ONEPW_REF   = env.VITE_AFF_1PASSWORD_REF || "";
const HONEY_REF   = env.VITE_AFF_HONEYBOOK_REF || "";
const ACRONIS_REF = env.VITE_AFF_ACRONIS_REF || "";

// Cyber-insurance broker referral partner (Coalition / Cowbell / At-Bay /
// Resilience). Typical per-bound-policy payout is $300-$2,000. The
// CyberInsuranceCTA component also reads VITE_CYBER_INSURANCE_PARTNER_NAME
// for display.
const CYBER_INS_REF = env.VITE_CYBER_INSURANCE_PARTNER_URL || "";
const CYBER_INS_NAME = env.VITE_CYBER_INSURANCE_PARTNER_NAME || "our insurance partner";

// Compliance-audit referral partners — SOC 2, HIPAA, PCI, FTC Safeguards.
// Typical per-referred-engagement payout is $500-$2,000. Per-type env vars
// so different specialists can be plugged in for each audit class. Generic
// VITE_AUDIT_PARTNER_URL is the fallback used when no type-specific URL is
// configured. ComplianceAuditCTA reads VITE_AUDIT_PARTNER_NAME for display.
const AUDIT_REF = env.VITE_AUDIT_PARTNER_URL || "";
const AUDIT_NAME = env.VITE_AUDIT_PARTNER_NAME || "our audit partner";

// Builder for an Amazon product link with the affiliate tag appended. Pass
// the product ASIN (the 10-char code in any Amazon URL) - the rest is
// constructed locally so we never depend on a specific Amazon URL format.
function amazonProduct(asin, label) {
  if (!AMAZON_TAG) return null;
  return {
    vendor: "Amazon",
    label,
    href: `https://www.amazon.com/dp/${asin}/?tag=${encodeURIComponent(AMAZON_TAG)}`,
    blurb: "Affiliate link - we earn a small commission if you buy through it.",
  };
}

// Builder for an Amazon search link with the affiliate tag appended. Use when
// recommending a category ("business-grade UPS") rather than a single SKU -
// links to a curated search instead of gambling on one ASIN that may go out
// of stock.
function amazonSearch(query, label) {
  if (!AMAZON_TAG) return null;
  return {
    vendor: "Amazon",
    label,
    href: `https://www.amazon.com/s?k=${encodeURIComponent(query)}&tag=${encodeURIComponent(AMAZON_TAG)}`,
    blurb: "Affiliate search link - we earn a small commission on qualifying purchases.",
  };
}

export const AFFILIATES = {
  // === Gusto referral - flat $200 per signup that runs first payroll ===
  gusto: GUSTO_REF
    ? {
        vendor: "Gusto",
        label: "Gusto Payroll for small business",
        href: GUSTO_REF,
        blurb: "Referral link - we get a thank-you bonus when you start payroll with them.",
      }
    : null,

  // === 1Password Business - 20-30% first year via PartnerStack ===
  onepassword: ONEPW_REF
    ? {
        vendor: "1Password",
        label: "1Password Business",
        href: ONEPW_REF,
        blurb: "Affiliate link - we earn a referral fee on new Business signups.",
      }
    : null,

  // === HoneyBook - $50-300 per signup, fits service-business clients ===
  honeybook: HONEY_REF
    ? {
        vendor: "HoneyBook",
        label: "HoneyBook for service businesses",
        href: HONEY_REF,
        blurb: "Referral link - we earn a small fee on new HoneyBook signups.",
      }
    : null,

  // === Acronis Cyber Protect - 15-25% recurring on backup customers ===
  acronis: ACRONIS_REF
    ? {
        vendor: "Acronis",
        label: "Acronis Cyber Protect",
        href: ACRONIS_REF,
        blurb: "Partner link - we earn ongoing commission on Cyber Protect signups.",
      }
    : null,

  // === Cyber-insurance broker - $300-$2,000 per bound policy ===
  // Only resolves to an affiliate once a partner URL is set. Without the
  // env var, [[cyber-insurance]] tokens render as plain-text "cyber
  // insurance" and the dedicated CyberInsuranceCTA component falls back
  // to the internal /cyber-insurance-quote lead-capture form.
  "cyber-insurance": CYBER_INS_REF
    ? {
        vendor: CYBER_INS_NAME,
        label: "Get a cyber-insurance quote",
        href: CYBER_INS_REF,
        blurb: `Referral link — we earn a fee when a policy binds through ${CYBER_INS_NAME}.`,
      }
    : null,

  // === Compliance audit referral - $500-$2,000 per referred engagement ===
  // SOC 2, HIPAA, PCI, FTC Safeguards. [[compliance-audit]] shortcode in
  // blog bodies resolves once a partner URL is set; otherwise degrades to
  // plain text and the ComplianceAuditCTA component falls back to the
  // internal /compliance-audit-referral lead form.
  "compliance-audit": AUDIT_REF
    ? {
        vendor: AUDIT_NAME,
        label: "Get a compliance-audit quote",
        href: AUDIT_REF,
        blurb: `Referral link — we earn a fee when an engagement starts through ${AUDIT_NAME}.`,
      }
    : null,

  // === Amazon hardware picks - per-ASIN, ASIN passed by the caller ===
  // Hardware picks are passed inline as [[amazon:ASIN|label]] in markdown
  // and resolved at render time, so we expose the constructor instead.
  amazon: AMAZON_TAG ? amazonProduct : null,

  // === Amazon category search - [[amazon_search:query|label]] in markdown ===
  // Better than a specific ASIN when recommending a category. Won't 404 if
  // the product goes OOS.
  amazon_search: AMAZON_TAG ? amazonSearch : null,
};

// True if at least one affiliate is configured. Used by BlogPost to decide
// whether to render the disclosure banner at all.
export const HAS_AFFILIATES = Object.values(AFFILIATES).some(Boolean);

// Resolve a string token like "gusto", "onepassword", or
// "amazon:B08N5WRWNW|Anker USB-C hub" into a {vendor, label, href, blurb}
// object - or null if the underlying program is not configured.
export function resolveAffiliate(token) {
  if (!token || typeof token !== "string") return null;

  // Amazon takes "amazon:ASIN|optional label"
  if (token.startsWith("amazon:")) {
    const rest = token.slice("amazon:".length);
    const [asin, label] = rest.split("|");
    if (typeof AFFILIATES.amazon !== "function") return null;
    return AFFILIATES.amazon(asin.trim(), (label || asin).trim());
  }

  // Amazon search takes "amazon_search:query|label"
  if (token.startsWith("amazon_search:")) {
    const rest = token.slice("amazon_search:".length);
    const [query, label] = rest.split("|");
    if (typeof AFFILIATES.amazon_search !== "function") return null;
    return AFFILIATES.amazon_search(query.trim(), (label || query).trim());
  }

  return AFFILIATES[token] || null;
}

// Test whether a piece of markdown contains any [[affiliate:...]] tokens.
// Used to drive the disclosure banner. Built dynamically from AFFILIATES keys
// so new programs get disclosure automatically.
const simpleKeys = Object.keys(AFFILIATES)
  .filter((k) => typeof AFFILIATES[k] !== "function" && k !== "amazon" && k !== "amazon_search")
  .join("|");
const TOKEN_RE = new RegExp(
  `\\[\\[(amazon:[^\\]]+|amazon_search:[^\\]]+${simpleKeys ? "|" + simpleKeys : ""})\\]\\]`,
  "g",
);

export function postHasAffiliateContent(markdown) {
  if (!markdown || typeof markdown !== "string") return false;
  // Reset lastIndex — the module-scope RegExp with /g flag otherwise
  // carries state across calls, yielding stale "no match" verdicts on
  // the second invocation with the same content.
  TOKEN_RE.lastIndex = 0;
  return TOKEN_RE.test(markdown);
}
