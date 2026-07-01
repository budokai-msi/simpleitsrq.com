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
        label: "Managed IT capabilities",
        shortLabel: "All services",
        to: "/#solutions",
        icon: "LayoutGrid",
        description: "Service desk, security, cloud, network, and continuity.",
        activePaths: ["/"],
        activeHashes: ["solutions", "compliance", "contact"],
      },
      {
        id: "catalog",
        label: "Fixed-fee service catalog",
        shortLabel: "Buy a service",
        to: "/services",
        icon: "ShoppingBag",
        description: "Clear scopes, posted pricing, and online checkout.",
        activePaths: ["/services"],
      },
      {
        id: "industries",
        label: "Industries we serve",
        to: "/industries",
        icon: "Briefcase",
        description: "Healthcare, legal, finance, construction, marine, and more.",
        activePaths: ["/industries"],
        activePatterns: [industryLandingPattern],
      },
      {
        id: "markets",
        label: "Service area",
        to: "/service-area",
        icon: "MapPin",
        description: "Sarasota, Bradenton, Venice, Lakewood Ranch, and Nokomis.",
        activePaths: ["/service-area", ...cityPaths],
      },
      {
        id: "stack",
        label: "Vendor stack",
        to: "/stack",
        icon: "Shield",
        description: "Tools, controls, and cost calculator for managed accounts.",
        activePaths: ["/stack", "/tools-we-use"],
      },
    ],
  },
  {
    id: "leadgen",
    label: "Get Leads",
    to: "/leadgen",
    icon: "Target",
    activePaths: ["/leadgen"],
  },
  {
    id: "resources",
    label: "Resources",
    icon: "BookOpen",
    items: [
      {
        id: "blog",
        label: "Blog",
        to: "/blog",
        icon: "BookOpen",
        description: "Plain-English security, AI, and operations notes.",
        activePrefixes: ["/blog"],
      },
      {
        id: "exposure-scan",
        label: "Free exposure scan",
        to: "/exposure-scan",
        icon: "ShieldAlert",
        description: "Quick outside-in check for public business risk.",
        activePaths: ["/exposure-scan"],
      },
      {
        id: "tools",
        label: "Recommended tools",
        to: "/tools",
        icon: "Wrench",
        description: "Hardware, software, and services we actually recommend.",
        activePaths: ["/tools"],
      },
      {
        id: "glossary",
        label: "Glossary",
        to: "/glossary",
        icon: "Info",
        description: "Short explanations for IT, security, and compliance terms.",
        activePrefixes: ["/glossary"],
      },
      {
        id: "compare",
        label: "Compare vendors",
        to: "/compare",
        icon: "Search",
        description: "Side-by-side product and service comparisons.",
        activePrefixes: ["/compare"],
      },
      {
        id: "why",
        label: "Why Simple IT",
        to: "/why",
        icon: "Shield",
        description: "How we stack up against common alternatives.",
        activePrefixes: ["/why"],
      },
      {
        id: "password-check",
        label: "Password check",
        to: "/password-check",
        icon: "Lock",
        description: "Check password exposure locally without sending secrets.",
        activePaths: ["/password-check"],
      },
    ],
  },
  {
    id: "support",
    label: "Support",
    to: "/support",
    icon: "Shield",
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
