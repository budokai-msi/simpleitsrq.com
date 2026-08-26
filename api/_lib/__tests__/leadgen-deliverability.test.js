import { describe, expect, it, vi } from "vitest";

// Mock dns/promises so tests don't hit the network.
vi.mock("node:dns/promises", () => ({
  resolveMx: vi.fn(),
}));

const { hasDeliverableMx } = await import("../leadgen-deliverability.js");
const { resolveMx } = await import("node:dns/promises");

describe("hasDeliverableMx", () => {
  it("returns true when the domain has a real MX record", async () => {
    resolveMx.mockResolvedValue([{ exchange: "mail.example.com", preference: 10 }]);
    await expect(hasDeliverableMx("sales@example.com")).resolves.toBe(true);
  });

  it("returns false when the domain has no MX records", async () => {
    resolveMx.mockResolvedValue([]);
    await expect(hasDeliverableMx("sales@example.com")).resolves.toBe(false);
  });

  it("returns false on a DNS error (NXDOMAIN / query failure)", async () => {
    resolveMx.mockRejectedValue(new Error("queryMx ENOTFOUND"));
    await expect(hasDeliverableMx("sales@example.com")).resolves.toBe(false);
  });

  it("treats a null MX (RFC 7505 '.') as undeliverable", async () => {
    resolveMx.mockResolvedValue([{ exchange: ".", preference: 0 }]);
    await expect(hasDeliverableMx("sales@example.com")).resolves.toBe(false);
  });

  it("returns false for structurally invalid addresses", async () => {
    await expect(hasDeliverableMx("not-an-email")).resolves.toBe(false);
    await expect(hasDeliverableMx("")).resolves.toBe(false);
    await expect(hasDeliverableMx("x@")).resolves.toBe(false);
  });

  it("returns false for non-deliverable TLDs without a DNS call", async () => {
    resolveMx.mockClear();
    await expect(hasDeliverableMx("a@example.invalid")).resolves.toBe(false);
    await expect(hasDeliverableMx("a@b.local")).resolves.toBe(false);
    expect(resolveMx).not.toHaveBeenCalled();
  });
});
