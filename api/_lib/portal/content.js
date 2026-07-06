// api/_lib/portal/content.js
//
// Content/marketing /api/portal actions: blog drafts (list/publish/reject),
// testimonials CRUD, newsletter (count/send), github-health.

import { Resend } from "resend";
import { sql } from "../db.js";
import { json } from "../http.js";
import { clientIp, logSecurityEvent } from "../security.js";
import { sanitizeHeader, clampString } from "../sanitize.js";
import { publishDraftToGitHub } from "../publish-draft.js";
import { requireAdmin } from "./shared.js";

// ---------- blog drafts (admin only) ----------
// These handlers manage the `draft_posts` table populated by the daily
// cron agent (api/cron/agent.js). They let the admin list pending drafts,
// reject them, or publish them — publish commits a new entry to
// src/data/posts.js via the GitHub Contents API and Vercel redeploys.

const DRAFT_STATUSES = ["draft", "approved", "rejected", "published"];

// --- Testimonials (admin CRUD; public read is on /api/contact) ---
export async function handleTestimonialsList(session) {
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

export async function handleTestimonialSave(session, request) {
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

export async function handleTestimonialDelete(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const id = Number(body?.id);
  if (!id) return json(400, { ok: false, error: "id_required" });
  await sql`DELETE FROM testimonials WHERE id = ${id}`;
  return json(200, { ok: true });
}

export async function handleDrafts(session, url) {
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
export async function handlePublishDraft(session, request) {
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

  const commit = await publishDraftToGitHub(draft, overrides);
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
      path: commit.path || null,
    },
  });

  return json(200, { ok: true, commitSha: commit.commitSha, commitUrl: commit.htmlUrl });
}

export async function handleRejectDraft(session, request) {
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

export async function handleNewsletterCount(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;
  const rows = await sql`
    SELECT COUNT(*)::int AS count FROM newsletter_subscribers
    WHERE confirmed_at IS NOT NULL AND unsubscribed_at IS NULL
  `.catch(() => [{ count: 0 }]);
  return json(200, { ok: true, count: rows[0]?.count || 0 });
}

export async function handleNewsletterSend(session, request) {
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

// ---------- github diagnostic (admin only) ----------
// Pings the GitHub Contents API with the current GITHUB_TOKEN to diagnose
// publish failures without exposing token bytes.
export async function handleGithubHealth(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const token = process.env.GITHUB_TOKEN;
  const repo  = process.env.GITHUB_REPO  || "budokai-msi/simpleitsrq.com";
  const branch = process.env.GITHUB_BRANCH || "main";
  const path  = "content/posts";

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
