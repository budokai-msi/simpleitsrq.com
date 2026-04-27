// GET /api/reviews
//
// Server-side proxy for Google Place Details — fetches text reviews + the
// aggregate rating + total review count for a configured Google Business
// Profile and returns a thin JSON payload. Keeps the API key off the
// client, lets us cache aggressively at the edge, and means we don't have
// to ship Google's JS Maps loader (~80 KB) just to display 5 stars.
//
// Required env vars:
//   GOOGLE_PLACES_API_KEY  — server-side Google Places API key (Place
//                            Details enabled). NEVER expose with VITE_ prefix.
//   GOOGLE_PLACE_ID        — the Place ID for Simple IT SRQ's GBP listing.
//                            Find via https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder
//
// Returns 503 + { ok: false, configured: false } when either env var is
// missing — lets the client component hide the section gracefully without
// a broken-data flash.

const ENDPOINT = "https://maps.googleapis.com/maps/api/place/details/json";

// Edge cache: 6 hours fresh, 24 hours stale-while-revalidate. Reviews
// move slowly; the visitor sees a fast cached response and we burn one
// upstream call every 6 hours per region.
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=21600, stale-while-revalidate=86400",
  "Content-Type": "application/json",
};

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CACHE_HEADERS, ...headers },
  });
}

export async function GET() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;
  if (!apiKey || !placeId) {
    return json(503, { ok: false, configured: false });
  }

  const url = new URL(ENDPOINT);
  url.searchParams.set("place_id", placeId);
  url.searchParams.set(
    "fields",
    ["name", "rating", "user_ratings_total", "reviews", "url"].join(","),
  );
  url.searchParams.set("reviews_sort", "newest");
  url.searchParams.set("language", "en");
  url.searchParams.set("key", apiKey);

  let upstream;
  try {
    upstream = await fetch(url, { signal: AbortSignal.timeout(8000) });
  } catch (err) {
    console.error("[reviews] upstream fetch failed", err);
    return json(502, { ok: false, error: "upstream_unreachable" });
  }
  if (!upstream.ok) {
    return json(upstream.status, { ok: false, error: "upstream_status" });
  }
  const data = await upstream.json().catch(() => null);
  if (!data || data.status !== "OK" || !data.result) {
    return json(502, { ok: false, error: data?.status || "upstream_no_result" });
  }

  const r = data.result;
  return json(200, {
    ok: true,
    name: r.name,
    rating: r.rating ?? null,
    total: r.user_ratings_total ?? 0,
    profileUrl: r.url || null,
    reviews: Array.isArray(r.reviews)
      ? r.reviews.slice(0, 8).map((rev) => ({
          author: rev.author_name,
          authorPhoto: rev.profile_photo_url,
          rating: rev.rating,
          text: rev.text,
          time: rev.time, // unix seconds
          relative: rev.relative_time_description,
          translated: !!rev.translated,
          language: rev.language,
        }))
      : [],
  });
}
