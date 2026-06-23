import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { encryptSecret, decryptSecret, encryptionAvailable } from "../crypto.js";

const KEY = randomBytes(32).toString("base64");

describe("integration credential encryption", () => {
  beforeEach(() => { process.env.INTEGRATIONS_ENC_KEY = KEY; });
  afterEach(() => { delete process.env.INTEGRATIONS_ENC_KEY; });

  it("round-trips an encrypted config and stores ciphertext, not plaintext", () => {
    const secret = { api_key: "mc-super-secret-123", list_id: "abc123" };
    const stored = encryptSecret(secret);
    expect(stored.v).toBe(1);
    // The raw key must NOT be recoverable from the stored envelope.
    expect(stored.data).not.toContain("mc-super-secret-123");
    expect(JSON.stringify(stored)).not.toContain("mc-super-secret-123");
    expect(decryptSecret(stored)).toEqual(secret);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptSecret({ k: "v" });
    const b = encryptSecret({ k: "v" });
    expect(a.data).not.toEqual(b.data);
  });

  it("reports availability based on the key", () => {
    expect(encryptionAvailable()).toBe(true);
    delete process.env.INTEGRATIONS_ENC_KEY;
    expect(encryptionAvailable()).toBe(false);
  });

  it("passes through legacy plaintext rows", () => {
    expect(decryptSecret({ url: "https://hook.example" })).toEqual({ url: "https://hook.example" });
  });

  it("rejects tampered ciphertext via the GCM auth tag", () => {
    const stored = encryptSecret({ a: 1 });
    const buf = Buffer.from(stored.data, "base64");
    buf[buf.length - 1] ^= 0xff; // flip a bit in the auth tag
    expect(() => decryptSecret({ v: 1, data: buf.toString("base64") })).toThrow();
  });
});
