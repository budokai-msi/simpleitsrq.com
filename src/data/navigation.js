import { cityList } from "./cities";

const PRIMARY_CITY_SLUGS = new Set([
  "sarasota-it-support",
  "bradenton-it-support",
  "lakewood-ranch-it-support",
]);

export const SERVICE_AREA_LINKS = cityList
  .filter((city) => PRIMARY_CITY_SLUGS.has(city.slug))
  .map((city) => ({ id: city.slug, label: city.city, to: `/${city.slug}`, icon: "MapPin" }));

export const PRIMARY_NAV = [
  {
    id: "services",
    label: "Services",
    icon: "Wrench",
    activePaths: ["/services"],
    items: [
      { id: "computer-repair", label: "Computer Repair", description: "Diagnostics, repair, and upgrades", to: "/services#computer-repair", icon: "Wrench" },
      { id: "hardware-upgrades", label: "Hardware Upgrades", description: "Memory, storage, docks, monitors", to: "/services#hardware-upgrades", icon: "ShoppingBag" },
      { id: "it-integration", label: "Systems & App Integration", description: "Make your tools work together", to: "/services#it-integration", icon: "LayoutGrid" },
      { id: "managed-it", label: "Managed IT", description: "Ongoing business IT support", to: "/services#managed-it", icon: "Briefcase" },
    ],
  },
  {
    id: "locations",
    label: "Locations",
    icon: "MapPin",
    activePrefixes: ["/sarasota-it-support", "/bradenton-it-support", "/lakewood-ranch-it-support", "/service-area"],
    items: [
      { id: "sarasota", label: "Sarasota", description: "IT support in Sarasota", to: "/sarasota-it-support", icon: "MapPin" },
      { id: "bradenton", label: "Bradenton", description: "IT support in Bradenton", to: "/bradenton-it-support", icon: "MapPin" },
      { id: "lakewood-ranch", label: "Lakewood Ranch", description: "IT support in Lakewood Ranch", to: "/lakewood-ranch-it-support", icon: "MapPin" },
      { id: "service-area", label: "All service areas", description: "We travel to you", to: "/service-area", icon: "MapPin" },
    ],
  },
  {
    id: "resources",
    label: "Resources",
    icon: "BookOpen",
    activePrefixes: ["/blog", "/tools", "/compare", "/glossary"],
    items: [
      { id: "blog", label: "Blog", description: "Field notes & analysis", to: "/blog", icon: "BookOpen" },
      { id: "tools", label: "Free tools", description: "Exposure scan, password check", to: "/tools", icon: "Search" },
      { id: "compare", label: "Compare", description: "X vs Y buying guides", to: "/compare", icon: "Shield" },
      { id: "glossary", label: "Glossary", description: "IT terms explained", to: "/glossary", icon: "Info" },
    ],
  },
  { id: "leadgen", label: "Leadgen", to: "/leadgen", icon: "Target", activePaths: ["/leadgen"] },
];

export const FOOTER_COLUMNS = [
  {
    title: "Services",
    items: [
      { label: "Computer repair & diagnostics", to: "/services#computer-repair" },
      { label: "Managed IT & networks", to: "/services#managed-it" },
      { label: "Leadgen", to: "/leadgen" },
    ],
  },
  {
    title: "Local",
    items: [
      { label: "Sarasota IT support", to: "/sarasota-it-support" },
      { label: "Bradenton IT support", to: "/bradenton-it-support" },
      { label: "Blog", to: "/blog" },
    ],
  },
];

function splitTarget(to = "") {
  const [pathPart, hashPart] = String(to).split("#");
  return { pathname: pathPart || "/", hash: hashPart ? `#${hashPart}` : "" };
}
function matchesPrefix(pathname, prefix) { return pathname === prefix || pathname.startsWith(`${prefix}/`); }
export function isNavItemActive(item, location) {
  if (!item || !location) return false;
  const pathname = location.pathname || "/";
  const hash = location.hash || "";
  if (item.activePaths?.includes(pathname)) return true;
  if (item.activePrefixes?.some((prefix) => matchesPrefix(pathname, prefix))) return true;
  if (!item.to) return false;
  const target = splitTarget(item.to);
  if (target.hash) return pathname === target.pathname && hash === target.hash;
  return pathname === target.pathname;
}
export function isNavSectionActive(section, location) {
  if (!section) return false;
  return section.items?.length ? section.items.some((item) => isNavItemActive(item, location)) : isNavItemActive(section, location);
}
