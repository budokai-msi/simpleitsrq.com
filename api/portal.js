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
import { aggregateScanners, identifyScanner } from "./_lib/scanner-fingerprints.js";
import { json } from "./_lib/http.js";
import { csrfValid } from "./_lib/csrf.js";
import { sanitizeHeader, clampString } from "./_lib/sanitize.js";
import { runLeadgenWorker } from "./cron/agent.js";
import { timingSafeEqual } from "node:crypto";
import {
  formatDraftAsPostEntry,
  spliceIntoPostsFile,
  commitPostsFile,
} from "./_lib/publish-draft.js";

// Vercel function config: lead-gen Discover + Crawl run their workers
// inline (Overpass + outbound HTTP fetches), so we need the higher
// 60s budget instead of the 10s Hobby default.
export const config = { maxDuration: 60 };

const TICKET_FROM = "Simple IT SRQ Support <support@simpleitsrq.com>";
// See note in api/contact.js — default goes to Gmail while simpleitsrq.com
// has no MX records. Override via CONTACT_TO_EMAIL once inbound mail is live.
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

// Memoized per-request admin check. Hard-locked to ADMIN_EMAIL env var.
// No DB fallback — even if someone manually edits users.is_admin, only
// the owner email can pass. This is the single source of truth for admin.
async function resolveAdmin(session) {
  if (session.__isAdmin !== undefined) return session.__isAdmin;
  const adminEmail = process.env.ADMIN_EMAIL || "";
  session.__isAdmin = Boolean(adminEmail) && session.user.email.toLowerCase() === adminEmail.toLowerCase();
  return session.__isAdmin;
}

// ────────────────────────────────────────────────────────────
// Admin API token (for tooling / CI / agent automation)
// ────────────────────────────────────────────────────────────
//
// Lets us drive a tightly-scoped allowlist of admin actions from the
// shell (curl / Invoke-RestMethod) without juggling browser cookies +
// CSRF tokens. Required env: ADMIN_API_TOKEN (≥ 32 chars).
//
// Compared with timing-safe equal. Token is checked BEFORE CSRF
// because the whole point is non-browser automation, but the
// allowlist (ADMIN_TOKEN_ACTIONS below) keeps blast radius small —
// no user impersonation, no Stripe writes, no payouts, no audit-log
// tampering.
const ADMIN_TOKEN_ACTIONS = new Set([
  // read-only / observability
  "admin-status",
  "leadgen-businesses",
  "leadgen-campaigns",
  "leadgen-jobs",
  "leadgen-status",
  "leadgen-export",
  "leadgen-insights",
  // self-serve maintenance
  "run-audit-migration",
  "leadgen-reclassify",
  "leadgen-run-jobs",
  "leadgen-discover",
  "leadgen-crawl-emails",
  "leadgen-business-update",
  "leadgen-ai",
  // opsec portal — defensive personal ops dashboard
  "opsec-data",
  "opsec-domain-add",
  "opsec-domain-toggle",
  "opsec-ioc-add",
  "opsec-ioc-toggle",
  "opsec-note-save",
  "opsec-note-delete",
]);

function verifyAdminToken(request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected || expected.length < 32) return false;
  const got = request.headers.get("x-admin-token") || "";
  if (!got || got.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(got, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false;
  }
}

// Synthetic session used when ADMIN_API_TOKEN auth succeeds. Looks
// just like a real admin session to the rest of the dispatcher so
// every existing requireAdmin() / resolveAdmin() check passes.
function adminTokenSession() {
  return {
    user: {
      id: 0,
      email: process.env.ADMIN_EMAIL || "admin@simpleitsrq.com",
      name: "Admin (token)",
      is_admin: true,
    },
    __isAdmin: true,
    __viaToken: true,
  };
}

