// MDX-friendly affiliate link component.
//
// Usage inside content/posts/*.mdx:
//     <Affiliate token="amazon_search:YubiKey 5C NFC|YubiKey 5C NFC security key" />
//
// Wraps the same resolveAffiliate() logic used by the legacy string-body
// posts via renderAffiliateToken() in BlogPost.jsx, so affiliate-link
// behavior stays identical across the MDX and legacy code paths:
//   - Unresolved tokens (program env not set) degrade to the label text
//   - Resolved tokens render as rel="sponsored noopener" anchors
//   - Click tracking goes through trackAffiliateClick()
import { resolveAffiliate } from "../data/affiliates";
import { trackAffiliateClick } from "../lib/trackClick";

export default function Affiliate({ token, slug }) {
  const aff = resolveAffiliate(token);
  if (!aff) {
    // Match the fallback formatting in BlogPost.renderAffiliateToken
    const display = token.startsWith("amazon:") || token.startsWith("amazon_search:")
      ? (token.split("|")[1] || token.split(":")[1] || token)
      : token.charAt(0).toUpperCase() + token.slice(1);
    return <span>{display}</span>;
  }
  return (
    <a
      href={aff.href}
      target="_blank"
      rel="sponsored noopener noreferrer"
      className="affiliate-link"
      title={aff.blurb}
      onClick={() => trackAffiliateClick({
        slug, destination: aff.href, label: aff.label, network: aff.vendor,
      })}
    >
      {aff.label}
    </a>
  );
}
