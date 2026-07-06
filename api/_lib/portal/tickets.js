// api/_lib/portal/tickets.js
//
// Ticket /api/portal actions: tickets, ticket (GET/PATCH), ticket-message,
// ticket-cc, ticket-appointment(-cancel), ics, and the inbound-email
// webhook.

import { sql } from "../db.js";
import { json } from "../http.js";
import { clampString } from "../sanitize.js";
import { timingSafeEqual, randomUUID } from "node:crypto";
import {
  sendTicketEmail,
  findTicketCode,
  signValue,
  verifyValue,
} from "../ticket-mail.js";
import { buildIcs, calendarLinks } from "../ics.js";
import { extractReply } from "../email-reply-parser.js";
import { parseRawEmail } from "../mime-parse.js";
import { resolveAdmin, requireAdmin } from "./shared.js";

const SUPPORT_EMAIL = "hello@simpleitsrq.com";
const CONTACT_TO_DEFAULT = SUPPORT_EMAIL;

const escapeHtml = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const OPEN_STATUSES    = ["open", "in_progress", "waiting"];
const CLOSED_STATUSES  = ["resolved", "closed"];
const VALID_STATUSES   = [...OPEN_STATUSES, ...CLOSED_STATUSES];
const CLOSING_STATUSES = new Set(CLOSED_STATUSES);
const VALID_PRIORITIES = ["low", "normal", "high", "critical"];

// Fan a new ticket message out to every participant and return the outbound
// Message-ID so the caller can persist it as tickets.last_message_id for
// threading the next email.
//
// Recipients:
//   • agent reply  → To: requester,  Cc: ticket CC list
//   • client reply → To: support inbox, Cc: requester + CC list (minus the
//                    author, so no one is mailed their own message back)
//
// Every outbound carries a signed VERP Reply-To, the reply-above-this-line
// banner, and In-Reply-To/References for native client threading. Best-effort
// — all errors are swallowed; email must never block the DB write.
async function notifyTicketParticipants({ ticket, message, authorType, authorEmail }) {
  const supportInbox = process.env.CONTACT_TO_EMAIL || CONTACT_TO_DEFAULT;
  const cc = Array.isArray(ticket.cc_emails) ? ticket.cc_emails.filter(Boolean) : [];
  const viaEmail = message.via === "email";

  let to, ccList, heading, subject;
  if (authorType === "agent") {
    to = ticket.email;
    ccList = cc;
    heading = "New update on your support ticket";
    subject = `[Update ${ticket.ticket_code}] ${ticket.subject}`;
  } else {
    to = supportInbox;
    const author = (authorEmail || "").toLowerCase();
    const inbox = supportInbox.toLowerCase();
    ccList = [ticket.email, ...cc].filter(
      (e) => e && e.toLowerCase() !== author && e.toLowerCase() !== inbox,
    );
    heading = `New ${viaEmail ? "email " : ""}reply on ${ticket.ticket_code}`;
    subject = `[Client reply ${ticket.ticket_code}] ${ticket.subject}`;
  }
  if (!to) return null;
  ccList = [...new Set(ccList.map((e) => String(e).trim()).filter(Boolean))];

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a">
      <div style="padding:14px 18px;background:#0F6CBD;color:#fff;border-radius:8px 8px 0 0">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;opacity:.9">${escapeHtml(heading)}</div>
        <div style="font-size:20px;font-weight:700;margin-top:2px">${escapeHtml(ticket.ticket_code)}</div>
      </div>
      <div style="padding:20px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
        <h2 style="margin:0 0 14px;font-size:18px;color:#0F6CBD">${escapeHtml(ticket.subject)}</h2>
        <div style="font-size:13px;color:#6b7280;margin-bottom:8px">From <strong>${escapeHtml(message.authorName || authorType)}</strong></div>
        <div style="white-space:pre-wrap;padding:14px 16px;background:#f7f7f8;border-radius:8px;font-size:14px;line-height:1.55">${escapeHtml(message.body)}</div>
        <p style="margin-top:22px;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px">
          Ticket ${escapeHtml(ticket.ticket_code)} · <a href="https://simpleitsrq.com/portal">view in the portal</a>
        </p>
      </div>
    </div>
  `;

  const text = [
    heading,
    `Ticket: ${ticket.ticket_code} — ${ticket.subject}`,
    `From: ${message.authorName || authorType}`,
    ``,
    message.body,
    ``,
    `View in the portal: https://simpleitsrq.com/portal`,
  ].join("\n");

  const res = await sendTicketEmail({
    ticketCode: ticket.ticket_code,
    to,
    cc: ccList,
    subject,
    html,
    text,
    inReplyTo: ticket.last_message_id || undefined,
  });
  return res.messageId || null;
}

