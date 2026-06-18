import { describe, it, expect, beforeAll } from "vitest";
import { extractReply, REPLY_DELIMITER } from "../email-reply-parser.js";
import { buildIcs, calendarLinks } from "../ics.js";

// VERP + token helpers read the secret at call time, so set one first.
beforeAll(() => {
  process.env.TICKET_MAIL_SECRET = "test-secret-key-aaaaaaaaaaaaaaaaaaaa";
  process.env.INBOUND_EMAIL_DOMAIN = "inbound.simpleitsrq.com";
});

describe("email-reply-parser", () => {
  it("cuts at the reply delimiter sentinel", () => {
    const body = [
      "Yes, Tuesday at 2pm works great. Thanks!",
      "",
      `On Tue, Jun 17, 2026 at 9:04 AM Simple IT SRQ <reply+SRQ-1.x@inbound.simpleitsrq.com> wrote:`,
      "",
      REPLY_DELIMITER,
      "> Hi, we wanted to confirm your appointment...",
      "> Ticket SRQ-20260617-AB3XK",
    ].join("\n");
    const { reply, usedDelimiter } = extractReply(body);
    expect(usedDelimiter).toBe(true);
    expect(reply).toBe("Yes, Tuesday at 2pm works great. Thanks!");
  });

  it("falls back to the heuristic when no delimiter is present", () => {
    const body = [
      "Sounds good, see you then.",
      "",
      "On Mon, Jun 16, 2026 at 4:00 PM Jane <jane@example.com> wrote:",
      "> previous message body here",
      "> more quoted text",
    ].join("\n");
    const { reply, usedDelimiter } = extractReply(body);
    expect(usedDelimiter).toBe(false);
    expect(reply).toBe("Sounds good, see you then.");
  });

  it("strips a mobile signature", () => {
    const { reply } = extractReply("Will do.\n\nSent from my iPhone");
    expect(reply).toBe("Will do.");
  });

  it("strips an Outlook-style quoted block", () => {
    const body = [
      "Approved.",
      "",
      "From: Simple IT SRQ <hello@simpleitsrq.com>",
      "Sent: Tuesday, June 17, 2026",
      "Subject: Your ticket",
      "",
      "Original message text",
    ].join("\n");
    expect(extractReply(body).reply).toBe("Approved.");
  });

  it("does not over-trim a message that merely starts a line with >", () => {
    const body = "Here is my config:\n> server { listen 80; }\nThat is all.";
    // The quoted run is a minority of the message, so it should be kept.
    expect(extractReply(body).reply).toContain("That is all.");
  });

  it("returns empty string for empty input without throwing", () => {
    expect(extractReply("").reply).toBe("");
    expect(extractReply(null).reply).toBe("");
  });
});

describe("ics generation", () => {
  const ev = {
    uid: "appt-123@simpleitsrq.com",
    title: "On-site network visit",
    location: "123 Main St, Sarasota, FL",
    description: "Replace the failing switch; bring spare SFP.",
    start: new Date("2026-06-20T18:00:00Z"),
    end: new Date("2026-06-20T19:00:00Z"),
    organizerName: "Simple IT SRQ",
    organizerEmail: "hello@simpleitsrq.com",
    status: "CONFIRMED",
  };

  it("emits a well-formed VCALENDAR with CRLF endings", () => {
    const ics = buildIcs(ev, new Date("2026-06-17T12:00:00Z"));
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(ics).toContain("END:VCALENDAR\r\n");
    expect(ics).toContain("UID:appt-123@simpleitsrq.com");
    expect(ics).toContain("DTSTART:20260620T180000Z");
    expect(ics).toContain("DTEND:20260620T190000Z");
    expect(ics).toContain("SUMMARY:On-site network visit");
    expect(ics).toContain("METHOD:PUBLISH");
    expect(ics).toContain("BEGIN:VALARM");
  });

  it("escapes TEXT special characters", () => {
    const ics = buildIcs({ ...ev, title: "Visit; bring tools, fast" });
    expect(ics).toContain("SUMMARY:Visit\\; bring tools\\, fast");
  });

  it("uses METHOD:CANCEL for cancelled events", () => {
    const ics = buildIcs({ ...ev, status: "CANCELLED" });
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
  });

  it("folds long lines to <=75 octets", () => {
    const longTitle = "A".repeat(200);
    const ics = buildIcs({ ...ev, title: longTitle });
    for (const line of ics.split("\r\n")) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
  });

  it("builds provider links with the right hosts + params", () => {
    const links = calendarLinks(ev);
    expect(links.google).toContain("calendar.google.com/calendar/render");
    expect(links.google).toContain("20260620T180000Z%2F20260620T190000Z");
    expect(links.outlook).toContain("outlook.live.com");
    expect(links.office365).toContain("outlook.office.com");
    expect(links.yahoo).toContain("calendar.yahoo.com");
  });
});

describe("VERP reply addressing", () => {
  // Imported lazily so the secret is set before the module reads it. (ESM
  // evaluates imports eagerly, but these functions read process.env at call
  // time, so a normal top-level import is fine.)
  it("round-trips a ticket code through sign/parse", async () => {
    const { replyToAddress, parseReplyAddress } = await import("../ticket-mail.js");
    const addr = replyToAddress("SRQ-20260617-AB3XK");
    expect(addr).toMatch(/^reply\+SRQ-20260617-AB3XK\.[A-Za-z0-9_-]+@inbound\.simpleitsrq\.com$/);
    expect(parseReplyAddress(addr)).toBe("SRQ-20260617-AB3XK");
  });

  it("rejects a tampered signature", async () => {
    const { replyToAddress, parseReplyAddress } = await import("../ticket-mail.js");
    const addr = replyToAddress("SRQ-1").replace(/\.[^.@]+@/, ".deadbeef@");
    expect(parseReplyAddress(addr)).toBeNull();
  });

  it("rejects an unrelated address", async () => {
    const { parseReplyAddress } = await import("../ticket-mail.js");
    expect(parseReplyAddress("randomguy@gmail.com")).toBeNull();
  });

  it("finds the ticket code among multiple recipients", async () => {
    const { replyToAddress, findTicketCode } = await import("../ticket-mail.js");
    const addr = replyToAddress("SRQ-XYZ");
    const code = findTicketCode(["someone@else.com", { address: addr }]);
    expect(code).toBe("SRQ-XYZ");
  });

  it("signs + verifies opaque .ics tokens", async () => {
    const { signValue, verifyValue } = await import("../ticket-mail.js");
    const uid = "appt-abc@simpleitsrq.com";
    const sig = signValue(uid);
    expect(verifyValue(uid, sig)).toBe(true);
    expect(verifyValue(uid, "wrong")).toBe(false);
  });
});
