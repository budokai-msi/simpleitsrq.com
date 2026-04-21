// Consolidated portal API. One Vercel Function that dispatches on
// ?action=... so we stay under the Hobby plan's 12-function limit.
//
// Actions:
//   GET   /api/portal?action=me
//   PATCH /api/portal?action=me               { name?, company?, phone? }
//   GET   /api/portal?action=tickets&status=open|closed[&q=search]
//   GET   /api/portal?action=ticket&code=SRQ-...
//   POST  /api/portal?action=ticket-message   { code, body }
//   PATCH /api/portal?action=ticket           { code, status }   (admin only)
//   GET   /api/portal?action=invoices
//   GET   /api/portal?action=visitors         (admin only)
//   GET   /api/portal?action=honeypot-creds   (admin only)
//   POST  /api/portal?action=block-ip         (admin only)
//   GET   /api/portal?action=investigate      (admin only)

import Stripe from "stripe";
import { Resend } from "resend";
import { sql } from "./_lib/db.js";
import { getSession } from "./_lib/session.js";
import { clientIp, auditVerify, logSecurityEvent } from "./_lib/security.js";
import { refreshThreatFeeds, matchOsintFeeds, osintStatus } from "./_lib/osint.js";
import { json } from "./_lib/http.js";

const TICKET_FROM = "Simple IT SRQ Support <support@simpleitsrq.com>";
const CONTACT_TO_DEFAULT = "hello@simpleitsrq.com";

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

async function requireSession(request) {
  const session = await getSession(request);
  if (!session) return { error: json(401, { ok: false, error: "unauthorized" }) };
  return { session };
}

// Send a notification when a new message is posted on a ticket. If the client
// replied, notify the support inbox; if the agent replied, notify the client
// who filed the ticket. Swallow all errors — email is best-effort and must
// never block the DB write that just succeeded.
async function sendReplyNotification({ ticket, message, authorType }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[portal] RESEND_API_KEY not set — skipping reply email");
    return;
  }
  const supportInbox = process.env.CONTACT_TO_EMAIL || CONTACT_TO_DEFAULT;
  const to = authorType === "agent" ? ticket.email : supportInbox;
  if (!to) return;

  const subject =
    authorType === "agent"
      ? `[Update ${ticket.ticket_code}] ${ticket.subject}`
      : `[Client reply ${ticket.ticket_code}] ${ticket.subject}`;

  const heading =
    authorType === "agent"
      ? `New update on your support ticket`
      : `New client reply on ${ticket.ticket_code}`;

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
          Reply from the <a href="https://simpleitsrq.com/portal">Simple IT SRQ portal</a> · Ticket ${escapeHtml(ticket.ticket_code)}
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
    `Reply in the portal: https://simpleitsrq.com/portal`,
  ].join("\n");

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: TICKET_FROM,
      to: [to],
      replyTo: authorType === "agent" ? supportInbox : ticket.email,
      subject,
      text,
      html,
      headers: { "X-Ticket-ID": ticket.ticket_code },
    });
  } catch (err) {
    console.error("[portal] reply email failed", err);
  }
}

// Memoized per-request admin check. Handlers that need it call
// `resolveAdmin(session)` which caches the DB lookup on the session object
// itself so a single portal call only hits `users` once.
async function resolveAdmin(session) {
  if (session.__isAdmin !== undefined) return session.__isAdmin;
  const adminEmail = process.env.ADMIN_EMAIL || "";
  if (!adminEmail || session.user.email.toLowerCase() !== adminEmail.toLowerCase()) {
    session.__isAdmin = false;
    return false;
  }
  const rows = await sql`SELECT is_admin FROM users WHERE id = ${session.user.id} LIMIT 1`;
  session.__isAdmin = rows.length > 0 && rows[0].is_admin === true;
  return session.__isAdmin;
}

// ---------- action handlers ----------
async function handleMeGet(session) {
  return json(200, { user: session.user });
}

async function handleMePatch(session, request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }
  const name    = body.name    == null ? null : String(body.name).trim().slice(0, 200);
  const company = body.company == null ? null : String(body.company).trim().slice(0, 200);
  const phone   = body.phone   == null ? null : String(body.phone).trim().slice(0, 50);

  const rows = await sql`
    UPDATE users
    SET name       = COALESCE(${name},    name),
        company    = COALESCE(${company}, company),
        phone      = COALESCE(${phone},   phone),
        updated_at = now()
    WHERE id = ${session.user.id}
    RETURNING id, email, name, avatar_url, company, phone, is_admin
  `;
  const u = rows[0];
  return json(200, {
    user: {
      id: u.id,
      email: u.email,
      name: u.name,
      avatarUrl: u.avatar_url,
      company: u.company,
      phone: u.phone,
      isAdmin: u.is_admin === true,
    },
  });
}

async function handleTickets(session, url) {
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
               t.created_at, t.updated_at, t.closed_at,
               u.name AS user_name, u.email AS user_email, u.company AS user_company
        FROM tickets t
        LEFT JOIN users u ON u.id = t.user_id
        WHERE t.ticket_code = ${code}
        LIMIT 1
      `
    : await sql`
        SELECT id, ticket_code, email, name, company, phone, priority, category,
               subject, description, status, created_at, updated_at, closed_at
        FROM tickets
        WHERE ticket_code = ${code}
          AND (user_id = ${session.user.id} OR lower(email) = lower(${session.user.email}))
        LIMIT 1
      `;
  return { admin, row: rows[0] || null };
}

async function handleTicket(session, url) {
  const code = url.searchParams.get("code");
  if (!code) return json(400, { ok: false, error: "missing_code" });

  const { admin, row: t } = await loadTicketForSession(session, code);
  if (!t) return json(404, { ok: false, error: "not_found" });

  const messages = await sql`
    SELECT id, author_type, author_name, body, created_at
    FROM ticket_messages
    WHERE ticket_id = ${t.id}
    ORDER BY created_at ASC
  `;
  return json(200, {
    ticket: {
      id: t.id,
      code: t.ticket_code,
      subject: t.subject,
      description: t.description,
      category: t.category,
      priority: t.priority,
      status: t.status,
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
      createdAt: m.created_at,
    })),
  });
}

async function handleTicketMessage(session, request) {
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

  const inserted = await sql`
    INSERT INTO ticket_messages (ticket_id, author_type, author_name, body)
    VALUES (${t.id}, ${authorType}, ${authorName}, ${text})
    RETURNING id, author_type, author_name, body, created_at
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
    createdAt: m.created_at,
  };

  await sendReplyNotification({
    ticket: t,
    message: messagePayload,
    authorType,
  });

  return json(200, { ok: true, message: messagePayload });
}