export async function handleTickets(session, url) {
  const bucket = url.searchParams.get("status") === "closed" ? "closed" : "open";
  const statuses = bucket === "closed" ? CLOSED_STATUSES : OPEN_STATUSES;
  const admin = await resolveAdmin(session);
  const qRaw = url.searchParams.get("q") || "";
  const q = qRaw.trim().slice(0, 100);
  const like = q ? `%${q.toLowerCase()}%` : null;

  // Admin sees every ticket with the submitter's linked user row (if any) so
  // the display name + company come from `users`, falling back to whatever
  // the ticket was filed with.
  const rows = admin
    ? (like
        ? await sql`
            SELECT t.id, t.ticket_code, t.email, t.name, t.company, t.priority, t.category,
                   t.subject, t.status, t.created_at, t.updated_at, t.closed_at,
                   u.name AS user_name, u.email AS user_email, u.company AS user_company
            FROM tickets t
            LEFT JOIN users u ON u.id = t.user_id
            WHERE t.status = ANY(${statuses})
              AND (
                lower(t.subject)     LIKE ${like} OR
                lower(t.email)       LIKE ${like} OR
                lower(t.name)        LIKE ${like} OR
                lower(coalesce(t.company, '')) LIKE ${like} OR
                lower(t.ticket_code) LIKE ${like}
              )
            ORDER BY t.created_at DESC
            LIMIT 200
          `
        : await sql`
            SELECT t.id, t.ticket_code, t.email, t.name, t.company, t.priority, t.category,
                   t.subject, t.status, t.created_at, t.updated_at, t.closed_at,
                   u.name AS user_name, u.email AS user_email, u.company AS user_company
            FROM tickets t
            LEFT JOIN users u ON u.id = t.user_id
            WHERE t.status = ANY(${statuses})
            ORDER BY t.created_at DESC
            LIMIT 200
          `)
    : await sql`
        SELECT id, ticket_code, email, name, company, priority, category,
               subject, status, created_at, updated_at, closed_at
        FROM tickets
        WHERE (user_id = ${session.user.id} OR lower(email) = lower(${session.user.email}))
          AND status = ANY(${statuses})
        ORDER BY created_at DESC
        LIMIT 200
      `;

  return json(200, {
    tickets: rows.map((r) => ({
      id: r.id,
      code: r.ticket_code,
      subject: r.subject,
      category: r.category,
      priority: r.priority,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      closedAt: r.closed_at,
      submitter: admin
        ? {
            name:    r.user_name    || r.name,
            email:   r.user_email   || r.email,
            company: r.user_company || r.company,
          }
        : undefined,
    })),
  });
}

async function loadTicketForSession(session, code) {
  const admin = await resolveAdmin(session);
  const rows = admin
    ? await sql`
        SELECT t.id, t.ticket_code, t.email, t.name, t.company, t.phone, t.priority,
               t.category, t.subject, t.description, t.status,
               t.cc_emails, t.last_message_id,
               t.created_at, t.updated_at, t.closed_at,
               u.name AS user_name, u.email AS user_email, u.company AS user_company
        FROM tickets t
        LEFT JOIN users u ON u.id = t.user_id
        WHERE t.ticket_code = ${code}
        LIMIT 1
      `
    : await sql`
        SELECT id, ticket_code, email, name, company, phone, priority, category,
               subject, description, status, cc_emails, last_message_id,
               created_at, updated_at, closed_at
        FROM tickets
        WHERE ticket_code = ${code}
          AND (user_id = ${session.user.id} OR lower(email) = lower(${session.user.email}))
        LIMIT 1
      `;
  return { admin, row: rows[0] || null };
}

