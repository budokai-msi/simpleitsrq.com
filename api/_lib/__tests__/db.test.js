import { describe, expect, it } from "vitest";
import { pickDatabaseUrl } from "../db.js";

describe("pickDatabaseUrl", () => {
  it("ignores empty DATABASE_URL and uses a configured fallback", () => {
    expect(pickDatabaseUrl({
      DATABASE_URL: "",
      POSTGRES_PRISMA_URL: "  ",
      POSTGRES_URL: "postgres://pool",
    })).toEqual({ key: "POSTGRES_URL", url: "postgres://pool" });
  });

  it("prefers DATABASE_URL when it is present", () => {
    expect(pickDatabaseUrl({
      DATABASE_URL: "postgres://primary",
      POSTGRES_URL: "postgres://pool",
    })).toEqual({ key: "DATABASE_URL", url: "postgres://primary" });
  });
});
