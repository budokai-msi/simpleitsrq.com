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

  // === Amazon hardware picks - per-ASIN, ASIN passed by the caller ===
  // Hardware picks are passed inline as [[amazon:ASIN|label]] in markdown
  // and resolved at render time, so we expose the constructor instead.
  amazon: AMAZON_TAG ? amazonProduct : null,
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

  return AFFILIATES[token] || null;
}

// Test whether a piece of markdown contains any [[affiliate:...]] tokens.
// Used to drive the disclosure banner.
const TOKEN_RE = /\[\[(amazon:[^\]]+|gusto|onepassword|honeybook|acronis)\]\]/g;

export function postHasAffiliateContent(markdown) {
  if (!markdown) return false;
  return TOKEN_RE.test(markdown);
}