export async function handleTicket(session, url) {
  const code = url.searchParams.get("code");
  if (!code) return json(400, { ok: false, error: "missing_code" });

  const { admin, row: t } = await loadTicketForSession(session, code);
  if (!t) return json(404, { ok: false, error: "not_found" });

  const [messages, appts] = await Promise.all([
    sql`
      SELECT id, author_type, author_name, body, created_at, via
      FROM ticket_messages
      WHERE ticket_id = ${t.id}
      ORDER BY created_at ASC
    `,
    sql`
      SELECT id, uid, title, location, description, starts_at, ends_at,
             status, sequence
      FROM ticket_appointments
      WHERE ticket_id = ${t.id}
      ORDER BY starts_at ASC
    `,
  ]);
  return json(200, {
    ticket: {
      id: t.id,
      code: t.ticket_code,
      subject: t.subject,
      description: t.description,
      category: t.category,
      priority: t.priority,
      status: t.status,
      cc: Array.isArray(t.cc_emails) ? t.cc_emails : [],
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      closedAt: t.closed_at,
      submitter: admin
        ? {
            name:    t.user_name    || t.name,
            email:   t.user_email   || t.email,
            company: t.user_company || t.company,
            phone:   t.phone,
          }
        : undefined,
    },
    messages: messages.map((m) => ({
      id: m.id,
      author: m.author_type,
      authorName: m.author_name,
      body: m.body,
      via: m.via,
      createdAt: m.created_at,
    })),
    appointments: appts.map(appointmentPayload),
  });
}

// Canonical origin for links we email/serve. Override via APP_URL.
const SITE_ORIGIN = (process.env.APP_URL || "https://simpleitsrq.com").replace(/\/+$/, "");

// Shape an appointment row for the client: include the per-provider
// add-to-calendar deep links and a signed .ics download URL that works from
// an email without a portal login.
function appointmentPayload(a) {
  const ev = {
    uid: a.uid,
    title: a.title,
    location: a.location || "",
    description: a.description || "",
    start: a.starts_at,
    end: a.ends_at,
    url: `${SITE_ORIGIN}/portal`,
    status: String(a.status || "confirmed").toUpperCase(),
    sequence: a.sequence || 0,
  };
  const icsUrl = `${SITE_ORIGIN}/api/portal?action=ics&uid=${encodeURIComponent(a.uid)}&t=${signValue(a.uid)}`;
  return {
    id: a.id,
    uid: a.uid,
    title: a.title,
    location: a.location || "",
    description: a.description || "",
    startsAt: a.starts_at,
    endsAt: a.ends_at,
    status: a.status,
    links: { ...calendarLinks(ev), ics: icsUrl, apple: icsUrl },
  };
}

export async function handleTicketMessage(session, request) {
  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const code = String(body?.code || "").trim();
  const text = String(body?.body || "").trim().slice(0, 8000);
  if (!code) return json(400, { ok: false, error: "missing_code" });
  if (!text) return json(400, { ok: false, error: "body_required" });

  const { admin, row: t } = await loadTicketForSession(session, code);
  if (!t) return json(404, { ok: false, error: "not_found" });

  const authorType = admin ? "agent" : "client";
  const authorName = session.user.name || session.user.email;
  const authorEmail = session.user.email || null;

  const inserted = await sql`
    INSERT INTO ticket_messages (ticket_id, author_type, author_name, author_email, body, via)
    VALUES (${t.id}, ${authorType}, ${authorName}, ${authorEmail}, ${text}, 'portal')
    RETURNING id, author_type, author_name, body, created_at, via
  `;

  // Replies should bump the ticket timestamp and, if a client writes back
  // on a resolved ticket, reopen it so the dashboard sees it again.
  await sql`
    UPDATE tickets
    SET updated_at = now(),
        status = CASE
          WHEN ${authorType} = 'client' AND status IN ('resolved','closed') THEN 'open'
          ELSE status
        END,
        closed_at = CASE
          WHEN ${authorType} = 'client' AND status IN ('resolved','closed') THEN NULL
          ELSE closed_at
        END
    WHERE id = ${t.id}
  `;

  const m = inserted[0];
  const messagePayload = {
    id: m.id,
    author: m.author_type,
    authorName: m.author_name,
    body: m.body,
    via: m.via,
    createdAt: m.created_at,
  };

  const outboundId = await notifyTicketParticipants({
    ticket: t,
    message: messagePayload,
    authorType,
    authorEmail,
  }).catch((err) => { console.error("[portal] notify failed", err); return null; });

  if (outboundId) {
    await sql`UPDATE tickets SET last_message_id = ${outboundId} WHERE id = ${t.id}`.catch(() => {});
  }

  return json(200, { ok: true, message: messagePayload });
}

