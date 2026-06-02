import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("botid/server", () => ({ checkBotId: vi.fn() }));
vi.mock("../db.js", () => ({ sql: vi.fn() }));

const originalEnv = { ...process.env };

process.env = {
  ...originalEnv,
  RESEND_API_KEY: "test-resend-key",
  TURNSTILE_SECRET_KEY: "test-turnstile-key",
};

const {
  normalizeServiceReserveBody,
  buildServiceReserveEmail,
} = await import("../../contact.js");

describe("service reservation contact payload", () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      RESEND_API_KEY: "test-resend-key",
      TURNSTILE_SECRET_KEY: "test-turnstile-key",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("normalizes a priced service request into structured sales context", () => {
    const parsed = normalizeServiceReserveBody({
      kind: "service_reserve",
      name: "Buyer\r\nBcc: bad@example.com",
      email: "BUYER@Example.COM",
      phone: " (941) 555-0144 ",
      service_slug: "M365 Migration!!",
      service_title: "Microsoft 365 Migration\r\nInjected: nope",
      service_price: 1500,
      service_price_label: "from $1,500",
      service_price_note: "Up to 25 mailboxes",
      source: "services-reserve",
    });

    expect(parsed.ok).toBe(true);
    expect(parsed.value).toMatchObject({
      name: "Buyer Bcc: bad@example.com",
      email: "buyer@example.com",
      phone: "(941) 555-0144",
      serviceSlug: "m365-migration",
      serviceTitle: "Microsoft 365 Migration Injected: nope",
      servicePrice: 1500,
      priceLabel: "from $1,500",
      priceNote: "Up to 25 mailboxes",
      source: "services-reserve",
    });

    const email = buildServiceReserveEmail(parsed.value, "203.0.113.10");
    expect(email.subject).toBe("Service reservation: Microsoft 365 Migration Injected: nope - from $1,500");
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.text).toContain("Slug: m365-migration");
    expect(email.text).toContain("Posted price: from $1,500");
    expect(email.text).toContain("Submitter IP: 203.0.113.10");
    expect(email.replyTo).toBe("buyer@example.com");
  });

  it("rejects missing customer or service fields", () => {
    expect(normalizeServiceReserveBody({ service_slug: "ssd-upgrade", service_title: "SSD Upgrade" }))
      .toEqual({ ok: false, error: "email_invalid" });
    expect(normalizeServiceReserveBody({ email: "buyer@example.com", service_title: "SSD Upgrade" }))
      .toEqual({ ok: false, error: "service_required" });
    expect(normalizeServiceReserveBody({ email: "buyer@example.com", service_slug: "ssd-upgrade" }))
      .toEqual({ ok: false, error: "service_required" });
  });

  it("escapes HTML content in the admin email", () => {
    const parsed = normalizeServiceReserveBody({
      email: "buyer@example.com",
      service_slug: "network-audit",
      service_title: "<Network Audit>",
      service_price: 399,
      message: "<script>alert('x')</script>",
    });
    const email = buildServiceReserveEmail(parsed.value, "unknown");

    expect(email.subject).toBe("Service reservation: <Network Audit> - $399");
    expect(email.html).toContain("&lt;Network Audit&gt;");
    expect(email.html).toContain("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
  });
});