async function handleTicketPatch(session, request) {
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

async function handleInvoices(session) {
  const rows = await sql`
    SELECT id, invoice_number, amount_cents, currency, status,
           issued_at, due_at, paid_at, hosted_url, pdf_url, description
    FROM invoices
    WHERE user_id = ${session.user.id}
    ORDER BY issued_at DESC
    LIMIT 200
  `;
  return json(200, {
    invoices: rows.map((r) => ({
      id: r.id,
      number: r.invoice_number,
      amountCents: r.amount_cents,
      currency: r.currency,
      status: r.status,
      issuedAt: r.issued_at,
      dueAt: r.due_at,
      paidAt: r.paid_at,
      hostedUrl: r.hosted_url,
      pdfUrl: r.pdf_url,
      description: r.description,
    })),
  });
}

async function handleVisitors(session) {
  if (!(await resolveAdmin(session))) {
    return json(403, { ok: false, error: "forbidden" });
  }

  const [stats24, stats7, recent, topPages, topCountries, topReferrers] = await Promise.all([
    sql`
      SELECT COUNT(*)::int AS total,
             COUNT(DISTINCT COALESCE(anon_id, ip))::int AS unique_count
      FROM visits WHERE ts > now() - interval '24 hours'
    `,
    sql`
      SELECT COUNT(*)::int AS total,
             COUNT(DISTINCT COALESCE(anon_id, ip))::int AS unique_count
      FROM visits WHERE ts > now() - interval '7 days'
    `,
    sql`
      SELECT v.ts, v.path, v.referrer, v.ip, v.country, v.region, v.city,
             v.browser, v.os, v.device, v.consent, v.anon_id,
             v.device_hash, v.screen, v.platform, v.cores, v.mem, v.touch,
             v.dpr, v.color_depth, v.connection, v.user_agent, v.tz, v.lang, v.langs,
             u.email AS user_email, u.name AS user_name
      FROM visits v
      LEFT JOIN users u ON u.id = v.user_id
      ORDER BY v.ts DESC
      LIMIT 100
    `,
    sql`
      SELECT path, COUNT(*)::int AS hits
      FROM visits WHERE ts > now() - interval '7 days'
      GROUP BY path ORDER BY hits DESC LIMIT 15
    `,
    sql`
      SELECT COALESCE(country, '?') AS country, COUNT(*)::int AS hits
      FROM visits WHERE ts > now() - interval '7 days'
      GROUP BY country ORDER BY hits DESC LIMIT 15
    `,
    sql`
      SELECT COALESCE(NULLIF(referrer, ''), '(direct)') AS referrer, COUNT(*)::int AS hits
      FROM visits WHERE ts > now() - interval '7 days'
      GROUP BY referrer ORDER BY hits DESC LIMIT 15
    `,
  ]);

  // --- Threat actors with OSINT enrichment + blocked status ---
  const [threatActors, sessionAnomalies, blockedIps, ipIntelAll] = await Promise.all([
    sql`
      SELECT ta.ip, ta.country, ta.city, ta.user_agent, ta.device_hash,
             ta.path, ta.method, ta.threat_class, ta.ts
      FROM threat_actors ta
      ORDER BY ta.ts DESC LIMIT 50
    `,
    sql`
      SELECT st.event, st.ip, st.country, st.city, st.device_hash, st.detail, st.ts,
             u.email AS user_email
      FROM session_tracking st
      LEFT JOIN users u ON u.id = st.user_id
      WHERE st.event = 'anomaly'
      ORDER BY st.ts DESC LIMIT 50
    `,
    sql`SELECT ip, reason, created_at FROM ip_blocklist ORDER BY created_at DESC LIMIT 100`,
    sql`
      SELECT ip, asn, org, isp, is_datacenter, is_tor, is_proxy, is_vpn,
             abuse_score, abuse_reports, abuse_last_seen, enriched_at
      FROM ip_intel
      ORDER BY enriched_at DESC LIMIT 200
    `,
  ]);

  // Build a lookup map for fast IP→intel resolution on the client.
  const intelMap = {};
  for (const i of ipIntelAll) {
    intelMap[i.ip] = {
      asn: i.asn, org: i.org, isp: i.isp,
      isDatacenter: i.is_datacenter, isTor: i.is_tor, isProxy: i.is_proxy, isVpn: i.is_vpn,
      abuseScore: i.abuse_score, abuseReports: i.abuse_reports,
      abuseLastSeen: i.abuse_last_seen, enrichedAt: i.enriched_at,
    };
  }
  const blockedSet = new Set(blockedIps.map((b) => b.ip));

  // Live OSINT feed matches for every IP in the rendered panel. Single
  // query against the threat_feeds cache (daily-refreshed by the cron);
  // returns {} silently if migration 003 hasn't been run yet.
  const osintIps = [...new Set([
    ...recent.map((r) => r.ip),
    ...threatActors.map((t) => t.ip),
    ...blockedIps.map((b) => b.ip),
  ].filter(Boolean))];
  const osintMap = await matchOsintFeeds(osintIps);

  return json(200, {
    stats: {
      total24h: stats24[0]?.total || 0,
      unique24h: stats24[0]?.unique_count || 0,
      total7d: stats7[0]?.total || 0,
      unique7d: stats7[0]?.unique_count || 0,
    },
    recent: recent.map((r) => ({
      ts: r.ts,
      path: r.path,
      referrer: r.referrer,
      ip: r.ip,
      country: r.country,
      region: r.region,
      city: r.city,
      browser: r.browser,
      os: r.os,
      device: r.device,
      consent: r.consent,
      anonId: r.anon_id,
      deviceHash: r.device_hash,
      screen: r.screen,
      platform: r.platform,
      cores: r.cores,
      mem: r.mem,
      touch: r.touch,
      dpr: r.dpr,
      colorDepth: r.color_depth,
      connection: r.connection,
      userAgent: r.user_agent,
      tz: r.tz,
      lang: r.lang,
      langs: r.langs,
      userEmail: r.user_email,
      userName: r.user_name,
      abuseScore: r.abuse_score,
      isDatacenter: r.is_datacenter,
      org: r.org,
      intel: intelMap[r.ip] || null,
      osintMatches: osintMap[r.ip] || [],
      blocked: blockedSet.has(r.ip),
    })),
    topPages,
    topCountries,
    topReferrers,
    threatActors: threatActors.map((t) => ({
      ip: t.ip, country: t.country, city: t.city, ua: t.user_agent,
      deviceHash: t.device_hash, path: t.path, method: t.method,
      threatClass: t.threat_class, ts: t.ts,
      intel: intelMap[t.ip] || null,
      osintMatches: osintMap[t.ip] || [],
      blocked: blockedSet.has(t.ip),
    })),
    sessionAnomalies: sessionAnomalies.map((s) => ({
      event: s.event, ip: s.ip, country: s.country, city: s.city,
      deviceHash: s.device_hash, detail: s.detail, ts: s.ts,
      userEmail: s.user_email,
    })),
    blockedIps: blockedIps.map((b) => ({
      ip: b.ip, reason: b.reason, blockedAt: b.created_at,
      intel: intelMap[b.ip] || null,
      osintMatches: osintMap[b.ip] || [],
    })),
    ipIntel: intelMap,
    osintSummary: {
      matchedIps: Object.keys(osintMap).length,
      totalChecked: osintIps.length,
    },
  });
}

// --- Per-IP investigation endpoint (admin only) ---
async function handleInvestigateIp(session, url) {
  if (!(await resolveAdmin(session))) {
    return json(403, { ok: false, error: "forbidden" });
  }
  const ip = url.searchParams.get("ip");
  if (!ip) return json(400, { ok: false, error: "missing_ip" });

  const [intel, visits, threats, blocked] = await Promise.all([
    sql`SELECT * FROM ip_intel WHERE ip = ${ip} LIMIT 1`,
    sql`
      SELECT ts, path, device_hash, user_agent, browser, os, device,
             screen, platform, cores, mem, tz, lang, country, city
      FROM visits WHERE ip = ${ip} ORDER BY ts DESC LIMIT 50
    `,
    sql`
      SELECT ts, path, method, threat_class, device_hash, user_agent
      FROM threat_actors WHERE ip = ${ip} ORDER BY ts DESC LIMIT 50
    `,
    sql`SELECT ip, reason, created_at FROM ip_blocklist WHERE ip = ${ip}`,
  ]);

  const osintMap = await matchOsintFeeds([ip]);
  const osintMatches = osintMap[ip] || [];

  const rawIntel = intel[0] || null;
  const intelOut = rawIntel
    ? {
        ip: rawIntel.ip,
        asn: rawIntel.asn,
        org: rawIntel.org,
        isp: rawIntel.isp,
        country: rawIntel.country,
        region: rawIntel.region,
        city: rawIntel.city,
        isDatacenter: rawIntel.is_datacenter,
        isTor: rawIntel.is_tor,
        isProxy: rawIntel.is_proxy,
        isVpn: rawIntel.is_vpn,
        abuseScore: rawIntel.abuse_score,
        abuseReports: rawIntel.abuse_reports,
        abuseLastSeen: rawIntel.abuse_last_seen,
        reverseDns: rawIntel.reverse_dns,
        rdapName: rawIntel.rdap_name,
        rdapRegistrant: rawIntel.rdap_registrant,
        rdapAbuseEmail: rawIntel.rdap_abuse_email,
        rdapNetRange: rawIntel.rdap_net_range,
        enrichedAt: rawIntel.enriched_at,
      }
    : null;

  return json(200, {
    ip,
    intel: intelOut,
    osintMatches,
    blocked: blocked.length > 0 ? blocked[0] : null,
    visits: visits.map((v) => ({
      ts: v.ts, path: v.path, deviceHash: v.device_hash, ua: v.user_agent,
      browser: v.browser, os: v.os, device: v.device, screen: v.screen,
      platform: v.platform, cores: v.cores, mem: v.mem, tz: v.tz,
      lang: v.lang, country: v.country, city: v.city,
    })),
    threats: threats.map((t) => ({
      ts: t.ts, path: t.path, method: t.method, threatClass: t.threat_class,
      deviceHash: t.device_hash, ua: t.user_agent,
    })),
    deviceHashes: [...new Set([
      ...visits.map((v) => v.device_hash),
      ...threats.map((t) => t.device_hash),
    ].filter(Boolean))],
  });
}

// ---------- threat intelligence (admin only) ----------

async function handleThreatIntel(session, url) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const range = url.searchParams.get("range") || "7d";
  const interval = range === "24h" ? "24 hours" : range === "30d" ? "30 days" : "7 days";

  const [
    timeline, campaigns, topAsns, threatClasses,
    tzDistribution, credStats,
    autoActions, recentCritical, attackVelocity
  ] = await Promise.all([
    // Attack timeline — hourly buckets for charting
    sql`
      SELECT date_trunc('hour', ts) AS bucket,
             threat_class,
             COUNT(*)::int AS hits
      FROM threat_actors
      WHERE ts > now() - ${interval}::interval
      GROUP BY bucket, threat_class
      ORDER BY bucket
    `,
    // Campaign clusters — group by device_hash to reveal actors behind multiple IPs
    sql`
      SELECT ta.device_hash,
             COUNT(DISTINCT ta.ip)::int AS ip_count,
             COUNT(*)::int AS total_hits,
             array_agg(DISTINCT ta.ip) AS ips,
             array_agg(DISTINCT ta.country) FILTER (WHERE ta.country IS NOT NULL) AS countries,
             MIN(ta.ts) AS first_seen,
             MAX(ta.ts) AS last_seen,
             array_agg(DISTINCT ta.threat_class) AS threat_classes,
             array_agg(DISTINCT ta.path ORDER BY ta.path) AS paths_probed
      FROM threat_actors ta
      WHERE ta.device_hash IS NOT NULL
        AND ta.ts > now() - ${interval}::interval
      GROUP BY ta.device_hash
      HAVING COUNT(DISTINCT ta.ip) >= 2
      ORDER BY total_hits DESC
      LIMIT 20
    `,
    // Top attacking ASNs/orgs
    sql`
      SELECT ii.org, ii.asn, ii.is_datacenter,
             COUNT(DISTINCT ta.ip)::int AS ip_count,
             COUNT(*)::int AS total_hits,
             AVG(ii.abuse_score)::int AS avg_abuse
      FROM threat_actors ta
      JOIN ip_intel ii ON ii.ip = ta.ip
      WHERE ta.ts > now() - ${interval}::interval AND ii.org IS NOT NULL
      GROUP BY ii.org, ii.asn, ii.is_datacenter
      ORDER BY total_hits DESC
      LIMIT 15
    `,
    // Threat class breakdown
    sql`
      SELECT threat_class, COUNT(*)::int AS hits
      FROM threat_actors
      WHERE ts > now() - ${interval}::interval
      GROUP BY threat_class
      ORDER BY hits DESC
    `,
    // Timezone distribution from attacker user-agents (behavioral signal)
    sql`
      SELECT
        EXTRACT(HOUR FROM ts AT TIME ZONE 'UTC')::int AS utc_hour,
        COUNT(*)::int AS hits
      FROM threat_actors
      WHERE ts > now() - ${interval}::interval
      GROUP BY utc_hour
      ORDER BY utc_hour
    `,
    // Credential capture stats
    sql`
      SELECT COUNT(*)::int AS total_captures,
             COUNT(DISTINCT detail->>'ip')::int AS unique_ips,
             COUNT(DISTINCT detail->>'email')::int AS unique_emails,
             COUNT(DISTINCT detail->>'passwordHash')::int AS unique_passwords
      FROM security_events
      WHERE kind = 'honeypot.credential'
        AND ts > now() - ${interval}::interval
    `,
    // Auto countermeasure actions taken
    sql`
      SELECT action, target, reason, ts
      FROM auto_actions
      WHERE ts > now() - ${interval}::interval
      ORDER BY ts DESC
      LIMIT 50
    `,
    // Recent critical security events
    sql`
      SELECT kind, severity, ip, user_agent, path, detail, ts
      FROM security_events
      WHERE severity IN ('critical', 'error')
        AND ts > now() - ${interval}::interval
      ORDER BY ts DESC
      LIMIT 20
    `,
    // Attack velocity — IPs with highest hit rate in last hour
    sql`
      SELECT ip, COUNT(*)::int AS hits_1h
      FROM threat_actors
      WHERE ts > now() - interval '1 hour'
      GROUP BY ip
      HAVING COUNT(*) >= 3
      ORDER BY hits_1h DESC
      LIMIT 10
    `,
  ]);

  // Enrich campaigns with ip_intel
  const campaignIps = new Set(campaigns.flatMap((c) => c.ips || []));
  const velocityIps = new Set(attackVelocity.map((v) => v.ip));
  const allIps = [...new Set([...campaignIps, ...velocityIps])];
  let intelMap = {};
  if (allIps.length > 0) {
    const intel = await sql`SELECT ip, org, asn, isp, is_datacenter, abuse_score, abuse_reports, is_tor, is_vpn, is_proxy FROM ip_intel WHERE ip = ANY(${allIps})`;
    for (const i of intel) intelMap[i.ip] = i;
  }

  // Summary stats
  const totalThreats = threatClasses.reduce((s, t) => s + t.hits, 0);
  const blockedCount = await sql`SELECT COUNT(*)::int AS n FROM ip_blocklist`;

  return json(200, {
    range,
    summary: {
      totalThreats,
      blockedIps: blockedCount[0]?.n || 0,
      campaignCount: campaigns.length,
      credCaptures: credStats[0]?.total_captures || 0,
      uniqueAttackerEmails: credStats[0]?.unique_emails || 0,
      uniquePasswords: credStats[0]?.unique_passwords || 0,
    },
    timeline: timeline.map((t) => ({
      bucket: t.bucket,
      threatClass: t.threat_class,
      hits: t.hits,
    })),
    campaigns: campaigns.map((c) => ({
      deviceHash: c.device_hash,
      ipCount: c.ip_count,
      totalHits: c.total_hits,
      ips: (c.ips || []).slice(0, 10),
      countries: c.countries || [],
      firstSeen: c.first_seen,
      lastSeen: c.last_seen,
      threatClasses: c.threat_classes || [],
      pathsProbed: (c.paths_probed || []).slice(0, 15),
      intel: (c.ips || []).slice(0, 3).map((ip) => intelMap[ip]).filter(Boolean),
    })),
    topAsns: topAsns.map((a) => ({
      org: a.org, asn: a.asn, isDatacenter: a.is_datacenter,
      ipCount: a.ip_count, totalHits: a.total_hits, avgAbuse: a.avg_abuse,
    })),
    threatClasses: threatClasses.map((t) => ({ class: t.threat_class, hits: t.hits })),
    tzDistribution: tzDistribution.map((t) => ({ hour: t.utc_hour, hits: t.hits })),
    attackVelocity: attackVelocity.map((v) => ({
      ip: v.ip, hits1h: v.hits_1h, intel: intelMap[v.ip] || null,
    })),
    autoActions: autoActions.map((a) => ({
      action: a.action, target: a.target, reason: a.reason, ts: a.ts,
    })),
    recentCritical: recentCritical.map((e) => ({
      kind: e.kind, severity: e.severity, ip: e.ip, path: e.path,
      detail: e.detail, ts: e.ts,
    })),
  });
}