// ─────────────────────────────────────────────────────────────
// CC recipients — customers and agents can manage who is copied.
// ─────────────────────────────────────────────────────────────
const isEmailAddr = (s = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const MAX_CC = 10;

function normalizeCcList(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : String(raw || "").split(/[,;\s]+/);
  const seen = new Set();
  const out = [];
  for (const e of arr) {
    const v = String(e || "").trim().toLowerCase();
    if (!v) continue;
    if (!isEmailAddr(v)) continue;
    if (v.length > 320) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= MAX_CC) break;
  }
  return out;
}

export async function handleTicketCc(session, request) {
  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const code = String(body?.code || "").trim();
  if (!code) return json(400, { ok: false, error: "missing_code" });
  if (body?.cc === undefined) return json(400, { ok: false, error: "missing_cc" });

  // Both the requester and an agent may edit CC (per chosen behavior).
  const { row: t } = await loadTicketForSession(session, code);
  if (!t) return json(404, { ok: false, error: "not_found" });

  // Don't let the requester's own address sit in CC (they're already To:).
  const requester = (t.email || "").toLowerCase();
  const cc = normalizeCcList(body.cc).filter((e) => e !== requester);

  const rows = await sql`
    UPDATE tickets SET cc_emails = ${cc}, updated_at = now()
    WHERE id = ${t.id}
    RETURNING cc_emails
  `;
  return json(200, { ok: true, cc: rows[0]?.cc_emails || [] });
}

// ─────────────────────────────────────────────────────────────
// Appointments — an agent schedules an on-site visit / call on a
// ticket. The customer gets an email with add-to-calendar links and an
// .ics attachment that imports into Outlook, Gmail, and Apple Calendar.
// ─────────────────────────────────────────────────────────────
const MS_HOUR = 3600 * 1000;

export async function handleTicketAppointment(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }

  const code = String(body?.code || "").trim();
  if (!code) return json(400, { ok: false, error: "missing_code" });

  const title = clampString(String(body?.title || "").trim(), 200);
  const location = clampString(String(body?.location || "").trim(), 300);
  const description = clampString(String(body?.description || "").trim(), 2000);
  const startsAt = new Date(body?.startsAt);
  if (Number.isNaN(startsAt.getTime())) return json(400, { ok: false, error: "invalid_start" });

  let endsAt;
  if (body?.endsAt) {
    endsAt = new Date(body.endsAt);
  } else {
    const mins = Number.parseInt(body?.durationMin, 10);
    endsAt = new Date(startsAt.getTime() + (Number.isFinite(mins) && mins > 0 ? mins : 60) * 60 * 1000);
  }
  if (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return json(400, { ok: false, error: "invalid_end" });
  }
  if (!title) return json(400, { ok: false, error: "title_required" });

  const { row: t } = await loadTicketForSession(session, code);
  if (!t) return json(404, { ok: false, error: "not_found" });

  const uid = `appt-${randomUUID()}@simpleitsrq.com`;
  const rows = await sql`
    INSERT INTO ticket_appointments
      (ticket_id, uid, title, location, description, starts_at, ends_at, created_by)
    VALUES
      (${t.id}, ${uid}, ${title}, ${location || null}, ${description || null},
       ${startsAt.toISOString()}, ${endsAt.toISOString()}, ${session.user.id || null})
    RETURNING id, uid, title, location, description, starts_at, ends_at, status, sequence
  `;
  const appt = rows[0];

  // System note in the thread so the timeline shows the scheduling.
  const whenLabel = startsAt.toLocaleString("en-US", {
    timeZone: "America/New_York", dateStyle: "full", timeStyle: "short",
  });
  await sql`
    INSERT INTO ticket_messages (ticket_id, author_type, author_name, body, via)
    VALUES (${t.id}, 'system', ${session.user.name || "Simple IT SRQ"},
            ${`Appointment scheduled: ${title} — ${whenLabel} ET${location ? ` (${location})` : ""}`}, 'system')
  `.catch(() => {});
  await sql`UPDATE tickets SET updated_at = now() WHERE id = ${t.id}`.catch(() => {});

  // Email the customer + CC with calendar links and an .ics attachment.
  await emailAppointment({ ticket: t, appt, kind: "scheduled" }).catch((err) =>
    console.error("[portal] appointment email failed", err));

  return json(200, { ok: true, appointment: appointmentPayload(appt) });
}

