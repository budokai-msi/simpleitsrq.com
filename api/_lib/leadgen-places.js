import { classifyIndustry } from "./leadgen-classify.js";

const PLACES_API_URL = "https://places.googleapis.com/v1/places:searchText";

/**
 * Normalizes a Google Places response into the common lead_businesses format.
 */
function normalizePlace(p, zip) {
  const type = p.types && p.types.length > 0 ? p.types[0] : null;
  const { industry: industry_group, sub_industry } = classifyIndustry(type);
  
  // Extract city/state from formatted address (heuristic)
  let city = null;
  let state = null;
  if (p.formattedAddress) {
    const parts = p.formattedAddress.split(", ");
    if (parts.length >= 3) {
      city = parts[parts.length - 3];
      const stateZip = parts[parts.length - 2].split(" ");
      if (stateZip.length >= 1) state = stateZip[0];
    }
  }

  return {
    name: p.displayName?.text || null,
    legal_name: null,
    brand: null,
    is_chain: false,
    address: p.formattedAddress || null,
    city,
    state,
    zip,
    lat: p.location?.latitude || null,
    lng: p.location?.longitude || null,
    website: p.websiteUri || null,
    phone: p.internationalPhoneNumber || p.nationalPhoneNumber || null,
    source: "google_places",
    source_id: p.id,
    source_url: p.id ? `https://www.google.com/maps/place/?q=place_id:${p.id}` : null,
    industry: type,
    industry_group,
    sub_industry,
    naics: null,
    email: null,
    socialTags: []
  };
}

/**
 * Discover businesses using the Google Places API (New) Text Search endpoint.
 */
export async function discoverBusinessesByZipPlaces(zip, niche) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY is not configured.");
  }

  const query = niche === "All" || !niche ? `businesses in ${zip}` : `${niche} in ${zip}`;
  
  const response = await fetch(PLACES_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.rating,places.types,places.location"
    },
    body: JSON.stringify({
      textQuery: query,
      pageSize: 20
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("[leadgen-places] Google Places API error:", response.status, errText);
    throw new Error(`Google Places API returned ${response.status}`);
  }

  const data = await response.json();
  const places = data.places || [];

  const businesses = places
    .map(p => normalizePlace(p, zip))
    .filter(b => b.name); // Must have a name

  // Calculate centroid from results if any
  let centroid = { lat: 27.3364, lng: -82.5307 }; // Default fallback
  if (businesses.length > 0) {
    const sumLat = businesses.reduce((sum, b) => sum + (b.lat || 0), 0);
    const sumLng = businesses.reduce((sum, b) => sum + (b.lng || 0), 0);
    const count = businesses.filter(b => b.lat && b.lng).length;
    if (count > 0) {
      centroid = { lat: sumLat / count, lng: sumLng / count };
    }
  }

  return { 
    ok: true, 
    businesses, 
    bbox: null, // Bbox is only relevant for OSM Overpass
    centroid
  };
}