// ---------- blog drafts (admin only) ----------
// These handlers manage the `draft_posts` table populated by the daily
// cron agent (api/cron/agent.js). They let the admin list pending drafts,
// reject them, or publish them — publish commits a new entry to
// src/data/posts.js via the GitHub Contents API and Vercel redeploys.

const DRAFT_STATUSES = ["draft", "approved", "rejected", "published"];

async function requireAdmin(session) {
  if (!(await resolveAdmin(session))) {
    return json(403, { ok: false, error: "forbidden" });
  }
  return null;
}

// Walk the security_events hash chain and report tampering. Admin-only —
// the breaks themselves are not sensitive, but the full event list behind
// them is.
async function handleAuditVerify(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const result = await auditVerify();
  return json(200, result);
}

// Run the audit-chain migration (001) — adds prev_hash + row_hash columns
// and the supporting index. Safe to re-run; each statement is IF NOT EXISTS.
// Admin-only. Gating on this action via requireAdmin means it can only be
// triggered by someone already authorized to read the audit log, so there's
// no privilege-escalation path from hitting it.
async function handleRunAuditMigration(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const results = [];
  try {
    await sql`ALTER TABLE security_events ADD COLUMN IF NOT EXISTS prev_hash CHAR(64)`;
    results.push({ step: "add prev_hash column", ok: true });
  } catch (e) {
    results.push({ step: "add prev_hash column", ok: false, error: String(e.message || e) });
  }
  try {
    await sql`ALTER TABLE security_events ADD COLUMN IF NOT EXISTS row_hash CHAR(64)`;
    results.push({ step: "add row_hash column", ok: true });
  } catch (e) {
    results.push({ step: "add row_hash column", ok: false, error: String(e.message || e) });
  }
  try {
    await sql`
      CREATE INDEX IF NOT EXISTS idx_security_events_row_hash_id
        ON security_events (id DESC)
        WHERE row_hash IS NOT NULL
    `;
    results.push({ step: "create index", ok: true });
  } catch (e) {
    results.push({ step: "create index", ok: false, error: String(e.message || e) });
  }

  // Migration 002 — drop CHAR(64) padding on prev_hash/row_hash. Safe to
  // re-run: ALTER COLUMN TYPE on a column that's already the target type
  // is a no-op.
  try {
    await sql`ALTER TABLE security_events ALTER COLUMN prev_hash TYPE varchar(64)`;
    results.push({ step: "alter prev_hash to varchar(64)", ok: true });
  } catch (e) {
    results.push({ step: "alter prev_hash to varchar(64)", ok: false, error: String(e.message || e) });
  }
  try {
    await sql`ALTER TABLE security_events ALTER COLUMN row_hash TYPE varchar(64)`;
    results.push({ step: "alter row_hash to varchar(64)", ok: true });
  } catch (e) {
    results.push({ step: "alter row_hash to varchar(64)", ok: false, error: String(e.message || e) });
  }

  // Migration 004 — admin IP immunity cache (prevents owner lockout).
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS admin_ip_immunity (
        ip          text PRIMARY KEY,
        user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
        granted_at  timestamptz NOT NULL DEFAULT now(),
        expires_at  timestamptz NOT NULL,
        reason      text
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS admin_ip_immunity_expires_idx ON admin_ip_immunity (expires_at)`;
    results.push({ step: "create admin_ip_immunity table", ok: true });
  } catch (e) {
    results.push({ step: "create admin_ip_immunity table", ok: false, error: String(e.message || e) });
  }

  // Migration 003 — OSINT threat-feed cache (Spamhaus DROP/EDROP + ET).
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS threat_feeds (
        id         bigserial PRIMARY KEY,
        feed_name  text NOT NULL,
        source_url text NOT NULL,
        cidr       cidr NOT NULL,
        category   text,
        note       text,
        fetched_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (feed_name, cidr)
      )
    `;
    results.push({ step: "create threat_feeds table", ok: true });
  } catch (e) {
    results.push({ step: "create threat_feeds table", ok: false, error: String(e.message || e) });
  }
  try {
    await sql`CREATE INDEX IF NOT EXISTS threat_feeds_feed_idx    ON threat_feeds (feed_name)`;
    await sql`CREATE INDEX IF NOT EXISTS threat_feeds_fetched_idx ON threat_feeds (fetched_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS threat_feeds_cidr_idx    ON threat_feeds (cidr)`;
    results.push({ step: "create threat_feeds indexes", ok: true });
  } catch (e) {
    results.push({ step: "create threat_feeds indexes", ok: false, error: String(e.message || e) });
  }

  // Migration 006 — newsletter subscribers (double-opt-in).
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS newsletter_subscribers (
        id                  bigserial PRIMARY KEY,
        email               text NOT NULL,
        confirm_token       text NOT NULL UNIQUE,
        unsubscribe_token   text NOT NULL UNIQUE,
        source              text,
        ip                  text,
        created_at          timestamptz NOT NULL DEFAULT now(),
        confirmed_at        timestamptz,
        unsubscribed_at     timestamptz,
        UNIQUE (email)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS newsletter_confirmed_idx ON newsletter_subscribers (confirmed_at) WHERE confirmed_at IS NOT NULL`;
    await sql`CREATE INDEX IF NOT EXISTS newsletter_email_idx     ON newsletter_subscribers (lower(email))`;
    results.push({ step: "create newsletter_subscribers table", ok: true });
  } catch (e) {
    results.push({ step: "create newsletter_subscribers table", ok: false, error: String(e.message || e) });
  }

  // Migration 007 — testimonials (no seed data; admin adds rows via UI).
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS testimonials (
        id             bigserial PRIMARY KEY,
        quote          text NOT NULL,
        author_name    text NOT NULL,
        author_role    text,
        author_company text,
        city           text,
        product_slug   text,
        rating         int CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
        approved       boolean NOT NULL DEFAULT false,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS testimonials_approved_idx ON testimonials (approved, created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS testimonials_product_idx  ON testimonials (product_slug) WHERE product_slug IS NOT NULL`;
    results.push({ step: "create testimonials table", ok: true });
  } catch (e) {
    results.push({ step: "create testimonials table", ok: false, error: String(e.message || e) });
  }

  // Migration 005 — affiliate_clicks table (revenue-signal tracking).
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS affiliate_clicks (
        id            bigserial PRIMARY KEY,
        ts            timestamptz NOT NULL DEFAULT now(),
        slug          text,
        destination   text NOT NULL,
        label         text,
        network       text,
        ip            text,
        country       text,
        anon_id       text,
        user_id       uuid REFERENCES users(id) ON DELETE SET NULL,
        referrer_path text
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS affiliate_clicks_ts_idx      ON affiliate_clicks (ts DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS affiliate_clicks_slug_idx    ON affiliate_clicks (slug, ts DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS affiliate_clicks_network_idx ON affiliate_clicks (network)`;
    results.push({ step: "create affiliate_clicks table", ok: true });
  } catch (e) {
    results.push({ step: "create affiliate_clicks table", ok: false, error: String(e.message || e) });
  }

  const allOk = results.every((r) => r.ok);
  return json(allOk ? 200 : 500, {
    ok: allOk,
    migrations: ["001_audit_chain", "002_audit_chain_fix", "003_threat_feeds", "004_admin_ip_immunity", "005_affiliate_clicks", "006_newsletter_subscribers", "007_testimonials"],
    results,
  });
}

// --- Testimonials (admin CRUD; public read is on /api/contact) ---
async function handleTestimonialsList(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const rows = await sql`
    SELECT id, quote, author_name, author_role, author_company, city,
           product_slug, rating, approved, created_at, updated_at
    FROM testimonials
    ORDER BY approved ASC, created_at DESC
  `.catch(() => []);
  return json(200, {
    ok: true,
    testimonials: rows.map((t) => ({
      id: t.id,
      quote: t.quote,
      authorName: t.author_name,
      authorRole: t.author_role,
      authorCompany: t.author_company,
      city: t.city,
      productSlug: t.product_slug,
      rating: t.rating,
      approved: t.approved,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    })),
  });
}

async function handleTestimonialSave(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }

  const quote = String(body?.quote || "").trim().slice(0, 2000);
  const authorName = String(body?.authorName || "").trim().slice(0, 120);
  if (!quote) return json(400, { ok: false, error: "quote_required" });
  if (!authorName) return json(400, { ok: false, error: "author_name_required" });

  const authorRole    = body?.authorRole    ? String(body.authorRole).slice(0, 120) : null;
  const authorCompany = body?.authorCompany ? String(body.authorCompany).slice(0, 200) : null;
  const city          = body?.city          ? String(body.city).slice(0, 80) : null;
  const productSlug   = body?.productSlug   ? String(body.productSlug).slice(0, 120) : null;
  const rating        = body?.rating ? Math.min(Math.max(Number(body.rating), 1), 5) : null;
  const approved      = body?.approved === true;

  if (body?.id) {
    const row = await sql`
      UPDATE testimonials
      SET quote = ${quote}, author_name = ${authorName}, author_role = ${authorRole},
          author_company = ${authorCompany}, city = ${city}, product_slug = ${productSlug},
          rating = ${rating}, approved = ${approved}, updated_at = now()
      WHERE id = ${body.id}
      RETURNING id
    `;
    return json(200, { ok: true, id: row[0]?.id || null, action: "updated" });
  }
  const row = await sql`
    INSERT INTO testimonials (quote, author_name, author_role, author_company,
                              city, product_slug, rating, approved)
    VALUES (${quote}, ${authorName}, ${authorRole}, ${authorCompany},
            ${city}, ${productSlug}, ${rating}, ${approved})
    RETURNING id
  `;
  return json(200, { ok: true, id: row[0]?.id, action: "created" });
}

async function handleTestimonialDelete(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const id = Number(body?.id);
  if (!id) return json(400, { ok: false, error: "id_required" });
  await sql`DELETE FROM testimonials WHERE id = ${id}`;
  return json(200, { ok: true });
}

// Revenue Signals: what's earning money. Combines three inputs:
//   1. Blog traffic — visits to /blog/:slug grouped by post in last 30 days
//   2. Affiliate clicks — outbound affiliate-link clicks grouped by slug + network
//   3. Store traffic — visits to /store and each product page
// Intentionally lightweight — all data already lives in the visits + new
// affiliate_clicks tables, so this is just aggregate queries.
async function handleRevenueSignals(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const [blogTraffic, clicksByPost, clicksByNetwork, clicksByProduct, storeTraffic, recentClicks] = await Promise.all([
    sql`
      SELECT path,
             COUNT(*)::int AS views,
             COUNT(DISTINCT COALESCE(anon_id, ip))::int AS unique_views
      FROM visits
      WHERE path LIKE '/blog/%'
        AND ts > now() - interval '30 days'
      GROUP BY path
      ORDER BY views DESC
      LIMIT 30
    `.catch(() => []),
    sql`
      SELECT slug, COUNT(*)::int AS clicks
      FROM affiliate_clicks
      WHERE ts > now() - interval '30 days'
        AND slug IS NOT NULL AND slug <> ''
      GROUP BY slug
      ORDER BY clicks DESC
      LIMIT 30
    `.catch(() => []),
    sql`
      SELECT COALESCE(network, 'unknown') AS network,
             COUNT(*)::int AS clicks
      FROM affiliate_clicks
      WHERE ts > now() - interval '30 days'
      GROUP BY network
      ORDER BY clicks DESC
    `.catch(() => []),
    sql`
      SELECT label, destination, COUNT(*)::int AS clicks
      FROM affiliate_clicks
      WHERE ts > now() - interval '30 days'
        AND label IS NOT NULL
      GROUP BY label, destination
      ORDER BY clicks DESC
      LIMIT 20
    `.catch(() => []),
    sql`
      SELECT path,
             COUNT(*)::int AS views
      FROM visits
      WHERE (path = '/store' OR path LIKE '/store/%')
        AND ts > now() - interval '30 days'
      GROUP BY path
      ORDER BY views DESC
    `.catch(() => []),
    sql`
      SELECT ts, slug, label, network, country
      FROM affiliate_clicks
      ORDER BY ts DESC
      LIMIT 20
    `.catch(() => []),
  ]);

  // Compute CTR per post: clicks on that post's slug / views of /blog/:slug.
  const viewsBySlug = {};
  for (const r of blogTraffic) {
    const m = r.path.match(/^\/blog\/(.+)$/);
    if (m) viewsBySlug[m[1]] = r.views;
  }
  const clicksBySlug = {};
  for (const c of clicksByPost) clicksBySlug[c.slug] = c.clicks;
  const postLeaderboard = Object.keys(viewsBySlug)
    .map((slug) => ({
      slug,
      views: viewsBySlug[slug],
      clicks: clicksBySlug[slug] || 0,
      ctr: viewsBySlug[slug] ? +(((clicksBySlug[slug] || 0) / viewsBySlug[slug]) * 100).toFixed(2) : 0,
    }))
    .sort((a, b) => b.clicks - a.clicks || b.views - a.views)
    .slice(0, 20);

  const totalClicks = clicksByNetwork.reduce((s, r) => s + r.clicks, 0);
  const totalBlogViews = blogTraffic.reduce((s, r) => s + r.views, 0);

  return json(200, {
    ok: true,
    window: "30 days",
    totals: {
      blogViews: totalBlogViews,
      affiliateClicks: totalClicks,
      overallCtr: totalBlogViews ? +((totalClicks / totalBlogViews) * 100).toFixed(2) : 0,
    },
    postLeaderboard,
    clicksByNetwork,
    clicksByProduct,
    storeTraffic,
    recentClicks,
  });
}

// Countermeasures dashboard: what the system has auto-blocked lately,
// which IPs are currently admin-immune, and the top OSINT matches that
// got turned into blocks. Pure read, admin-gated.
async function handleCountermeasures(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const [recentAutoActions, autoBlocks, immunities, osintBlocks] = await Promise.all([
    sql`
      SELECT action, target, reason, ts
      FROM auto_actions
      WHERE ts > now() - interval '7 days'
      ORDER BY ts DESC
      LIMIT 50
    `.catch(() => []),
    sql`
      SELECT ip, reason, created_at
      FROM ip_blocklist
      WHERE reason LIKE 'auto:%'
      ORDER BY created_at DESC
      LIMIT 50
    `.catch(() => []),
    sql`
      SELECT imm.ip, imm.granted_at, imm.expires_at, imm.reason, u.email AS user_email
      FROM admin_ip_immunity imm
      LEFT JOIN users u ON u.id = imm.user_id
      WHERE imm.expires_at > now()
      ORDER BY imm.expires_at DESC
    `.catch(() => []),
    sql`
      SELECT ta.ip, ta.country, ta.ts, ta.threat_class
      FROM threat_actors ta
      WHERE ta.threat_class = 'osint_match'
        AND ta.ts > now() - interval '7 days'
      ORDER BY ta.ts DESC
      LIMIT 30
    `.catch(() => []),
  ]);

  return json(200, {
    ok: true,
    recentAutoActions,
    autoBlocks,
    immunities: immunities.map((i) => ({
      ip: i.ip,
      grantedAt: i.granted_at,
      expiresAt: i.expires_at,
      reason: i.reason,
      userEmail: i.user_email,
    })),
    osintBlocks: osintBlocks.map((o) => ({
      ip: o.ip,
      country: o.country,
      ts: o.ts,
      threatClass: o.threat_class,
    })),
  });
}

// Grant or extend admin-IP immunity manually. Useful to pre-authorize a
// travel IP before a trip so the owner doesn't get locked out from a
// hotel network. Default TTL 7 days, overridable via days param.
async function handleGrantImmunity(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const ip = String(body?.ip || "").trim();
  const days = Math.min(Math.max(Number(body?.days) || 7, 1), 90);
  if (!ip) return json(400, { ok: false, error: "missing_ip" });

  const row = await sql`
    INSERT INTO admin_ip_immunity (ip, user_id, expires_at, reason)
    VALUES (${ip}, ${session?.user?.id || null}, now() + (${days}::int * interval '1 day'),
            ${`manual: granted by ${session?.user?.email || "admin"}`})
    ON CONFLICT (ip) DO UPDATE
      SET user_id    = EXCLUDED.user_id,
          granted_at = now(),
          expires_at = EXCLUDED.expires_at,
          reason     = EXCLUDED.reason
    RETURNING ip, expires_at
  `.catch((err) => {
    console.error("[portal] grant-immunity failed", err);
    return null;
  });

  if (!row) return json(500, { ok: false, error: "grant_failed" });

  // Also remove from the blocklist if present — granting immunity should
  // unblock the IP in one click, not leave them both blocked and immune.
  const unblocked = await sql`
    DELETE FROM ip_blocklist WHERE ip = ${ip} RETURNING ip, reason
  `.catch(() => []);

  return json(200, { ok: true, granted: row[0], unblocked: unblocked[0] || null });
}

// Aggregate "system health" snapshot for the Ops Console. Runs one read
// per subsystem so the admin can see at a glance what's installed, what
// hasn't been run yet, and whether the chain is currently clean. All
// queries degrade gracefully when their tables don't exist yet (pre-
// migration state) — `ok: false, migrationNeeded: true` instead of 500.
async function handleOpsStatus(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const [auditCols, feedTable, feedAgg, chainSnapshot] = await Promise.all([
    sql`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'security_events'
        AND column_name IN ('prev_hash', 'row_hash')
    `.catch(() => []),
    sql`
      SELECT EXISTS(
        SELECT 1 FROM information_schema.tables WHERE table_name = 'threat_feeds'
      ) AS present
    `.catch(() => [{ present: false }]),
    sql`
      SELECT feed_name, COUNT(*)::int AS n, MAX(fetched_at) AS last_fetched
      FROM threat_feeds GROUP BY feed_name
    `.catch(() => []),
    sql`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE row_hash IS NOT NULL)::int AS chained
      FROM security_events
    `.catch(() => [{ total: 0, chained: 0 }]),
  ]);

  const hasChainCols = auditCols.length === 2;
  const hashType = auditCols.find((c) => c.column_name === "row_hash")?.data_type || null;
  const paddedChar = hashType === "character"; // CHAR(N) pads; migration 002 flips it to varchar.
  const threatFeedsInstalled = Boolean(feedTable[0]?.present);

  return json(200, {
    ok: true,
    migrations: {
      auditChainInstalled: hasChainCols,
      auditChainFixApplied: hasChainCols && !paddedChar,
      threatFeedsInstalled,
    },
    chain: {
      totalRows: chainSnapshot[0]?.total || 0,
      chainedRows: chainSnapshot[0]?.chained || 0,
    },
    osint: {
      feeds: feedAgg,
      totalCidrs: feedAgg.reduce((s, f) => s + f.n, 0),
      oldestFetch: feedAgg.length
        ? feedAgg.reduce((a, b) => (a.last_fetched < b.last_fetched ? a : b)).last_fetched
        : null,
    },
  });
}

// GET the current OSINT cache summary (per-feed counts, last-fetched time,
// 20 most-recent matches against real threat_actors visits). Cheap — runs
// two small aggregate queries.
async function handleOsintStatus(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const status = await osintStatus();
  return json(status.ok ? 200 : 500, status);
}

// POST force-refresh every configured feed. Idempotent: each feed's rows
// are upserted on (feed_name, cidr), so re-running just bumps fetched_at
// and purges CIDRs that disappeared upstream.
async function handleOsintRefresh(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const result = await refreshThreatFeeds();
  return json(result.ok ? 200 : 500, result);
}

// One-shot: null prev_hash/row_hash on every currently-chained row. Use
// once after migration 002 to discard pre-fix rows whose hashes can never
// verify (CHAR padding + ts drift). Verify then skips them (WHERE row_hash
// IS NOT NULL) and the chain restarts clean from the next event.
async function handleResetAuditChain(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const before = await sql`
    SELECT COUNT(*)::int AS n FROM security_events WHERE row_hash IS NOT NULL
  `;
  const reset = await sql`
    UPDATE security_events
    SET prev_hash = NULL, row_hash = NULL
    WHERE row_hash IS NOT NULL
    RETURNING id
  `;
  return json(200, {
    ok: true,
    resetRows: reset.length,
    chainedBefore: before[0]?.n || 0,
    note: "Chain will restart from the next logSecurityEvent() call.",
  });
}

// Programmatically create Stripe Payment Links for every product in the
// catalog that doesn't already have one. Uses the same STRIPE_SECRET_KEY
// that invoicing uses. Returns the full list of URLs for the admin to
// paste into Vercel env vars. Idempotent: running twice produces the same
// Payment Link per product because we look up the product by its name
// before creating.
async function handleCreatePaymentLinks(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  return runCreateAllPaymentLinks();
}

// Bare helper — same logic, skips the admin gate. Called from the
// admin-auth path above AND from the one-shot bootstrap branch in
// dispatch(). Isolated so the bootstrap branch in dispatch can be
// removed cleanly without disturbing the admin-auth path.
async function runCreateAllPaymentLinks() {
  const stripe = getStripe();
  if (!stripe) return json(500, { ok: false, error: "stripe_not_configured" });

  // Products mirror src/data/products.js — kept hardcoded here so this
  // endpoint is self-contained and doesn't depend on the frontend bundle.
  const CATALOG = [
    { slug: "hipaa-starter-kit",      title: "Florida Small-Business HIPAA Starter Kit",       price: 79,  envVar: "VITE_PRODUCT_HIPAA_KIT_BUY_URL" },
    { slug: "wisp-template",          title: "Written Information Security Program (WISP)",   price: 149, envVar: "VITE_PRODUCT_WISP_BUY_URL" },
    { slug: "cyber-insurance-answers", title: "Cyber-Insurance Questionnaire Answer Kit",       price: 99,  envVar: "VITE_PRODUCT_INSURANCE_KIT_BUY_URL" },
    { slug: "hurricane-it-playbook",  title: "Hurricane-Season IT Continuity Playbook",        price: 49,  envVar: "VITE_PRODUCT_HURRICANE_KIT_BUY_URL" },
    { slug: "onboarding-runbook",     title: "Employee Onboarding + Offboarding IT Runbook",   price: 39,  envVar: "VITE_PRODUCT_ONBOARDING_KIT_BUY_URL" },
    { slug: "saas-incident-response-playbook", title: "SaaS Incident Response Playbook",        price: 29,  envVar: "VITE_PRODUCT_SAAS_IR_BUY_URL" },
    { slug: "vendor-risk-register",   title: "Vendor Risk Register for Small Business",         price: 19,  envVar: "VITE_PRODUCT_VENDOR_RISK_BUY_URL" },
    { slug: "it-budget-calendar",     title: "365-Day IT Budget Calendar Template",             price: 29,  envVar: "VITE_PRODUCT_BUDGET_CALENDAR_BUY_URL" },
    { slug: "cyber-insurance-evidence-binder", title: "Cyber-Insurance Evidence Binder Template", price: 39, envVar: "VITE_PRODUCT_INSURANCE_BINDER_BUY_URL" },
    { slug: "ransomware-tabletop-kit", title: "Ransomware Tabletop Exercise Kit",               price: 49,  envVar: "VITE_PRODUCT_TABLETOP_KIT_BUY_URL" },
    { slug: "compliance-library",     title: "Complete Florida Compliance Library",            price: 299, envVar: "VITE_PRODUCT_BUNDLE_BUY_URL" },
  ];

  const results = [];

  for (const item of CATALOG) {
    try {
      // Idempotency — search for an existing active Stripe Product with the
      // same name. Stripe's search API is eventually-consistent but fine
      // for a manual admin trigger.
      const existing = await stripe.products.search({
        query: `active:'true' AND name:'${item.title.replace(/'/g, "\\'")}'`,
        limit: 1,
      }).catch(() => ({ data: [] }));

      let productId;
      if (existing.data?.length > 0) {
        productId = existing.data[0].id;
      } else {
        const product = await stripe.products.create({
          name: item.title,
          description: `Simple IT SRQ — ${item.title}. Lifetime updates. 30-day refund.`,
          metadata: { slug: item.slug, source: "simpleitsrq.com/store" },
        });
        productId = product.id;
      }

      // Look for an existing matching price so we don't spam new price IDs
      // on re-runs.
      const prices = await stripe.prices.list({ product: productId, active: true, limit: 10 });
      let price = prices.data.find(
        (p) => p.unit_amount === item.price * 100 && p.currency === "usd"
      );
      if (!price) {
        price = await stripe.prices.create({
          product: productId,
          unit_amount: item.price * 100,
          currency: "usd",
        });
      }

      // Check for existing active Payment Link pointing at this price.
      const existingLinks = await stripe.paymentLinks.list({ limit: 100, active: true });
      let link = existingLinks.data.find(
        (l) => l.line_items?.data?.[0]?.price?.id === price.id
      );
      if (!link) {
        link = await stripe.paymentLinks.create({
          line_items: [{ price: price.id, quantity: 1 }],
          after_completion: {
            type: "redirect",
            redirect: { url: `https://simpleitsrq.com/store?purchased=${item.slug}` },
          },
          metadata: { slug: item.slug, source: "simpleitsrq.com/store" },
        });
      }

      results.push({
        slug: item.slug,
        title: item.title,
        price: item.price,
        envVar: item.envVar,
        productId,
        priceId: price.id,
        paymentLinkId: link.id,
        url: link.url,
        ok: true,
      });
    } catch (e) {
      results.push({
        slug: item.slug,
        title: item.title,
        envVar: item.envVar,
        ok: false,
        error: String(e.message || e),
      });
    }
  }

  return json(200, {
    ok: true,
    message: "Copy each URL into the matching Vercel env var, then redeploy. Re-running this action is safe — it reuses existing Stripe resources.",
    created: results,
  });
}

