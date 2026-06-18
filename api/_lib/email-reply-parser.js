// api/_lib/email-reply-parser.js
//
// Extract only the *new* reply text from an inbound email, discarding the
// quoted history, the client's signature, and any mobile-client footer.
//
// Two strategies, applied in order:
//
//   1. Delimiter sentinel (primary, most reliable). Every outbound ticket
//      email we send embeds a fixed marker line — REPLY_DELIMITER below —
//      with the instruction "type your reply above this line". When the
//      customer replies, their client quotes the whole message *including*
//      that line, so we can cut everything from the first sentinel onward
//      and keep exactly what they typed. This is the technique Zendesk,
//      Help Scout, and Front all use, and it's robust across every mail
//      client because it doesn't depend on how that client formats quotes.
//
//   2. Heuristic parser (fallback, for replies that lost the sentinel —
//      forwards, plain-text clients that strip it, etc.). A port of the
//      well-trodden email_reply_parser logic (GitHub / Willdurand / Zapier):
//      walk the lines, cut at the first attribution header ("On <date>,
//      <name> wrote:" and friends), at "-----Original Message-----", at a
//      run of quoted (`>`) lines, and strip trailing signatures.
//
// Always returns a trimmed string. Never throws.

// The sentinel must be plain ASCII so no mail client mangles it, and
// distinctive enough that it never collides with real prose. Keep this in
// sync with the copy emitted by ticket-mail.js.
export const REPLY_DELIMITER = "##- Please type your reply above this line -##";

// Matches the sentinel even if a client prefixes it with quote markers
// (`> `, `>> `) or surrounding whitespace.
const DELIMITER_RE = /^[>\s]*##-\s*Please type your reply above this line\s*-##/im;

// Attribution lines that introduce a quoted block. Deliberately broad —
// covers Gmail/Apple ("On <date> <name> wrote:"), Outlook ("From: ... Sent:
// ..."), and the localized variants we actually see from SW-Florida clients.
const QUOTE_HEADER_RES = [
  // "On Tue, Jun 17, 2026 at 9:04 AM Jane Doe <jane@x.com> wrote:"
  // (may wrap across two lines — we also catch a dangling "wrote:" below)
  /^On\s.+?\bwrote:\s*$/i,
  /^On\s.+?\b(wrote|sent|escribió|écrit|schrieb):?\s*$/i,
  // Outlook block header
  /^From:\s.+$/i,
  // Old-school separators
  /^-{2,}\s*Original Message\s*-{2,}/i,
  /^_{5,}$/, // Outlook's underscore rule above the quoted header
  /^-{5,}$/,
  // Forwarded message banner
  /^-{2,}\s*Forwarded message\s*-{2,}/i,
  /^Begin forwarded message:/i,
];

// A line that is the *start* of a multi-line attribution, e.g. a Gmail
// "On ... " line whose "wrote:" landed on the next line.
const QUOTE_HEADER_START_RE = /^On\s.+,\s*$/i;

// Signature / footer markers. Everything from here down is dropped.
const SIGNATURE_RES = [
  /^--\s*$/,            // RFC 3676 signature delimiter ("-- ")
  /^__+\s*$/,           // underscore rule some clients use
  /^Sent from my\s.+/i, // iPhone / iPad / Galaxy / Samsung
  /^Sent via\s.+/i,
  /^Get Outlook for\s.+/i,
  /^Enviado desde mi\s.+/i,
];

const normalize = (raw) =>
  String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // Non-breaking spaces show up in pasted signatures; treat as spaces.
    .replace(/\u00A0/g, " ");

/**
 * Cut everything from the reply-delimiter sentinel onward.
 * @returns {string|null} the text above the sentinel, or null if absent.
 */
function cutAtDelimiter(text) {
  const m = DELIMITER_RE.exec(text);
  if (!m) return null;
  return text.slice(0, m.index);
}

const isQuoted = (line) => /^\s*>/.test(line);

const isQuoteHeader = (line) => QUOTE_HEADER_RES.some((re) => re.test(line.trim()));

const isSignature = (line) => SIGNATURE_RES.some((re) => re.test(line.trim()));

/**
 * Heuristic extraction for replies that lost the sentinel.
 */
function heuristicVisible(text) {
  const lines = text.split("\n");
  const kept = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Multi-line Gmail attribution: "On ...,\n<name> wrote:" — peek ahead.
    if (QUOTE_HEADER_START_RE.test(line.trim())) {
      const next = (lines[i + 1] || "").trim();
      if (/\bwrote:\s*$/i.test(next) || /<[^>]+@[^>]+>/.test(next)) break;
    }

    if (isQuoteHeader(line)) break;

    // A quoted line — but only treat it as the start of the trailer if the
    // rest of the message is also mostly quoted (guards against someone who
    // legitimately starts a line with ">").
    if (isQuoted(line)) {
      const rest = lines.slice(i);
      const quotedCount = rest.filter((l) => isQuoted(l) || l.trim() === "").length;
      if (quotedCount / rest.length > 0.6) break;
    }

    if (isSignature(line)) break;

    kept.push(line);
  }

  return kept.join("\n");
}

/**
 * Extract the customer's new reply from an inbound email body.
 *
 * @param {string} body          plain-text body of the inbound email
 * @param {object} [opts]
 * @param {string} [opts.html]   HTML body, used only if `body` is empty
 * @returns {{ reply: string, usedDelimiter: boolean }}
 */
export function extractReply(body, opts = {}) {
  let text = normalize(body);

  // If we only got HTML, degrade it to text first (very light touch — the
  // heuristic parser does the real work on the result).
  if (!text.trim() && opts.html) {
    text = htmlToText(opts.html);
  }

  const cut = cutAtDelimiter(text);
  if (cut !== null) {
    // The delimiter removes the bulk quoted history, but mail clients insert
    // an attribution line ("On <date>, <name> wrote:") just *above* the
    // quoted original — i.e. above the delimiter — so run the heuristic over
    // the remainder to strip that trailing line and any signature too.
    return { reply: tidy(heuristicVisible(cut)), usedDelimiter: true };
  }

  return { reply: tidy(heuristicVisible(text)), usedDelimiter: false };
}

/** Collapse excess blank lines and trim leading/trailing whitespace. */
function tidy(s) {
  return s
    .replace(/[ \t]+$/gm, "")        // trailing spaces per line
    .replace(/\n{3,}/g, "\n\n")      // cap consecutive blanks at one
    .trim();
}

/**
 * Minimal HTML→text used only as a fallback when no plaintext part exists.
 * Not a general-purpose converter — just enough to feed the line parser.
 */
export function htmlToText(html) {
  return normalize(html)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|tr|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<blockquote/gi, "\n> <blockquote") // hint the quote detector
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}
