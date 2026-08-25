import { describe, expect, it } from "vitest";
import { classifyIndustry, INDUSTRY_OPTIONS } from "../leadgen-classify.js";

describe("classifyIndustry (provider + OSM taxonomy)", () => {
  it("maps bare Google Places type names to real industry groups", () => {
    expect(classifyIndustry("car_dealer")).toEqual({ industry: "Automotive", sub_industry: "Car dealer" });
    expect(classifyIndustry("dental_clinic")).toEqual({ industry: "Healthcare", sub_industry: "Dentist" });
    expect(classifyIndustry("insurance_agency")).toEqual({ industry: "Professional Services", sub_industry: "Insurance" });
    expect(classifyIndustry("grocery_store")).toEqual({ industry: "Retail", sub_industry: "Grocery store" });
    expect(classifyIndustry("historic_site")).toEqual({ industry: "Recreation", sub_industry: "Historic site" });
    expect(classifyIndustry("place_of_worship")).toEqual({ industry: "Recreation", sub_industry: "Place of worship" });
  });

  it("keeps OSM key:value tags working", () => {
    expect(classifyIndustry("amenity:fast_food")).toEqual({ industry: "Food & Drink", sub_industry: "Fast food" });
    expect(classifyIndustry("shop:car_repair")).toEqual({ industry: "Automotive", sub_industry: "Auto repair" });
    expect(classifyIndustry("craft:electrician")).toEqual({ industry: "Trades", sub_industry: "Electrician" });
  });

  it("handles Overture-prefixed category ids", () => {
    expect(classifyIndustry("overture:retail.auto_parts").industry).toBe("Automotive");
    expect(classifyIndustry("overture:amenity.dentist").industry).toBe("Healthcare");
  });

  it("uses keyword fallback for unknown types instead of dumping into Other", () => {
    expect(classifyIndustry("auto_parts_wholesaler").industry).toBe("Automotive");
    expect(classifyIndustry("oil_change").industry).toBe("Automotive");
    expect(classifyIndustry("cafe_terrace").industry).toBe("Food & Drink");
  });

  it("falls back to Other with a sub-industry label for truly unknown tokens", () => {
    const result = classifyIndustry("oddball_thingamajig");
    expect(result.industry).toBe("Other");
    expect(result.sub_industry).toBe("Oddball Thingamajig");
  });

  it("returns Other/null for empty input", () => {
    expect(classifyIndustry(null)).toEqual({ industry: "Other", sub_industry: null });
    expect(classifyIndustry("")).toEqual({ industry: "Other", sub_industry: null });
  });
});

describe("INDUSTRY_OPTIONS", () => {
  it("is sorted with Other last", () => {
    expect(INDUSTRY_OPTIONS[INDUSTRY_OPTIONS.length - 1]).toBe("Other");
    expect(INDUSTRY_OPTIONS).toContain("Automotive");
    expect(INDUSTRY_OPTIONS).toContain("Healthcare");
  });
});