async function handleDrafts(session, url) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const statusParam = url.searchParams.get("status") || "";
  const filter = DRAFT_STATUSES.includes(statusParam) ? statusParam : null;

  const rows = filter
    ? await sql`
        SELECT id, ts, title, slug, category, excerpt, body, meta_desc,
               status, model, reviewed_at, published_at
        FROM draft_posts
        WHERE status = ${filter}
        ORDER BY ts DESC
        LIMIT 100
      `
    : await sql`
        SELECT id, ts, title, slug, category, excerpt, body, meta_desc,
               status, model, reviewed_at, published_at
        FROM draft_posts
        ORDER BY ts DESC
        LIMIT 100
      `;

  return json(200, {
    drafts: rows.map((r) => ({
      id: r.id,
      createdAt: r.ts,
      title: r.title,
      slug: r.slug,
      category: r.category,
      excerpt: r.excerpt,
      body: r.body,
      metaDescription: r.meta_desc,
      status: r.status,
      model: r.model,
      reviewedAt: r.reviewed_at,
      publishedAt: r.published_at,
    })),
  });
}

// Strip contractions + apostrophes to match the voice already in posts.js.
// This is intentionally dumb — it is only called when the admin clicks
// Publish, and runs against a body the admin has already reviewed.
function strikeApostrophes(text) {
  return String(text || "").replace(/\u2019|'/g, "");
}

// Format a draft row into the exact shape the existing posts.js array
// uses. Keeps schema in lock-step with the hand-authored posts.
function formatDraftAsPostEntry(draft, overrides = {}) {
  const slug     = overrides.slug     ?? draft.slug;
  const title    = strikeApostrophes(overrides.title    ?? draft.title);
  const metaDesc = strikeApostrophes(overrides.metaDescription ?? draft.metaDescription ?? draft.meta_desc ?? "");
  const excerpt  = strikeApostrophes(overrides.excerpt  ?? draft.excerpt);
  const category = overrides.category ?? draft.category;
  const body     = strikeApostrophes(overrides.body     ?? draft.body);
  const tags     = Array.isArray(overrides.tags) && overrides.tags.length
    ? overrides.tags
    : ["ai", "smb"];
  const heroAlt  = overrides.heroAlt  ?? `An illustration accompanying ${title}.`;
  const sourceUrl = overrides.sourceUrl ?? "https://simpleitsrq.com/blog";
  const today = new Date().toISOString().slice(0, 10);

  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const tagList = tags.map((t) => `"${esc(t)}"`).join(", ");

  return `  {
    slug: "${esc(slug)}",
    title: "${esc(title)}",
    metaDescription: "${esc(metaDesc)}",
    date: "${today}",
    author: "Simple IT SRQ Team",
    category: "${esc(category)}",
    tags: [${tagList}],
    excerpt: "${esc(excerpt)}",
    sourceUrl: "${esc(sourceUrl)}",
    heroAlt: "${esc(heroAlt)}",
    content: \`${body.replace(/`/g, "\\`").replace(/\$\{/g, "\\${")}\`
  },
`;
}

