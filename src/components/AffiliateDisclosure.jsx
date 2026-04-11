// FTC-compliant disclosure for blog posts. Two flavors:
//
// `variant="affiliate"` is rendered when a post contains [[ ]] affiliate
// tokens that resolve to a configured program. Required by FTC 16 CFR
// Part 255 - the disclosure must be conspicuous, before or near the link,
// and use language a reasonable reader understands.
//
// `variant="partnership"` is the softer language for posts that only mention
// vendor relationships (SentinelOne, Microsoft, Fortinet, Meraki) without
// using affiliate tracking links.

export default function AffiliateDisclosure({ variant = "partnership" }) {
  if (variant === "affiliate") {
    return (
      <p className="affiliate-disclosure">
        <strong>Affiliate disclosure:</strong> This post contains affiliate
        and referral links. If you sign up for a product through one of
        these links, Simple IT SRQ may earn a commission or referral fee at
        no extra cost to you. We only recommend products our team uses or
        deploys for paying clients, and we never accept payment to write a
        post or change an opinion. Per FTC 16 CFR Part 255.
      </p>
    );
  }

  return (
    <p className="affiliate-disclosure">
      <strong>Disclosure:</strong> Simple IT SRQ is a managed service provider
      serving Sarasota, Bradenton, and Lakewood Ranch. Some links in our posts
      may point to vendors we partner with or resell (for example SentinelOne,
      Microsoft, Fortinet, or Meraki). We only recommend tools we actively
      deploy for paying clients, and we never accept editorial payment for
      coverage.
    </p>
  );
}
