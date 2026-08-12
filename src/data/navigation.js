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
  { id: "repair", label: "Computer Repair", to: "/services#computer-repair", icon: "Wrench", activePaths: ["/services"] },
  { id: "managed-it", label: "Managed IT", to: "/services#managed-it", icon: "Briefcase", activePaths: ["/services"] },
  { id: "leadgen", label: "Leadgen", to: "/leadgen", icon: "Target", activePaths: ["/leadgen"] },
  { id: "blog", label: "Blog", to: "/blog", icon: "BookOpen", activePrefixes: ["/blog"] },
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