// Commit a file change to GitHub via the Contents API. Expects a GitHub
// fine-grained PAT with contents:write scope on the target repo in the
// GITHUB_TOKEN env var. Caller passes the SHA from the same fetch they
// used to build newContent so there is no race between read and write.
async function commitPostsFile(newContent, commitMessage, fileSha) {
  const token = process.env.GITHUB_TOKEN;
  const repo  = process.env.GITHUB_REPO  || "budokai-msi/simpleitsrq.com";
  const branch = process.env.GITHUB_BRANCH || "main";
  const path  = "src/data/posts.js";

  if (!token) {
    return { ok: false, error: "github_token_not_set" };
  }

  const base = `https://api.github.com/repos/${repo}/contents/${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "simpleitsrq-portal",
  };

  const body = {
    message: commitMessage,
    content: Buffer.from(newContent, "utf8").toString("base64"),
    sha: fileSha,
    branch,
    committer: {
      name:  "Simple IT SRQ Agent",
      email: "agent@simpleitsrq.com",
    },
  };

  const putRes = await fetch(base, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!putRes.ok) {
    const txt = await putRes.text().catch(() => "");
    if (putRes.status === 409) {
      return { ok: false, error: "github_conflict",
        hint: "posts.js was modified on GitHub between read and write. Try again — the portal will re-fetch the latest version." };
    }
    return { ok: false, error: `github_put_${putRes.status}`, detail: txt.slice(0, 200) };
  }
  const putData = await putRes.json();
  return { ok: true, commitSha: putData.commit?.sha, htmlUrl: putData.commit?.html_url };
}

// Insert a new post entry into the existing posts.js array string by
// anchoring on the closing "];" of the array followed by the default
// export. Tolerates 0-2 newlines and optional \r between them.
function spliceIntoPostsFile(fileContent, entry) {
  const re = /\];\s*\r?\nexport\s+default\s+posts;/;
  const match = re.exec(fileContent);
  if (!match) return null;
  const before = fileContent.slice(0, match.index);
  const after = fileContent.slice(match.index);
  return before + entry + after;
}

async function handlePublishDraft(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const id = Number(body?.id);
  if (!Number.isFinite(id) || id <= 0) return json(400, { ok: false, error: "invalid_id" });

  // Accept optional overrides so the admin can refine before publishing.
  const overrides = body.overrides && typeof body.overrides === "object" ? body.overrides : {};

  const rows = await sql`
    SELECT id, title, slug, category, excerpt, body, meta_desc, status
    FROM draft_posts
    WHERE id = ${id}
    LIMIT 1
  `;
  if (rows.length === 0) return json(404, { ok: false, error: "not_found" });
  const draft = rows[0];
  if (draft.status === "published") {
    return json(409, { ok: false, error: "already_published" });
  }

  // Build the entry, fetch posts.js, splice, commit.
  const entry = formatDraftAsPostEntry(draft, overrides);

  const token = process.env.GITHUB_TOKEN;
  const repo  = process.env.GITHUB_REPO  || "budokai-msi/simpleitsrq.com";
  const branch = process.env.GITHUB_BRANCH || "main";
  if (!token) {
    return json(500, { ok: false, error: "github_token_not_set",
      hint: "Set GITHUB_TOKEN in Vercel env with contents:write on the repo." });
  }

  // Fetch current posts.js through the Contents API (same path the commit
  // uses, so we are always in sync).
  const getUrl = `https://api.github.com/repos/${repo}/contents/src/data/posts.js?ref=${encodeURIComponent(branch)}`;
  const getRes = await fetch(getUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "simpleitsrq-portal",
    },
  });
  if (!getRes.ok) {
    const txt = await getRes.text().catch(() => "");
    // Diagnose common causes to help admins fix without hunting through logs.
    let hint = null;
    if (getRes.status === 404) {
      // Token presence is already checked above; at this point we have a token
      // that GitHub either rejected as unauthorized (404 masks 403 on private
      // repos) or couldn't find the file. Common causes: wrong GITHUB_REPO or
      // GITHUB_BRANCH, token scoped to a different repo, or token lacks
      // Contents:Read+Write on this repo.
      hint = "GitHub returned 404. Either the file doesn't exist at " + repo + "@" + branch + "/src/data/posts.js, or the token can authenticate but lacks Contents:Read+Write on this repo (GitHub masks 403 as 404 for private repos). Verify GITHUB_REPO/GITHUB_BRANCH env vars in Vercel, and the token's repository access.";
    } else if (getRes.status === 401) {
      hint = "GitHub rejected the token (401). The token is malformed or revoked. Rotate it in GitHub and update GITHUB_TOKEN in Vercel.";
    } else if (getRes.status === 403) {
      hint = "GitHub returned 403. The token is valid but doesn't have permission to read this file. Check the token's repository access and scope (needs Contents:Read+Write).";
    }
    return json(502, {
      ok: false,
      error: `github_get_${getRes.status}`,
      detail: txt.slice(0, 300),
      repo,
      branch,
      hint,
    });
  }
  const meta = await getRes.json();
  const currentFile = Buffer.from(meta.content, "base64").toString("utf8");
  const fileSha = meta.sha;

  // Bail if this slug is already in the file (idempotency).
  if (currentFile.includes(`slug: "${draft.slug}"`)) {
    await sql`
      UPDATE draft_posts
      SET status = 'published',
          reviewed_at = COALESCE(reviewed_at, now()),
          published_at = now()
      WHERE id = ${id}
    `;
    return json(200, { ok: true, alreadyInFile: true });
  }

  const spliced = spliceIntoPostsFile(currentFile, entry);
  if (!spliced) {
    return json(500, { ok: false, error: "posts_file_anchor_missing" });
  }

  const commit = await commitPostsFile(
    spliced,
    `Publish blog post: ${draft.title}`,
    fileSha,
  );
  if (!commit.ok) {
    return json(502, commit);
  }

  await sql`
    UPDATE draft_posts
    SET status = 'published',
        reviewed_at = COALESCE(reviewed_at, now()),
        published_at = now()
    WHERE id = ${id}
  `;

  // Admin action audit log — who published what, when. Runs through
  // logSecurityEvent so the row gets chained into the tamper-evident
  // audit log alongside the other security events.
  await logSecurityEvent({
    kind: "admin.publish_draft",
    severity: "info",
    ip: clientIp(request),
    userId: session?.user?.id || null,
    userAgent: request.headers.get("user-agent") || null,
    path: "/api/portal?action=publish-draft",
    detail: {
      adminEmail: session?.user?.email || null,
      draftId: id,
      slug: draft.slug,
      title: draft.title,
      commitSha: commit.commitSha,
    },
  });

  return json(200, { ok: true, commitSha: commit.commitSha, commitUrl: commit.htmlUrl });
}

