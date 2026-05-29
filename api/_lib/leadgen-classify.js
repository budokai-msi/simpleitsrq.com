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

  // ── Education ────────────────────────────────────────────────
  "amenity:school":       ["Education", "School"],
  "amenity:college":      ["Education", "College"],
  "amenity:university":   ["Education", "University"],
  "amenity:kindergarten": ["Education", "Childcare"],
  "amenity:childcare":    ["Education", "Childcare"],
  "amenity:library":      ["Education", "Library"],
  "amenity:driving_school": ["Education", "Driving school"],

  // ── Recreation / Fitness ─────────────────────────────────────
  "leisure:fitness_centre": ["Recreation", "Gym"],
  "leisure:sports_centre":  ["Recreation", "Sports center"],
  "amenity:gym":          ["Recreation", "Gym"],
  "amenity:cinema":       ["Recreation", "Cinema"],
  "amenity:theatre":      ["Recreation", "Theatre"],
  "amenity:nightclub":    ["Recreation", "Nightclub"],
  "amenity:marketplace":  ["Recreation", "Marketplace"],
};

/**
 * Classify a raw OSM industry tag (e.g. "shop:car_parts") into a
 * two-level taxonomy. Falls back to splitting the tag on ":" so the
 * "Other" bucket still has *some* hierarchy.
 */
export function classifyIndustry(rawTag) {
  if (!rawTag) return { industry: "Other", sub_industry: null };
  const hit = MAP[rawTag];
  if (hit) return { industry: hit[0], sub_industry: hit[1] };
  // Unknown — bucket by OSM key (shop, amenity, healthcare…) and use the
  // value as sub-industry, prettified.
  const [key, val] = String(rawTag).split(":");
  const groupMap = {
    shop: "Retail", amenity: "Other", healthcare: "Healthcare",
    office: "Professional Services", craft: "Trades", tourism: "Hospitality",
    leisure: "Recreation",
  };
  return {
    industry: groupMap[key] || "Other",
    sub_industry: val ? val.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : null,
  };
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
