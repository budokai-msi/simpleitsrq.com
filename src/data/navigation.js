import { cityList } from "./cities";

const cityPaths = cityList.map((city) => `/${city.slug}`);

const industryLandingPattern =
  /^\/(?:medical|law-firm|financial-advisor|marine|construction|vacation-rental)-it-[a-z0-9-]+$/;

// Core markets surfaced in the footer / nav. The full set of city pages still
// exists (routes + sitemap) for SEO, but listing all of them everywhere is
// bloat - the footer shows these few plus a "View all markets" link.
const PRIMARY_CITY_SLUGS = new Set([
  "sarasota-it-support",
  "bradenton-it-support",
  "lakewood-ranch-it-support",
  "venice-it-support",
  "nokomis-it-support",
]);

export const SERVICE_AREA_LINKS = cityList
  .filter((city) => PRIMARY_CITY_SLUGS.has(city.slug))
  .map((city) => ({
    id: city.slug,
    label: city.city,
    to: `/${city.slug}`,
    icon: "MapPin",
  }));

export const PRIMARY_NAV = [
  {
    id: "services",
    label: "Services",
    icon: "LayoutGrid",
    items: [
      {
        id: "capabilities",
        label: "Managed IT Solutions",
        shortLabel: "Solutions",
        to: "/#solutions",
        icon: "LayoutGrid",
        description: "Service desk, security, cloud, network, and continuity.",
        activePaths: ["/"],
        activeHashes: ["solutions", "compliance", "contact"],
      },
      {
        id: "catalog",
        label: "Transparent Pricing",
        shortLabel: "Pricing",
        to: "/services",
        icon: "ShoppingBag",
        description: "Fixed-fee scopes, posted pricing, and online checkout.",
        activePaths: ["/services"],
      },
      {
        id: "industries",
        label: "Industries & Markets",
        to: "/industries",
        icon: "MapPin",
        description: "Specialized IT for healthcare, legal, and local markets.",
        activePaths: ["/industries", "/service-area", ...cityPaths],
        activePatterns: [industryLandingPattern],
      }
    ],
  },
  {
    id: "security",
    label: "Security Tools",
    icon: "ShieldAlert",
    items: [
      {
        id: "exposure-scan",
        label: "Free Exposure Scan",
        to: "/exposure-scan",
        icon: "ShieldAlert",
        description: "Quick outside-in check for public business risk.",
        activePaths: ["/exposure-scan"],
      },
      {
        id: "password-check",
        label: "Password Breach Check",
        to: "/password-check",
        icon: "Lock",
        description: "Check password exposure locally without sending secrets.",
        activePaths: ["/password-check"],
      },
      {
        id: "stack",
        label: "Our Vendor Stack",
        to: "/stack",
        icon: "Shield",
        description: "Tools and controls we use for managed accounts.",
        activePaths: ["/stack", "/tools-we-use"],
      },
    ]
  },
  {
    id: "learn",
    label: "Learn",
    icon: "BookOpen",
    items: [
      {
        id: "blog",
        label: "IT Insights Blog",
        to: "/blog",
        icon: "BookOpen",
        description: "Plain-English security, AI, and operations notes.",
        activePrefixes: ["/blog"],
      },
      {
        id: "compare",
        label: "Compare Providers",
        to: "/compare",
        icon: "Search",
        description: "Side-by-side product and IT service model comparisons.",
        activePrefixes: ["/compare", "/why"],
      },
      {
        id: "glossary",
        label: "IT Glossary",
        to: "/glossary",
        icon: "Info",
        description: "Short explanations for IT and security terms.",
        activePrefixes: ["/glossary"],
      }
    ]
  },
  {
    id: "leadgen",
    label: "Get Leads",
    to: "/leadgen",
    icon: "Target",
    activePaths: ["/leadgen"],
  },
  {
    id: "support",
    label: "Support",
    to: "/support",
    icon: "Phone",
    activePaths: ["/support"],
  },
];

export const FOOTER_COLUMNS = [
  {
    title: "What We Do",
    items: [
      { label: "Managed IT capabilities", to: "/#solutions" },
      { label: "Fixed-fee service catalog", to: "/services" },
      { label: "Industries we serve", to: "/industries" },
      { label: "Vendor stack", to: "/stack" },
      { label: "Service area", to: "/service-area" },
    ],
  },
  {
    title: "Resources",
    items: [
      { label: "Blog", to: "/blog" },
      { label: "Glossary", to: "/glossary" },
      { label: "Free exposure scan", to: "/exposure-scan" },
      { label: "Recommended tools", to: "/tools" },
      { label: "Compare vendors", to: "/compare" },
      { label: "Get local leads", to: "/leadgen" },
      { label: "Partner program", to: "/partners" },
      { label: "Support", to: "/support" },
    ],
  },
];

function splitTarget(to = "") {
  const [pathPart, hashPart] = String(to).split("#");
  return {
    pathname: pathPart || "/",
    hash: hashPart ? `#${hashPart}` : "",
  };
}

function matchesPrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isNavItemActive(item, location) {
  if (!item || !location) return false;

  const pathname = location.pathname || "/";
  const hash = location.hash || "";

  if (item.activePaths?.includes(pathname)) return true;

  if (item.activePrefixes?.some((prefix) => matchesPrefix(pathname, prefix))) {
    return true;
  }

  if (item.activePatterns?.some((pattern) => pattern.test(pathname))) {
    return true;
  }

  if (pathname === "/" && item.activeHashes?.some((activeHash) => hash === `#${activeHash}`)) {
    return true;
  }

  if (!item.to) return false;

  const target = splitTarget(item.to);
  if (target.hash) {
    return pathname === target.pathname && hash === target.hash;
  }

  return pathname === target.pathname;
}

export function isNavSectionActive(section, location) {
  if (!section) return false;
  if (section.items?.length) {
    return section.items.some((item) => isNavItemActive(item, location));
  }
  return isNavItemActive(section, location);
}