async function handleRejectDraft(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const id = Number(body?.id);
  if (!Number.isFinite(id) || id <= 0) return json(400, { ok: false, error: "invalid_id" });

  const rows = await sql`
    UPDATE draft_posts
    SET status = 'rejected',
        reviewed_at = now()
    WHERE id = ${id}
    RETURNING id, slug, status
  `;
  if (rows.length === 0) return json(404, { ok: false, error: "not_found" });
  return json(200, { ok: true, draft: rows[0] });
}

// ---------- stripe invoices (admin only, two-step draft→send) ----------

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

async function handleCreateInvoice(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const stripe = getStripe();
  if (!stripe) return json(500, { ok: false, error: "stripe_not_configured" });

  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }

  const email = String(body?.email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { ok: false, error: "invalid_email" });
  }

  const items = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0) return json(400, { ok: false, error: "no_items" });
  for (const item of items) {
    if (!item.description || typeof item.amount !== "number" || item.amount <= 0) {
      return json(400, { ok: false, error: "invalid_item", detail: "Each item needs description + amount (cents > 0)" });
    }
  }

  const memo = body?.memo ? String(body.memo).slice(0, 500) : null;

  try {
    // Find or create customer by email.
    const existing = await stripe.customers.list({ email, limit: 1 });
    let customer;
    if (existing.data.length > 0) {
      customer = existing.data[0];
    } else {
      customer = await stripe.customers.create({
        email,
        name: body?.name || undefined,
        metadata: { source: "simpleitsrq-portal" },
      });
    }

    // Create invoice in draft state (NEVER auto-finalize with live key).
    const invoice = await stripe.invoices.create({
      customer: customer.id,
      collection_method: "send_invoice",
      days_until_due: 30,
      description: memo || undefined,
      metadata: { created_by: session.user.email, source: "portal" },
    });

    // Add line items.
    for (const item of items) {
      await stripe.invoiceItems.create({
        customer: customer.id,
        invoice: invoice.id,
        description: String(item.description).slice(0, 500),
        amount: Math.round(item.amount),
        currency: "usd",
      });
    }

    // Fetch the draft to get the hosted URL.
    const draft = await stripe.invoices.retrieve(invoice.id);

    return json(200, {
      ok: true,
      invoice: {
        id: draft.id,
        number: draft.number,
        status: draft.status,
        amountDue: draft.amount_due,
        hostedUrl: draft.hosted_invoice_url,
        pdfUrl: draft.invoice_pdf,
        customerEmail: email,
      },
    });
  } catch (err) {
    console.error("[portal] stripe create-invoice failed", err);
    return json(502, { ok: false, error: "stripe_error", detail: String(err.message).slice(0, 200) });
  }
}

