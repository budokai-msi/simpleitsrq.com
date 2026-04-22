// The Simple IT SRQ tech stack. Categorized list of every tool we install
// or recommend for Florida small businesses. Rendered on /stack as the
// passive-income hub — each item resolves through src/data/affiliates.js
// when the corresponding VITE_AFF_* env var is set in Vercel, and
// degrades to a plain-text entry (no link) when it isn't.
//
// Adding a new tool: append to the right category. Don't invent a new
// category without thinking about whether readers will actually browse by
// it. Eight top-level categories is about the ceiling before the page
// becomes a directory instead of a curated list.

import { resolveAffiliate } from "./affiliates";

/**
 * @typedef {Object} StackTool
 * @property {string} id              Internal key — stable, used in URL
 *                                    anchors and analytics.
 * @property {string} name            Human-readable vendor + product.
 * @property {string} tagline         One-line description of what it is.
 * @property {string} whyThis         The sentence explaining why we picked
 *                                    it over alternatives — specific to
 *                                    Florida small businesses where
 *                                    possible.
 * @property {string} [tier]          Recommended tier (e.g. "Business
 *                                    Premium, not Basic"). Optional.
 * @property {string} [priceHint]     Ballpark price (e.g. "$8/user/mo").
 *                                    Optional.
 * @property {string} [affiliateKey]  Token consumed by resolveAffiliate()
 *                                    — when the corresponding env var is
 *                                    unset, the link degrades to plain
 *                                    text.
 * @property {string} [fallbackUrl]   Vendor homepage used when no
 *                                    affiliate is configured. Still gets
 *                                    the user there, just without a
 *                                    referral fee attached.
 * @property {string[]} [alternatives] Cheaper / different-trade-off picks
 *                                    we considered and rejected (or
 *                                    accept as second choice).
 * @property {string} [goodFor]       Audience slice this is especially
 *                                    good for (e.g. "HIPAA-covered
 *                                    dental/medical").
 */

/**
 * @typedef {Object} StackCategory
 * @property {string} id
 * @property {string} title
 * @property {string} intro           One-paragraph preamble explaining
 *                                    why this category matters for
 *                                    Florida SMBs.
 * @property {StackTool[]} tools
 */

