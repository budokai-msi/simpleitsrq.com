// Maps raw OSM "industry" strings (shop:car_parts, amenity:fast_food, etc.)
// to a friendly two-level taxonomy used in the dashboard filter dropdowns
// and exports. Pure function — no DB access, safe to import anywhere.
//
// Returns { industry, sub_industry } where industry is the broad
// category and sub_industry is the human-readable specific name.

const MAP = {
  // ── Food & Drink ─────────────────────────────────────────────
  "amenity:restaurant":   ["Food & Drink", "Restaurant"],
  "amenity:fast_food":    ["Food & Drink", "Fast food"],
  "amenity:cafe":         ["Food & Drink", "Café"],
  "amenity:bar":          ["Food & Drink", "Bar"],
  "amenity:pub":          ["Food & Drink", "Pub"],
  "amenity:ice_cream":    ["Food & Drink", "Ice cream"],
  "amenity:food_court":   ["Food & Drink", "Food court"],
  "shop:bakery":          ["Food & Drink", "Bakery"],
  "shop:butcher":         ["Food & Drink", "Butcher"],
  "shop:deli":            ["Food & Drink", "Deli"],
  "shop:coffee":          ["Food & Drink", "Coffee shop"],
  "craft:brewery":        ["Food & Drink", "Brewery"],
  "craft:distillery":     ["Food & Drink", "Distillery"],
  "craft:winery":         ["Food & Drink", "Winery"],

  // ── Retail ───────────────────────────────────────────────────
  "shop:supermarket":     ["Retail", "Supermarket"],
  "shop:convenience":     ["Retail", "Convenience store"],
  "shop:clothes":         ["Retail", "Clothing"],
  "shop:shoes":           ["Retail", "Shoes"],
  "shop:jewelry":         ["Retail", "Jewelry"],
  "shop:books":           ["Retail", "Books"],
  "shop:electronics":     ["Retail", "Electronics"],
  "shop:mobile_phone":    ["Retail", "Mobile phone"],
  "shop:furniture":       ["Retail", "Furniture"],
  "shop:hardware":        ["Retail", "Hardware"],
  "shop:gift":            ["Retail", "Gift shop"],
  "shop:florist":         ["Retail", "Florist"],
  "shop:pet":             ["Retail", "Pet supplies"],
  "shop:toys":            ["Retail", "Toys"],
  "shop:sports":          ["Retail", "Sporting goods"],
  "shop:department_store":["Retail", "Department store"],
  "shop:variety_store":   ["Retail", "Variety store"],

  // ── Automotive ───────────────────────────────────────────────
  "shop:car":             ["Automotive", "Car dealer"],
  "shop:car_parts":       ["Automotive", "Auto parts"],
  "shop:car_repair":      ["Automotive", "Auto repair"],
  "shop:tyres":           ["Automotive", "Tires"],
  "shop:motorcycle":      ["Automotive", "Motorcycle"],
  "amenity:car_wash":     ["Automotive", "Car wash"],
  "amenity:car_rental":   ["Automotive", "Car rental"],
  "amenity:fuel":         ["Automotive", "Gas station"],

  // ── Healthcare ───────────────────────────────────────────────
  "healthcare:doctor":    ["Healthcare", "Doctor"],
  "healthcare:dentist":   ["Healthcare", "Dentist"],
  "healthcare:hospital":  ["Healthcare", "Hospital"],
  "healthcare:clinic":    ["Healthcare", "Clinic"],
  "healthcare:pharmacy":  ["Healthcare", "Pharmacy"],
  "healthcare:optometrist":["Healthcare", "Optometrist"],
  "healthcare:physiotherapist": ["Healthcare", "Physical therapy"],
  "healthcare:chiropractor":["Healthcare", "Chiropractor"],
  "healthcare:psychotherapist": ["Healthcare", "Mental health"],
  "amenity:pharmacy":     ["Healthcare", "Pharmacy"],
  "amenity:clinic":       ["Healthcare", "Clinic"],
  "amenity:hospital":     ["Healthcare", "Hospital"],
  "amenity:dentist":      ["Healthcare", "Dentist"],
  "amenity:doctors":      ["Healthcare", "Doctor"],
  "amenity:veterinary":   ["Healthcare", "Veterinary"],
  "shop:optician":        ["Healthcare", "Optician"],

  // ── Hospitality / Lodging ────────────────────────────────────
  "tourism:hotel":        ["Hospitality", "Hotel"],
  "tourism:motel":        ["Hospitality", "Motel"],
  "tourism:hostel":       ["Hospitality", "Hostel"],
  "tourism:guest_house":  ["Hospitality", "Guest house"],
  "tourism:apartment":    ["Hospitality", "Vacation rental"],
  "tourism:museum":       ["Hospitality", "Museum"],
  "tourism:attraction":   ["Hospitality", "Attraction"],

  // ── Personal Services ────────────────────────────────────────
  "shop:hairdresser":     ["Personal Services", "Hair salon"],
  "shop:beauty":          ["Personal Services", "Beauty"],
  "shop:massage":         ["Personal Services", "Massage"],
  "shop:tattoo":          ["Personal Services", "Tattoo"],
  "shop:dry_cleaning":    ["Personal Services", "Dry cleaning"],
  "shop:laundry":         ["Personal Services", "Laundry"],
  "shop:tailor":          ["Personal Services", "Tailor"],
  "shop:funeral_directors":["Personal Services", "Funeral"],

  // ── Professional Services ────────────────────────────────────
  "office:lawyer":        ["Professional Services", "Lawyer"],
  "office:accountant":    ["Professional Services", "Accountant"],
  "office:financial":     ["Professional Services", "Financial advisor"],
  "office:insurance":     ["Professional Services", "Insurance"],
  "office:estate_agent":  ["Professional Services", "Real estate"],
  "office:architect":     ["Professional Services", "Architect"],
  "office:engineer":      ["Professional Services", "Engineering"],
  "office:it":            ["Professional Services", "IT services"],
  "office:consulting":    ["Professional Services", "Consulting"],
  "office:advertising_agency": ["Professional Services", "Advertising"],
  "office:travel_agent":  ["Professional Services", "Travel agent"],
  "office:notary":        ["Professional Services", "Notary"],
  "office:tax_advisor":   ["Professional Services", "Tax advisor"],
  "office:association":   ["Professional Services", "Association"],
  "office:government":    ["Professional Services", "Government"],
  "office:company":       ["Professional Services", "Company office"],
  "amenity:bank":         ["Professional Services", "Bank"],

  // ── Trades / Construction ────────────────────────────────────
  "craft:plumber":        ["Trades", "Plumber"],
  "craft:electrician":    ["Trades", "Electrician"],
  "craft:carpenter":      ["Trades", "Carpenter"],
  "craft:hvac":           ["Trades", "HVAC"],
  "craft:roofer":         ["Trades", "Roofer"],
  "craft:painter":        ["Trades", "Painter"],
  "craft:handyman":       ["Trades", "Handyman"],
  "craft:contractor":     ["Trades", "Contractor"],
  "craft:builder":        ["Trades", "Builder"],
  "craft:gardener":       ["Trades", "Landscaping"],
  "craft:exterminator":   ["Trades", "Pest control"],
  "craft:pest_control":   ["Trades", "Pest control"],
  "craft:exterminator;pest_control": ["Trades", "Pest control"],

  // ── Storage / Logistics ──────────────────────────────────────
  "shop:storage_rental":  ["Storage & Logistics", "Self storage"],
  "amenity:parking":      ["Storage & Logistics", "Parking"],
  "office:logistics":     ["Storage & Logistics", "Logistics"],
  "shop:wholesale":       ["Storage & Logistics", "Wholesale"],

  // ── Education ────────────────────────────────────────────────
  "amenity:school":       ["Education", "School"],
  "amenity:college":      ["Education", "College"],
  "amenity:university":   ["Education", "University"],
  "amenity:kindergarten": ["Education", "Childcare"],
  "amenity:childcare":    ["Education", "Childcare"],
  "amenity:library":      ["Education", "Library"],
  "amenity:driving_school": ["Education", "Driving school"],
  "amenity:language_school": ["Education", "Language school"],
  "amenity:music_school": ["Education", "Music school"],
  "amenity:tutoring":     ["Education", "Tutoring"],

  // ── Recreation / Fitness ─────────────────────────────────────
  "leisure:fitness_centre": ["Recreation", "Gym"],
  "leisure:sports_centre":  ["Recreation", "Sports center"],
  "leisure:spa":          ["Recreation", "Spa"],
  "leisure:dance":        ["Recreation", "Dance studio"],
  "amenity:gym":          ["Recreation", "Gym"],
  "amenity:cinema":       ["Recreation", "Cinema"],
  "amenity:theatre":      ["Recreation", "Theatre"],
  "amenity:nightclub":    ["Recreation", "Nightclub"],
  "amenity:marketplace":  ["Recreation", "Marketplace"],
  "amenity:events_venue": ["Recreation", "Event venue"],
  "leisure:bowling_alley": ["Recreation", "Bowling"],

  // ── Cleaning & Maintenance ───────────────────────────────────
  "craft:cleaning":       ["Cleaning & Maintenance", "Cleaning"],
  "craft:window_cleaner": ["Cleaning & Maintenance", "Window cleaning"],
  "craft:carpet_cleaner": ["Cleaning & Maintenance", "Carpet cleaning"],
  "craft:pool_cleaner":   ["Cleaning & Maintenance", "Pool service"],
  "office:cleaning":      ["Cleaning & Maintenance", "Cleaning company"],

  // ── Real Estate ──────────────────────────────────────────────
  "office:real_estate":   ["Real Estate", "Real estate agency"],
  "office:property_management": ["Real Estate", "Property management"],
  "office:mortgage":      ["Real Estate", "Mortgage broker"],
  "shop:rental":          ["Real Estate", "Rental agency"],

  // ── Media & Creative ─────────────────────────────────────────
  "office:graphic_design": ["Media & Creative", "Graphic design"],
  "office:photography":   ["Media & Creative", "Photography"],
  "office:video_production": ["Media & Creative", "Video production"],
  "office:marketing":     ["Media & Creative", "Marketing agency"],
  "office:web_design":    ["Media & Creative", "Web design"],
  "shop:photography":     ["Media & Creative", "Photography studio"],
  "craft:photographer":   ["Media & Creative", "Photographer"],
  "craft:printer":        ["Media & Creative", "Print shop"],
  "shop:art":             ["Media & Creative", "Art gallery / shop"],
};

