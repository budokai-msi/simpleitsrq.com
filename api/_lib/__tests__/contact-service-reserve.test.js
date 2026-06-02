import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sqlQueue = [];
const sqlCalls = [];

vi.mock("botid/server", () => ({ checkBotId: vi.fn() }));
vi.mock("../db.js", () => ({
  sql: vi.fn((strings, ...values) => {
    sqlCalls.push({ text: Array.from(strings).join("?"), values });
    const next = sqlQueue.shift();
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next || []);
  }),
}));

const originalEnv = { ...process.env };

process.env = {
  ...originalEnv,
  RESEND_API_KEY: "test-resend-key",
  TURNSTILE_SECRET_KEY: "test-turnstile-key",
};

const {
  normalizeServiceReserveBody,
  buildServiceReserveEmail,
  persistServiceReserveLead,
} = await import("../../contact.js");

describe("service reservation contact payload", () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      RESEND_API_KEY: "test-resend-key",
      TURNSTILE_SECRET_KEY: "test-turnstile-key",
    };
    sqlQueue.length = 0;
    sqlCalls.length = 0;
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

  it("persists a new service reservation lead to the existing subscriber store", async () => {
    sqlQueue.push([], []);
    const parsed = normalizeServiceReserveBody({
      email: "buyer@example.com",
      service_slug: "ssd-upgrade",
      service_title: "SSD Upgrade",
      service_price: 249,
    });

    const result = await persistServiceReserveLead(parsed.value, "198.51.100.10");

    expect(result).toEqual({
      ok: true,
      action: "inserted",
      source: "service-reserve:ssd-upgrade",
    });
    expect(sqlCalls).toHaveLength(2);
    expect(sqlCalls[0].text).toContain("SELECT id FROM newsletter_subscribers");
    expect(sqlCalls[0].values).toContain("buyer@example.com");
    expect(sqlCalls[1].text).toContain("INSERT INTO newsletter_subscribers");
    expect(sqlCalls[1].values).toContain("service-reserve:ssd-upgrade");
    expect(sqlCalls[1].values).toContain("198.51.100.10");
  });

  it("updates an existing subscriber row with the latest service intent", async () => {
    sqlQueue.push([{ id: 42 }], []);
    const parsed = normalizeServiceReserveBody({
      email: "buyer@example.com",
      service_slug: "network-audit",
      service_title: "Network + Wi-Fi Audit",
      service_price: 399,
    });

    const result = await persistServiceReserveLead(parsed.value, "203.0.113.25");

    expect(result).toEqual({
      ok: true,
      action: "updated",
      source: "service-reserve:network-audit",
    });
    expect(sqlCalls).toHaveLength(2);
    expect(sqlCalls[1].text).toContain("UPDATE newsletter_subscribers");
    expect(sqlCalls[1].values).toContain("service-reserve:network-audit");
    expect(sqlCalls[1].values).toContain("203.0.113.25");
    expect(sqlCalls[1].values).toContain(42);
  });
});