/** @type {StackCategory[]} */
export const STACK = [
  {
    id: "productivity-suite",
    title: "Email + Productivity Suite",
    intro:
      "Your email, shared drive, Teams/Meet, and calendar all live here. Get the tier right the first time — the cheaper tiers fail a HIPAA audit and get a premium bump on cyber-insurance renewal.",
    tools: [
      {
        id: "m365-business-premium",
        name: "Microsoft 365 Business Premium",
        tagline: "Email, Word/Excel/Teams, OneDrive, and the security controls your insurer actually wants.",
        whyThis:
          "Business Premium is the smallest tier that meets cyber-insurance Audit Controls §164.312(b) and HIPAA technical safeguards. Business Basic and Standard fail both. For offices under 10 people the tier math usually works out to $22/user/mo instead of $12 — but the insurance rate savings on a single policy pay for five years of the delta.",
        tier: "Business Premium (not Basic or Standard)",
        priceHint: "$22/user/mo",
        fallbackUrl: "https://www.microsoft.com/en-us/microsoft-365/business/microsoft-365-business-premium",
        alternatives: ["Google Workspace Business Plus"],
        goodFor: "Almost every Florida small office. Default choice.",
      },
      {
        id: "google-workspace",
        name: "Google Workspace Business Plus",
        tagline: "Same deal as M365 Business Premium, on the Google side.",
        whyThis:
          "Business Plus is the smallest Google Workspace tier with Vault, eDiscovery, and advanced endpoint management — the three features a HIPAA audit or cyber-insurance renewal will ask about. Starter and Standard tiers won't pass.",
        tier: "Business Plus (not Starter or Standard)",
        priceHint: "$22/user/mo",
        fallbackUrl: "https://workspace.google.com/pricing.html",
        alternatives: ["Microsoft 365 Business Premium"],
        goodFor: "Offices already committed to Gmail + Google Drive.",
      },
    ],
  },
  {
    id: "password-manager",
    title: "Password Manager",
    intro:
      "Every 2026 cyber-insurance questionnaire asks if staff use a password manager. The wrong answer raises premiums more than the annual license cost. Pick one, roll it out company-wide, and keep it to one.",
    tools: [
      {
        id: "1password-business",
        name: "1Password Business",
        tagline: "Deploys in an afternoon; the UX is good enough that staff actually use it.",
        whyThis:
          "The single biggest rollout failure we see is staff abandoning the password manager because its UX is clumsy. 1Password's browser + mobile experience is the one where that doesn't happen. Business tier adds directory sync with M365/Google Workspace so onboarding/offboarding is one check-box.",
        tier: "Business (not Teams Starter)",
        priceHint: "$7.99/user/mo",
        affiliateKey: "onepassword",
        fallbackUrl: "https://1password.com/business",
        alternatives: ["Bitwarden Business (cheaper; less polish)", "Dashlane Business"],
        goodFor: "Any office 5+ people. Non-negotiable for HIPAA or cyber-insurance.",
      },
    ],
  },
  {
    id: "backup-disaster-recovery",
    title: "Backup + Disaster Recovery",
    intro:
      "Hurricanes, ransomware, and human error — three ways your data can disappear in one afternoon. A 2026 cyber-insurance renewal asks if you've tested a restore in the last 12 months. Having backups isn't enough; having tested backups is.",
    tools: [
      {
        id: "acronis-cyber-protect",
        name: "Acronis Cyber Protect",
        tagline: "Integrated backup + anti-ransomware + endpoint protection in one agent.",
        whyThis:
          "For 5-50 person Florida offices, the friction of running Veeam + SentinelOne + a separate DR tool exceeds what Acronis does in one install. Hurricane season is the forcing function — we've restored client data from Acronis cloud backups three times post-storm while other tools were still syncing. Their 30-day retention default is where most small offices should start.",
        priceHint: "$80–$200/month per 10 devices",
        affiliateKey: "acronis",
        fallbackUrl: "https://www.acronis.com/en-us/business/cyber-protect/",
        alternatives: ["Datto (more MSP-oriented)", "Veeam (stronger for VMware)"],
        goodFor: "Any office with on-prem file servers, medical imaging, or accounting data.",
      },
    ],
  },
  {
    id: "payroll-hr",
    title: "Payroll + HR",
    intro:
      "Not strictly IT, but the system that handles your W-2s and direct deposits is a critical vendor from a security posture standpoint. If it lacks SOC 2 Type II and a real BAA, it's a gap on your cyber-insurance questionnaire.",
    tools: [
      {
        id: "gusto",
        name: "Gusto Payroll",
        tagline: "Payroll + benefits + W-2/1099 that a non-accountant can actually run.",
        whyThis:
          "Gusto's SOC 2 Type II coverage, BAA availability, and built-in I-9/W-4 e-signing are the specific boxes on a 2026 cyber-insurance form that say 'yes, we have a compliant payroll provider.' Their Florida-specific unemployment filing is automatic, which is the exact place where we've seen other payroll tools mis-file and cost offices money.",
        tier: "Plus (not Core) for multi-state or R&D tax credits",
        priceHint: "$40/mo base + $6/person",
        affiliateKey: "gusto",
        fallbackUrl: "https://gusto.com/",
        alternatives: ["Rippling (more HR features, higher price)", "ADP RUN (traditional)"],
        goodFor: "Florida small offices 1-50 people.",
      },
    ],
  },
  {
    id: "crm-client-ops",
    title: "CRM + Client Operations",
    intro:
      "For service businesses (dentists, lawyers, designers, photographers, contractors), the CRM is the system clients actually see. It's also a top breach vector because it stores contracts, signatures, and payment info.",
    tools: [
      {
        id: "honeybook",
        name: "HoneyBook",
        tagline: "CRM + proposals + contracts + invoicing + scheduling for service businesses.",
        whyThis:
          "HoneyBook consolidates five tools (Typeform + DocuSign + QuickBooks + Calendly + Zapier) into one UI for businesses under $2M revenue. SOC 2 Type II, explicit data residency options, and native e-signing mean it passes the cyber-insurance vendor-risk questionnaire without a BAA addendum. Their Stripe integration also means fewer vendors handling payment data.",
        priceHint: "$39–$79/user/mo",
        affiliateKey: "honeybook",
        fallbackUrl: "https://www.honeybook.com/",
        alternatives: ["Dubsado (similar), 17hats (lighter), Clio (law firms)"],
        goodFor: "Photographers, designers, event planners, coaches, consultants. Not for law firms (use Clio).",
      },
    ],
  },
  {
    id: "hardware-mfa",
    title: "Hardware MFA Keys",
    intro:
      "2026 cyber insurance no longer accepts SMS codes as MFA. The authenticator-app route works but breaks when staff change phones. Hardware keys are the only path that survives an IT turnover cleanly.",
    tools: [
      {
        id: "yubikey-5c-nfc",
        name: "YubiKey 5C NFC",
        tagline: "USB-C + NFC hardware key that works with every mainstream IdP.",
        whyThis:
          "The 5C NFC is the single SKU that covers every laptop (USB-C), every phone (NFC tap), and every cloud admin console (WebAuthn). We issue two per employee — one for the desk and one for the person — so a lost key isn't a lockout event. The $55 per employee is roughly what a Florida office pays for one hour of downtime.",
        priceHint: "$55/key (buy 2 per person)",
        affiliateKey: "amazon:B07HBD71HL|YubiKey 5C NFC",
        fallbackUrl: "https://www.yubico.com/product/yubikey-5c-nfc/",
        alternatives: ["Google Titan key", "YubiKey 5 NFC (USB-A) for older machines"],
        goodFor: "Every admin on every account. Non-negotiable for cyber-insurance Tier A posture.",
      },
    ],
  },
  {
    id: "power-protection",
    title: "Power Protection",
    intro:
      "Florida Gulf Coast offices lose power multiple times a year between summer storms, grid maintenance, and hurricanes. A business-grade UPS is the difference between 'power blinked, rebooted the office' and 'power blinked, corrupted a SQL database we then spent a weekend restoring.'",
    tools: [
      {
        id: "business-grade-ups",
        name: "Business-grade Line-Interactive UPS",
        tagline: "Keeps the server, switch, and phone system alive long enough to shut down cleanly.",
        whyThis:
          "Consumer UPS units from big-box stores handle 5-8 minutes and then cut power without warning. Business-grade Line-Interactive units hold 15-30 minutes and signal the server to initiate a graceful shutdown. We standardize on CyberPower or APC for the exact product slot — both have next-business-day replacement programs that matter post-storm.",
        priceHint: "$180–$400/unit",
        affiliateKey: "amazon_search:business grade UPS cyberpower apc 1500va|Business-grade UPS (CyberPower / APC, 1500VA+)",
        fallbackUrl: "https://www.amazon.com/s?k=business+grade+UPS+cyberpower+apc+1500va",
        alternatives: ["Eaton 9PX (pricier, fleet-manageable)"],
        goodFor: "Every Florida office. Count one per server rack + one per phone system.",
      },
    ],
  },
  {
    id: "managed-services",
    title: "Managed Services We Run Ourselves",
    intro:
      "Not every slot on the tech stack is a vendor referral. Some are things we do in-house for clients — listed here so the page is a complete picture of how we think about small-business IT.",
    tools: [
      {
        id: "security-academy",
        name: "Simple IT SRQ Security Academy",
        tagline: "Managed security-awareness training for Florida small businesses.",
        whyThis:
          "Every 2026 cyber-insurance policy requires annual security training. Running that in-house burns 4-6 hours/month of an office manager's time. Security Academy is our white-labeled program that handles enrollment, monthly modules, quarterly phishing simulations, and the annual compliance report your insurer asks for. $12/user/mo, 10-user minimum.",
        priceHint: "$12/user/mo",
        fallbackUrl: "/security-academy",
        goodFor: "Any Florida business whose cyber-insurance carrier requires annual training — which is all of them in 2026.",
      },
      {
        id: "cyber-insurance-broker",
        name: "Cyber-Insurance Broker Intro",
        tagline: "Free intro to a broker who quotes Florida small businesses daily.",
        whyThis:
          "Most Sarasota owners renew with their incumbent carrier without shopping the market. The brokers we work with run the 2026 questionnaire, return 2-3 quotes within 3-7 days, and the competing quote is worth 15-30% off your current rate even if you don't switch. Free, no obligation.",
        priceHint: "Free",
        fallbackUrl: "/cyber-insurance-quote",
        goodFor: "Any Florida business with a cyber-insurance renewal in the next 120 days.",
      },
    ],
  },
];

/**
 * Resolve every tool's outbound link. Returns `{ href, isAffiliate }` —
 * `isAffiliate: true` when the link carries a referral tag, otherwise the
 * vendor's plain homepage (or an internal route for managed services).
 *
 * @param {StackTool} tool
 * @returns {{ href: string, isAffiliate: boolean, label: string }}
 */
export function resolveStackLink(tool) {
  if (tool.affiliateKey) {
    const resolved = resolveAffiliate(tool.affiliateKey);
    if (resolved?.href) {
      return { href: resolved.href, isAffiliate: true, label: resolved.label };
    }
  }
  if (tool.fallbackUrl) {
    return { href: tool.fallbackUrl, isAffiliate: false, label: tool.name };
  }
  return { href: "", isAffiliate: false, label: tool.name };
}

/** True if at least one tool in the stack currently resolves to an affiliate link. */
export function stackHasAffiliates() {
  return STACK.some((cat) =>
    cat.tools.some((t) => {
      if (!t.affiliateKey) return false;
      return Boolean(resolveAffiliate(t.affiliateKey));
    }),
  );
}
