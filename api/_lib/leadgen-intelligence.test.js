import { describe, expect, it } from "vitest";
import { analyzeBusinessRecord, deduplicateBusinesses, LEAD_INTELLIGENCE_MODEL } from "./leadgen-intelligence.js";

describe("Leadgen data quality", () => {
  it("collapses duplicate business records by website and preserves richer evidence", () => {
    const rows = deduplicateBusinesses([
      { name:"Acme LLC", zip:"34236", website:"https://acme.test", phone:null, source:"osm", source_id:"node/1" },
      { name:"Acme", zip:"34236", website:"https://www.acme.test/contact", phone:"9415550100", address:"1 Main St", city:"Sarasota", source:"osm", source_id:"way/2" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].phone).toBe("9415550100");
    expect(rows[0].duplicate_evidence_count).toBe(2);
  });

  it("rewards fresh, complete, sourced records with higher quality", () => {
    const now = Date.UTC(2026,7,13);
    const rich = analyzeBusinessRecord({ name:"Rich", address:"1 Main", city:"Sarasota", state:"FL", zip:"34236", website:"https://rich.test", phone:"9415550101", source:"osm", source_id:"node/1", source_url:"https://openstreetmap.org/node/1", industry_group:"Professional Services", sub_industry:"Accounting", updated_at:new Date(now).toISOString() }, { now });
    const sparse = analyzeBusinessRecord({ name:"Sparse", source:"unknown", updated_at:"2024-01-01T00:00:00Z" }, { now });
    expect(rich.data_quality).toBeGreaterThan(sparse.data_quality);
    expect(rich.provenance_confidence).toBeGreaterThan(sparse.provenance_confidence);
    expect(rich.model_version).toBe(LEAD_INTELLIGENCE_MODEL);
  });

  it("decays freshness instead of treating old cache rows as equally current", () => {
    const now = Date.UTC(2026,7,13);
    const fresh = analyzeBusinessRecord({ name:"A", source:"osm", updated_at:new Date(now).toISOString() }, { now });
    const old = analyzeBusinessRecord({ name:"A", source:"osm", updated_at:"2025-01-01T00:00:00Z" }, { now });
    expect(fresh.freshness).toBeGreaterThan(old.freshness);
    expect(old.data_age_days).toBeGreaterThan(365);
  });
});