// ----------- handler: admin-status (token + admin only) -----------
//
// Read-only health snapshot. Designed for the CLI / agent to "see
// what's going on" without needing to hit the browser dashboard.
// Returns: env presence flags, table row counts, queue depths, recent
// errors, and the last-applied audit chain head.
async function handleAdminStatus(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const env = {
    ADMIN_API_TOKEN: !!process.env.ADMIN_API_TOKEN,
    GROQ_API_KEY:    !!process.env.GROQ_API_KEY,
    BREVO_API_KEY:   !!process.env.BREVO_API_KEY,
    SMTP_HOST:       !!process.env.SMTP_HOST,
    SMTP_USER:       !!process.env.SMTP_USER,
    RESEND_API_KEY:  !!process.env.RESEND_API_KEY,
    STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
    NEON_API_KEY:    !!process.env.NEON_API_KEY,
  };

  // Run all probe queries in parallel; wrap each in a defensive try
  // so a single missing-table doesn't 500 the whole snapshot.
  const safe = async (label, q) => {
    try { return { [label]: (await q)[0] }; }
    catch (e) { return { [label]: { error: String(e.message || e) } }; }
  };

  const [
    leadBiz, leadEmails, leadCampaigns, leadSends, leadJobs,
    users, tickets, sec, eng, threats,
  ] = await Promise.all([
    safe("lead_businesses",      sql`SELECT count(*)::int AS n, count(*) FILTER (WHERE status='active')::int AS active FROM lead_businesses`),
    safe("lead_emails",          sql`SELECT count(*)::int AS n, count(*) FILTER (WHERE status='deliverable')::int AS deliverable FROM lead_emails`),
    safe("lead_campaigns",       sql`SELECT count(*)::int AS n FROM lead_campaigns`),
    safe("lead_campaign_sends",  sql`SELECT count(*)::int AS n FROM lead_campaign_sends`),
    safe("lead_crawl_jobs",      sql`SELECT count(*)::int AS n,
                                            count(*) FILTER (WHERE status='queued')::int     AS queued,
                                            count(*) FILTER (WHERE status='running')::int    AS running,
                                            count(*) FILTER (WHERE status='failed')::int     AS failed
                                       FROM lead_crawl_jobs`),
    safe("users",                sql`SELECT count(*)::int AS n FROM users`),
    safe("tickets",              sql`SELECT count(*)::int AS n, count(*) FILTER (WHERE status IN ('open','in_progress','waiting'))::int AS open FROM tickets`),
    safe("security_events",      sql`SELECT count(*)::int AS n FROM security_events`),
    safe("engagement_events",    sql`SELECT count(*)::int AS n FROM engagement_events`),
    safe("threat_feeds",         sql`SELECT count(*)::int AS n FROM threat_feeds`),
  ]);
  const counts = { ...leadBiz, ...leadEmails, ...leadCampaigns, ...leadSends, ...leadJobs, ...users, ...tickets, ...sec, ...eng, ...threats };

  // Most recent jobs and security events — fingerprint of "what just
  // happened" without dumping the full table.
  const recentJobs = await sql`
    SELECT id, kind, status, progress, total, error, created_at, finished_at
    FROM lead_crawl_jobs
    ORDER BY id DESC
    LIMIT 25
  `.catch((e) => [{ error: String(e.message || e) }]);

  const recentSecurity = await sql`
    SELECT id, event_type, detail, ip, ts
    FROM security_events
    WHERE event_type LIKE '%error%' OR event_type LIKE '%fail%' OR event_type LIKE '%blocked%'
    ORDER BY id DESC
    LIMIT 25
  `.catch((e) => [{ error: String(e.message || e) }]);

  // Detect schema state of migration 014 columns (informational so the
  // agent can decide whether to run run-audit-migration).
  let schema014;
  try {
    const r = await sql`
      SELECT
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lead_businesses' AND column_name='industry_group')  AS has_industry_group,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lead_businesses' AND column_name='sub_industry')    AS has_sub_industry,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lead_businesses' AND column_name='tags')            AS has_tags
    `;
    schema014 = r[0];
  } catch (e) {
    schema014 = { error: String(e.message || e) };
  }

  return json(200, {
    ok: true,
    via: session.__viaToken ? "admin_token" : "session",
    env,
    counts,
    schema014,
    recent_jobs: recentJobs,
    recent_security_errors: recentSecurity,
    server_time: new Date().toISOString(),
  });
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

// GDPR / CCPA Right to Access — full data export.
//
// Returns a JSON dump of every row in our DB tied to the calling user's
// identity (by user_id AND by email match for tables that don't carry
// the FK, like newsletter_subscribers). Format is human-readable JSON
// so it can be opened in any text editor or fed into a privacy
// portability flow at the user's next provider.
//
// Read-only — no mutations. Does not surface other users' data even
// in joined tables (every query is scoped to session.user.id or
// session.user.email).
async function handleExportData(session) {
  const userId = session.user.id;
  const email = (session.user.email || "").toLowerCase();

  const [user, tickets, ticketMessages, invoices, sessions, newsletterRows, visits, affiliateClicks] = await Promise.all([
    sql`SELECT id, email, name, avatar_url, company, phone, is_admin, created_at, updated_at
        FROM users WHERE id = ${userId}`.catch(() => []),
    sql`SELECT id, ticket_code, email, name, company, phone, priority, category, subject,
               description, status, created_at, updated_at, closed_at
        FROM tickets WHERE user_id = ${userId} OR lower(email) = ${email}
        ORDER BY created_at DESC`.catch(() => []),
    sql`SELECT tm.id, tm.ticket_id, tm.author_type, tm.author_email, tm.body, tm.created_at
        FROM ticket_messages tm
        JOIN tickets t ON t.id = tm.ticket_id
        WHERE t.user_id = ${userId} OR lower(t.email) = ${email}
        ORDER BY tm.created_at ASC`.catch(() => []),
    sql`SELECT id, stripe_invoice_id, amount_cents, currency, status, hosted_invoice_url,
               created_at, paid_at
        FROM invoices WHERE user_id = ${userId} OR lower(email) = ${email}
        ORDER BY created_at DESC`.catch(() => []),
    sql`SELECT id, ip_at_login, user_agent, created_at, expires_at, last_seen_at
        FROM sessions WHERE user_id = ${userId} ORDER BY created_at DESC`.catch(() => []),
    sql`SELECT id, email, source, created_at, confirmed_at, unsubscribed_at
        FROM newsletter_subscribers WHERE lower(email) = ${email}`.catch(() => []),
    sql`SELECT id, ts, path, referrer, country, city
        FROM visits WHERE user_id = ${userId} ORDER BY ts DESC LIMIT 1000`.catch(() => []),
    sql`SELECT id, slug, destination, label, network, country, referrer_path, ts
        FROM affiliate_clicks WHERE user_id = ${userId} ORDER BY ts DESC`.catch(() => []),
  ]);

  // Audit-log this access request itself — required by some privacy
  // frameworks (Illinois BIPA, Virginia VCDPA) for inspection later.
  await logSecurityEvent({
    kind: "data.export",
    severity: "info",
    ip: null,
    userId,
    detail: { rowCounts: {
      tickets: tickets.length, messages: ticketMessages.length, invoices: invoices.length,
      sessions: sessions.length, newsletter: newsletterRows.length, visits: visits.length,
      affiliateClicks: affiliateClicks.length,
    } },
  }).catch(() => {});

  return new Response(JSON.stringify({
    generatedAt: new Date().toISOString(),
    request: { kind: "data-export", legalBasis: "GDPR Article 15 / CCPA §1798.110" },
    user: user[0] || null,
    tickets,
    ticketMessages,
    invoices,
    sessions,
    newsletterSubscriptions: newsletterRows,
    visits,
    affiliateClicks,
  }, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="simpleitsrq-data-export-${userId}-${new Date().toISOString().slice(0,10)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}

// GDPR / CCPA Right to Erasure — account anonymization.
//
// Anonymizes rather than hard-deletes for two reasons:
//   1. Tickets + invoices retain legal value (warranty, tax, dispute
//      resolution) — Florida law requires keeping invoices ~5 years.
//      Hard-delete would force us to violate that.
//   2. The audit chain in security_events references user_id; breaking
//      it with a hard-delete would corrupt the chain forever.
//
// What we do:
//   - users: NULL email/name/avatar/company/phone, set deleted_at
//   - sessions: hard-delete (forces logout everywhere)
//   - newsletter_subscribers (matched by email): set unsubscribed_at +
//     anonymize email so the "user" can't be re-identified
//   - tickets: keep the rows, NULL the email + name (FK to users
//     remains so admin can still see the linkage was deleted)
//
// The user is logged out at the end (cookie cleared by clearing all
// sessions for that user_id). Returns 200 + a confirmation token they
// can keep for their records.
async function handleDeleteAccount(session) {
  const userId = session.user.id;
  const email = (session.user.email || "").toLowerCase();
  const confirmationToken = `del-${userId.slice(0, 8)}-${Date.now()}`;

  try {
    await sql`UPDATE users
              SET email = NULL, name = NULL, avatar_url = NULL,
                  company = NULL, phone = NULL,
                  deleted_at = COALESCE(deleted_at, now()),
                  updated_at = now()
              WHERE id = ${userId}`;
    await sql`DELETE FROM sessions WHERE user_id = ${userId}`;
    await sql`UPDATE newsletter_subscribers
              SET email = ${"anonymized-" + userId.slice(0, 8)},
                  unsubscribed_at = COALESCE(unsubscribed_at, now())
              WHERE lower(email) = ${email}`.catch(() => {});
    await sql`UPDATE tickets
              SET email = NULL, name = NULL, company = NULL, phone = NULL
              WHERE user_id = ${userId}`.catch(() => {});

    await logSecurityEvent({
      kind: "account.deleted",
      severity: "info",
      ip: null,
      userId,
      detail: { confirmationToken, legalBasis: "GDPR Article 17 / CCPA §1798.105" },
    }).catch(() => {});
  } catch (err) {
    console.error("[portal] delete-account failed", err);
    return json(500, { ok: false, error: "deletion_failed" });
  }

  // Session cookie is invalidated server-side by the DELETE above.
  // Tell the client to also clear local state — Set-Cookie with
  // Max-Age=0 ensures the browser drops the session cookie even
  // before its TTL expires.
  return new Response(JSON.stringify({ ok: true, confirmationToken }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": `sit_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
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

  // ── Narrative summary (Huntress-style) ──────────────────────────────
  // Turns raw numbers into a plain-English story the MSP owner can read
  // in 10 seconds. Status level is the first thing they see; incidents
  // are the second. Everything else is optional drill-down.
  const activeAttackers = attackVelocity.length;
  const exploitAttempts = (recentCritical || []).filter((e) =>
    e.kind === "exploit_attempt" || String(e.detail?.cve || "").length > 0
  ).length;
  const scannerBlocks = (autoActions || []).filter((a) =>
    String(a.reason || "").includes("scanner trap") || String(a.reason || "").includes("exploit attempt")
  ).length;

  let statusLevel = "calm";
  let statusHeadline = "No notable activity in the last window.";
  if (exploitAttempts > 0 || activeAttackers >= 5) {
    statusLevel = "under_attack";
    statusHeadline = exploitAttempts > 0
      ? `${exploitAttempts} active exploit attempt${exploitAttempts > 1 ? "s" : ""} in progress — all blocked.`
      : `${activeAttackers} attackers hitting hard right now — site still healthy.`;
  } else if (activeAttackers >= 2 || campaigns.length >= 1) {
    statusLevel = "elevated";
    statusHeadline = campaigns.length >= 1
      ? `Coordinated activity detected — ${campaigns.length} attacker${campaigns.length > 1 ? "s" : ""} rotating through multiple IPs.`
      : `${activeAttackers} attackers active — automatic defenses engaged.`;
  }

  // Build the "incidents worth your attention" list — the 3-5 highest-
  // severity events with plain-English explanations + recommendations.
  const incidents = [];

  if (exploitAttempts > 0) {
    const first = (recentCritical || []).find((e) => e.kind === "exploit_attempt" || e.detail?.cve);
    incidents.push({
      severity: "critical",
      title: `Exploit payload thrown at your site`,
      explanation: "Someone tried to land a known CVE payload (like Log4Shell, Spring4Shell, or ProxyShell) in a request header or URL. These are automated attacks — the same IP has probably tried thousands of other sites today.",
      weDid: "Instantly blocked the IP, served them a fake login page, and logged every byte of the payload for your records.",
      youShould: "Nothing urgent — this is covered. Review the blocked IP list weekly to make sure we're not catching anyone legit.",
      ts: first?.ts || null,
    });
  }

  if (campaigns.length >= 1) {
    const c = campaigns[0];
    incidents.push({
      severity: "warning",
      title: `One attacker, multiple IPs`,
      explanation: `We spotted a single device fingerprint rotating through ${c.ip_count} different IPs${c.countries?.length ? ` (${c.countries.slice(0, 3).join(", ")})` : ""}. That's someone using a proxy pool to look like many people — classic for credential stuffing or vulnerability sweeps.`,
      weDid: `Logged every request and fingerprinted their browser/OS combo so we recognize them even if they switch networks again.`,
      youShould: `Consider blocking the /24 range from the Geo tab — one range often covers the whole campaign.`,
      ts: c.last_seen,
    });
  }

  const credCount = credStats[0]?.total_captures || 0;
  if (credCount >= 5) {
    incidents.push({
      severity: "warning",
      title: `Automated login attempts against your admin panel`,
      explanation: `${credCount} credential attempts from ${credStats[0]?.unique_ips || "multiple"} IPs hit the honeypot login page. Attackers don't know it's fake — they're burning through username/password pairs.`,
      weDid: `Let them keep trying (tarpit'd the response so it's slow) and captured every username + password shape they submitted.`,
      youShould: `Open the "Login attempts" tab to see what usernames they're trying — if "admin" or your real username is in the list, rotate that password.`,
      ts: null,
    });
  }

  const hostileGeoHits = (threatClasses.find((t) => t.threat_class === "hostile_geo") || {}).hits || 0;
  if (hostileGeoHits >= 50) {
    incidents.push({
      severity: "info",
      title: `High traffic from China / Russia / North Korea`,
      explanation: `${hostileGeoHits} requests from hostile-geo countries in this window. These visitors see the honeypot, not your real site — they never know the difference.`,
      weDid: `Every request from those countries is served the fake site. Your real content is protected.`,
      youShould: `Nothing. This is normal — small-business sites attract routine sweeps from these regions.`,
      ts: null,
    });
  }

  // Positive framing — "what we saved you from" card.
  const stopped = {
    blocks: blockedCount[0]?.n || 0,
    autoActions: (autoActions || []).length,
    scannerBlocks,
    exploitAttempts,
    hostileGeoHits,
    credAttempts: credCount,
  };

  return json(200, {
    range,
    narrative: {
      statusLevel,
      statusHeadline,
      activeAttackers,
      incidents,
      stopped,
    },
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

// ---------- enumeration intel (admin only) ----------
//
// Turns the raw threat_actors table into "what tools are scanning us",
// "which CMS/products are being probed", and "which CVEs are being
// thrown at us". The scanner fingerprint library runs in-process over
// the recent rows — no per-query CPU hit on the DB.

async function handleEnumIntel(session, url) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const range = url.searchParams.get("range") || "7d";
  const interval = range === "24h" ? "24 hours" : range === "30d" ? "30 days" : "7 days";

  // Pull (ip, path, user_agent) for every threat in the window. We cap
  // at 20k rows so a runaway scanner can't blow up the function — the
  // aggregations below are all frequency-based, so sampling still
  // produces a representative shape.
  const rows = await sql`
    SELECT ip, path, user_agent, ts
    FROM threat_actors
    WHERE ts > now() - ${interval}::interval
    ORDER BY ts DESC
    LIMIT 20000
  `;

  // Path frequency — what attackers are looking for, regardless of who.
  const pathCounts = new Map();
  for (const r of rows) {
    const p = r.path || "/";
    pathCounts.set(p, (pathCounts.get(p) || 0) + 1);
  }
  const topPaths = [...pathCounts.entries()]
    .map(([path, hits]) => ({ path, hits }))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 25);

  // Scanner / CMS / CVE aggregation (pure function over the rows).
  const scannerAgg = aggregateScanners(
    rows.map((r) => ({ userAgent: r.user_agent, path: r.path })),
  );

  // Per-IP path entropy — many unique paths = directory-busting or
  // full-CMS fingerprint sweep; few unique paths with many hits = a
  // targeted exploit attempt or credential brute-force.
  const perIp = new Map();
  for (const r of rows) {
    const e = perIp.get(r.ip) || { hits: 0, paths: new Set() };
    e.hits += 1;
    e.paths.add(r.path || "/");
    perIp.set(r.ip, e);
  }
  const topEnumerators = [...perIp.entries()]
    .map(([ip, { hits, paths }]) => ({ ip, hits, uniquePaths: paths.size }))
    .sort((a, b) => b.uniquePaths - a.uniquePaths || b.hits - a.hits)
    .slice(0, 15);

  // First-seen vs recurring — IPs that attacked us this window but
  // have never been in visits or threat_actors before it.
  const startISO = new Date(Date.now() - (
    range === "24h" ? 86400e3 : range === "30d" ? 30 * 86400e3 : 7 * 86400e3
  )).toISOString();
  const ipsInWindow = [...new Set(rows.map((r) => r.ip))];
  let freshIps = [];
  if (ipsInWindow.length > 0) {
    const prior = await sql`
      SELECT DISTINCT ip FROM threat_actors
      WHERE ip = ANY(${ipsInWindow}) AND ts < ${startISO}
    `;
    const seenBefore = new Set(prior.map((p) => p.ip));
    freshIps = ipsInWindow.filter((ip) => !seenBefore.has(ip));
  }

  // Exploit attempts — rows matched to a CVE. Surface the top N so the
  // dashboard can show "CVE-2021-44228 × 47 hits from 9 IPs".
  const cveHits = new Map();
  for (const r of rows) {
    const id = identifyScanner({ userAgent: r.user_agent, path: r.path });
    if (!id.cve) continue;
    const e = cveHits.get(id.cve) || { cve: id.cve, name: id.cveName, hits: 0, ips: new Set(), lastSeen: null };
    e.hits += 1;
    e.ips.add(r.ip);
    if (!e.lastSeen || r.ts > e.lastSeen) e.lastSeen = r.ts;
    cveHits.set(id.cve, e);
  }
  const exploitAttempts = [...cveHits.values()]
    .map((e) => ({ cve: e.cve, name: e.name, hits: e.hits, uniqueIps: e.ips.size, lastSeen: e.lastSeen }))
    .sort((a, b) => b.hits - a.hits);

  return json(200, {
    range,
    summary: {
      totalThreats: rows.length,
      uniqueIps: ipsInWindow.length,
      freshIps: freshIps.length,
      recurringIps: ipsInWindow.length - freshIps.length,
      distinctPaths: pathCounts.size,
      exploitAttempts: exploitAttempts.reduce((s, e) => s + e.hits, 0),
    },
    topPaths,
    topEnumerators,
    tools: scannerAgg.tools.slice(0, 15),
    cms:   scannerAgg.cms.slice(0, 15),
    cve:   scannerAgg.cve.slice(0, 15),
    exploitAttempts,
    freshIps: freshIps.slice(0, 20),
  });
}

// ---------- credential-enumeration intel (admin only) ----------
//
// The honeypot logs every login attempt into security_events as
// 'honeypot.credential'. This endpoint mines that table for:
//   - Top usernames tried (is admin/root/test dominant? → classic)
//   - Password length + first-char shape distribution
//   - Per-IP pattern: spray (many usernames, few tries each) vs
//     brute-force (one username, many tries) vs stuffing (diverse, bursty)

async function handleCredIntel(session, url) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const range = url.searchParams.get("range") || "7d";
  const interval = range === "24h" ? "24 hours" : range === "30d" ? "30 days" : "7 days";

  const rows = await sql`
    SELECT ip, detail, ts
    FROM security_events
    WHERE kind = 'honeypot.credential'
      AND ts > now() - ${interval}::interval
    ORDER BY ts ASC
    LIMIT 10000
  `;

  const normEmail = (d) => {
    const raw = String(d?.email || d?.d?.email || "").toLowerCase().trim();
    return raw || "(empty)";
  };
  const pwShape = (d) => d?.passwordShape || d?.d?.passwordShape || null;

  // Top usernames
  const userCounts = new Map();
  for (const r of rows) {
    const u = normEmail(r.detail);
    userCounts.set(u, (userCounts.get(u) || 0) + 1);
  }
  const topUsernames = [...userCounts.entries()]
    .map(([username, hits]) => ({ username, hits }))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 20);

  // Password length distribution (histogram, buckets of 1 char up to 32)
  const lenBuckets = new Array(33).fill(0); // 0..32, 32 = "32+"
  for (const r of rows) {
    const sh = pwShape(r.detail);
    const len = Number(sh?.length) || 0;
    const idx = Math.min(32, Math.max(0, len));
    lenBuckets[idx] += 1;
  }
  const pwLengthHistogram = lenBuckets
    .map((hits, len) => ({ length: len, hits }))
    .filter((b) => b.hits > 0);

  // Per-IP pattern classification.
  //   spray       → distinct usernames >= 3 AND max attempts per username <= 3
  //   brute-force → distinct usernames <= 2 AND total >= 5
  //   stuffing    → distinct usernames >= 5 AND total >= 10
  //   probe       → otherwise
  const perIp = new Map();
  for (const r of rows) {
    const u = normEmail(r.detail);
    const e = perIp.get(r.ip) || { total: 0, users: new Map(), first: r.ts, last: r.ts };
    e.total += 1;
    e.users.set(u, (e.users.get(u) || 0) + 1);
    if (r.ts < e.first) e.first = r.ts;
    if (r.ts > e.last)  e.last  = r.ts;
    perIp.set(r.ip, e);
  }
  const classify = (e) => {
    const distinct = e.users.size;
    const maxPerUser = [...e.users.values()].reduce((m, v) => Math.max(m, v), 0);
    if (distinct >= 5 && e.total >= 10) return "stuffing";
    if (distinct >= 3 && maxPerUser <= 3) return "spray";
    if (distinct <= 2 && e.total >= 5) return "brute-force";
    return "probe";
  };
  const ipBreakdown = [...perIp.entries()]
    .map(([ip, e]) => ({
      ip,
      total: e.total,
      distinctUsers: e.users.size,
      maxPerUser: [...e.users.values()].reduce((m, v) => Math.max(m, v), 0),
      pattern: classify(e),
      firstSeen: e.first,
      lastSeen: e.last,
      spanSeconds: Math.max(1, Math.round((new Date(e.last) - new Date(e.first)) / 1000)),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 30);

  const patternCounts = ipBreakdown.reduce((acc, row) => {
    acc[row.pattern] = (acc[row.pattern] || 0) + 1;
    return acc;
  }, {});

  return json(200, {
    range,
    summary: {
      totalAttempts: rows.length,
      uniqueIps: perIp.size,
      uniqueUsernames: userCounts.size,
      patternCounts,
    },
    topUsernames,
    pwLengthHistogram,
    ipBreakdown,
  });
}

// ---------- geo intel (admin only) ----------
//
// Country + city + /24 rollup. Uses inet arithmetic for the CIDR
// bucketing so we count every attack in the same /24 as one entry.

async function handleGeoIntel(session, url) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const range = url.searchParams.get("range") || "7d";
  const interval = range === "24h" ? "24 hours" : range === "30d" ? "30 days" : "7 days";

  const [byCountry, byCity, byCidr, conversionByCountry] = await Promise.all([
    sql`
      SELECT country, COUNT(*)::int AS hits, COUNT(DISTINCT ip)::int AS ips
      FROM threat_actors
      WHERE ts > now() - ${interval}::interval AND country IS NOT NULL
      GROUP BY country
      ORDER BY hits DESC
      LIMIT 25
    `,
    sql`
      SELECT country, city, COUNT(*)::int AS hits, COUNT(DISTINCT ip)::int AS ips
      FROM threat_actors
      WHERE ts > now() - ${interval}::interval AND city IS NOT NULL
      GROUP BY country, city
      ORDER BY hits DESC
      LIMIT 25
    `,
    // /24 rollup — cast ip text to inet then mask to /24. Rows where
    // the cast fails (e.g. malformed IP) are silently excluded by the
    // WHERE inet check.
    sql`
      SELECT (host(set_masklen(ip::inet, 24)) || '/24') AS cidr,
             COUNT(*)::int AS hits,
             COUNT(DISTINCT ip)::int AS ips,
             array_agg(DISTINCT country) FILTER (WHERE country IS NOT NULL) AS countries
      FROM threat_actors
      WHERE ts > now() - ${interval}::interval
        AND ip ~ '^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+$'
      GROUP BY cidr
      HAVING COUNT(DISTINCT ip) >= 2
      ORDER BY hits DESC
      LIMIT 20
    `,
    // Visit-to-threat conversion rate by country — what fraction of
    // traffic from each country turned hostile. High rate = consider
    // geofencing; low rate = normal user traffic mixed with noise.
    sql`
      WITH v AS (
        SELECT country, COUNT(DISTINCT ip)::int AS visit_ips
        FROM visits
        WHERE ts > now() - ${interval}::interval AND country IS NOT NULL
        GROUP BY country
      ),
      t AS (
        SELECT country, COUNT(DISTINCT ip)::int AS threat_ips
        FROM threat_actors
        WHERE ts > now() - ${interval}::interval AND country IS NOT NULL
        GROUP BY country
      )
      SELECT v.country,
             v.visit_ips,
             COALESCE(t.threat_ips, 0) AS threat_ips,
             ROUND(100.0 * COALESCE(t.threat_ips, 0) / NULLIF(v.visit_ips, 0), 1)::float AS pct
      FROM v
      LEFT JOIN t ON t.country = v.country
      WHERE v.visit_ips >= 3
      ORDER BY pct DESC NULLS LAST, threat_ips DESC
      LIMIT 20
    `,
  ]);

  return json(200, {
    range,
    byCountry: byCountry.map((r) => ({ country: r.country, hits: r.hits, ips: r.ips })),
    byCity:    byCity.map((r) => ({ country: r.country, city: r.city, hits: r.hits, ips: r.ips })),
    byCidr:    byCidr.map((r) => ({ cidr: r.cidr, hits: r.hits, ips: r.ips, countries: r.countries || [] })),
    conversionByCountry: conversionByCountry.map((r) => ({
      country: r.country, visitIps: r.visit_ips, threatIps: r.threat_ips, pct: r.pct,
    })),
  });
}

// ---------- adsense health (admin only) ----------
//
// Aggregates the client-side AdSense beacons so we can answer "are
// real visitors seeing ads?" in 10 seconds instead of logging into
// Google AdSense. Fill rate and block rate are the two numbers the
// owner actually cares about:
//
//   - High blocked% → most visitors run ad-blockers; expected, don't
//     confuse with a broken deploy.
//   - High timeout%  → AdSense approval is pending, or Google is
//     rate-limiting us (brand-new site, low traffic, thin content).
//   - High unfilled% → Google's accepting us but not selling — low
//     inventory on our niche. Expect over time as pages mature.
//   - High filled%   → Everything working; revenue is real.

async function handleAdsenseHealth(session, url) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const range = url.searchParams.get("range") || "7d";
  const interval = range === "24h" ? "24 hours" : range === "30d" ? "30 days" : "7 days";

  // The adsense_events table is created on-demand by the first /api/track
  // beacon, so a cold portal that's never seen traffic returns an empty
  // summary gracefully instead of a "relation does not exist" 500.
  let rows;
  try {
    rows = await sql`
      SELECT
        COUNT(*)::int                                 AS sessions,
        COUNT(*) FILTER (WHERE script_loaded)::int    AS script_loaded_sessions,
        SUM(slot_count)::int                          AS total_slots,
        SUM(filled)::int                              AS total_filled,
        SUM(unfilled)::int                            AS total_unfilled,
        SUM(blocked)::int                             AS total_blocked,
        SUM(timeout)::int                             AS total_timeout
      FROM adsense_events
      WHERE ts > now() - ${interval}::interval
    `;
  } catch {
    return json(200, { range, noData: true, hint: "Table not yet created — no beacons received." });
  }

  const byPath = await sql`
    SELECT path,
           COUNT(*)::int AS sessions,
           SUM(slot_count)::int AS slots,
           SUM(filled)::int AS filled,
           SUM(unfilled)::int AS unfilled,
           SUM(blocked)::int AS blocked,
           SUM(timeout)::int AS timeout
    FROM adsense_events
    WHERE ts > now() - ${interval}::interval
    GROUP BY path
    ORDER BY sessions DESC
    LIMIT 15
  `.catch(() => []);

  const r = rows[0] || {};
  const totalSlots = r.total_slots || 0;
  const pct = (n) => totalSlots === 0 ? 0 : Math.round((n / totalSlots) * 1000) / 10;

  // One-line narrative that tells the owner what to do.
  let headline;
  const fillPct = pct(r.total_filled || 0);
  const blockPct = pct(r.total_blocked || 0);
  const timeoutPct = pct(r.total_timeout || 0);
  const scriptPct = r.sessions ? Math.round((r.script_loaded_sessions / r.sessions) * 100) : 0;

  if (totalSlots === 0) {
    headline = "No AdSense beacons received yet. Visit a page with ads (e.g. /glossary) in a fresh browser to seed the first measurement.";
  } else if (fillPct >= 20) {
    headline = `AdSense is healthy — ${fillPct}% of slot impressions served a real ad.`;
  } else if (timeoutPct >= 40) {
    headline = `Google isn't responding to most slots (${timeoutPct}% timeout). Your AdSense account is probably still in "Getting ready" — check adsense.google.com → Sites for the approval state.`;
  } else if (blockPct >= 40) {
    headline = `Ad blockers are the main problem — ${blockPct}% of sessions block the adsbygoogle script entirely. Real visitors on clean browsers will see ads; the "missing ads" complaint from your own browser is expected.`;
  } else if (fillPct < 5) {
    headline = `Low fill rate (${fillPct}%). Site is approved but Google isn't finding many advertisers for your pages. Normal for new sites; improves with traffic + pagecount.`;
  } else {
    headline = `AdSense is working — ${fillPct}% fill, ${blockPct}% blocked, ${timeoutPct}% timed out.`;
  }

  return json(200, {
    range,
    headline,
    summary: {
      sessions: r.sessions || 0,
      scriptLoadedPct: scriptPct,
      totalSlots,
      fillPct,
      unfilledPct: pct(r.total_unfilled || 0),
      blockedPct: blockPct,
      timeoutPct,
    },
    byPath: byPath.map((b) => ({
      path: b.path, sessions: b.sessions, slots: b.slots,
      filled: b.filled, unfilled: b.unfilled, blocked: b.blocked, timeout: b.timeout,
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

  // Migration 013 — lead-gen tables (businesses, emails, campaigns, sends,
  // links, crawl jobs). Idempotent: every CREATE uses IF NOT EXISTS.
  //
  // The schema here is canonical. handlers in this file and the cron
  // worker in api/cron/agent.js depend on the column names + uniqueness
  // constraints below; if you rename anything, update both.
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS lead_businesses (
        id            bigserial PRIMARY KEY,
        name          text NOT NULL,
        legal_name    text,
        address       text,
        city          text,
        state         text,
        zip           text,
        lat           double precision,
        lng           double precision,
        website       text,
        phone         text,
        source        text NOT NULL,
        source_id     text,
        source_url    text,
        industry      text,
        naics         text,
        status        text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','rejected','do_not_contact')),
        notes         text,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        last_crawled_at timestamptz,
        -- Upsert key for OSM/Sunbiz/etc rediscovery — same source row
        -- updates in place rather than duplicating.
        UNIQUE (source, source_id)
      )`;
    await sql`CREATE INDEX IF NOT EXISTS lead_businesses_zip_idx     ON lead_businesses (zip, status)`;
    await sql`CREATE INDEX IF NOT EXISTS lead_businesses_status_idx  ON lead_businesses (status, created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS lead_businesses_website_idx ON lead_businesses (website) WHERE website IS NOT NULL`;
    await sql`CREATE INDEX IF NOT EXISTS lead_businesses_name_idx    ON lead_businesses (zip, lower(name))`;
    results.push({ step: "create lead_businesses table", ok: true });
  } catch (e) {
    results.push({ step: "create lead_businesses table", ok: false, error: String(e.message || e) });
  }
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS lead_emails (
        id              bigserial PRIMARY KEY,
        business_id     bigint NOT NULL REFERENCES lead_businesses(id) ON DELETE CASCADE,
        email           text NOT NULL,
        source          text NOT NULL,
        source_url      text,
        context_snippet text,
        confidence      double precision NOT NULL DEFAULT 0.5
                        CHECK (confidence >= 0 AND confidence <= 1),
        mx_valid        boolean,
        smtp_verified   boolean,
        consent_basis   text NOT NULL DEFAULT 'legitimate_interest'
                        CHECK (consent_basis IN ('legitimate_interest','public_record','opted_in')),
        opted_out_at    timestamptz,
        bounced_at      timestamptz,
        last_sent_at    timestamptz,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now(),
        -- Same address can appear under multiple businesses (shared owner,
        -- franchise HQ contact). Dedupe within a business only.
        UNIQUE (business_id, email)
      )`;
    await sql`CREATE INDEX IF NOT EXISTS lead_emails_business_idx   ON lead_emails (business_id)`;
    await sql`CREATE INDEX IF NOT EXISTS lead_emails_optout_idx     ON lead_emails (opted_out_at) WHERE opted_out_at IS NOT NULL`;
    await sql`CREATE INDEX IF NOT EXISTS lead_emails_confidence_idx ON lead_emails (confidence DESC)`;
    results.push({ step: "create lead_emails table", ok: true });
  } catch (e) {
    results.push({ step: "create lead_emails table", ok: false, error: String(e.message || e) });
  }
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS lead_campaigns (
        id                bigserial PRIMARY KEY,
        name              text NOT NULL,
        description       text,
        subject_template  text NOT NULL,
        body_template     text NOT NULL,
        ai_intro_prompt   text,
        from_email        text NOT NULL,
        reply_to          text,
        throttle_per_hour int NOT NULL DEFAULT 30 CHECK (throttle_per_hour > 0),
        daily_cap         int NOT NULL DEFAULT 200 CHECK (daily_cap > 0),
        consent_basis     text NOT NULL DEFAULT 'legitimate_interest'
                          CHECK (consent_basis IN ('legitimate_interest','public_record','opted_in')),
        -- segment is a JSON filter that handleLeadgenCampaignStart reads
        -- to materialize lead_campaign_sends rows. Today: { zip, min_confidence }.
        segment           jsonb NOT NULL DEFAULT '{}'::jsonb,
        status            text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','scheduled','running','paused','done','cancelled')),
        scheduled_at      timestamptz,
        started_at        timestamptz,
        completed_at      timestamptz,
        created_by        uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now()
      )`;
    await sql`CREATE INDEX IF NOT EXISTS lead_campaigns_status_idx ON lead_campaigns (status, scheduled_at)`;
    results.push({ step: "create lead_campaigns table", ok: true });
  } catch (e) {
    results.push({ step: "create lead_campaigns table", ok: false, error: String(e.message || e) });
  }
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS lead_campaign_sends (
        id                  bigserial PRIMARY KEY,
        campaign_id         bigint NOT NULL REFERENCES lead_campaigns(id) ON DELETE CASCADE,
        business_id         bigint NOT NULL REFERENCES lead_businesses(id) ON DELETE CASCADE,
        email_id            bigint NOT NULL REFERENCES lead_emails(id) ON DELETE CASCADE,
        to_email            text NOT NULL,
        status              text NOT NULL DEFAULT 'queued'
                            CHECK (status IN ('queued','sending','sent','failed','bounced','suppressed')),
        -- Filled in by the sender at send time (so a paused campaign doesn't
        -- store a 5000-row body cache it never uses).
        rendered_subject    text,
        rendered_body       text,
        provider            text,
        provider_message_id text,
        queued_at           timestamptz NOT NULL DEFAULT now(),
        sent_at             timestamptz,
        delivered_at        timestamptz,
        opened_at           timestamptz,
        clicked_at          timestamptz,
        replied_at          timestamptz,
        bounced_at          timestamptz,
        unsubscribed_at     timestamptz,
        error               text,
        -- open_token NULL until first send (then set + persisted so reopens
        -- of the link still work after status='sent').
        open_token          text UNIQUE,
        unsubscribe_token   text NOT NULL UNIQUE,
        open_count          int NOT NULL DEFAULT 0,
        click_count         int NOT NULL DEFAULT 0,
        UNIQUE (campaign_id, email_id)
      )`;
    await sql`CREATE INDEX IF NOT EXISTS lead_campaign_sends_campaign_idx ON lead_campaign_sends (campaign_id, queued_at)`;
    await sql`CREATE INDEX IF NOT EXISTS lead_campaign_sends_email_idx    ON lead_campaign_sends (email_id)`;
    await sql`CREATE INDEX IF NOT EXISTS lead_campaign_sends_provider_idx ON lead_campaign_sends (provider_message_id) WHERE provider_message_id IS NOT NULL`;
    await sql`CREATE INDEX IF NOT EXISTS lead_campaign_sends_status_idx   ON lead_campaign_sends (status, queued_at) WHERE sent_at IS NULL`;
    results.push({ step: "create lead_campaign_sends table", ok: true });
  } catch (e) {
    results.push({ step: "create lead_campaign_sends table", ok: false, error: String(e.message || e) });
  }
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS lead_campaign_links (
        id          bigserial PRIMARY KEY,
        campaign_id bigint NOT NULL REFERENCES lead_campaigns(id) ON DELETE CASCADE,
        url         text NOT NULL,
        label       text,
        click_count int NOT NULL DEFAULT 0,
        created_at  timestamptz NOT NULL DEFAULT now(),
        UNIQUE (campaign_id, url)
      )`;
    results.push({ step: "create lead_campaign_links table", ok: true });
  } catch (e) {
    results.push({ step: "create lead_campaign_links table", ok: false, error: String(e.message || e) });
  }
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS lead_crawl_jobs (
        id          bigserial PRIMARY KEY,
        kind        text NOT NULL CHECK (kind IN ('sunbiz_zip','osm_zip','website_emails','smtp_verify')),
        payload     jsonb NOT NULL,
        status      text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','running','done','failed','cancelled')),
        attempts    int NOT NULL DEFAULT 0,
        progress    int,
        total       int,
        error       text,
        result      jsonb,
        created_at  timestamptz NOT NULL DEFAULT now(),
        started_at  timestamptz,
        finished_at timestamptz,
        created_by  uuid REFERENCES users(id) ON DELETE SET NULL
      )`;
    await sql`CREATE INDEX IF NOT EXISTS lead_crawl_jobs_status_idx ON lead_crawl_jobs (status, created_at)`;
    await sql`CREATE INDEX IF NOT EXISTS lead_crawl_jobs_kind_idx   ON lead_crawl_jobs (kind, status)`;
    results.push({ step: "create lead_crawl_jobs table", ok: true });
  } catch (e) {
    results.push({ step: "create lead_crawl_jobs table", ok: false, error: String(e.message || e) });
  }

  // Migration 014 — better lead-gen taxonomy. Adds:
  //   - industry_group: friendly top-level (e.g. "Healthcare")
  //   - sub_industry:   specific human label (e.g. "Dentist")
  //   - tags:           free-form text[] for manual operator notes
  // Backfill of industry_group + sub_industry happens lazily on the next
  // Discover/upsert via classifyIndustry(); existing rows can be backfilled
  // by calling /api/portal?action=leadgen-reclassify (admin).
  try {
    await sql`ALTER TABLE lead_businesses ADD COLUMN IF NOT EXISTS industry_group text`;
    await sql`ALTER TABLE lead_businesses ADD COLUMN IF NOT EXISTS sub_industry   text`;
    await sql`ALTER TABLE lead_businesses ADD COLUMN IF NOT EXISTS tags           text[] NOT NULL DEFAULT '{}'`;
    await sql`CREATE INDEX IF NOT EXISTS lead_businesses_group_idx ON lead_businesses (industry_group, status)`;
    await sql`CREATE INDEX IF NOT EXISTS lead_businesses_tags_gin  ON lead_businesses USING gin (tags)`;
    results.push({ step: "lead-gen taxonomy columns (014)", ok: true });
  } catch (e) {
    results.push({ step: "lead-gen taxonomy columns (014)", ok: false, error: String(e.message || e) });
  }

  const allOk = results.every((r) => r.ok);
  const failedSteps = results.filter((r) => !r.ok).map((r) => ({ step: r.step, error: r.error }));
  if (failedSteps.length > 0) {
    // Surface details in Vercel runtime logs for post-hoc debugging since
    // the admin UI's pre-block can be hard to read on small screens.
     
    console.error("[run-audit-migration] failed steps:", JSON.stringify(failedSteps));
  }
  return json(allOk ? 200 : 500, {
    ok: allOk,
    migrations: ["001_audit_chain", "002_audit_chain_fix", "003_threat_feeds", "004_admin_ip_immunity", "005_affiliate_clicks", "006_newsletter_subscribers", "007_testimonials", "013_leadgen"],
    failedSteps,
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
// Intentionally lightweight — all data already lives in the visits + new
// affiliate_clicks tables, so this is just aggregate queries.
async function handleRevenueSignals(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const [blogTraffic, clicksByPost, clicksByNetwork, clicksByProduct, recentClicks] = await Promise.all([
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

// Stripe revenue summary for the last 30 days + active subscriptions.
// Pulls paid invoices and active subscriptions directly from Stripe so
// the admin panel reflects the live account state (no local cache). When
// STRIPE_SECRET_KEY is unset, returns a `stripe_not_configured` shape so
// the widget can show a "Stripe not configured" pill instead of 500-ing.
// Per-network + per-day affiliate click counts for the last N days.
// Internal affiliate stats endpoint. Admin-gated. Pure SELECT —
// no Stripe call, no upstream API, just the affiliate_clicks table.
async function handleAffiliateStats(session, url) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "30", 10) || 30, 7), 365);
  const since = `${days} days`;

  const [byNetwork, byDay, topPosts, recent] = await Promise.all([
    sql`
      SELECT
        COALESCE(network, 'unknown') AS network,
        COUNT(*)::int AS clicks,
        COUNT(DISTINCT anon_id)::int AS unique_visitors,
        MAX(ts) AS last_click
      FROM affiliate_clicks
      WHERE ts > now() - ${since}::interval
      GROUP BY network
      ORDER BY clicks DESC
    `.catch(() => []),
    sql`
      SELECT
        date_trunc('day', ts)::date AS day,
        COUNT(*)::int AS clicks
      FROM affiliate_clicks
      WHERE ts > now() - ${since}::interval
      GROUP BY 1
      ORDER BY 1 ASC
    `.catch(() => []),
    sql`
      SELECT
        COALESCE(NULLIF(slug, ''), referrer_path, '(unknown)') AS slug,
        COUNT(*)::int AS clicks,
        COUNT(DISTINCT network)::int AS networks
      FROM affiliate_clicks
      WHERE ts > now() - ${since}::interval
      GROUP BY 1
      ORDER BY clicks DESC
      LIMIT 15
    `.catch(() => []),
    sql`
      SELECT ts, network, label, slug, country
      FROM affiliate_clicks
      ORDER BY ts DESC
      LIMIT 25
    `.catch(() => []),
  ]);

  const totalClicks = byNetwork.reduce((sum, r) => sum + (r.clicks || 0), 0);

  return json(200, {
    ok: true,
    days,
    totalClicks,
    byNetwork,
    byDay,
    topPosts,
    recent,
  });
}

async function handleRevenueSummary(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const stripe = getStripe();
  if (!stripe) {
    return json(200, { ok: false, configured: false, error: "stripe_not_configured" });
  }

  const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);

  try {
    // Paginate once through the 30-day paid invoices window. Stripe caps
    // each page at 100; auto_paging_to_array walks the cursor for us.
    const paidInvoices = await stripe.invoices
      .list({ status: "paid", created: { gte: thirtyDaysAgo }, limit: 100 })
      .autoPagingToArray({ limit: 1000 })
      .catch(async () => {
        // autoPagingToArray isn't available in every SDK version — fall
        // back to a single page, which covers the common case.
        const single = await stripe.invoices.list({
          status: "paid",
          created: { gte: thirtyDaysAgo },
          limit: 100,
        });
        return single.data || [];
      });

    const paidTotalCents = paidInvoices.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0);
    const paidCount = paidInvoices.length;

    // Active subscriptions → MRR. Normalize each plan to monthly regardless
    // of billing interval (yearly/2 or weekly*4.33 etc) so one figure.
    const activeSubs = await stripe.subscriptions
      .list({ status: "active", limit: 100 })
      .autoPagingToArray({ limit: 1000 })
      .catch(async () => {
        const single = await stripe.subscriptions.list({ status: "active", limit: 100 });
        return single.data || [];
      });

    let mrrCents = 0;
    for (const sub of activeSubs) {
      const items = sub.items?.data || [];
      for (const item of items) {
        const price = item.price;
        if (!price || price.unit_amount == null) continue;
        const qty = item.quantity || 1;
        const cents = price.unit_amount * qty;
        const interval = price.recurring?.interval || "month";
        const count = price.recurring?.interval_count || 1;
        let monthly = cents;
        if (interval === "year") monthly = cents / (12 * count);
        else if (interval === "week") monthly = cents * (4.3333 / count);
        else if (interval === "day") monthly = cents * (30 / count);
        else if (interval === "month") monthly = cents / count;
        mrrCents += monthly;
      }
    }

    return json(200, {
      ok: true,
      configured: true,
      paid_count: paidCount,
      paid_total_cents: paidTotalCents,
      active_subs_count: activeSubs.length,
      mrr_cents: Math.round(mrrCents),
      window_days: 30,
    });
  } catch (err) {
    console.error("[portal] revenue-summary failed", err);
    return json(500, { ok: false, configured: true, error: String(err?.message || err).slice(0, 200) });
  }
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

// ---------- newsletter (admin only) ----------
// NEWSLETTER_FROM is the mailbox used for the monthly Simple IT Brief.
// The contact.js confirm flow already uses this string — reusing it keeps
// From-addresses consistent across confirm + send.
const NEWSLETTER_FROM = "Simple IT Brief <hello@simpleitsrq.com>";
const NEWSLETTER_BATCH_SIZE = 100;
const NEWSLETTER_SUBJECT_MAX = 200;
const NEWSLETTER_MARKDOWN_MAX = 20000;
const SITE_URL = "https://simpleitsrq.com";

// Extremely small Markdown → HTML converter tailored to newsletter use:
// paragraphs, headings (# / ## / ###), links, bold/italic, and lists.
// Everything unrecognized passes through as escaped text so we never
// emit attacker-controlled raw HTML into an email body.
function escapeEmailHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function newsletterMarkdownToHtml(md) {
  const escaped = escapeEmailHtml(md);
  const lines = escaped.split(/\r?\n/);
  const out = [];
  let listOpen = false;
  const flushList = () => { if (listOpen) { out.push("</ul>"); listOpen = false; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^###\s+/.test(line))      { flushList(); out.push(`<h3 style="margin:18px 0 8px;font-size:15px;color:#0F6CBD">${line.replace(/^###\s+/, "")}</h3>`); continue; }
    if (/^##\s+/.test(line))       { flushList(); out.push(`<h2 style="margin:22px 0 8px;font-size:17px;color:#0F6CBD">${line.replace(/^##\s+/, "")}</h2>`); continue; }
    if (/^#\s+/.test(line))        { flushList(); out.push(`<h1 style="margin:24px 0 10px;font-size:19px;color:#0F6CBD">${line.replace(/^#\s+/, "")}</h1>`); continue; }
    if (/^[-*]\s+/.test(line))     { if (!listOpen) { out.push(`<ul style="margin:8px 0;padding-left:20px">`); listOpen = true; } out.push(`<li style="margin:4px 0">${line.replace(/^[-*]\s+/, "")}</li>`); continue; }
    if (line === "")               { flushList(); out.push(""); continue; }
    flushList();
    out.push(`<p style="margin:10px 0;font-size:14px;line-height:1.6;color:#1a1a1a">${line}</p>`);
  }
  flushList();
  let html = out.join("\n");
  // bold + italic + links
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" style="color:#0F6CBD">$1</a>');
  return html;
}

async function handleNewsletterCount(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const rows = await sql`
    SELECT COUNT(*)::int AS count FROM newsletter_subscribers
    WHERE confirmed_at IS NOT NULL AND unsubscribed_at IS NULL
  `.catch(() => [{ count: 0 }]);
  return json(200, { ok: true, count: rows[0]?.count || 0 });
}

async function handleNewsletterSend(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }

  const subject = sanitizeHeader(body?.subject, NEWSLETTER_SUBJECT_MAX);
  const markdown = clampString(body?.markdown, NEWSLETTER_MARKDOWN_MAX);
  if (!subject) return json(400, { ok: false, error: "subject_required" });
  if (!markdown) return json(400, { ok: false, error: "body_required" });
  if (subject.length < 3) return json(400, { ok: false, error: "subject_too_short" });
  if (markdown.length < 20) return json(400, { ok: false, error: "body_too_short" });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return json(500, { ok: false, error: "resend_not_configured" });

  const subs = await sql`
    SELECT email, unsubscribe_token FROM newsletter_subscribers
    WHERE confirmed_at IS NOT NULL AND unsubscribed_at IS NULL
    ORDER BY id ASC
  `.catch(() => []);

  if (subs.length === 0) {
    return json(200, { ok: true, sent: 0, failed: 0, log_id: null });
  }

  const resend = new Resend(apiKey);
  let sent = 0;
  let failed = 0;

  const bodyHtml = newsletterMarkdownToHtml(markdown);

  for (let i = 0; i < subs.length; i += NEWSLETTER_BATCH_SIZE) {
    const chunk = subs.slice(i, i + NEWSLETTER_BATCH_SIZE);
    const payload = chunk.map((s) => {
      const unsubscribeUrl = `${SITE_URL}/api/contact?unsubscribe=${s.unsubscribe_token}`;
      const html = `
        <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;padding:20px">
          ${bodyHtml}
          <p style="font-size:11px;color:#9ca3af;margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb">
            You're receiving this because you confirmed a subscription to The Simple IT Brief.
            <a href="${unsubscribeUrl}" style="color:#9ca3af">Unsubscribe</a>.
          </p>
        </div>
      `;
      return {
        from: NEWSLETTER_FROM,
        to: [s.email],
        subject,
        html,
        headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      };
    });

    try {
      const result = await resend.batch.create(payload);
      // Resend batch returns { data: { data: [{ id }], ... } } on success;
      // per-recipient failures are rare but we count everything as sent
      // unless the whole call threw.
      if (result?.error) {
        failed += chunk.length;
        console.error("[portal] newsletter batch error", result.error);
      } else {
        sent += chunk.length;
      }
    } catch (err) {
      failed += chunk.length;
      console.error("[portal] newsletter batch threw", err);
    }
  }

  let logId = null;
  try {
    const logged = await sql`
      INSERT INTO newsletter_sends (subject, sent, failed, sent_by)
      VALUES (${subject}, ${sent}, ${failed}, ${session.user.id})
      RETURNING id
    `;
    logId = logged[0]?.id || null;
  } catch (err) {
    console.warn("[portal] newsletter_sends insert failed", err);
  }

  await logSecurityEvent({
    kind: "admin.newsletter_send",
    severity: "info",
    ip: clientIp(request),
    userId: session?.user?.id || null,
    userAgent: request.headers.get("user-agent") || null,
    path: "/api/portal?action=newsletter-send",
    detail: { subject, sent, failed, subscribers: subs.length },
  });

  return json(200, { ok: true, sent, failed, log_id: logId });
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

// ============================================================
// Lead generation (admin only)
// ============================================================
//
// All handlers below back the /portal/leadgen admin dashboard. The pipeline
// is:
//
//   1. Operator enters a zip code → handleLeadgenDiscover queues a
//      `lead_crawl_jobs` row of kind='osm_zip'. The cron worker picks it up,
//      calls discoverBusinessesByZip, and upserts into lead_businesses.
//   2. Operator picks a batch of businesses → handleLeadgenCrawlEmails
//      queues kind='website_emails' jobs (one per business). Cron worker
//      runs crawlEmails(business.website) and inserts lead_emails rows.
//   3. Operator builds a lead_campaigns row, ties it to a saved-segment
//      query, and starts it. Cron worker drains lead_campaign_sends
//      respecting throttle_per_hour + daily_cap, calling SES.
//
// The handlers are intentionally lightweight: they validate input, write
// the queue row or read from the DB, and return. All real work happens
// in api/cron/agent.js so we stay well under serverless time limits.

const LEADGEN_VALID_KINDS = new Set(["osm_zip", "website_emails"]);

async function handleLeadgenStatus(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  // Aggregate counts in one round-trip per table. These power the
  // dashboard top-line numbers.
  const [biz, emails, camps, sends, jobs] = await Promise.all([
    sql`SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status='active')::int AS active,
               COUNT(*) FILTER (WHERE website IS NOT NULL)::int AS with_website
        FROM lead_businesses`,
    sql`SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE opted_out_at IS NULL AND bounced_at IS NULL)::int AS deliverable,
               COUNT(DISTINCT business_id)::int AS businesses_with_email
        FROM lead_emails`,
    sql`SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status='running')::int AS running
        FROM lead_campaigns`,
    sql`SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE sent_at IS NOT NULL)::int AS sent,
               COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::int AS opened,
               COUNT(*) FILTER (WHERE clicked_at IS NOT NULL)::int AS clicked,
               COUNT(*) FILTER (WHERE replied_at IS NOT NULL)::int AS replied
        FROM lead_campaign_sends`,
    sql`SELECT id, kind, status, progress, total, created_at
        FROM lead_crawl_jobs
        ORDER BY created_at DESC
        LIMIT 20`,
  ]);

  return json(200, {
    ok: true,
    businesses: biz[0] || {},
    emails: emails[0] || {},
    campaigns: camps[0] || {},
    sends: sends[0] || {},
    recent_jobs: jobs,
  });
}

// GET — aggregated insights for the Insights tab
async function handleLeadgenInsights(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const [
    totalRow,
    withWebsiteRow,
    withEmailRow,
    avgEmailsRow,
    geography,
    industries,
    emailHealth,
    discoveryVelocity,
    campaignStats,
    topSegments,
  ] = await Promise.all([
    sql`SELECT COUNT(*)::int AS n FROM lead_businesses`,
    sql`SELECT COUNT(*)::int AS n FROM lead_businesses WHERE website IS NOT NULL`,
    sql`SELECT COUNT(DISTINCT business_id)::int AS n FROM lead_emails WHERE opted_out_at IS NULL AND bounced_at IS NULL`,
    sql`SELECT AVG(cnt)::numeric(4,2) AS avg FROM (SELECT COUNT(*)::int AS cnt FROM lead_emails WHERE opted_out_at IS NULL AND bounced_at IS NULL GROUP BY business_id) t`,
    sql`SELECT b.zip, b.city, COUNT(*)::int AS count,
               COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM lead_emails e WHERE e.business_id = b.id AND e.opted_out_at IS NULL AND e.bounced_at IS NULL))::int AS with_email
        FROM lead_businesses b
        GROUP BY b.zip, b.city
        ORDER BY count DESC
        LIMIT 10`,
    sql`SELECT industry_group, COUNT(*)::int AS count,
               ROUND(COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER (), 0), 1)::text AS pct
        FROM lead_businesses
        WHERE industry_group IS NOT NULL
        GROUP BY industry_group
        ORDER BY count DESC
        LIMIT 10`,
    sql`SELECT b.industry_group,
               COUNT(e.id)::int AS total_emails,
               COUNT(*) FILTER (WHERE e.opted_out_at IS NULL AND e.bounced_at IS NULL)::int AS deliverable,
               ROUND(COUNT(*) FILTER (WHERE e.opted_out_at IS NULL AND e.bounced_at IS NULL) * 100.0
                     / NULLIF(COUNT(e.id), 0), 1)::text AS rate
        FROM lead_businesses b
        LEFT JOIN lead_emails e ON e.business_id = b.id
        WHERE b.industry_group IS NOT NULL
        GROUP BY b.industry_group
        HAVING COUNT(e.id) > 0
        ORDER BY deliverable DESC
        LIMIT 10`,
    sql`SELECT TO_CHAR(DATE_TRUNC('week', created_at), 'YYYY-MM-DD') AS period,
               COUNT(*)::int AS count,
               COUNT(*) FILTER (WHERE website IS NOT NULL)::int AS with_website
        FROM lead_businesses
        WHERE created_at > now() - interval '12 weeks'
        GROUP BY DATE_TRUNC('week', created_at)
        ORDER BY period DESC
        LIMIT 12`,
    sql`SELECT c.id, c.name,
               COUNT(*) FILTER (WHERE cs.sent_at IS NOT NULL)::int AS sent,
               ROUND(COUNT(*) FILTER (WHERE cs.opened_at IS NOT NULL) * 100.0
                     / NULLIF(COUNT(*) FILTER (WHERE cs.sent_at IS NOT NULL), 0), 1)::text AS open_rate,
               ROUND(COUNT(*) FILTER (WHERE cs.replied_at IS NOT NULL) * 100.0
                     / NULLIF(COUNT(*) FILTER (WHERE cs.sent_at IS NOT NULL), 0), 1)::text AS reply_rate
        FROM lead_campaigns c
        LEFT JOIN lead_campaign_sends cs ON cs.campaign_id = c.id
        GROUP BY c.id, c.name
        ORDER BY sent DESC
        LIMIT 10`,
    sql`SELECT b.zip, b.industry_group, COUNT(*)::int AS count,
               COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM lead_emails e WHERE e.business_id = b.id AND e.opted_out_at IS NULL AND e.bounced_at IS NULL))::int AS with_email
        FROM lead_businesses b
        WHERE b.zip IS NOT NULL AND b.industry_group IS NOT NULL
        GROUP BY b.zip, b.industry_group
        ORDER BY count DESC
        LIMIT 10`,
  ]);

  const total = totalRow[0]?.n || 0;
  const withWebsite = withWebsiteRow[0]?.n || 0;
  const withEmail = withEmailRow[0]?.n || 0;

  return json(200, {
    ok: true,
    totalBusinesses: total,
    withWebsite,
    withEmail,
    websiteRate: total > 0 ? Math.round((withWebsite / total) * 100) : 0,
    emailRate: total > 0 ? Math.round((withEmail / total) * 100) : 0,
    avgEmailsPerBiz: Number(avgEmailsRow[0]?.avg || 0),
    geography: geography || [],
    industries: industries || [],
    emailHealth: emailHealth || [],
    discoveryVelocity: discoveryVelocity || [],
    campaignStats: campaignStats || [],
    topSegments: topSegments || [],
  });
}

// POST { zip }
async function handleLeadgenDiscover(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const zip = String(body?.zip || "").trim();
  if (!/^\d{5}$/.test(zip)) return json(400, { ok: false, error: "invalid_zip" });

  // Refuse to queue a duplicate pending job for the same zip — operators
  // hitting the button twice shouldn't double-spend Overpass quota.
  const existing = await sql`
    SELECT id FROM lead_crawl_jobs
    WHERE kind='osm_zip' AND status IN ('pending','running') AND payload->>'zip' = ${zip}
    LIMIT 1
  `;
  if (existing.length) {
    return json(200, { ok: true, job_id: existing[0].id, deduped: true });
  }

  const rows = await sql`
    INSERT INTO lead_crawl_jobs (kind, status, payload, created_by)
    VALUES ('osm_zip', 'pending', ${JSON.stringify({ zip })}::jsonb, ${session.userId || null})
    RETURNING id
  `;
  return json(200, { ok: true, job_id: rows[0].id });
}

// POST { business_ids?: number[], zip?: string, limit?: number }
//
// If business_ids is provided, queue a website_emails job per id. Otherwise
// pick the first `limit` (default 25, max 200) active businesses in the
// given zip that still have a website and no recent crawl.
async function handleLeadgenCrawlEmails(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }

  let ids = Array.isArray(body?.business_ids) ? body.business_ids.filter(Number.isInteger) : [];
  if (!ids.length) {
    const zip = String(body?.zip || "").trim();
    const limit = Math.min(Math.max(Number(body?.limit) || 25, 1), 200);
    if (!/^\d{5}$/.test(zip)) return json(400, { ok: false, error: "missing_zip_or_ids" });
    const rows = await sql`
      SELECT b.id FROM lead_businesses b
      WHERE b.zip = ${zip}
        AND b.website IS NOT NULL
        AND b.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM lead_crawl_jobs j
          WHERE j.kind='website_emails'
            AND j.status IN ('pending','running','done')
            AND (j.payload->>'business_id')::int = b.id
            AND j.created_at > now() - interval '30 days'
        )
      ORDER BY b.id
      LIMIT ${limit}
    `;
    ids = rows.map((r) => r.id);
  }
  if (!ids.length) return json(200, { ok: true, queued: 0, ids: [] });

  const inserted = [];
  for (const id of ids) {
    const r = await sql`
      INSERT INTO lead_crawl_jobs (kind, status, payload, created_by)
      VALUES ('website_emails', 'pending', ${JSON.stringify({ business_id: id })}::jsonb, ${session.userId || null})
      RETURNING id
    `;
    inserted.push(r[0].id);
  }
  return json(200, { ok: true, queued: inserted.length, ids: inserted });
}

// GET ?zip=&status=&q=&page=&limit=&tag=&min_emails=&max_emails=&created_after=&created_before=
async function handleLeadgenBusinesses(session, url) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const zip = (url.searchParams.get("zip") || "").trim();
  const status = (url.searchParams.get("status") || "").trim();
  const q = (url.searchParams.get("q") || "").trim();
  const industryGroup = (url.searchParams.get("industry_group") || "").trim();
  const subIndustry = (url.searchParams.get("sub_industry") || "").trim();
  const hasWebsite = url.searchParams.get("has_website") === "1";
  const hasEmail = url.searchParams.get("has_email") === "1";
  const tag = (url.searchParams.get("tag") || "").trim().toLowerCase();
  const minEmails = Math.max(0, Number(url.searchParams.get("min_emails")) || 0);
  const maxEmails = Math.max(0, Number(url.searchParams.get("max_emails")) || 0);
  const createdAfter = (url.searchParams.get("created_after") || "").trim();
  const createdBefore = (url.searchParams.get("created_before") || "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const offset = (page - 1) * limit;

  const wantsZip = /^\d{5}$/.test(zip);
  const wantsStatus = ["active", "rejected", "do_not_contact"].includes(status);
  const wantsQ = q.length >= 2;
  const wantsGroup = industryGroup.length > 0;
  const wantsSub = subIndustry.length > 0;
  const wantsTag = tag.length > 0;
  const wantsMinEmails = minEmails > 0;
  const wantsMaxEmails = maxEmails > 0;
  const wantsCreatedAfter = /^\d{4}-\d{2}-\d{2}$/.test(createdAfter);
  const wantsCreatedBefore = /^\d{4}-\d{2}-\d{2}$/.test(createdBefore);
  const like = `%${q.toLowerCase()}%`;

  const rows = await sql`
    SELECT b.id, b.name, b.address, b.city, b.state, b.zip, b.website,
           b.phone, b.industry, b.industry_group, b.sub_industry, b.tags,
           b.status, b.created_at,
           (SELECT COUNT(*)::int FROM lead_emails e
              WHERE e.business_id = b.id
                AND e.opted_out_at IS NULL
                AND e.bounced_at IS NULL) AS deliverable_emails
    FROM lead_businesses b
    WHERE (${!wantsZip}::bool OR b.zip = ${zip})
      AND (${!wantsStatus}::bool OR b.status = ${status})
      AND (${!wantsQ}::bool OR lower(b.name) LIKE ${like} OR lower(coalesce(b.website,'')) LIKE ${like})
      AND (${!wantsGroup}::bool OR b.industry_group = ${industryGroup})
      AND (${!wantsSub}::bool OR b.sub_industry = ${subIndustry})
      AND (${!hasWebsite}::bool OR b.website IS NOT NULL)
      AND (${!hasEmail}::bool OR EXISTS (
            SELECT 1 FROM lead_emails e
            WHERE e.business_id = b.id
              AND e.opted_out_at IS NULL
              AND e.bounced_at IS NULL))
      AND (${!wantsTag}::bool OR EXISTS (SELECT 1 FROM unnest(b.tags) t WHERE lower(t) LIKE ${'%' + tag + '%'}))
      AND (${!wantsCreatedAfter}::bool OR b.created_at >= ${createdAfter + 'T00:00:00Z'})
      AND (${!wantsCreatedBefore}::bool OR b.created_at <= ${createdBefore + 'T23:59:59Z'})
    ORDER BY b.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  // Apply min/max email filters in JS because the subquery makes SQL
  // composition with neon tagged templates fragile for HAVING.
  const filteredRows = rows.filter((r) => {
    const de = r.deliverable_emails || 0;
    if (wantsMinEmails && de < minEmails) return false;
    if (wantsMaxEmails && de > maxEmails) return false;
    return true;
  });

  const totalRow = await sql`
    SELECT COUNT(*)::int AS total
    FROM lead_businesses b
    WHERE (${!wantsZip}::bool OR b.zip = ${zip})
      AND (${!wantsStatus}::bool OR b.status = ${status})
      AND (${!wantsQ}::bool OR lower(b.name) LIKE ${like} OR lower(coalesce(b.website,'')) LIKE ${like})
      AND (${!wantsGroup}::bool OR b.industry_group = ${industryGroup})
      AND (${!wantsSub}::bool OR b.sub_industry = ${subIndustry})
      AND (${!hasWebsite}::bool OR b.website IS NOT NULL)
      AND (${!hasEmail}::bool OR EXISTS (
            SELECT 1 FROM lead_emails e
            WHERE e.business_id = b.id
              AND e.opted_out_at IS NULL
              AND e.bounced_at IS NULL))
      AND (${!wantsTag}::bool OR EXISTS (SELECT 1 FROM unnest(b.tags) t WHERE lower(t) LIKE ${'%' + tag + '%'}))
      AND (${!wantsCreatedAfter}::bool OR b.created_at >= ${createdAfter + 'T00:00:00Z'})
      AND (${!wantsCreatedBefore}::bool OR b.created_at <= ${createdBefore + 'T23:59:59Z'})
  `;

  const groups = await sql`
    SELECT industry_group, COUNT(*)::int AS n
    FROM lead_businesses
    WHERE industry_group IS NOT NULL
      AND (${!wantsZip}::bool OR zip = ${zip})
    GROUP BY industry_group ORDER BY n DESC
  `;
  const subs = wantsGroup ? await sql`
    SELECT sub_industry, COUNT(*)::int AS n
    FROM lead_businesses
    WHERE industry_group = ${industryGroup}
      AND sub_industry IS NOT NULL
      AND (${!wantsZip}::bool OR zip = ${zip})
    GROUP BY sub_industry ORDER BY n DESC
  ` : [];

  return json(200, {
    ok: true,
    page, limit,
    total: totalRow[0]?.total || 0,
    rows: filteredRows,
    facets: { groups, subs },
  });
}

// GET ?business_id=
async function handleLeadgenBusinessDetail(session, url) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const id = Number(url.searchParams.get("business_id"));
  if (!Number.isInteger(id)) return json(400, { ok: false, error: "invalid_id" });

  const [biz, emails] = await Promise.all([
    sql`SELECT * FROM lead_businesses WHERE id = ${id}`,
    sql`SELECT id, email, source, source_url, context_snippet, confidence,
               opted_out_at, bounced_at, last_sent_at, created_at
        FROM lead_emails WHERE business_id = ${id} ORDER BY confidence DESC, id ASC`,
  ]);
  if (!biz.length) return json(404, { ok: false, error: "not_found" });
  return json(200, { ok: true, business: biz[0], emails });
}

// POST { id, status?, tags?, sub_industry?, industry_group? }
//   id required. Any of the optional fields may be passed; nulls/undefined
//   leave the existing value untouched.
async function handleLeadgenBusinessUpdate(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const id = Number(body?.id);
  if (!Number.isInteger(id)) return json(400, { ok: false, error: "invalid_id" });

  const status = body?.status !== undefined ? String(body.status) : null;
  if (status !== null && !["active","rejected","do_not_contact"].includes(status)) {
    return json(400, { ok: false, error: "invalid_status" });
  }

  // Tags arrive as either an array of strings or a comma-separated string;
  // normalize to a deduped lowercased array (PG text[]).
  let tags = undefined;
  if (Array.isArray(body?.tags)) {
    tags = body.tags;
  } else if (typeof body?.tags === "string") {
    tags = body.tags.split(",");
  }
  if (tags !== undefined) {
    tags = Array.from(new Set(tags
      .map((t) => String(t || "").trim().toLowerCase())
      .filter((t) => t.length > 0 && t.length <= 32)));
  }

  const subIndustry = body?.sub_industry !== undefined ? String(body.sub_industry || "").slice(0, 64) : null;
  const industryGroup = body?.industry_group !== undefined ? String(body.industry_group || "").slice(0, 64) : null;

  await sql`
    UPDATE lead_businesses SET
      status         = COALESCE(${status}, status),
      sub_industry   = COALESCE(${subIndustry}, sub_industry),
      industry_group = COALESCE(${industryGroup}, industry_group),
      tags           = COALESCE(${tags}::text[], tags),
      updated_at     = now()
    WHERE id = ${id}
  `;
  return json(200, { ok: true });
}

// POST — backfill industry_group + sub_industry on every lead_businesses
// row from the raw OSM tag in `industry`. Idempotent. Useful after rolling
// out new entries in api/_lib/leadgen-classify.js.
async function handleLeadgenReclassify(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const { classifyIndustry } = await import("./_lib/leadgen-classify.js");
  const rows = await sql`
    SELECT id, industry FROM lead_businesses
    WHERE industry IS NOT NULL
      AND (industry_group IS NULL OR sub_industry IS NULL)
  `;
  let updated = 0;
  for (const r of rows) {
    const { industry, sub_industry } = classifyIndustry(r.industry);
    await sql`
      UPDATE lead_businesses
      SET industry_group = ${industry}, sub_industry = ${sub_industry}, updated_at = now()
      WHERE id = ${r.id}
    `;
    updated += 1;
  }
  return json(200, { ok: true, updated });
}

// GET ?format=csv|json + same filter params as handleLeadgenBusinesses.
// Streams up to 10,000 rows of the current filter view as a download.
async function handleLeadgenExport(session, url) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const format = (url.searchParams.get("format") || "csv").toLowerCase();
  const zip = (url.searchParams.get("zip") || "").trim();
  const status = (url.searchParams.get("status") || "").trim();
  const industryGroup = (url.searchParams.get("industry_group") || "").trim();
  const subIndustry = (url.searchParams.get("sub_industry") || "").trim();
  const hasWebsite = url.searchParams.get("has_website") === "1";
  const hasEmail = url.searchParams.get("has_email") === "1";

  const wantsZip = /^\d{5}$/.test(zip);
  const wantsStatus = ["active", "rejected", "do_not_contact"].includes(status);
  const wantsGroup = industryGroup.length > 0;
  const wantsSub = subIndustry.length > 0;

  const rows = await sql`
    SELECT b.id, b.name, b.address, b.city, b.state, b.zip, b.website,
           b.phone, b.industry, b.industry_group, b.sub_industry, b.tags, b.status,
           b.created_at,
           (SELECT string_agg(e.email, ';') FROM lead_emails e
              WHERE e.business_id = b.id AND e.opted_out_at IS NULL AND e.bounced_at IS NULL) AS emails
    FROM lead_businesses b
    WHERE (${!wantsZip}::bool OR b.zip = ${zip})
      AND (${!wantsStatus}::bool OR b.status = ${status})
      AND (${!wantsGroup}::bool OR b.industry_group = ${industryGroup})
      AND (${!wantsSub}::bool OR b.sub_industry = ${subIndustry})
      AND (${!hasWebsite}::bool OR b.website IS NOT NULL)
      AND (${!hasEmail}::bool OR EXISTS (
            SELECT 1 FROM lead_emails e
            WHERE e.business_id = b.id
              AND e.opted_out_at IS NULL
              AND e.bounced_at IS NULL))
    ORDER BY b.id DESC
    LIMIT 10000
  `;

  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "json") {
    return new Response(JSON.stringify({ exported_at: new Date().toISOString(), count: rows.length, rows }, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="leads-${stamp}.json"`,
      },
    });
  }
  // CSV — RFC 4180-ish quoting: wrap every field in quotes, escape internal
  // quotes by doubling. Keeps cells with commas/newlines/semicolons safe.
  const cols = ["id","name","industry_group","sub_industry","industry","address","city","state","zip","phone","website","emails","tags","status","created_at"];
  const esc = (v) => {
    if (v === null || v === undefined) return "";
    const s = Array.isArray(v) ? v.join(";") : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [cols.join(",")];
  for (const r of rows) {
    lines.push(cols.map((c) => esc(r[c])).join(","));
  }
  return new Response(lines.join("\r\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${stamp}.csv"`,
    },
  });
}

// POST { mode, prompt?, draft_subject?, draft_body?, business_id?, business_name?, industry?, website? }
//   mode: "campaign"     → write a fresh subject+body from a brief
//         "rewrite"      → improve a draft (keeps placeholders intact)
//         "personalize"  → 1–2 sentence opener tailored to a single biz
// Calls Groq's free Llama 3.3 70B endpoint. Requires GROQ_API_KEY env var.
async function handleLeadgenAi(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return json(503, { ok: false, error: "groq_not_configured", hint: "Set GROQ_API_KEY in Vercel env vars." });

  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const mode = String(body?.mode || "campaign");
  const prompt = String(body?.prompt || "").slice(0, 2000);
  const draftSubject = String(body?.draft_subject || "").slice(0, 500);
  const draftBody = String(body?.draft_body || "").slice(0, 8000);

  // Hand-tuned system prompts. Goal: pass an "is this AI?" sniff test
  // from a Florida small-business owner. The model loves em-dashes,
  // tricolons, hedging openers and "as a [role] you know" — kill all
  // of them on sight. Reward concrete specifics over generic claims.
  const systemBase =
    "You write cold-outreach business emails for Simple IT SRQ, a Sarasota/Bradenton " +
    "Florida IT services shop run by one local engineer (Dan). Helpdesk, computer " +
    "repair, security cameras, Microsoft 365, ransomware/backup for SMBs.\n\n" +
    "VOICE: Direct. Florida-local. First person. One human writing to one human.\n\n" +
    "BAN LIST (do not output any of these):\n" +
    "- em-dashes (— or --)\n" +
    "- emojis or icons of any kind\n" +
    "- 'as a [job] owner you know', 'in today's', 'in this fast-paced', 'we understand'\n" +
    "- 'just wanted to', 'hope this finds you well', 'I hope you are doing well'\n" +
    "- 'leverage', 'synergy', 'robust', 'cutting-edge', 'streamline', 'best-in-class', " +
    "'unlock', 'empower', 'tailored solutions', 'peace of mind' (cliche), 'seamless'\n" +
    "- 'consider reaching out', 'feel free to', 'don't hesitate to'\n" +
    "- triple-parallel lists (X, Y, and Z) when one specific is enough\n" +
    "- exclamation marks except in extreme rare cases\n\n" +
    "REQUIRED:\n" +
    "- Reference one concrete Florida thing (hurricane season, snowbird turnover, " +
    "FIPA, Sarasota humidity, county building, a real local pain) — do not force it " +
    "if the prompt does not allow.\n" +
    "- Sentence fragments are fine. Vary length.\n" +
    "- Sign 'Dan' or '— Dan' (no em-dash; use ASCII hyphen). Default sign-off: 'Dan, Simple IT SRQ'.\n" +
    "- Preserve {{first_name}}, {{business_name}}, {{city}}, {{unsubscribe_url}} placeholders verbatim if used.";

  let systemPrompt = systemBase;
  let userPrompt = prompt;
  if (mode === "campaign") {
    systemPrompt += " Output a JSON object with exactly two keys: \"subject\" (one short line, under 70 characters, no spam triggers like 'free', 'urgent', '!') and \"body\" (plain text, 80-180 words, includes {{first_name}} once near the top and a soft CTA at the bottom). No markdown. No code fences. Output ONLY the JSON object.";
  } else if (mode === "rewrite") {
    userPrompt = `Rewrite this email to sound more human and direct. Keep all {{placeholder}} tokens intact. Same goal, better words.\n\nSubject: ${draftSubject}\n\nBody:\n${draftBody}`;
    systemPrompt += " Output a JSON object with \"subject\" and \"body\". No markdown. No code fences. Output ONLY the JSON object.";
  } else if (mode === "personalize") {
    const bn = String(body?.business_name || "").slice(0, 200);
    const ind = String(body?.industry || "").slice(0, 100);
    const site = String(body?.website || "").slice(0, 300);
    userPrompt = `Write 1-2 sentences (max 40 words) that opens a cold email to this business. Make it specific enough that it could not have been sent to anyone else. Do not flatter. Do not use the words "love", "amazing", or "great". Mention the industry naturally.\n\nBusiness: ${bn}\nIndustry: ${ind}\nWebsite: ${site}\n\nReturn JSON: {"opener": "..."}`;
    systemPrompt = systemBase + " Output ONLY a JSON object with one key \"opener\". No markdown.";
  } else {
    return json(400, { ok: false, error: "invalid_mode" });
  }

  let groqResp;
  try {
    groqResp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
        max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
  } catch (e) {
    return json(502, { ok: false, error: "groq_network", detail: String(e?.message || e) });
  }
  if (!groqResp.ok) {
    const text = await groqResp.text().catch(() => "");
    return json(502, { ok: false, error: "groq_http_" + groqResp.status, detail: text.slice(0, 500) });
  }
  const out = await groqResp.json().catch(() => ({}));
  const content = out?.choices?.[0]?.message?.content;
  if (!content) return json(502, { ok: false, error: "groq_no_content" });

  let parsed;
  try { parsed = JSON.parse(content); }
  catch { return json(502, { ok: false, error: "groq_bad_json", raw: content.slice(0, 500) }); }

  return json(200, { ok: true, mode, result: parsed, usage: out.usage || null });
}

// POST { ids?: number[], industry_group?: string, zip?: string, list_id: number }
//   Pushes filtered businesses' first deliverable email into a Brevo
//   contact list. Reuses the same SMTP_USER as the API key holder; you
//   need a separate BREVO_API_KEY (v3) set in Vercel because SMTP creds
//   don't authenticate the contacts API.
async function handleLeadgenBrevoSync(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return json(503, { ok: false, error: "brevo_not_configured", hint: "Set BREVO_API_KEY (v3 key from app.brevo.com → SMTP & API → API keys) in Vercel env." });

  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const listId = Number(body?.list_id);
  if (!Number.isInteger(listId) || listId <= 0) return json(400, { ok: false, error: "invalid_list_id" });

  const ids = Array.isArray(body?.ids) ? body.ids.filter(Number.isInteger).slice(0, 1000) : [];
  const zip = String(body?.zip || "").trim();
  const group = String(body?.industry_group || "").trim();
  const wantsZip = /^\d{5}$/.test(zip);
  const wantsGroup = group.length > 0;

  const rows = ids.length
    ? await sql`
        SELECT b.id, b.name, b.industry_group, b.sub_industry, b.city, b.state,
               (SELECT e.email FROM lead_emails e
                  WHERE e.business_id = b.id AND e.opted_out_at IS NULL AND e.bounced_at IS NULL
                  ORDER BY e.confidence DESC, e.id ASC LIMIT 1) AS email
        FROM lead_businesses b
        WHERE b.id = ANY(${ids}) AND b.status = 'active'
      `
    : await sql`
        SELECT b.id, b.name, b.industry_group, b.sub_industry, b.city, b.state,
               (SELECT e.email FROM lead_emails e
                  WHERE e.business_id = b.id AND e.opted_out_at IS NULL AND e.bounced_at IS NULL
                  ORDER BY e.confidence DESC, e.id ASC LIMIT 1) AS email
        FROM lead_businesses b
        WHERE b.status = 'active'
          AND (${!wantsZip}::bool OR b.zip = ${zip})
          AND (${!wantsGroup}::bool OR b.industry_group = ${group})
        LIMIT 1000
      `;

  const eligible = rows.filter((r) => r.email);
  let pushed = 0, failed = 0;
  const errors = [];
  // Brevo /contacts has no batch upsert endpoint that also assigns to a
  // list, so we loop. For larger pushes, use /contacts/import (CSV file
  // body) — out of scope here.
  for (const r of eligible) {
    try {
      const resp = await fetch("https://api.brevo.com/v3/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": apiKey, accept: "application/json" },
        body: JSON.stringify({
          email: r.email,
          listIds: [listId],
          attributes: {
            BUSINESS_NAME: r.name,
            INDUSTRY: r.industry_group || null,
            SUB_INDUSTRY: r.sub_industry || null,
            CITY: r.city || null,
            STATE: r.state || null,
          },
          updateEnabled: true,
        }),
      });
      if (resp.ok || resp.status === 204) pushed += 1;
      else { failed += 1; errors.push(`${r.email}: HTTP ${resp.status}`); }
    } catch (e) {
      failed += 1; errors.push(`${r.email}: ${String(e?.message || e).slice(0, 100)}`);
    }
  }
  return json(200, { ok: true, considered: rows.length, eligible: eligible.length, pushed, failed, errors: errors.slice(0, 20) });
}

// GET — list campaigns
async function handleLeadgenCampaigns(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const rows = await sql`
    SELECT c.id, c.name, c.status, c.subject_template, c.from_email, c.reply_to,
           c.throttle_per_hour, c.daily_cap, c.consent_basis, c.segment,
           c.created_at, c.updated_at,
           (SELECT COUNT(*)::int FROM lead_campaign_sends s WHERE s.campaign_id = c.id) AS total_sends,
           (SELECT COUNT(*)::int FROM lead_campaign_sends s
              WHERE s.campaign_id = c.id AND s.sent_at IS NOT NULL) AS sent,
           (SELECT COUNT(*)::int FROM lead_campaign_sends s
              WHERE s.campaign_id = c.id AND s.opened_at IS NOT NULL) AS opened,
           (SELECT COUNT(*)::int FROM lead_campaign_sends s
              WHERE s.campaign_id = c.id AND s.replied_at IS NOT NULL) AS replied
    FROM lead_campaigns c
    ORDER BY c.id DESC
  `;
  return json(200, { ok: true, rows });
}

// POST — create or update a campaign (id optional)
async function handleLeadgenCampaignSave(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }

  const fields = {
    name: clampString(body?.name, 200),
    subject_template: clampString(body?.subject_template, 500),
    body_template: clampString(body?.body_template, 20000),
    from_email: clampString(body?.from_email, 254),
    reply_to: clampString(body?.reply_to, 254),
    throttle_per_hour: Math.min(Math.max(Number(body?.throttle_per_hour) || 30, 1), 500),
    daily_cap: Math.min(Math.max(Number(body?.daily_cap) || 200, 1), 5000),
    consent_basis: ["legitimate_interest","public_record","opted_in"].includes(body?.consent_basis)
      ? body.consent_basis : "legitimate_interest",
    segment: body?.segment && typeof body.segment === "object" ? body.segment : {},
  };
  if (!fields.name || !fields.subject_template || !fields.body_template || !fields.from_email) {
    return json(400, { ok: false, error: "missing_fields" });
  }

  if (body?.id) {
    const id = Number(body.id);
    await sql`
      UPDATE lead_campaigns SET
        name=${fields.name},
        subject_template=${fields.subject_template},
        body_template=${fields.body_template},
        from_email=${fields.from_email},
        reply_to=${fields.reply_to || null},
        throttle_per_hour=${fields.throttle_per_hour},
        daily_cap=${fields.daily_cap},
        consent_basis=${fields.consent_basis},
        segment=${JSON.stringify(fields.segment)}::jsonb,
        updated_at=now()
      WHERE id=${id}
    `;
    return json(200, { ok: true, id });
  }
  const r = await sql`
    INSERT INTO lead_campaigns
      (name, status, subject_template, body_template, from_email, reply_to,
       throttle_per_hour, daily_cap, consent_basis, segment, created_by)
    VALUES
      (${fields.name}, 'draft', ${fields.subject_template}, ${fields.body_template},
       ${fields.from_email}, ${fields.reply_to || null},
       ${fields.throttle_per_hour}, ${fields.daily_cap},
       ${fields.consent_basis}, ${JSON.stringify(fields.segment)}::jsonb, ${session.userId || null})
    RETURNING id
  `;
  return json(200, { ok: true, id: r[0].id });
}

// POST { id, status }   id required, status in ('draft','scheduled','running','paused','done','cancelled')
async function handleLeadgenCampaignSetStatus(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const id = Number(body?.id);
  const status = String(body?.status || "");
  if (!Number.isInteger(id)) return json(400, { ok: false, error: "invalid_id" });
  if (!["draft","scheduled","running","paused","done","cancelled"].includes(status)) {
    return json(400, { ok: false, error: "invalid_status" });
  }
  await sql`UPDATE lead_campaigns SET status=${status}, updated_at=now() WHERE id=${id}`;
  return json(200, { ok: true });
}

// POST { id }
//
// Materializes one lead_campaign_sends row per deliverable email matching
// the campaign's segment query, with a fresh unsubscribe_token per row.
// Then flips campaign status to 'running' so cron can drain it.
async function handleLeadgenCampaignStart(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const id = Number(body?.id);
  if (!Number.isInteger(id)) return json(400, { ok: false, error: "invalid_id" });

  const camp = await sql`SELECT * FROM lead_campaigns WHERE id=${id}`;
  if (!camp.length) return json(404, { ok: false, error: "not_found" });
  const c = camp[0];
  if (!["draft","paused","scheduled"].includes(c.status)) {
    return json(400, { ok: false, error: "bad_status_transition", current: c.status });
  }

  const seg = c.segment || {};
  const zip = typeof seg.zip === "string" && /^\d{5}$/.test(seg.zip) ? seg.zip : null;
  const minConfidence = Number(seg.min_confidence) || 0.5;

  // Pull deliverable emails for this segment that aren't already queued
  // for this campaign. We only consider 'active' businesses.
  const candidates = await sql`
    SELECT e.id AS email_id, e.business_id, e.email
    FROM lead_emails e
    JOIN lead_businesses b ON b.id = e.business_id
    WHERE b.status = 'active'
      AND e.opted_out_at IS NULL
      AND e.bounced_at IS NULL
      AND e.confidence >= ${minConfidence}
      AND (${!zip}::bool OR b.zip = ${zip})
      AND NOT EXISTS (
        SELECT 1 FROM lead_campaign_sends s
        WHERE s.campaign_id = ${id} AND s.email_id = e.id
      )
    LIMIT 5000
  `;

  let inserted = 0;
  for (const row of candidates) {
    const tok = (globalThis.crypto || (await import("node:crypto")).webcrypto)
      .randomUUID().replace(/-/g, "");
    await sql`
      INSERT INTO lead_campaign_sends
        (campaign_id, business_id, email_id, to_email, status, unsubscribe_token)
      VALUES
        (${id}, ${row.business_id}, ${row.email_id}, ${row.email}, 'queued', ${tok})
      ON CONFLICT DO NOTHING
    `;
    inserted += 1;
  }
  await sql`UPDATE lead_campaigns SET status='running', updated_at=now() WHERE id=${id}`;
  return json(200, { ok: true, queued: inserted });
}

// POST { id, to } — send the campaign template to an arbitrary address right
// now (no queue, no segment match). Used to preview deliverability before
// flipping the campaign to running.
async function handleLeadgenCampaignTest(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const id = Number(body?.id);
  const to = String(body?.to || "").trim().toLowerCase();
  if (!Number.isInteger(id)) return json(400, { ok: false, error: "invalid_id" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json(400, { ok: false, error: "invalid_email" });

  const camp = await sql`SELECT * FROM lead_campaigns WHERE id=${id}`;
  if (!camp.length) return json(404, { ok: false, error: "not_found" });
  const c = camp[0];

  const { sendCampaignEmail, renderTemplate } = await import("./_lib/leadgen-smtp.js");
  const crypto = globalThis.crypto || (await import("node:crypto")).webcrypto;
  const tok = () => crypto.randomUUID().replace(/-/g, "");
  const openToken = tok();
  const unsubToken = tok();

  // Render with sane preview vars; real sends pull these from the lead row.
  const vars = {
    first_name: "there",
    business_name: "(test)",
    city: "Sarasota",
    state: "FL",
  };
  const subject = renderTemplate(c.subject_template || "(no subject)", vars);
  const text    = renderTemplate(c.body_template || "", vars);

  const result = await sendCampaignEmail({
    to,
    subject: `[TEST] ${subject}`,
    textBody: text,
    from: c.from_email || undefined,
    replyTo: c.reply_to || undefined,
    openToken,
    unsubscribeToken: unsubToken,
    campaignId: c.id,
    sendId: 0,
  });
  return json(result.ok ? 200 : 500, result);
}

// GET ?id=&page=&limit=
async function handleLeadgenCampaignSends(session, url) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const id = Number(url.searchParams.get("id"));
  if (!Number.isInteger(id)) return json(400, { ok: false, error: "invalid_id" });
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 100));
  const offset = (page - 1) * limit;

  const rows = await sql`
    SELECT s.id, s.to_email, s.status, s.sent_at, s.opened_at,
           s.clicked_at, s.replied_at, s.bounced_at, s.error,
           b.name AS business_name, b.zip
    FROM lead_campaign_sends s
    JOIN lead_businesses b ON b.id = s.business_id
    WHERE s.campaign_id = ${id}
    ORDER BY s.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return json(200, { ok: true, rows });
}

// GET — list crawl jobs (admin diagnostics)
async function handleLeadgenJobs(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const rows = await sql`
    SELECT id, kind, status, progress, total, payload, error,
           created_at, started_at, finished_at
    FROM lead_crawl_jobs
    ORDER BY id DESC
    LIMIT 100
  `;
  return json(200, { ok: true, rows });
}

// Drains the lead_crawl_jobs queue inline so admin clicks (Discover,
// Crawl emails) feel synchronous instead of waiting on the daily cron.
// Bounded by the worker's own LEADGEN_TIME_BUDGET_MS / max-jobs guards;
// the surrounding portal function is configured for maxDuration=60.
async function handleLeadgenRunJobs(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  try {
    const summary = await runLeadgenWorker();
    return json(200, { ok: true, summary });
  } catch (err) {
    return json(500, { ok: false, error: String(err?.message || err).slice(0, 500) });
  }
}

// ---------- public token-authenticated lead-gen endpoints ----------
//
// These three handlers serve outbound-email engagement: open pixel, click
// redirect, and unsubscribe. They never touch session — the security model
// is "if you have a valid token, you can act on the row that token belongs
// to". Tokens are 32-hex random per send, generated server-side, and only
// shipped inside the actual email body, so possession ≈ recipient.

// 1×1 transparent GIF (43 bytes). Hard-coded base64 so we don't ship a
// binary asset just for tracking.
const PIXEL_GIF = Uint8Array.from(atob(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
), (c) => c.charCodeAt(0));

function pixelResponse() {
  return new Response(PIXEL_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL_GIF.byteLength),
      "Cache-Control": "private, no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
    },
  });
}

async function handleLeadgenOpenPixel(url) {
  const token = (url.searchParams.get("t") || "").slice(0, 64);
  // Always return a pixel so the email client doesn't render a broken
  // image icon — even if the token is bogus.
  if (!/^[a-f0-9]{32}$/i.test(token)) return pixelResponse();
  try {
    await sql`
      UPDATE lead_campaign_sends
      SET opened_at = COALESCE(opened_at, now()),
          open_count = open_count + 1
      WHERE open_token = ${token}
    `;
  } catch (err) {
    console.error("[leadgen-o] update failed", err?.message || err);
  }
  return pixelResponse();
}

async function handleLeadgenClick(url) {
  const token = (url.searchParams.get("t") || "").slice(0, 64);
  const dest = url.searchParams.get("u") || "";

  // Validate destination — only allow http/https. Otherwise we'd be an
  // open redirect to javascript: / data: schemes.
  let target;
  try {
    const parsed = new URL(dest);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    target = parsed.toString();
  } catch {
    return new Response("Invalid destination", { status: 400 });
  }

  if (/^[a-f0-9]{32}$/i.test(token)) {
    try {
      const rows = await sql`
        UPDATE lead_campaign_sends
        SET clicked_at = COALESCE(clicked_at, now()),
            click_count = click_count + 1,
            opened_at = COALESCE(opened_at, now())
        WHERE open_token = ${token}
        RETURNING campaign_id
      `;
      if (rows.length) {
        // Upsert into lead_campaign_links and bump click_count. Lazily
        // creates the row on first click — keeps the sender stateless.
        await sql`
          INSERT INTO lead_campaign_links (campaign_id, url, click_count)
          VALUES (${rows[0].campaign_id}, ${target}, 1)
          ON CONFLICT (campaign_id, url) DO UPDATE SET
            click_count = lead_campaign_links.click_count + 1
        `;
      }
    } catch (err) {
      console.error("[leadgen-c] update failed", err?.message || err);
    }
  }
  return new Response(null, {
    status: 302,
    headers: { Location: target, "Cache-Control": "no-store" },
  });
}

async function handleLeadgenUnsubscribe(url, method) {
  const token = (url.searchParams.get("t") || "").slice(0, 64);
  if (!/^[a-f0-9]{32}$/i.test(token)) {
    return new Response("Invalid unsubscribe link.", { status: 400 });
  }

  // Single update: flip the email row's opted_out_at, mark the send row
  // as unsubscribed, and any future queued sends for the same email get
  // suppressed by the queued→sending claim path (which checks opted_out_at).
  let row;
  try {
    const r = await sql`
      UPDATE lead_campaign_sends
      SET unsubscribed_at = COALESCE(unsubscribed_at, now()),
          status = CASE WHEN status IN ('queued','sending') THEN 'suppressed' ELSE status END
      WHERE unsubscribe_token = ${token}
      RETURNING email_id
    `;
    row = r[0];
    if (row) {
      await sql`UPDATE lead_emails SET opted_out_at = COALESCE(opted_out_at, now()) WHERE id = ${row.email_id}`;
      // Suppress all queued sends to this address across all campaigns.
      await sql`
        UPDATE lead_campaign_sends
        SET status='suppressed'
        WHERE email_id = ${row.email_id}
          AND status IN ('queued','sending')
      `;
    }
  } catch (err) {
    console.error("[leadgen-u] update failed", err?.message || err);
    return new Response("Unsubscribe failed — please reply STOP to the original email.", { status: 500 });
  }

  // RFC 8058 one-click POST: just acknowledge. Web GET: render a small
  // confirmation page so the recipient sees the action took effect.
  if (method === "POST") {
    return new Response(null, { status: 200 });
  }
  const html = `<!doctype html>
<html><head><title>Unsubscribed</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:60px auto;padding:0 20px;color:#1a1a1a;line-height:1.55}
h1{font-size:22px;margin:0 0 12px}
p{font-size:15px;color:#374151}
.box{padding:20px;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb}</style>
</head><body>
<div class="box">
  <h1>${row ? "You've been unsubscribed." : "Already unsubscribed."}</h1>
  <p>${row
    ? "We won't email you again. Sorry for the bother."
    : "This address is already off our list. Nothing more to do."}</p>
  <p style="font-size:13px;color:#6b7280">
    If you didn't expect this email at all, please ignore — we won't contact you again.
    Questions? <a href="mailto:hello@simpleitsrq.com">hello@simpleitsrq.com</a>.
  </p>
</div>
</body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

// ---------- entry points ----------
// CSRF is enforced in two layers:
//   1. csrfCheck() — Origin must be present AND match an allowed host.
//      Browsers always set Origin on cross-origin non-GET fetches, so a
//      missing Origin on a mutation is itself a CSRF signal. GET skips.
//   2. csrfValid() (from _lib/csrf.js) — double-submit cookie pattern;
//      mutating requests must echo the `sit_csrf` cookie back as the
//      `x-csrf-token` header.
// Both must pass for any mutation. Defense in depth.
const ALLOWED_ORIGINS = new Set([
  "https://simpleitsrq.com",
  "https://www.simpleitsrq.com",
]);

function csrfCheck(request, method) {
  if (method === "GET") return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return ALLOWED_ORIGINS.has(origin);
}

// ────────────────────────────────────────────────────────────
// Internal OpSec handlers. No public SPA route imports these screens.
// ────────────────────────────────────────────────────────────
//
// Personal defensive ops dashboard. Admin-only (gated by requireAdmin
// + ADMIN_TOKEN_ACTIONS allowlist). Backed by the three opsec_* tables
// from migration 015.
//
// All entries are scoped to created_by_user_id for a future multi-admin
// world but today only one admin row exists, so every list query returns
// every row.

const OPSEC_IOC_TYPES = new Set(["ip","domain","url","email","hash","cidr","user_agent","other"]);
const OPSEC_SEVERITIES = new Set(["low","medium","high","critical"]);

async function handleOpsecData(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  // Run all reads in parallel; defensive try-per-query so a single
  // missing-table doesn't blow up first-render after a fresh deploy
  // where the migration hasn't been applied yet.
  const safe = async (q) => { try { return await q; } catch { return []; } };
  const [domains, iocs, notes, threatTop, threatTotal] = await Promise.all([
    safe(sql`SELECT id, domain, label, notes, is_active, created_at, last_scanned_at
             FROM opsec_watched_domains ORDER BY is_active DESC, created_at DESC LIMIT 100`),
    safe(sql`SELECT id, ioc_type, value, source, severity, notes, first_seen_at, last_seen_at, is_active
             FROM opsec_iocs ORDER BY is_active DESC, last_seen_at DESC LIMIT 200`),
    safe(sql`SELECT id, title, body, tags, created_at, updated_at
             FROM opsec_notes ORDER BY updated_at DESC LIMIT 50`),
    safe(sql`SELECT feed_name, count(*)::int AS n, max(fetched_at) AS fetched_at
             FROM threat_feeds GROUP BY feed_name ORDER BY n DESC LIMIT 10`),
    safe(sql`SELECT count(*)::int AS n FROM threat_feeds`),
  ]);

  return json(200, {
    ok: true,
    domains,
    iocs,
    notes,
    threats: { feeds: threatTop, total: threatTotal[0]?.n ?? 0 },
  });
}

async function handleOpsecDomainAdd(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const body = await request.json().catch(() => ({}));
  const domain = String(body.domain || "").trim().toLowerCase();
  if (!/^[a-z0-9.-]{3,253}$/.test(domain) || !domain.includes(".")) {
    return json(400, { ok: false, error: "invalid_domain" });
  }
  const label = String(body.label || "").slice(0, 200) || null;
  const notes = String(body.notes || "").slice(0, 2000) || null;
  const userId = (typeof session.user.id === "string" && session.user.id.length === 36) ? session.user.id : null;
  const rows = await sql`
    INSERT INTO opsec_watched_domains (domain, label, notes, created_by_user_id)
    VALUES (${domain}, ${label}, ${notes}, ${userId})
    ON CONFLICT (domain) DO UPDATE SET
      label = EXCLUDED.label,
      notes = EXCLUDED.notes,
      is_active = true
    RETURNING id, domain, label, notes, is_active, created_at, last_scanned_at
  `;
  return json(200, { ok: true, domain: rows[0] });
}

async function handleOpsecDomainToggle(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const body = await request.json().catch(() => ({}));
  const id = Number.parseInt(body.id, 10);
  if (!Number.isFinite(id) || id <= 0) return json(400, { ok: false, error: "invalid_id" });
  const isActive = body.is_active !== false;
  await sql`UPDATE opsec_watched_domains SET is_active = ${isActive} WHERE id = ${id}`;
  return json(200, { ok: true });
}

async function handleOpsecIocAdd(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const body = await request.json().catch(() => ({}));
  const ioc_type = String(body.ioc_type || "").toLowerCase();
  if (!OPSEC_IOC_TYPES.has(ioc_type)) return json(400, { ok: false, error: "invalid_type" });
  const value = String(body.value || "").trim();
  if (!value || value.length > 500) return json(400, { ok: false, error: "invalid_value" });
  const severity = OPSEC_SEVERITIES.has(body.severity) ? body.severity : "medium";
  const source = String(body.source || "").slice(0, 200) || null;
  const notes = String(body.notes || "").slice(0, 2000) || null;
  const userId = (typeof session.user.id === "string" && session.user.id.length === 36) ? session.user.id : null;
  const rows = await sql`
    INSERT INTO opsec_iocs (ioc_type, value, source, severity, notes, created_by_user_id)
    VALUES (${ioc_type}, ${value}, ${source}, ${severity}, ${notes}, ${userId})
    ON CONFLICT (ioc_type, value) DO UPDATE SET
      source = COALESCE(EXCLUDED.source, opsec_iocs.source),
      severity = EXCLUDED.severity,
      notes = COALESCE(EXCLUDED.notes, opsec_iocs.notes),
      last_seen_at = now(),
      is_active = true
    RETURNING id, ioc_type, value, source, severity, notes, first_seen_at, last_seen_at, is_active
  `;
  return json(200, { ok: true, ioc: rows[0] });
}

async function handleOpsecIocToggle(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const body = await request.json().catch(() => ({}));
  const id = Number.parseInt(body.id, 10);
  if (!Number.isFinite(id) || id <= 0) return json(400, { ok: false, error: "invalid_id" });
  const isActive = body.is_active !== false;
  await sql`UPDATE opsec_iocs SET is_active = ${isActive}, last_seen_at = now() WHERE id = ${id}`;
  return json(200, { ok: true });
}

async function handleOpsecNoteSave(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const body = await request.json().catch(() => ({}));
  const title = String(body.title || "").slice(0, 200) || null;
  const noteBody = String(body.body || "").slice(0, 50_000);
  if (!noteBody.trim()) return json(400, { ok: false, error: "empty_body" });
  const tags = Array.isArray(body.tags)
    ? body.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 16)
    : [];
  const id = Number.parseInt(body.id, 10);
  const userId = (typeof session.user.id === "string" && session.user.id.length === 36) ? session.user.id : null;
  let rows;
  if (Number.isFinite(id) && id > 0) {
    rows = await sql`
      UPDATE opsec_notes
      SET title = ${title}, body = ${noteBody}, tags = ${tags}, updated_at = now()
      WHERE id = ${id}
      RETURNING id, title, body, tags, created_at, updated_at
    `;
  } else {
    rows = await sql`
      INSERT INTO opsec_notes (title, body, tags, created_by_user_id)
      VALUES (${title}, ${noteBody}, ${tags}, ${userId})
      RETURNING id, title, body, tags, created_at, updated_at
    `;
  }
  return json(200, { ok: true, note: rows[0] });
}

async function handleOpsecNoteDelete(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const body = await request.json().catch(() => ({}));
  const id = Number.parseInt(body.id, 10);
  if (!Number.isFinite(id) || id <= 0) return json(400, { ok: false, error: "invalid_id" });
  await sql`DELETE FROM opsec_notes WHERE id = ${id}`;
  return json(200, { ok: true });
}

async function dispatch(request, method) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "";

  // Health check is unauthenticated — must be before requireSession.
  if (action === "health" && method === "GET") return handleHealth();

  // Public lead-gen tracking endpoints. Authenticated by per-send tokens
  // embedded in the outgoing email, NOT a session — recipients open these
  // from their inbox without ever visiting our site otherwise. Must run
  // BEFORE the CSRF + session gates.
  //
  //   leadgen-o : 1×1 tracking pixel (GET only)
  //   leadgen-c : click-tracking redirect (GET only, 302 to ?u=)
  //   leadgen-u : one-click unsubscribe — accepts both GET (web link)
  //               and POST (RFC 8058 List-Unsubscribe-Post header).
  if (action === "leadgen-o" && method === "GET") return handleLeadgenOpenPixel(url);
  if (action === "leadgen-c" && method === "GET") return handleLeadgenClick(url);
  if (action === "leadgen-u" && (method === "GET" || method === "POST")) {
    return handleLeadgenUnsubscribe(url, method);
  }

  // ─── Admin API token bypass ─────────────────────────────────
  // Tightly scoped: only actions in ADMIN_TOKEN_ACTIONS are reachable
  // via token, the token must be ≥32 chars set in env, and the
  // x-admin-token header must match in constant time. Skips CSRF
  // (which only matters for browsers) but everything else is identical
  // to a real admin session.
  if (verifyAdminToken(request)) {
    if (!ADMIN_TOKEN_ACTIONS.has(action)) {
      return json(403, { ok: false, error: "admin_token_action_not_allowed", action });
    }
    const session = adminTokenSession();
    return dispatchAuthed(request, method, url, action, session);
  }

  // Layer 1: Origin check (rejects cross-origin and missing-Origin
  // mutations before any DB work).
  if (!csrfCheck(request, method)) {
    return json(403, { ok: false, error: "csrf_origin_rejected" });
  }
  // Layer 2: double-submit cookie (rejects same-origin XSS-driven CSRF).
  if (!csrfValid(request)) {
    return json(403, { ok: false, error: "csrf_rejected" });
  }

  const { session, error } = await requireSession(request);
  if (error) return error;

  return dispatchAuthed(request, method, url, action, session);
}

// Routes that need an authenticated admin/user session. Split out so
// the admin-token path and the cookie-session path share one routing
// table. Anything reachable without auth must remain in dispatch()
// above the auth gates.
async function dispatchAuthed(request, method, url, action, session) {
  if (action === "me"              && method === "GET")   return handleMeGet(session);
  if (action === "me"              && method === "PATCH") return handleMePatch(session, request);
  if (action === "export-data"     && method === "GET")   return handleExportData(session);
  if (action === "delete-account"  && method === "POST")  return handleDeleteAccount(session);
  if (action === "tickets"         && method === "GET")   return handleTickets(session, url);
  if (action === "ticket"          && method === "GET")   return handleTicket(session, url);
  if (action === "ticket"          && method === "PATCH") return handleTicketPatch(session, request);
  if (action === "ticket-message"  && method === "POST")  return handleTicketMessage(session, request);
  if (action === "invoices"        && method === "GET")   return handleInvoices(session);
  if (action === "visitors"        && method === "GET")   return handleVisitors(session);
  if (action === "investigate-ip"   && method === "GET")   return handleInvestigateIp(session, url);
  if (action === "investigate"      && method === "GET")   return handleInvestigateIp(session, url);
  if (action === "block-ip"         && method === "POST")  return handleBlockIp(session, request);
  if (action === "honeypot-creds"   && method === "GET")   return handleHoneypotCreds(session);
  if (action === "threat-intel"     && method === "GET")   return handleThreatIntel(session, url);
  if (action === "enum-intel"       && method === "GET")   return handleEnumIntel(session, url);
  if (action === "cred-intel"       && method === "GET")   return handleCredIntel(session, url);
  if (action === "geo-intel"        && method === "GET")   return handleGeoIntel(session, url);
  if (action === "adsense-health"   && method === "GET")   return handleAdsenseHealth(session, url);
  if (action === "audit-verify"     && method === "GET")   return handleAuditVerify(session);
  if (action === "run-audit-migration" && method === "POST") return handleRunAuditMigration(session);
  if (action === "reset-audit-chain"    && method === "POST") return handleResetAuditChain(session);
  if (action === "osint-status"         && method === "GET")  return handleOsintStatus(session);
  if (action === "ops-status"           && method === "GET")  return handleOpsStatus(session);
  if (action === "countermeasures"      && method === "GET")  return handleCountermeasures(session);
  if (action === "revenue-signals"      && method === "GET")  return handleRevenueSignals(session);
  if (action === "revenue-summary"      && method === "GET")  return handleRevenueSummary(session);
  if (action === "affiliate-stats"      && method === "GET")  return handleAffiliateStats(session, url);
  if (action === "testimonials"         && method === "GET")  return handleTestimonialsList(session);
  if (action === "testimonial-save"     && method === "POST") return handleTestimonialSave(session, request);
  if (action === "testimonial-delete"   && method === "POST") return handleTestimonialDelete(session, request);
  if (action === "grant-immunity"       && method === "POST") return handleGrantImmunity(session, request);
  if (action === "osint-refresh"        && method === "POST") return handleOsintRefresh(session);
  if (action === "drafts"          && method === "GET")   return handleDrafts(session, url);
  if (action === "publish-draft"   && method === "POST")  return handlePublishDraft(session, request);
  if (action === "github-health"   && method === "GET")   return handleGithubHealth(session);
  if (action === "reject-draft"    && method === "POST")  return handleRejectDraft(session, request);
  if (action === "create-invoice"  && method === "POST")  return handleCreateInvoice(session, request);
  if (action === "send-invoice"    && method === "POST")  return handleSendInvoice(session, request);
  if (action === "newsletter-count" && method === "GET")  return handleNewsletterCount(session);
  if (action === "newsletter-send"  && method === "POST") return handleNewsletterSend(session, request);

  // Lead generation (admin)
  if (action === "leadgen-status"           && method === "GET")  return handleLeadgenStatus(session);
  if (action === "leadgen-discover"         && method === "POST") return handleLeadgenDiscover(session, request);
  if (action === "leadgen-crawl-emails"     && method === "POST") return handleLeadgenCrawlEmails(session, request);
  if (action === "leadgen-businesses"       && method === "GET")  return handleLeadgenBusinesses(session, url);
  if (action === "leadgen-insights"         && method === "GET")  return handleLeadgenInsights(session);
  if (action === "leadgen-business"         && method === "GET")  return handleLeadgenBusinessDetail(session, url);
  if (action === "leadgen-business-update"  && method === "POST") return handleLeadgenBusinessUpdate(session, request);
  if (action === "leadgen-campaigns"        && method === "GET")  return handleLeadgenCampaigns(session);
  if (action === "leadgen-campaign-save"    && method === "POST") return handleLeadgenCampaignSave(session, request);
  if (action === "leadgen-campaign-status"  && method === "POST") return handleLeadgenCampaignSetStatus(session, request);
  if (action === "leadgen-campaign-start"   && method === "POST") return handleLeadgenCampaignStart(session, request);
  if (action === "leadgen-campaign-test"    && method === "POST") return handleLeadgenCampaignTest(session, request);
  if (action === "leadgen-campaign-sends"   && method === "GET")  return handleLeadgenCampaignSends(session, url);
  if (action === "leadgen-jobs"             && method === "GET")  return handleLeadgenJobs(session);
  if (action === "leadgen-run-jobs"         && method === "POST") return handleLeadgenRunJobs(session);
  if (action === "leadgen-reclassify"       && method === "POST") return handleLeadgenReclassify(session);
  if (action === "leadgen-export"           && method === "GET")  return handleLeadgenExport(session, url);
  if (action === "leadgen-ai"               && method === "POST") return handleLeadgenAi(session, request);
  if (action === "leadgen-brevo-sync"       && method === "POST") return handleLeadgenBrevoSync(session, request);

  // Read-only admin observability — used by the agent CLI to diagnose
  // env config, queue depth, schema state, and recent errors without
  // touching the dashboard.
  if (action === "admin-status"             && method === "GET")  return handleAdminStatus(session);

  // Internal OpSec data/actions. All admin-only; mutations write through
  // the same admin-token allowlist.
  if (action === "opsec-data"          && method === "GET")  return handleOpsecData(session);
  if (action === "opsec-domain-add"    && method === "POST") return handleOpsecDomainAdd(session, request);
  if (action === "opsec-domain-toggle" && method === "POST") return handleOpsecDomainToggle(session, request);
  if (action === "opsec-ioc-add"       && method === "POST") return handleOpsecIocAdd(session, request);
  if (action === "opsec-ioc-toggle"    && method === "POST") return handleOpsecIocToggle(session, request);
  if (action === "opsec-note-save"     && method === "POST") return handleOpsecNoteSave(session, request);
  if (action === "opsec-note-delete"   && method === "POST") return handleOpsecNoteDelete(session, request);

  return json(404, { ok: false, error: "unknown_action" });
}

export async function GET(request)   { return dispatch(request, "GET"); }
export async function POST(request)  { return dispatch(request, "POST"); }
export async function PATCH(request) { return dispatch(request, "PATCH"); }
