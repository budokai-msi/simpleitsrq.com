import { describe, it, expect } from "vitest";
import { parseRawEmail } from "../mime-parse.js";

describe("parseRawEmail", () => {
  it("extracts a simple text/plain body", () => {
    const raw = [
      "From: Jane <jane@example.com>",
      "To: reply+SRQ-1.abc@simpleitsrq.com",
      "Subject: Re: ticket",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Yes that works, thanks.",
    ].join("\r\n");
    const { text } = parseRawEmail(raw);
    expect(text.trim()).toBe("Yes that works, thanks.");
  });

  it("decodes quoted-printable", () => {
    const raw = [
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "Caf=C3=A9 meeting at 3 =E2=80=94 sounds good=21",
    ].join("\r\n");
    const { text } = parseRawEmail(raw);
    expect(text).toContain("Café meeting at 3 — sounds good!");
  });

  it("decodes base64", () => {
    const body = Buffer.from("Hello from base64", "utf8").toString("base64");
    const raw = [
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: base64",
      "",
      body,
    ].join("\r\n");
    expect(parseRawEmail(raw).text.trim()).toBe("Hello from base64");
  });

  it("prefers text/plain from multipart/alternative and also captures html", () => {
    const boundary = "BOUND123";
    const raw = [
      "Content-Type: multipart/alternative; boundary=\"" + boundary + "\"",
      "",
      "--" + boundary,
      "Content-Type: text/plain; charset=utf-8",
      "",
      "plain version",
      "--" + boundary,
      "Content-Type: text/html; charset=utf-8",
      "",
      "<p>html version</p>",
      "--" + boundary + "--",
      "",
    ].join("\r\n");
    const { text, html } = parseRawEmail(raw);
    expect(text.trim()).toBe("plain version");
    expect(html).toContain("html version");
  });

  it("handles nested multipart/mixed > multipart/alternative", () => {
    const outer = "OUT", inner = "IN";
    const raw = [
      `Content-Type: multipart/mixed; boundary="${outer}"`,
      "",
      `--${outer}`,
      `Content-Type: multipart/alternative; boundary="${inner}"`,
      "",
      `--${inner}`,
      "Content-Type: text/plain",
      "",
      "the real reply",
      `--${inner}--`,
      `--${outer}`,
      "Content-Type: text/plain",
      "Content-Disposition: attachment; filename=note.txt",
      "",
      "an attachment we should ignore",
      `--${outer}--`,
      "",
    ].join("\r\n");
    const { text } = parseRawEmail(raw);
    expect(text.trim()).toBe("the real reply");
    expect(text).not.toContain("attachment we should ignore");
  });

  it("never throws on garbage", () => {
    expect(() => parseRawEmail("")).not.toThrow();
    expect(() => parseRawEmail(null)).not.toThrow();
    expect(parseRawEmail("no headers just text").text).toContain("no headers just text");
  });
});
