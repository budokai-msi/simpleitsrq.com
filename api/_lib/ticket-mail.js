// api/_lib/ticket-mail.js
//
// Everything about ticket email *addressing* and *sending* lives here so the
// ticket-creation route, the portal reply handler, and the inbound webhook
// all speak the same protocol.
//
// Reply-by-email uses VERP-style signed reply addresses:
//
//     reply+SRQ-20260617-AB3XK.<sig>@inbound.simpleitsrq.com
//
// The <sig> is an HMAC of the ticket code keyed on a server secret, so an
// inbound message can be bound to its ticket without a DB lookup *and*
// without trusting an attacker-supplied "which ticket is this" field. A
// forged or tampered address fails verification and is dropped. This is the
// same shape Help Scout / Front / Discourse use for their reply addresses.
//
// Threading uses RFC 5322 Message-ID / In-Reply-To / References so replies
// nest correctly in Gmail, Outlook, and Apple Mail instead of starting a new
// conversation each time.

import { createHmac, timingSafeEqual } from "node:crypto";
import { Resend } from "resend";
import { escapeHtml } from "./sanitize.js";
import { REPLY_DELIMITER } from "./email-reply-parser.js";

const SUPPORT_EMAIL = "hello@simpleitsrq.com";
const FROM = `Simple IT SRQ <${SUPPORT_EMAIL}>`;

// Subdomain that carries the inbound MX records (kept off the apex so the
// main mail flow is untouched). Override per-env if it ever moves.
const INBOUND_DOMAIN = () => process.env.INBOUND_EMAIL_DOMAIN || "inbound.simpleitsrq.com";

// Dedicated secret, falling back to the session secret so reply-by-email
// works the moment AUTH_SECRET is set even before a separate key is minted.
const secret = () => process.env.TICKET_MAIL_SECRET || process.env.AUTH_SECRET || "";

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// Short, URL/email-safe signature over the ticket code. 12 base64url chars
// (~72 bits) is plenty to stop forgery while keeping the address typable.
function sign(ticketCode) {
  const mac = createHmac("sha256", secret()).update(`ticket:${ticketCode}`).digest();
  return b64url(mac).slice(0, 16);
}

/** The signed Reply-To address a customer should reply to for this ticket. */
export function replyToAddress(ticketCode) {
  if (!secret()) return SUPPORT_EMAIL; // no secret configured ⇒ no VERP
  return `reply+${ticketCode}.${sign(ticketCode)}@${INBOUND_DOMAIN()}`;
}

/**
 * Parse + verify an inbound recipient address. Returns the ticket code only
 * when the signature checks out; null otherwise.
 *
 * Accepts a bare address or a full "Name <addr>" header value.
 * @param {string} raw
 * @returns {string|null}
 */
export function parseReplyAddress(raw) {
  if (!raw || !secret()) return null;
  const m = String(raw).match(/reply\+([^.@\s]+)\.([^@\s]+)@/i);
  if (!m) return null;
  const [, ticketCode, sig] = m;
  const expected = sign(ticketCode);
  // constant-time compare on equal-length buffers
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  try {
    return timingSafeEqual(a, b) ? ticketCode : null;
  } catch {
    return null;
  }
}

/** Scan a list of candidate recipients (To + Cc) for a valid reply address. */
export function findTicketCode(recipients = []) {
  for (const r of recipients) {
    const code = parseReplyAddress(typeof r === "string" ? r : r?.address || r?.email || "");
    if (code) return code;
  }
  return null;
}

// ── Generic signed opaque tokens ───────────────────────────────────────
// Used for the public .ics download link emailed to customers: the link
// carries ?uid=<apptUid>&t=<sig> and the server re-derives the signature to
// authorize the download without requiring a portal login.
export function signValue(value) {
  const mac = createHmac("sha256", secret()).update(`ics:${value}`).digest();
  return b64url(mac).slice(0, 24);
}

export function verifyValue(value, sig) {
  if (!value || !sig || !secret()) return false;
  const a = Buffer.from(String(sig));
  const b = Buffer.from(signValue(value));
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

const domainForId = () => INBOUND_DOMAIN().replace(/^inbound\./, "") || "simpleitsrq.com";

/** Generate an RFC 5322 Message-ID for an outbound ticket email. */
export function newMessageId(ticketCode) {
  const rand = b64url(createHmac("sha256", secret() || "x")
    .update(`${ticketCode}:${Date.now()}:${Math.random()}`).digest()).slice(0, 20);
  return `<${ticketCode}.${rand}@${domainForId()}>`;
}

// ── Reply-above-this-line banner ───────────────────────────────────────
// Customers reply to the email; their client quotes everything *including*
// this banner, and the parser cuts at it. The visible copy tells them where
// to type so the cut lands cleanly.
const replyBannerHtml = () => `
  <div style="margin:0 0 18px;padding:10px 14px;background:#f1f5f9;border:1px dashed #cbd5e1;border-radius:8px;font-size:12px;color:#64748b;text-align:center">
    Reply to this email and we'll add it to your ticket — type above the line below.
  </div>`;

const replyBannerText = () =>
  `You can reply directly to this email and we'll add it to your ticket.\n\n${REPLY_DELIMITER}\n`;

/**
 * Send one ticket email through Resend with the full reply-by-email +
 * threading + CC protocol applied. Best-effort: returns the Resend id on
 * success, or { error } — callers treat email as non-blocking.
 *
 * @param {object} o
 * @param {string}   o.ticketCode
 * @param {string|string[]} o.to        primary recipient(s)
 * @param {string[]} [o.cc]             cc recipients (deduped against `to`)
 * @param {string}   o.subject
 * @param {string}   o.html             body HTML (banner is prepended)
 * @param {string}   o.text             body text (delimiter is appended)
 * @param {string}   [o.messageId]      outbound Message-ID (generated if omitted)
 * @param {string}   [o.inReplyTo]      Message-ID this is a reply to
 * @param {string[]} [o.references]     prior Message-IDs in the thread
 * @param {string[]} [o.attachments]    Resend attachment objects
 * @returns {Promise<{id?:string, messageId?:string, error?:unknown}>}
 */
export async function sendTicketEmail(o) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[ticket-mail] RESEND_API_KEY not set — skipping send");
    return { error: "no_api_key" };
  }

  const toList = (Array.isArray(o.to) ? o.to : [o.to]).filter(Boolean);
  const toSet = new Set(toList.map((s) => s.toLowerCase()));
  const ccList = (o.cc || [])
    .filter(Boolean)
    .filter((c) => !toSet.has(String(c).toLowerCase()));

  const messageId = o.messageId || newMessageId(o.ticketCode);
  const headers = {
    "X-Ticket-ID": o.ticketCode,
    "Message-ID": messageId,
  };
  if (o.inReplyTo) headers["In-Reply-To"] = o.inReplyTo;
  const refs = [...(o.references || []), o.inReplyTo].filter(Boolean);
  if (refs.length) headers["References"] = refs.join(" ");

  const html = replyBannerHtml() + o.html;
  const text = o.text + "\n\n" + replyBannerText();

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: toList,
      ...(ccList.length ? { cc: ccList } : {}),
      replyTo: replyToAddress(o.ticketCode),
      subject: o.subject,
      html,
      text,
      headers,
      ...(o.attachments?.length ? { attachments: o.attachments } : {}),
    });
    if (error) {
      console.error("[ticket-mail] resend error", error);
      return { error };
    }
    return { id: data?.id, messageId };
  } catch (err) {
    console.error("[ticket-mail] resend threw", err);
    return { error: err };
  }
}

export { SUPPORT_EMAIL, FROM, escapeHtml };