async function handleSendInvoice(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const stripe = getStripe();
  if (!stripe) return json(500, { ok: false, error: "stripe_not_configured" });

  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const invoiceId = String(body?.invoiceId || "").trim();
  if (!invoiceId.startsWith("in_")) return json(400, { ok: false, error: "invalid_invoice_id" });

  try {
    // Finalize the draft.
    const finalized = await stripe.invoices.finalizeInvoice(invoiceId);

    // Send to customer.
    const sent = await stripe.invoices.sendInvoice(finalized.id);

    // Resolve customer email — on freshly-finalized invoices Stripe often
    // returns customer_email = null, so fall back to the Customer record.
    // Without this the `users` lookup below always misses and invoices end
    // up with user_id = NULL even when the email maps to a portal account.
    let customerEmail = sent.customer_email || null;
    if (!customerEmail && sent.customer) {
      try {
        const cust = await stripe.customers.retrieve(sent.customer);
        if (cust && !cust.deleted) customerEmail = cust.email || null;
      } catch (err) {
        console.error("[portal] stripe customer lookup failed", err);
      }
    }

    // Mirror to local invoices table.
    const userId = customerEmail
      ? (await sql`
          SELECT id FROM users WHERE lower(email) = lower(${customerEmail}) LIMIT 1
        `.catch(() => []))[0]?.id || null
      : null;

    await sql`
      INSERT INTO invoices (
        invoice_number, user_id, stripe_invoice_id, amount_cents, currency,
        status, issued_at, due_at, hosted_url, pdf_url, description
      ) VALUES (
        ${sent.number || sent.id}, ${userId}, ${sent.id},
        ${sent.amount_due || 0}, ${sent.currency || "usd"},
        'open', now(),
        ${sent.due_date ? new Date(sent.due_date * 1000).toISOString() : null},
        ${sent.hosted_invoice_url || null}, ${sent.invoice_pdf || null},
        ${sent.description || null}
      )
      ON CONFLICT (stripe_invoice_id) DO UPDATE
        SET status = 'open', hosted_url = EXCLUDED.hosted_url, pdf_url = EXCLUDED.pdf_url
    `.catch((err) => console.error("[portal] invoice mirror failed", err));

    return json(200, {
      ok: true,
      invoice: {
        id: sent.id,
        number: sent.number,
        status: sent.status,
        amountDue: sent.amount_due,
        hostedUrl: sent.hosted_invoice_url,
        pdfUrl: sent.invoice_pdf,
      },
    });
  } catch (err) {
    console.error("[portal] stripe send-invoice failed", err);
    return json(502, { ok: false, error: "stripe_error", detail: String(err.message).slice(0, 200) });
  }
}

// ---------- health (unauthenticated, for external uptime monitors) ----------
// ---------- honeypot credentials (admin only) ----------
async function handleHoneypotCreds(session) {
  if (!(await resolveAdmin(session))) {
    return json(403, { ok: false, error: "forbidden" });
  }
  // LATERAL + LIMIT 1 caps the threat_actors join at one row per event —
  // plain LEFT JOIN on IP + time window could multiply rows (an attacker
  // commonly has several hits inside a 2-minute window) and inflate total.
  const rows = await sql`
    SELECT se.id, se.ip, se.detail, se.ts,
           ta.country, ta.threat_class,
           ii.org, ii.isp, ii.abuse_score
    FROM security_events se
    LEFT JOIN LATERAL (
      SELECT country, threat_class
      FROM threat_actors
      WHERE ip = se.ip
        AND ts BETWEEN se.ts - interval '2 minutes' AND se.ts + interval '30 seconds'
      ORDER BY ts DESC
      LIMIT 1
    ) ta ON TRUE
    LEFT JOIN ip_intel ii ON ii.ip = se.ip
    WHERE se.kind = 'honeypot.credential'
    ORDER BY se.ts DESC
    LIMIT 500
  `;

  // De-duplicate by IP — keep the latest credential per attacker.
  const byIp = new Map();
  for (const r of rows) {
    const email = r.detail?.email || r.detail?.d?.email || "(none captured)";
    const page = r.detail?.page || r.detail?.d?.page || "/";
    const passwordHash = r.detail?.passwordHash || null;
    const passwordShape = r.detail?.passwordShape || null;
    const existing = byIp.get(r.ip);
    if (!existing || new Date(r.ts) > new Date(existing.ts)) {
      byIp.set(r.ip, {
        ip: r.ip,
        email,
        passwordHash,
        passwordShape,
        country: r.country || "unknown",
        threatClass: r.threat_class || "honeypot",
        ts: r.ts,
        page,
        org: r.org,
        isp: r.isp,
        abuseScore: r.abuse_score,
      });
    }
  }

  return json(200, {
    credentials: [...byIp.values()],
    total: rows.length,
    uniqueIps: byIp.size,
  });
}

