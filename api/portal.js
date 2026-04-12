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

import { Resend } from "resend";
import { sql } from "./_lib/db.js";
import { getSession } from "./_lib/session.js";
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

  // --- Threat actors + session anomalies ---
  const [threatActors, sessionAnomalies] = await Promise.all([
    sql`
      SELECT ip, country, city, user_agent, device_hash, path, method, threat_class, ts
      FROM threat_actors
      ORDER BY ts DESC LIMIT 50
    `,
    sql`
      SELECT st.event, st.ip, st.country, st.city, st.device_hash, st.detail, st.ts,
             u.email AS user_email
      FROM session_tracking st
      LEFT JOIN users u ON u.id = st.user_id
      WHERE st.event = 'anomaly'
      ORDER BY st.ts DESC LIMIT 50
    `,
  ]);

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
    })),
    topPages,
    topCountries,
    topReferrers,
    threatActors: threatActors.map((t) => ({
      ip: t.ip, country: t.country, city: t.city, ua: t.user_agent,
      deviceHash: t.device_hash, path: t.path, method: t.method,
      threatClass: t.threat_class, ts: t.ts,
    })),
    sessionAnomalies: sessionAnomalies.map((s) => ({
      event: s.event, ip: s.ip, country: s.country, city: s.city,
      deviceHash: s.device_hash, detail: s.detail, ts: s.ts,
      userEmail: s.user_email,
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
    author: "Dancho Ivanov",
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
// GITHUB_TOKEN env var.
async function commitPostsFile(newContent, commitMessage) {
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

  // Fetch current file to get its SHA (required to update).
  const getRes = await fetch(`${base}?ref=${encodeURIComponent(branch)}`, { headers });
  if (!getRes.ok) {
    const txt = await getRes.text().catch(() => "");
    return { ok: false, error: `github_get_${getRes.status}`, detail: txt.slice(0, 200) };
  }
  const meta = await getRes.json();
  const sha = meta.sha;

  // PUT the new content, base64-encoded.
  const body = {
    message: commitMessage,
    content: Buffer.from(newContent, "utf8").toString("base64"),
    sha,
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
    return { ok: false, error: `github_put_${putRes.status}`, detail: txt.slice(0, 200) };
  }
  const putData = await putRes.json();
  return { ok: true, commitSha: putData.commit?.sha, htmlUrl: putData.commit?.html_url };
}

// Insert a new post entry into the existing posts.js array string by
// anchoring on the final "];\nexport default posts;" tail. Returns null
// if the tail is not found (file structure changed).
function spliceIntoPostsFile(fileContent, entry) {
  const tail = "];\n\nexport default posts;";
  const idx = fileContent.lastIndexOf(tail);
  if (idx === -1) return null;
  const before = fileContent.slice(0, idx);
  const after = fileContent.slice(idx);
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
      "User-Agent": "simpleitsrq-portal",
    },
  });
  if (!getRes.ok) {
    const txt = await getRes.text().catch(() => "");
    return json(502, { ok: false, error: `github_get_${getRes.status}`, detail: txt.slice(0, 200) });
  }
  const meta = await getRes.json();
  const currentFile = Buffer.from(meta.content, "base64").toString("utf8");

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

// ---------- health (unauthenticated, for external uptime monitors) ----------
async function handleHealth() {
  const checks = { db: "unknown", criticalEvents: 0, ok: false };
  try {
    const r = await sql`SELECT 1 AS ping`;
    checks.db = r.length > 0 ? "connected" : "no_response";
  } catch (err) {
    checks.db = "error";
    checks.dbError = String(err.message || err).slice(0, 200);
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

// ---------- entry points ----------
async function dispatch(request, method) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "";

  // Health check is unauthenticated — must be before requireSession.
  if (action === "health" && method === "GET") return handleHealth();

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
  if (action === "drafts"          && method === "GET")   return handleDrafts(session, url);
  if (action === "publish-draft"   && method === "POST")  return handlePublishDraft(session, request);
  if (action === "reject-draft"    && method === "POST")  return handleRejectDraft(session, request);

  return json(404, { ok: false, error: "unknown_action" });
}

export async function GET(request)   { return dispatch(request, "GET"); }
export async function POST(request)  { return dispatch(request, "POST"); }
export async function PATCH(request) { return dispatch(request, "PATCH"); }