// Human-friendly subcategory name from a raw token (snake_case or
// dotted Overture category ids like "retail.auto_parts").
function prettyName(token) {
  if (!token) return null;
  const cleaned = String(token)
    .replace(/^overture:/i, "")
    .replace(/\./g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Google Places + Overture type names → [industry group, friendly subcategory].
// OSM MAP above keys on "key:value" tags; this covers the bare type strings the
// live providers return, so businesses no longer collapse into a single "Other".
const PROVIDER_MAP = {
  // Automotive
  car_dealer: ["Automotive", "Car dealer"],
  car_rental: ["Automotive", "Car rental"],
  car_repair: ["Automotive", "Auto repair"],
  car_wash: ["Automotive", "Car wash"],
  auto_parts_store: ["Automotive", "Auto parts"],
  motor_vehicle_dealer: ["Automotive", "Car dealer"],
  truck_dealer: ["Automotive", "Truck dealer"],
  used_car_dealer: ["Automotive", "Used car dealer"],
  motor_vehicle_store: ["Automotive", "Vehicle store"],
  vehicle_financing: ["Automotive", "Vehicle financing"],
  auto_detailing: ["Automotive", "Auto detailing"],
  motorcycle_dealer: ["Automotive", "Motorcycle dealer"],
  gas_station: ["Automotive", "Gas station"],
  boat_service: ["Recreation", "Boat service"],
  boat_rental: ["Recreation", "Boat rental"],
  // Healthcare
  dentist: ["Healthcare", "Dentist"],
  dental_clinic: ["Healthcare", "Dentist"],
  doctor: ["Healthcare", "Doctor"],
  hospital: ["Healthcare", "Hospital"],
  pharmacy: ["Healthcare", "Pharmacy"],
  chiropractor: ["Healthcare", "Chiropractor"],
  optometrist: ["Healthcare", "Optometrist"],
  physiotherapist: ["Healthcare", "Physical therapy"],
  dermatologist: ["Healthcare", "Dermatologist"],
  physiotherapy_center: ["Healthcare", "Physical therapy"],
  medical_clinic: ["Healthcare", "Clinic"],
  medical_lab: ["Healthcare", "Medical lab"],
  medical_spa: ["Healthcare", "Medical spa"],
  ambulance_service: ["Healthcare", "Ambulance"],
  health: ["Healthcare", "Health service"],
  doctor_office: ["Healthcare", "Doctor"],
  nursing_home: ["Healthcare", "Nursing home"],
  veterinary_care: ["Healthcare", "Veterinary"],
  pet_veterinarian: ["Healthcare", "Veterinary"],
  // Professional services
  insurance_agency: ["Professional Services", "Insurance"],
  accountancy: ["Professional Services", "Accountant"],
  real_estate_agency: ["Real Estate", "Real estate agency"],
  lawyer: ["Professional Services", "Lawyer"],
  law_firm: ["Professional Services", "Law firm"],
  bank: ["Professional Services", "Bank"],
  finance: ["Professional Services", "Financial service"],
  financial_institution: ["Professional Services", "Financial service"],
  travel_agency: ["Professional Services", "Travel agency"],
  taxi_service: ["Professional Services", "Taxi service"],
  employment_agency: ["Professional Services", "Employment agency"],
  notary_public: ["Professional Services", "Notary"],
  architect: ["Professional Services", "Architect"],
  electrician: ["Trades", "Electrician"],
  plumber: ["Trades", "Plumber"],
  general_contractor: ["Trades", "Contractor"],
  contractor: ["Trades", "Contractor"],
  hvac: ["Trades", "HVAC"],
  roofing_contractor: ["Trades", "Roofer"],
  painter: ["Trades", "Painter"],
  landscaper: ["Trades", "Landscaping"],
  property_maintenance: ["Cleaning & Maintenance", "Maintenance"],
  moving_company: ["Cleaning & Maintenance", "Moving"],
  // Retail / grocery
  supermarket: ["Retail", "Supermarket"],
  grocery_store: ["Retail", "Grocery store"],
  convenience_store: ["Retail", "Convenience store"],
  hardware_store: ["Retail", "Hardware"],
  electronics_store: ["Retail", "Electronics"],
  furniture_store: ["Retail", "Furniture"],
  clothing_store: ["Retail", "Clothing"],
  shoe_store: ["Retail", "Shoes"],
  jewelry_store: ["Retail", "Jewelry"],
  book_store: ["Retail", "Books"],
  gift_shop: ["Retail", "Gift shop"],
  department_store: ["Retail", "Department store"],
  mobile_phone_store: ["Retail", "Mobile phone"],
  computer_store: ["Retail", "Computers"],
  wholesale_store: ["Retail", "Wholesale"],
  storage: ["Storage & Logistics", "Self storage"],
  self_storage: ["Storage & Logistics", "Self storage"],
  pawn_shop: ["Retail", "Pawn shop"],
  home_improvement_store: ["Retail", "Home improvement"],
  building_materials_store: ["Retail", "Building materials"],
  // Food & Drink
  restaurant: ["Food & Drink", "Restaurant"],
  seafood_restaurant: ["Food & Drink", "Seafood restaurant"],
  fast_food_restaurant: ["Food & Drink", "Fast food"],
  cafe: ["Food & Drink", "Café"],
  coffee_shop: ["Food & Drink", "Coffee shop"],
  bar: ["Food & Drink", "Bar"],
  bakery: ["Food & Drink", "Bakery"],
  ice_cream_shop: ["Food & Drink", "Ice cream"],
  pizzeria: ["Food & Drink", "Pizza"],
  sandwich_shop: ["Food & Drink", "Sandwich shop"],
  meal_takeaway: ["Food & Drink", "Takeaway"],
  liquor_store: ["Retail", "Liquor"],
  wine_store: ["Retail", "Wine"],
  liquor_store_2: ["Retail", "Liquor"],
  // Personal services
  beauty_salon: ["Personal Services", "Beauty salon"],
  hair_salon: ["Personal Services", "Hair salon"],
  barber_shop: ["Personal Services", "Barber"],
  spa: ["Personal Services", "Spa"],
  massage: ["Personal Services", "Massage"],
  tattoo_parlor: ["Personal Services", "Tattoo"],
  nail_salon: ["Personal Services", "Nails"],
  laundry: ["Personal Services", "Laundry"],
  dry_cleaning: ["Personal Services", "Dry cleaning"],
  tailor: ["Personal Services", "Tailor"],
  funeral_home: ["Personal Services", "Funeral home"],
  // Lodging / recreation
  lodging: ["Hospitality", "Lodging"],
  hotel: ["Hospitality", "Hotel"],
  motel: ["Hospitality", "Motel"],
  campground: ["Hospitality", "Campground"],
  museum: ["Recreation", "Museum"],
  art_gallery: ["Recreation", "Art gallery"],
  historic_site: ["Recreation", "Historic site"],
  park: ["Recreation", "Park"],
  zoo: ["Recreation", "Zoo"],
  aquarium: ["Recreation", "Aquarium"],
  bowling_alley: ["Recreation", "Bowling"],
  movie_theater: ["Recreation", "Cinema"],
  gym: ["Recreation", "Gym"],
  sports_club: ["Recreation", "Sports club"],
  fitness_center: ["Recreation", "Gym"],
  golf_course: ["Recreation", "Golf course"],
  recreation_center: ["Recreation", "Recreation"],
  place_of_worship: ["Recreation", "Place of worship"],
  church: ["Recreation", "Church"],
  synagogue: ["Recreation", "Synagogue"],
  mosque: ["Recreation", "Mosque"],
  stadium: ["Recreation", "Stadium"],
  amusement_park: ["Recreation", "Amusement park"],
  event_venue: ["Recreation", "Event venue"],
  performing_arts_theater: ["Recreation", "Theatre"],
  night_club: ["Recreation", "Nightclub"],
  // Education
  school: ["Education", "School"],
  elementary_school: ["Education", "Elementary school"],
  high_school: ["Education", "High school"],
  middle_school: ["Education", "Middle school"],
  preschool: ["Education", "Preschool"],
  kindergarten: ["Education", "Kindergarten"],
  college: ["Education", "College"],
  university: ["Education", "University"],
  library: ["Education", "Library"],
  tutoring_center: ["Education", "Tutoring"],
  child_care_agency: ["Education", "Childcare"],
  vocational_school: ["Education", "Vocational school"],
  driving_school: ["Education", "Driving school"],
  language_school: ["Education", "Language school"],
  // Trades
  window_tinting_service: ["Automotive", "Window tinting"],
  transmission_shop: ["Automotive", "Transmission repair"],
  key_and_lock_repair: ["Professional Services", "Locksmith"],
  locksmith: ["Professional Services", "Locksmith"],
  marina: ["Recreation", "Marina"],
  pet_store: ["Retail", "Pet supplies"],
  pet_groomer: ["Personal Services", "Pet grooming"],
  veterinary: ["Healthcare", "Veterinary"],
  home_inspector: ["Professional Services", "Home inspector"],
  land_surveyor: ["Professional Services", "Land surveying"],
  it_services: ["Professional Services", "IT services"],
  computer_repair: ["Professional Services", "IT services"],
  internet_cafe: ["Recreation", "Internet cafe"],
  funeral_service: ["Personal Services", "Funeral service"],
  home_goods_store: ["Retail", "Home goods"],
  shop: ["Retail", "Store"],
  rental: ["Real Estate", "Rental service"],
  building: ["Trades", "Building service"],
  business_to_business: ["Professional Services", "B2B service"],
  motorcycle: ["Automotive", "Motorcycle"],
  trust: ["Professional Services", "Trust"],
  youth_organization: ["Recreation", "Youth organization"],
};

// Keyword fallback so unknown provider type names still land in a real group
// (e.g. "auto_parts_wholesaler", "oil_change", "cafe_terrace") instead of "Other".
const KEYWORD_RULES = [
  ["Healthcare", /dent|clinic|doctor|medic|health|pharma|chiropr|physio|therapy|optometr|veterinar|nurse|hospital|hearing|dermatolog|psycholog|pediatr/],
  ["Automotive", /auto|car |vehicle|tire|tyre|mechanic|gas_station|fuel|motorcycle|transmission|tint|detailing|car_wash|dealership|automotive|oil_change|lube|alignment|brake/],
  ["Food & Drink", /restaurant|cafe|coffee|bar$|pub$|bakery|food|pizza|burger|sandwich|ice_cream|brew|wine|beer|bistro|breakfast|donut|caterer/],
  ["Hospitality", /hotel|motel|lodging|hostel|resort|camp|guest_house|bed_and_breakfast|vacation_rental/],
  ["Personal Services", /barber|hair|salon|beauty|massage|tattoo|nail|laundry|dry_clean|funeral|spa|grooming|tanning|lash|fitness_gym/],
  ["Cleaning & Maintenance", /clean|janitor|maintenance|pool_service|window_clean|carpet_clean|pest|landscap|lawn/],
  ["Real Estate", /real_estate|property|mortgage|realtor|appraiser|home_inspect/],
  ["Trades", /plumb|electric|roof|contract|carpent|hvac|heating|air_condition|builder|paint|surveyor|mason|flooring|fencing|glass|welding|contractor/],
  ["Education", /school|college|universit|childcare|daycare|kindergarden|library|tutor|education|training|academy|driving_school/],
  ["Recreation", /gym|fitness|sport|theatre|theater|cinema|bowling|dance|museum|gallery|recreation|park|zoo|aquarium|club|venue|event|entertainment|casino|game/],
  ["Professional Services", /lawyer|attorney|law_firm|account|financial|insurance|consult|architect|engineer|notary|tax_|business|office|it_|technology|software|advertising|marketing|recruit|security_service|courier/],
  ["Retail", /store|shop|retail|market|supermarket|grocery|clothing|shoe|jewel|book|electronic|furniture|hardware|florist|pet|sporting|gift|pawn|antique|fabric|photo|tobacco|furnishings|department/],
  ["Food & Drink", /grill|burger|pizza|sushi|breakfast|lunch|dinner|brewery|tasting/],
];

function keywordIndustry(raw) {
  for (const [industry, re] of KEYWORD_RULES) if (re.test(raw)) return industry;
  return null;
}

/**
 * Classify a raw industry tag into a two-level taxonomy.
 *
 * Accepts three shapes the live providers emit:
 *  - OSM key:value tags ("shop:car_parts", "amenity:fast_food")
 *  - Google Places / Overture bare type names ("car_dealer", "insurance_agency",
 *    "overture:retail.auto_parts")
 *  - Anything else, via a keyword fallback so rows land in a real group rather
 *    than all collapsing into "Other".
 */
export function classifyIndustry(rawTag) {
  if (!rawTag) return { industry: "Other", sub_industry: null };

  const raw = String(rawTag).trim();
  const lower = raw.toLowerCase();

  // 1. Exact OSM map (key:value).
  const hit = MAP[lower];
  if (hit) return { industry: hit[0], sub_industry: hit[1] };

  // 2. Exact provider map (bare type name, optionally with a prefix).
  const providerKey = lower.replace(/^(overture|google)[:_-]+/i, "");
  if (PROVIDER_MAP[providerKey]) {
    const [industry, sub] = PROVIDER_MAP[providerKey];
    return { industry, sub_industry: sub };
  }

  // 3. Split on the OSM separator to bucket by key.
  if (lower.includes(":")) {
    const [key, ...rest] = lower.split(":");
    const val = rest.join(" ");
    const groupMap = {
      shop: "Retail", amenity: "Other", healthcare: "Healthcare",
      office: "Professional Services", craft: "Trades", tourism: "Hospitality",
      leisure: "Recreation", building: "Other", landuse: "Other",
    };
    if (key === "overture") {
      const classified = classifyProviderValue(val);
      if (classified) return classified;
    }
    const industry = groupMap[key] || keywordIndustry(val) || "Other";
    return {
      industry,
      sub_industry: prettyName(val) || prettyName(key),
    };
  }

  // 4. Bare token (Google type, Overture category id, "auto_dealer", etc.).
  const industry = keywordIndustry(lower) || "Other";
  return { industry, sub_industry: prettyName(raw) };
}

function classifyProviderValue(val) {
  // Values like "retail.auto_parts" or "car_dealer".
  const providerKey = val.replace(/[._-]+/g, "_");
  const hit = PROVIDER_MAP[providerKey];
  if (hit) return { industry: hit[0], sub_industry: hit[1] };
  for (const [industry, re] of KEYWORD_RULES) if (re.test(val)) return { industry, sub_industry: prettyName(val) };
  return null;
}

/**
 * Distinct list of top-level industries used for the filter dropdown.
 * Sorted with "Other" last so it always appears at the bottom.
 */
export const INDUSTRY_OPTIONS = (() => {
  const set = new Set(Object.values(MAP).map((v) => v[0]));
  set.add("Other");
  const arr = Array.from(set);
  arr.sort((a, b) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)));
  return arr;
})();

