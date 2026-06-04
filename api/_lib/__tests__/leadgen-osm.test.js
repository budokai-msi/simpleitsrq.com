import { afterEach, describe, expect, it, vi } from "vitest";

const { overpassBusinessesResilient } = await import("../leadgen-osm.js");

function overpassResponse(elements, status = 200) {
  return new Response(JSON.stringify({ elements }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("leadgen OSM discovery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("splits large bounding boxes after transient Overpass failures", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(overpassResponse([], 504))
      .mockResolvedValueOnce(overpassResponse([], 504))
      .mockResolvedValueOnce(overpassResponse([{ type: "node", id: 1, tags: { name: "A" } }]))
      .mockResolvedValueOnce(overpassResponse([{ type: "node", id: 2, tags: { name: "B" } }]))
      .mockResolvedValueOnce(overpassResponse([{ type: "node", id: 1, tags: { name: "A duplicate" } }]))
      .mockResolvedValueOnce(overpassResponse([{ type: "way", id: 3, tags: { name: "C" } }]));
    vi.stubGlobal("fetch", fetch);

    const elements = await overpassBusinessesResilient([27.0, -82.5, 27.1, -82.4]);

    expect(fetch).toHaveBeenCalledTimes(6);
    expect(elements.map((el) => `${el.type}/${el.id}`)).toEqual(["node/1", "node/2", "way/3"]);
  });

  it("retries the full Overpass query before splitting", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(overpassResponse([], 504))
      .mockResolvedValueOnce(overpassResponse([{ type: "node", id: 10, tags: { name: "Recovered" } }]));
    vi.stubGlobal("fetch", fetch);

    const elements = await overpassBusinessesResilient([27.0, -82.5, 27.1, -82.4]);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(elements.map((el) => `${el.type}/${el.id}`)).toEqual(["node/10"]);
  });

  it("throws when all fallback chunks fail", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(overpassResponse([], 504))
      .mockResolvedValueOnce(overpassResponse([], 504))
      .mockResolvedValueOnce(overpassResponse([], 504))
      .mockResolvedValueOnce(overpassResponse([], 504))
      .mockResolvedValueOnce(overpassResponse([], 504))
      .mockResolvedValueOnce(overpassResponse([], 504));
    vi.stubGlobal("fetch", fetch);

    await expect(overpassBusinessesResilient([27.0, -82.5, 27.1, -82.4]))
      .rejects.toThrow("overpass http 504");
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it("does not split non-transient Overpass failures", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(overpassResponse([], 400));
    vi.stubGlobal("fetch", fetch);

    await expect(overpassBusinessesResilient([27.0, -82.5, 27.1, -82.4]))
      .rejects.toThrow("overpass http 400");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
