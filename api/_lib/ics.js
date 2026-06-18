// api/_lib/ics.js
//
// Calendar integration for ticket appointments. Two outputs:
//
//   buildIcs()        → an RFC 5545 VCALENDAR string (text/calendar). This is
//                       the universal path: Apple Calendar (iPhone/iPad/Mac),
//                       Outlook desktop, and every other client import it
//                       directly. Served as a download with a .ics extension.
//
//   calendarLinks()   → deep links that pre-fill a new event in the web
//                       calendars: Google, Outlook.com, Office 365, Yahoo.
//                       These open the provider's "new event" screen with
//                       everything filled in — one click to save.
//
// We get the fiddly bits right because clients are unforgiving:
//   • CRLF line endings (RFC 5545 §3.1 — LF-only breaks Outlook).
//   • 75-octet line folding with a leading space on continuations.
//   • TEXT escaping of "\ ; , and newlines.
//   • UTC timestamps (Z suffix) so we never ship an ambiguous local time.
//   • A stable UID per appointment so re-sends update the event in place
//     instead of creating duplicates, plus SEQUENCE for revisions.

const PRODID = "-//Simple IT SRQ//Ticket Appointments//EN";

/** Escape a value for an iCalendar TEXT field (RFC 5545 §3.3.11). */
function escText(s = "") {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold a content line to 75 octets with CRLF + leading-space continuations. */
function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;

  const out = [];
  let cur = "";
  let curBytes = 0;
  for (const ch of line) {
    const chBytes = enc.encode(ch).length;
    // First line caps at 75; continuation lines cap at 74 (they carry a
    // leading space that counts toward the octet limit).
    const cap = out.length === 0 ? 75 : 74;
    if (curBytes + chBytes > cap) {
      out.push(cur);
      cur = ch;
      curBytes = chBytes;
    } else {
      cur += ch;
      curBytes += chBytes;
    }
  }
  if (cur) out.push(cur);
  return out.join("\r\n ");
}

/** Format a Date as a UTC iCalendar timestamp: 20260617T140000Z. */
function toIcsUtc(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Compact UTC stamp for Google/Yahoo deep links: 20260617T140000Z. */
function toCompactUtc(d) {
  return toIcsUtc(d);
}

/**
 * @typedef {Object} AppointmentEvent
 * @property {string} uid           stable unique id (we use the appt UUID)
 * @property {string} title         SUMMARY
 * @property {string} [description] DESCRIPTION (plain text, newlines ok)
 * @property {string} [location]    LOCATION
 * @property {Date|string} start    event start
 * @property {Date|string} end      event end
 * @property {string} [organizerName]
 * @property {string} [organizerEmail]
 * @property {string} [url]         a link back to the ticket
 * @property {number} [sequence]    revision counter (default 0)
 * @property {"CONFIRMED"|"TENTATIVE"|"CANCELLED"} [status]
 */

/**
 * Build a complete VCALENDAR document for one appointment.
 * @param {AppointmentEvent} ev
 * @param {Date} [now]  stamp time (DTSTAMP); pass for deterministic tests
 * @returns {string} CRLF-terminated iCalendar text
 */
export function buildIcs(ev, now = new Date()) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    // CANCELLED status ⇒ METHOD:CANCEL so clients remove the event.
    `METHOD:${ev.status === "CANCELLED" ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${ev.uid}`,
    `SEQUENCE:${Number.isFinite(ev.sequence) ? ev.sequence : 0}`,
    `DTSTAMP:${toIcsUtc(now)}`,
    `DTSTART:${toIcsUtc(ev.start)}`,
    `DTEND:${toIcsUtc(ev.end)}`,
    `SUMMARY:${escText(ev.title)}`,
    `STATUS:${ev.status || "CONFIRMED"}`,
  ];

  if (ev.location)    lines.push(`LOCATION:${escText(ev.location)}`);
  if (ev.description) lines.push(`DESCRIPTION:${escText(ev.description)}`);
  if (ev.url)         lines.push(`URL:${escText(ev.url)}`);
  if (ev.organizerEmail) {
    const cn = ev.organizerName ? `;CN=${escText(ev.organizerName)}` : "";
    lines.push(`ORGANIZER${cn}:mailto:${ev.organizerEmail}`);
  }
  // A 1-hour-before alarm is what most people expect from a scheduled visit.
  lines.push(
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escText("Reminder: " + ev.title)}`,
    "TRIGGER:-PT1H",
    "END:VALARM",
  );
  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.map(fold).join("\r\n") + "\r\n";
}

/**
 * Build per-provider "add to calendar" deep links.
 * @param {AppointmentEvent} ev
 * @returns {{ google:string, outlook:string, office365:string, yahoo:string }}
 */
export function calendarLinks(ev) {
  const start = toCompactUtc(ev.start);
  const end = toCompactUtc(ev.end);
  const details = ev.description || "";
  const location = ev.location || "";

  // Google: dates as YYYYMMDDTHHMMSSZ/YYYYMMDDTHHMMSSZ
  const google = "https://calendar.google.com/calendar/render?" + new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: `${start}/${end}`,
    details,
    location,
  }).toString();

  // Outlook.com & Office 365 share the deeplink shape; only the host differs.
  // They want ISO-8601 with offset, not the compact form.
  const iso = (d) => (d instanceof Date ? d : new Date(d)).toISOString();
  const owaParams = (base) => base + "?" + new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: ev.title,
    startdt: iso(ev.start),
    enddt: iso(ev.end),
    body: details,
    location,
  }).toString();
  const outlook = owaParams("https://outlook.live.com/calendar/0/deeplink/compose");
  const office365 = owaParams("https://outlook.office.com/calendar/0/deeplink/compose");

  // Yahoo: et is end time; dur left out in favor of explicit st/et.
  const yahoo = "https://calendar.yahoo.com/?" + new URLSearchParams({
    v: "60",
    title: ev.title,
    st: start,
    et: end,
    desc: details,
    in_loc: location,
  }).toString();

  return { google, outlook, office365, yahoo };
}