// Name-based chain detection. The live OSM path is authoritative via
// brand/brand:wikidata tags (see leadgen-osm.js); this catches the common
// national chains for records that lack those tags (e.g. older cached rows or
// DB rows in the admin dashboard). Prospectors generally want independent
// local businesses, so callers use this to flag and de-prioritize chains.
const CHAIN_NAME_RE = new RegExp(
  "\\b(" + [
    "7-?eleven", "circle k", "wawa", "racetrac", "speedway", "exxon", "mobil", "shell", "chevron", "bp", "marathon", "citgo", "sunoco",
    "walmart", "target", "costco", "sam's club", "aldi", "publix", "winn-?dixie", "whole foods", "trader joe", "kroger", "dollar general", "dollar tree", "family dollar",
    "cvs", "walgreens", "rite aid",
    "mcdonald", "burger king", "wendy", "taco bell", "kfc", "popeyes", "chick-?fil-?a", "subway", "starbucks", "dunkin", "domino", "pizza hut", "papa john", "chipotle", "panera", "arby", "sonic", "culver", "five guys", "jersey mike", "firehouse subs", "ihop", "denny", "applebee", "olive garden", "chili's", "outback", "panda express",
    "home depot", "lowe's", "best buy", "autozone", "o'reilly", "advance auto", "napa auto", "pep boys", "jiffy lube", "valvoline",
    "bank of america", "wells fargo", "chase", "citibank", "pnc", "truist", "regions", "suntrust", "us bank", "td bank", "capital one", "fifth third",
    "ups store", "fedex", "usps", "h&r block", "great clips", "supercuts", "planet fitness", "anytime fitness", "la fitness", "crunch fitness", "orangetheory",
    "verizon", "at&t", "t-mobile", "xfinity", "spectrum", "enterprise rent", "hertz", "avis", "budget rent", "u-haul",
    "marriott", "hilton", "hampton inn", "holiday inn", "best western", "comfort inn", "la quinta", "courtyard", "fairfield inn", "residence inn",
  ].join("|") + ")\\b",
  "i",
);

export function looksLikeChain(name) {
  return CHAIN_NAME_RE.test(String(name || ""));
}