// ---------- block IP (admin only) ----------
async function handleBlockIp(session, request) {
  if (!(await resolveAdmin(session))) {
    return json(403, { ok: false, error: "forbidden" });
  }
  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const ip = String(body?.ip || "").trim();
  if (!ip) return json(400, { ok: false, error: "missing_ip" });
  const reason = String(body?.reason || "manual block").trim().slice(0, 200);

  await sql`
    INSERT INTO ip_blocklist (ip, reason)
    VALUES (${ip}, ${reason})
    ON CONFLICT (ip) DO NOTHING
  `;

  await logSecurityEvent({
    kind: "admin.block_ip",
    severity: "info",
    ip: clientIp(request),
    userId: session?.user?.id || null,
    userAgent: request.headers.get("user-agent") || null,
    path: "/api/portal?action=block-ip",
    detail: {
      adminEmail: session?.user?.email || null,
      targetIp: ip,
      reason,
    },
  });

  return json(200, { ok: true });
}

// ---------- health (unauthenticated, for external uptime monitors) ----------
async function handleHealth() {
  const checks = { db: "unknown", criticalEvents: 0, ok: false };
  try {
    const r = await sql`SELECT 1 AS ping`;
    checks.db = r.length > 0 ? "connected" : "no_response";
  } catch (err) {
    // Public endpoint — don't leak schema/host/connection details from
    // the driver error. Log server-side, return a generic status.
    console.error("[portal/health] db ping failed", err);
    checks.db = "error";
  }
  try {
    const r = await sql`
      SELECT COUNT(*)::int AS cnt FROM security_events
      WHERE severity = 'critical' AND ts > now() - interval '1 hour'
    `;
    checks.criticalEvents = r[0]?.cnt || 0;
  } catch { checks.criticalEvents = -1; }
  checks.ok = checks.db === "connected" && checks.criticalEvents === 0;
  return json(checks.ok ? 200 : 503, checks);
}

// ---------- github diagnostic (admin only) ----------
// Pings the GitHub Contents API with the current GITHUB_TOKEN to diagnose
// publish failures without exposing token bytes.
async function handleGithubHealth(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const token = process.env.GITHUB_TOKEN;
  const repo  = process.env.GITHUB_REPO  || "budokai-msi/simpleitsrq.com";
  const branch = process.env.GITHUB_BRANCH || "main";
  const path  = "src/data/posts.js";

  const result = {
    tokenSet: !!token,
    repo,
    branch,
    path,
    user: null,
    fileAccess: null,
    rateLimit: null,
    hint: null,
  };

  if (!token) {
    result.hint = "GITHUB_TOKEN env var is not set in Vercel. Set it under Settings → Environment Variables.";
    return json(200, result);
  }

  // 1. Check token validity + identity (works for both classic and fine-grained PATs)
  try {
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "simpleitsrq-portal",
      },
      signal: AbortSignal.timeout?.(5000),
    });
    if (userRes.ok) {
      const u = await userRes.json();
      result.user = { login: u.login, type: u.type };
      // Capture rate limit info from headers
      result.rateLimit = {
        remaining: userRes.headers.get("x-ratelimit-remaining"),
        limit: userRes.headers.get("x-ratelimit-limit"),
        reset: userRes.headers.get("x-ratelimit-reset"),
      };
    } else if (userRes.status === 401) {
      result.user = { error: "401 unauthorized — token is invalid or revoked" };
      result.hint = "Token is rejected by GitHub. Generate a new fine-grained PAT with Contents:Read+Write on the repo and update GITHUB_TOKEN in Vercel.";
      return json(200, result);
    } else {
      result.user = { error: `HTTP ${userRes.status}` };
    }
  } catch (err) {
    result.user = { error: String(err.message || err).slice(0, 200) };
  }

  // 2. Try to read the target file with the same call publish-draft makes
  try {
    const fileRes = await fetch(
      `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "simpleitsrq-portal",
        },
        signal: AbortSignal.timeout?.(5000),
      },
    );
    if (fileRes.ok) {
      const meta = await fileRes.json();
      result.fileAccess = {
        ok: true,
        sha: meta.sha,
        size: meta.size,
      };
    } else {
      result.fileAccess = { ok: false, status: fileRes.status };
      if (fileRes.status === 404) {
        result.hint = `404 reading ${path} on branch ${branch}. Either the repo/branch name is wrong (current: ${repo}@${branch}), the file doesn't exist there, or the token lacks Contents:Read+Write on this repo.`;
      } else if (fileRes.status === 403) {
        result.hint = "403 — token is valid but lacks Contents permission on this repo.";
      }
    }
  } catch (err) {
    result.fileAccess = { ok: false, error: String(err.message || err).slice(0, 200) };
  }

  result.ok = Boolean(result.tokenSet && result.user?.login && result.fileAccess?.ok === true);
  return json(200, result);
}

// ---------- entry points ----------
const ALLOWED_ORIGINS = new Set([
  "https://simpleitsrq.com",
  "https://www.simpleitsrq.com",
]);

function csrfCheck(request, method) {
  if (method === "GET") return true;
  const origin = request.headers.get("origin");
  // Browsers always set Origin on cross-origin non-GET fetches. Treat a
  // missing Origin as a CSRF-shaped request and reject it — defense in
  // depth alongside requireSession. Real server-to-server callers should
  // use a scoped API token on a different surface, not /api/portal.
  if (!origin) return false;
  return ALLOWED_ORIGINS.has(origin);
}

async function dispatch(request, method) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "";

  // Health check is unauthenticated — must be before requireSession.
  if (action === "health" && method === "GET") return handleHealth();

  if (!csrfCheck(request, method)) {
    return json(403, { ok: false, error: "csrf_origin_rejected" });
  }

  const { session, error } = await requireSession(request);
  if (error) return error;

  if (action === "me"              && method === "GET")   return handleMeGet(session);
  if (action === "me"              && method === "PATCH") return handleMePatch(session, request);
  if (action === "tickets"         && method === "GET")   return handleTickets(session, url);
  if (action === "ticket"          && method === "GET")   return handleTicket(session, url);
  if (action === "ticket"          && method === "PATCH") return handleTicketPatch(session, request);
  if (action === "ticket-message"  && method === "POST")  return handleTicketMessage(session, request);
  if (action === "invoices"        && method === "GET")   return handleInvoices(session);
  if (action === "visitors"        && method === "GET")   return handleVisitors(session);
  if (action === "investigate-ip"   && method === "GET")   return handleInvestigateIp(session, url);
  if (action === "block-ip"         && method === "POST")  return handleBlockIp(session, request);
  if (action === "honeypot-creds"   && method === "GET")   return handleHoneypotCreds(session);
  if (action === "threat-intel"     && method === "GET")   return handleThreatIntel(session, url);
  if (action === "audit-verify"     && method === "GET")   return handleAuditVerify(session);
  if (action === "run-audit-migration" && method === "POST") return handleRunAuditMigration(session);
  if (action === "reset-audit-chain"    && method === "POST") return handleResetAuditChain(session);
  if (action === "osint-status"         && method === "GET")  return handleOsintStatus(session);
  if (action === "ops-status"           && method === "GET")  return handleOpsStatus(session);
  if (action === "countermeasures"      && method === "GET")  return handleCountermeasures(session);
  if (action === "revenue-signals"      && method === "GET")  return handleRevenueSignals(session);
  if (action === "testimonials"         && method === "GET")  return handleTestimonialsList(session);
  if (action === "testimonial-save"     && method === "POST") return handleTestimonialSave(session, request);
  if (action === "testimonial-delete"   && method === "POST") return handleTestimonialDelete(session, request);
  if (action === "grant-immunity"       && method === "POST") return handleGrantImmunity(session, request);
  if (action === "osint-refresh"        && method === "POST") return handleOsintRefresh(session);
  if (action === "create-payment-links" && method === "POST") return handleCreatePaymentLinks(session);
  if (action === "drafts"          && method === "GET")   return handleDrafts(session, url);
  if (action === "publish-draft"   && method === "POST")  return handlePublishDraft(session, request);
  if (action === "github-health"   && method === "GET")   return handleGithubHealth(session);
  if (action === "reject-draft"    && method === "POST")  return handleRejectDraft(session, request);
  if (action === "create-invoice"  && method === "POST")  return handleCreateInvoice(session, request);
  if (action === "send-invoice"    && method === "POST")  return handleSendInvoice(session, request);

  return json(404, { ok: false, error: "unknown_action" });
}

export async function GET(request)   { return dispatch(request, "GET"); }
export async function POST(request)  { return dispatch(request, "POST"); }
export async function PATCH(request) { return dispatch(request, "PATCH"); }
