// api/_lib/portal/me.js
//
// Account-scoped /api/portal actions: me (GET/PATCH), export-data,
// delete-account, invoices.

import { sql } from "../db.js";
import { json } from "../http.js";
import { logSecurityEvent } from "../security.js";

// ---------- action handlers ----------
export async function handleMeGet(session) {
  return json(200, { user: session.user });
}

export async function handleMePatch(session, request) {
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
export async function handleExportData(session) {
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
export async function handleDeleteAccount(session) {
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

export async function handleInvoices(session) {
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