export async function handleTicketAppointmentCancel(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const uid = String(body?.uid || "").trim();
  if (!uid) return json(400, { ok: false, error: "missing_uid" });

  const rows = await sql`
    UPDATE ticket_appointments
    SET status = 'cancelled', sequence = sequence + 1, updated_at = now()
    WHERE uid = ${uid}
    RETURNING id, ticket_id, uid, title, location, description, starts_at, ends_at, status, sequence
  `;
  if (rows.length === 0) return json(404, { ok: false, error: "not_found" });
  const appt = rows[0];

  const tRows = await sql`SELECT * FROM tickets WHERE id = ${appt.ticket_id} LIMIT 1`;
  const t = tRows[0];
  if (t) {
    await sql`
      INSERT INTO ticket_messages (ticket_id, author_type, author_name, body, via)
      VALUES (${t.id}, 'system', ${session.user.name || "Simple IT SRQ"},
              ${`Appointment cancelled: ${appt.title}`}, 'system')
    `.catch(() => {});
    await emailAppointment({ ticket: t, appt, kind: "cancelled" }).catch((err) =>
      console.error("[portal] cancel email failed", err));
  }
  return json(200, { ok: true, appointment: appointmentPayload(appt) });
}

// Build + send the appointment email (schedule or cancel) with an .ics
// attachment and inline add-to-calendar links.
async function emailAppointment({ ticket, appt, kind }) {
  const ev = {
    uid: appt.uid,
    title: appt.title,
    location: appt.location || "",
    description: appt.description || "",
    start: appt.starts_at,
    end: appt.ends_at,
    url: `${SITE_ORIGIN}/portal`,
    organizerName: "Simple IT SRQ",
    organizerEmail: process.env.CONTACT_TO_EMAIL || CONTACT_TO_DEFAULT,
    status: kind === "cancelled" ? "CANCELLED" : "CONFIRMED",
    sequence: appt.sequence || 0,
  };
  const ics = buildIcs(ev);
  const links = calendarLinks(ev);
  const cancelled = kind === "cancelled";

  const when = new Date(appt.starts_at).toLocaleString("en-US", {
    timeZone: "America/New_York", dateStyle: "full", timeStyle: "short",
  });

  const btn = (href, label) =>
    `<a href="${escapeHtml(href)}" style="display:inline-block;margin:4px 6px 4px 0;padding:8px 14px;background:#0F6CBD;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600">${escapeHtml(label)}</a>`;

  const heading = cancelled ? "Appointment cancelled" : "Appointment scheduled";
  const calBlock = cancelled
    ? `<p style="font-size:14px;color:#6b7280">This appointment has been cancelled. The attached file will remove it from your calendar.</p>`
    : `<div style="margin:14px 0">
         ${btn(links.google, "Google Calendar")}
         ${btn(links.outlook, "Outlook")}
         ${btn(links.office365, "Office 365")}
         ${btn(links.yahoo, "Yahoo")}
       </div>
       <p style="font-size:12px;color:#9ca3af">On iPhone, iPad, or Mac, open the attached <strong>invite.ics</strong> to add it to Apple Calendar.</p>`;

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a">
      <div style="padding:14px 18px;background:${cancelled ? "#DC2626" : "#0F6CBD"};color:#fff;border-radius:8px 8px 0 0">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;opacity:.9">${escapeHtml(heading)}</div>
        <div style="font-size:20px;font-weight:700;margin-top:2px">${escapeHtml(ticket.ticket_code)}</div>
      </div>
      <div style="padding:20px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
        <h2 style="margin:0 0 6px;font-size:18px;color:#0F6CBD">${escapeHtml(appt.title)}</h2>
        <div style="font-size:14px;margin:8px 0"><strong>When:</strong> ${escapeHtml(when)} (Eastern)</div>
        ${appt.location ? `<div style="font-size:14px;margin:8px 0"><strong>Where:</strong> ${escapeHtml(appt.location)}</div>` : ""}
        ${appt.description ? `<div style="white-space:pre-wrap;padding:12px 14px;background:#f7f7f8;border-radius:8px;font-size:14px;margin:10px 0">${escapeHtml(appt.description)}</div>` : ""}
        ${calBlock}
        <p style="margin-top:18px;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px">
          Ticket ${escapeHtml(ticket.ticket_code)} · <a href="${escapeHtml(SITE_ORIGIN)}/portal">view in the portal</a>
        </p>
      </div>
    </div>
  `;
  const text = [
    heading,
    `${appt.title}`,
    `When: ${when} (Eastern)`,
    appt.location ? `Where: ${appt.location}` : "",
    "",
    appt.description || "",
    "",
    cancelled ? "This appointment has been cancelled." : `Add to calendar:\nGoogle: ${links.google}\nOutlook: ${links.outlook}\nApple: open the attached invite.ics`,
  ].filter(Boolean).join("\n");

  const cc = Array.isArray(ticket.cc_emails) ? ticket.cc_emails.filter(Boolean) : [];
  await sendTicketEmail({
    ticketCode: ticket.ticket_code,
    to: ticket.email,
    cc,
    subject: `[${cancelled ? "Cancelled" : "Appointment"} ${ticket.ticket_code}] ${appt.title}`,
    html,
    text,
    inReplyTo: ticket.last_message_id || undefined,
    attachments: [{
      filename: "invite.ics",
      content: Buffer.from(ics, "utf8"),
      contentType: cancelled ? "text/calendar; method=CANCEL" : "text/calendar; method=PUBLISH",
    }],
  });
}

// Serve the .ics file for an appointment. Public but token-gated: the link
// emailed to customers carries a signed ?t= so it works without a portal
// login, but can't be guessed or enumerated.
export async function handleIcs(url) {
  const uid = url.searchParams.get("uid") || "";
  const token = url.searchParams.get("t") || "";
  if (!uid || !verifyValue(uid, token)) {
    return json(403, { ok: false, error: "invalid_token" });
  }
  const rows = await sql`
    SELECT uid, title, location, description, starts_at, ends_at, status, sequence
    FROM ticket_appointments WHERE uid = ${uid} LIMIT 1
  `;
  if (rows.length === 0) return json(404, { ok: false, error: "not_found" });
  const a = rows[0];
  const ics = buildIcs({
    uid: a.uid,
    title: a.title,
    location: a.location || "",
    description: a.description || "",
    start: a.starts_at,
    end: a.ends_at,
    url: `${SITE_ORIGIN}/portal`,
    organizerName: "Simple IT SRQ",
    organizerEmail: process.env.CONTACT_TO_EMAIL || CONTACT_TO_DEFAULT,
    status: String(a.status || "confirmed").toUpperCase(),
    sequence: a.sequence || 0,
  });
  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="simpleitsrq-${a.uid.slice(0, 12)}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}

// ─────────────────────────────────────────────────────────────
// Inbound email webhook (Resend `email.received`). A customer replies to
// our notification; Resend POSTs the parsed message here. We:
//   1. verify the webhook signature (Svix headers),
//   2. resolve + verify the ticket from the signed VERP reply address,
//   3. strip quoted history with the reply parser,
//   4. insert the reply as a client message (idempotent on Message-ID),
//   5. fan the reply out to support + CC participants.
//
// Runs BEFORE the CSRF/session gates in dispatch(). Datacenter-origin (it's
// Resend's servers), so it must also be exempt from the middleware IP-
// reputation block — see middleware.js.
// ─────────────────────────────────────────────────────────────
export async function handleInboundEmail(request) {
  // Two ingress paths share the same downstream logic (recordInboundReply):
  //   • Cloudflare Email Worker  — authenticated by a shared secret header,
  //     posts { to, from, subject, messageId, raw } (free; our chosen path).
  //   • Resend Inbound webhook   — Svix-signed metadata; body fetched from the
  //     Received Emails API (kept for flexibility; requires a paid Resend plan).
  const workerSecret = process.env.INBOUND_SHARED_SECRET;
  const provided = request.headers.get("x-inbound-secret");
  if (workerSecret && provided) {
    let ok = false;
    try {
      const a = Buffer.from(provided), b = Buffer.from(workerSecret);
      ok = a.length === b.length && timingSafeEqual(a, b);
    } catch { /* ok stays false */ }
    if (!ok) return json(401, { ok: false, error: "bad_secret" });
    return handleInboundFromWorker(request);
  }

  const raw = await request.text();

  // 1. Verify signature. Resend signs with Svix headers; the secret is the
  //    webhook signing secret from the Resend dashboard.
  const verified = await verifyResendWebhook(request, raw);
  if (!verified) {
    return json(401, { ok: false, error: "bad_signature" });
  }

  let evt;
  try { evt = JSON.parse(raw); } catch { return json(400, { ok: false, error: "invalid_json" }); }

  if (evt?.type !== "email.received") {
    // Acknowledge other event types so Resend doesn't retry them.
    return json(200, { ok: true, ignored: evt?.type || "unknown" });
  }

  const data = evt.data || {};
  // The webhook carries metadata only (to/cc/from/message_id/subject) — NOT
  // the body. We can resolve the ticket from the recipient metadata, then
  // fetch the full body from the Received Emails API.
  const recipients = [
    ...(Array.isArray(data.to) ? data.to : [data.to]),
    ...(Array.isArray(data.cc) ? data.cc : []),
  ].filter(Boolean);

  const code = findTicketCode(recipients);
  if (!code) {
    console.warn("[inbound] no valid ticket reply address", { recipients });
    return json(200, { ok: true, unmatched: true });
  }

  const rows = await sql`SELECT * FROM tickets WHERE ticket_code = ${code} LIMIT 1`;
  const t = rows[0];
  if (!t) return json(200, { ok: true, unknown_ticket: code });

  // Fetch the full message body (GET /emails/receiving/{id}). Fall back to any
  // inline body fields the webhook happens to include.
  const full = await fetchReceivedEmail(data.email_id).catch((err) => {
    console.error("[inbound] body fetch failed", err);
    return null;
  });
  const bodyText = full?.text ?? data.text ?? "";
  const bodyHtml = full?.html ?? data.html ?? "";

  const { reply } = extractReply(bodyText, { html: bodyHtml });
  const clean = reply.trim().slice(0, 8000);
  if (!clean) return json(200, { ok: true, empty: true });

  const fromRaw = full?.from ?? data.from ?? "";
  const fromAddr = (typeof fromRaw === "object" ? fromRaw.address : fromRaw).toString().toLowerCase().trim();
  const fromName = (typeof fromRaw === "object" ? fromRaw.name : fromAddr || "").toString().slice(0, 200);
  const msgId = (full?.message_id || data.message_id || full?.headers?.["message-id"] || "").toString().slice(0, 400) || null;

  return recordInboundReply({ t, code, clean, fromAddr, fromName, msgId });
}

// Cloudflare Email Worker path: the Worker matched a reply+TOKEN address and
// posted the raw RFC 822 message. We parse the body, strip quotes, and record.
async function handleInboundFromWorker(request) {
  let payload;
  try { payload = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }

  const recipients = [payload.to, ...(Array.isArray(payload.cc) ? payload.cc : [])].filter(Boolean);
  const code = findTicketCode(recipients);
  if (!code) return json(200, { ok: true, unmatched: true });

  const rows = await sql`SELECT * FROM tickets WHERE ticket_code = ${code} LIMIT 1`;
  const t = rows[0];
  if (!t) return json(200, { ok: true, unknown_ticket: code });

  let text = payload.text || "";
  let html = payload.html || "";
  if (!text && !html && payload.raw) {
    const parsed = parseRawEmail(payload.raw);
    text = parsed.text;
    html = parsed.html;
  }

  const { reply } = extractReply(text, { html });
  const clean = reply.trim().slice(0, 8000);
  if (!clean) return json(200, { ok: true, empty: true });

  // "Name <addr>" → addr
  const fromHeader = String(payload.from || "");
  const fromAddr = (fromHeader.match(/<([^>]+)>/)?.[1] || fromHeader).toLowerCase().trim();
  const fromName = (fromHeader.replace(/<[^>]*>/, "").replace(/"/g, "").trim() || fromAddr).slice(0, 200);
  const msgId = String(payload.messageId || "").slice(0, 400) || null;

  return recordInboundReply({ t, code, clean, fromAddr, fromName, msgId });
}

// Shared tail for both inbound paths: idempotent insert, reopen/bump the
// ticket, fan out to participants, persist threading id.
async function recordInboundReply({ t, code, clean, fromAddr, fromName, msgId }) {
  let inserted;
  try {
    inserted = await sql`
      INSERT INTO ticket_messages (ticket_id, author_type, author_name, author_email, body, via, message_id)
      VALUES (${t.id}, 'client', ${fromName}, ${fromAddr || null}, ${clean}, 'email', ${msgId})
      ON CONFLICT (message_id) WHERE message_id IS NOT NULL DO NOTHING
      RETURNING id, author_type, author_name, body, created_at, via
    `;
  } catch (err) {
    console.error("[inbound] insert failed", err);
    return json(500, { ok: false, error: "storage_failed" });
  }
  if (!inserted || inserted.length === 0) {
    return json(200, { ok: true, duplicate: true });
  }
  const m = inserted[0];

  // Reopen + bump the ticket, exactly like a portal client reply.
  await sql`
    UPDATE tickets
    SET updated_at = now(),
        status = CASE WHEN status IN ('resolved','closed') THEN 'open' ELSE status END,
        closed_at = CASE WHEN status IN ('resolved','closed') THEN NULL ELSE closed_at END
    WHERE id = ${t.id}
  `.catch(() => {});

  // Fan out to support + CC participants (excluding the sender).
  const outboundId = await notifyTicketParticipants({
    ticket: t,
    message: { ...m, via: "email" },
    authorType: "client",
    authorEmail: fromAddr,
  }).catch((err) => { console.error("[inbound] notify failed", err); return null; });
  if (outboundId) {
    await sql`UPDATE tickets SET last_message_id = ${outboundId} WHERE id = ${t.id}`.catch(() => {});
  }

  return json(200, { ok: true, ticket: code, messageId: m.id });
}

// Fetch a received email's full body from the Resend Received Emails API.
// The inbound webhook is metadata-only, so this is how we get text/html.
// Returns the parsed JSON (text, html, from, headers, ...) or null.
async function fetchReceivedEmail(emailId) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !emailId) return null;
  const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    console.error("[inbound] received-email fetch non-200", res.status);
    return null;
  }
  return res.json().catch(() => null);
}

// Verify a Resend (Svix) webhook signature over the raw body. Returns true
// when valid, or when no secret is configured in non-production (so local
// testing works); never throws.
async function verifyResendWebhook(request, raw) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("[inbound] RESEND_WEBHOOK_SECRET not set — rejecting");
      return false;
    }
    console.warn("[inbound] RESEND_WEBHOOK_SECRET not set — skipping verify (non-prod)");
    return true;
  }
  const id = request.headers.get("svix-id") || request.headers.get("webhook-id");
  const ts = request.headers.get("svix-timestamp") || request.headers.get("webhook-timestamp");
  const sigHeader = request.headers.get("svix-signature") || request.headers.get("webhook-signature");
  if (!id || !ts || !sigHeader) return false;

  // Reject stale timestamps (>5 min) to blunt replay.
  const tsNum = Number(ts);
  if (Number.isFinite(tsNum) && Math.abs(Date.now() / 1000 - tsNum) > 300) return false;

  // Svix secret is "whsec_<base64>"; HMAC-SHA256 over `${id}.${ts}.${raw}`.
  const key = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let expected;
  try {
    const { createHmac } = await import("node:crypto");
    expected = createHmac("sha256", Buffer.from(key, "base64"))
      .update(`${id}.${ts}.${raw}`).digest("base64");
  } catch {
    return false;
  }
  // Header may carry multiple space-separated "v1,<sig>" entries.
  for (const part of sigHeader.split(" ")) {
    const sig = part.includes(",") ? part.split(",")[1] : part;
    if (!sig) continue;
    try {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch { /* try next */ }
  }
  return false;
}

export async function handleTicketPatch(session, request) {
  if (!(await resolveAdmin(session))) {
    return json(403, { ok: false, error: "forbidden" });
  }
  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }

  const code = String(body?.code || "").trim();
  if (!code) return json(400, { ok: false, error: "missing_code" });

  const hasStatus   = body?.status   !== undefined;
  const hasPriority = body?.priority !== undefined;
  if (!hasStatus && !hasPriority) {
    return json(400, { ok: false, error: "nothing_to_update" });
  }

  const status   = hasStatus   ? String(body.status).trim()   : null;
  const priority = hasPriority ? String(body.priority).trim() : null;

  if (hasStatus   && !VALID_STATUSES.includes(status))     return json(400, { ok: false, error: "invalid_status" });
  if (hasPriority && !VALID_PRIORITIES.includes(priority)) return json(400, { ok: false, error: "invalid_priority" });

  const closing = hasStatus && CLOSING_STATUSES.has(status);
  const rows = await sql`
    UPDATE tickets
    SET status     = COALESCE(${hasStatus   ? status   : null}, status),
        priority   = COALESCE(${hasPriority ? priority : null}, priority),
        updated_at = now(),
        closed_at  = CASE
          WHEN ${hasStatus} AND ${closing} THEN now()
          WHEN ${hasStatus} AND NOT ${closing} THEN NULL
          ELSE closed_at
        END
    WHERE ticket_code = ${code}
    RETURNING id, ticket_code, status, priority, updated_at, closed_at
  `;
  if (rows.length === 0) return json(404, { ok: false, error: "not_found" });
  return json(200, { ok: true, ticket: rows[0] });
}
