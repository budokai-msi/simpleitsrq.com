// api/_lib/portal/content.js
//
// Content/marketing /api/portal actions:
//  - blog drafts (list/publish/reject), testimonials CRUD, newsletter
//    (count/send), github-health
//  - content-insights: engagement analytics for the admin Content tab

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

function requireAdminSync(session) {
  return session?.user?.isAdmin ? null : json(403, { ok: false, error: "forbidden" });
}

// Content performance: which posts attract, hold, and convert readers.
// Feeds the "Content" tab of the admin dashboard. All queries read the
// engagement_events + visits tables that VisitorTracker already populates,
// so there is no new client instrumentation required.
export async function handleContentInsights(session) {
  const gate = requireAdminSync(session);
  if (gate) return gate;

  const [topPosts, entryPosts, exitToBook, searchTerms, stalePosts, categoryMix] = await Promise.all([
    // Per-post engagement over 30 days
    sql`
      SELECT slug,
             COUNT(*) FILTER (WHERE kind = 'pageview_enter')::int AS views,
             COUNT(DISTINCT COALESCE(anon_id, session_id::text))::int AS unique_visitors,
             ROUND(AVG(value_num) FILTER (WHERE kind = 'pageview_exit') / 1000.0, 1)::float AS avg_dwell_sec,
             ROUND(MAX(value_num) FILTER (WHERE kind = 'pageview_exit'))::int AS max_scroll_pct
      FROM engagement_events
      WHERE path LIKE '/blog/%' AND ts > now() - interval '30 days' AND slug IS NOT NULL
      GROUP BY slug
      ORDER BY views DESC
      LIMIT 25
    `.catch(() => []),
    // Where do new sessions land? Landing pages drive SEO.
    sql`
      SELECT landing_path, COUNT(*)::int AS entries,
             ROUND(AVG(total_dwell_ms) / 1000.0, 1)::float AS avg_dwell_sec,
             COUNT(*) FILTER (WHERE bounced)::int AS bounces,
             COUNT(*)::int AS total_sessions
      FROM web_sessions
      WHERE landing_path LIKE '/blog%' AND started_at > now() - interval '30 days'
      GROUP BY landing_path
      ORDER BY entries DESC
      LIMIT 15
    `.catch(() => []),
    // Conversion signal: blog readers who later hit /book or /services
    sql`
      WITH bookers AS (
        SELECT DISTINCT anon_id FROM visits
        WHERE (path LIKE '/book%' OR path LIKE '/contact%')
          AND ts > now() - interval '30 days'
      )
      SELECT v2.path, COUNT(DISTINCT v2.anon_id)::int AS visitors_who_booked
      FROM visits v2
      JOIN bookers ON bookers.anon_id = v2.anon_id
      WHERE v2.path LIKE '/blog%'
        AND v2.ts > now() - interval '30 days'
        AND v2.ts < (
          SELECT MIN(v3.ts) FROM visits v3
          WHERE v3.anon_id = v2.anon_id AND (v3.path LIKE '/book%' OR v3.path LIKE '/contact%')
            AND v3.ts > now() - interval '30 days'
        )
      GROUP BY v2.path
      ORDER BY visitors_who_booked DESC
      LIMIT 10
    `.catch(() => []),
    // What are people searching for on the site?
    sql`
      SELECT value_text AS query, COUNT(*)::int AS searches
      FROM engagement_events
      WHERE kind = 'search' AND ts > now() - interval '30 days'
      GROUP BY value_text
      ORDER BY searches DESC
      LIMIT 20
    `.catch(() => []),
    // Posts losing traffic — update candidates for SEO refreshes
    sql`
      SELECT COALESCE(this_month.slug, prior.slug) AS slug,
             COALESCE(this_month.views, 0) AS recent_views,
             COALESCE(prior.views, 0) AS prior_views
      FROM (
        SELECT slug, COUNT(*) FILTER (WHERE kind='pageview_enter')::int AS views
        FROM engagement_events
        WHERE path LIKE '/blog/%' AND ts > now() - interval '30 days' AND slug IS NOT NULL
        GROUP BY slug
      ) this_month
      FULL OUTER JOIN (
        SELECT slug, COUNT(*) FILTER (WHERE kind='pageview_enter')::int AS views
        FROM engagement_events
        WHERE path LIKE '/blog/%' AND ts BETWEEN now() - interval '60 days' AND now() - interval '30 days' AND slug IS NOT NULL
        GROUP BY slug
      ) prior ON prior.slug = this_month.slug
      WHERE COALESCE(this_month.views, 0) * 2 < COALESCE(prior.views, 0)
      ORDER BY prior.views DESC
      LIMIT 12
    `.catch(() => []),
    sql`
      SELECT meta->>'category' AS category, COUNT(*)::int AS views
      FROM engagement_events
      WHERE path LIKE '/blog/%' AND kind = 'pageview_enter' AND ts > now() - interval '30 days'
      GROUP BY meta->>'category'
      ORDER BY views DESC
      LIMIT 8
    `.catch(() => []),
  ]);

  return json(200, {
    ok: true,
    generatedAt: new Date().toISOString(),
    topPosts,
    entryPosts,
    exitToBook,
    searchTerms,
    stalePosts,
    categoryMix,
  });
}

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

export async function handleGenerateBlogDraft(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const TOPICS = [
    {
      title: "Ransomware Defense for Sarasota & Bradenton Businesses: 2026 Playbook",
      slug: "sarasota-bradenton-ransomware-defense-playbook",
      category: "Cybersecurity",
      excerpt: "How small businesses in Sarasota and Bradenton can protect workstations, cloud backups, and client data from modern ransomware.",
      metaDescription: "Practical ransomware defense guide for Sarasota and Bradenton businesses. Hardware 2FA, offsite backups, and local IT support.",
      body: `## Short Answer\nRansomware attacks targeting Florida small businesses increased by over 40% last year. Protecting your office does not require an enterprise budget—it requires clean backups, hardware multi-factor authentication, and locked-down user permissions.\n\n## Local Impact for Sarasota & Bradenton Businesses\nLocal law firms on Main St, dental practices near Sarasota Memorial, and accounting firms in Bradenton are primary targets for automated credential harvesting. A single compromised password can encrypt shared network drives and cloud file syncs in minutes.\n\n## Recommended Gear & Solutions\n- **Phishing-Resistant MFA**: Deploy [[amazon:B07HBD71HL|YubiKey 5C NFC]] keys for all Microsoft 365 and admin logins.\n- **Immutable Cloud & Local Backup**: Pair local [[amazon_search:Synology 2 bay NAS DS224+|Synology NAS]] storage with encrypted offsite cloud backups.\n- **Battery & Surge Protection**: Protect network switches with a [[amazon_search:APC Back-UPS Pro 1500VA sine wave|APC Back-UPS Pro 1500VA]].\n\n## What to Do This Week\n1. Enforce 14+ character passphrases and disable legacy email protocols.\n2. Verify that your daily backups are isolated from your local network.\n3. Run a perimeter security scan on your office router and firewalls.\n\n## When to Call IT\nIf your workstations are sluggish, receiving unexplained login prompts, or missing recent file backups, call Simple IT SRQ at (813) 434-3230 or explore our [transparent pricing](/services) or [B2B lead generation scanner](/leadgen).`,
    },
    {
      title: "Microsoft 365 Security Hardening Guide for SRQ Offices",
      slug: "microsoft-365-security-hardening-sarasota",
      category: "Cloud",
      excerpt: "Step-by-step Microsoft 365 checklist to stop unauthorized logins, spam forwarding, and wire-fraud phishing in Sarasota offices.",
      metaDescription: "Hardening Microsoft 365 for Sarasota and Bradenton small offices. Disable legacy auth, enable conditional access, and enforce MFA.",
      body: `## Short Answer\nDefault Microsoft 365 settings leave key security gaps open. By hardening tenant policies, auditing mail flow rules, and requiring hardware MFA, you eliminate over 95% of business email compromise threats.\n\n## Local Impact for Sarasota & Bradenton Businesses\nWire fraud and invoice manipulation target Florida real estate title companies, contractors, and professional service firms weekly. Standard passwords can be guessed or phished without MFA enforcing secure tokens.\n\n## Recommended Gear & Solutions\n- **Hardware Security Keys**: Require [[amazon:B07HBD71HL|YubiKey 5C NFC]] keys for key accounts.\n- **Enterprise Password Management**: Deploy 1Password or Bitwarden Teams for secure credential sharing.\n\n## What to Do This Week\n1. Turn on Security Defaults or Conditional Access in Azure AD / Entra ID.\n2. Disable IMAP, POP3, and SMTP AUTH across all mailbox accounts.\n3. Set up automated alerts for external inbox forwarding rules.\n\n## When to Call IT\nFor a full Microsoft 365 security audit or local hands-on assistance, call Simple IT SRQ at (813) 434-3230, [schedule a strategy call](/book), or view [our IT services](/services).`,
    },
    {
      title: "Fast Workstation & Network Repair for Sarasota Small Businesses",
      slug: "sarasota-workstation-network-repair-guide",
      category: "Business Tech",
      excerpt: "Diagnosing slow PCs, Wi-Fi drops, and workstation crashes in Sarasota and Manatee County offices without expensive monthly retainers.",
      metaDescription: "Workstation computer repair and Wi-Fi network setup in Sarasota, Bradenton, and Lakewood Ranch. Fast local engineer response.",
      body: `## Short Answer\nComputer slowdowns and erratic Wi-Fi cut directly into daily office billing. Upgrading old mechanical hard drives to NVMe SSDs and replacing consumer routers with managed access points resolves 90% of office productivity bottlenecks.\n\n## Local Impact for Sarasota & Bradenton Businesses\nHumid Florida coastal weather, power surges, and aging workstation hardware frequently cause thermal throttling and drive failures. Fast local repair prevents data loss and minimizes employee downtime.\n\n## Recommended Gear & Solutions\n- **Wi-Fi Access Points**: Upgrade to [[amazon_search:Ubiquiti UniFi U6 Pro access point|UniFi U6 Pro Access Points]] for seamless office coverage.\n- **Power Cleaners**: Protect workstations from Florida brown-outs with [[amazon_search:APC Back-UPS Pro 1500VA sine wave|APC UPS Backups]].\n\n## What to Do This Week\n1. Check drive SMART health on every office workstation.\n2. Audit Wi-Fi channel interference in multi-tenant commercial buildings.\n3. Replace any mechanical boot drives with 1TB+ high-speed SSDs.\n\n## When to Call IT\nNeed same-day computer repair or network troubleshooting in Sarasota, Bradenton, or Lakewood Ranch? Call Simple IT SRQ at (813) 434-3230 or view [our IT services](/services).`,
    },
  ];

  const pick = TOPICS[Math.floor(Math.random() * TOPICS.length)];

  // Slug collision guard: if a post with this base slug already exists, skip
  // instead of appending a timestamp suffix (which silently creates a
  // duplicate-slug post). The operator can pick a different topic or reject
  // the existing draft.
  const exists = await sql`SELECT 1 FROM draft_posts WHERE slug = ${pick.slug} LIMIT 1`;
  if (exists.length) {
    return json(409, { ok: false, error: "already_exists", slug: pick.slug, message: "This topic is already covered by a post with this slug." });
  }

  const row = await sql`
    INSERT INTO draft_posts (title, slug, category, excerpt, body, meta_desc, model, status)
    VALUES (${pick.title}, ${pick.slug}, ${pick.category}, ${pick.excerpt}, ${pick.body}, ${pick.metaDescription}, ${'gemma2:9b'}, ${'draft'})
    RETURNING id, title, slug, status
  `;

  return json(200, { ok: true, draft: row[0] });
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

// ---------- blog engine health & recovery (admin only) ----------
// Observability for the daily auto-publish cron. Reads blog_cron_runs (the
// table created by migration 023) so the dashboard can see a week of
// qwen_generation_failed / source-extraction failures instead of being blind
// to them. Also reports draft/published counts and the last successful
// publish so the operator can judge whether the engine is healthy.
export async function handleBlogEngineHealth(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const runs = await sql`
    SELECT id, run_date, status, error_code, error_detail, source_url, retried_at, created_at
    FROM blog_cron_runs
    ORDER BY run_date DESC, id DESC
  `.catch(() => []);

  const lastRuns = runs.slice(0, 14);

  // Consecutive failed/partial runs ending at the most recent run_date. Walk
  // back from the newest run and stop at the first 'ok'.
  let consecutiveFailures = 0;
  for (const r of runs) {
    if (r.status === "ok") break;
    consecutiveFailures += 1;
  }

  const lastOkRow = runs.find((r) => r.status === "ok") || null;
  const lastOk = lastOkRow ? { run_date: lastOkRow.run_date, created_at: lastOkRow.created_at } : null;

  const [draftsPending, publishedCount, lastPublishRow] = await Promise.all([
    sql`SELECT count(*)::int AS n FROM draft_posts WHERE status = 'draft'`.catch(() => [{ n: 0 }]),
    sql`SELECT count(*)::int AS n FROM draft_posts WHERE status = 'published'`.catch(() => [{ n: 0 }]),
    sql`
      SELECT title, slug, published_at, ts
      FROM draft_posts
      WHERE status = 'published'
      ORDER BY COALESCE(published_at, ts) DESC
      LIMIT 1
    `.catch(() => []),
  ]);

  const lastPublish = lastPublishRow[0]
    ? {
        title: lastPublishRow[0].title,
        slug: lastPublishRow[0].slug,
        published_at: lastPublishRow[0].published_at || lastPublishRow[0].ts,
      }
    : null;

  return json(200, {
    ok: true,
    lastRuns,
    consecutiveFailures,
    lastOk,
    draftsPending: draftsPending[0]?.n || 0,
    publishedCount: publishedCount[0]?.n || 0,
    lastPublish,
  });
}

// POST — lightweight "acknowledge/retry" marker for failed cron runs. The
// actual regeneration is out of scope; this clears the failure state and
// signals operator intent. Idempotent: re-running just re-stamps retried_at.
//   { source_url? }  → mark that run retried
//   {}               → mark ALL of today's failed/partial runs retried
export async function handleBlogRetry(session, request) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const sourceUrl = String(body?.source_url || "").trim();

  if (sourceUrl) {
    await sql`
      UPDATE blog_cron_runs
      SET retried_at = now()
      WHERE source_url = ${sourceUrl}
    `;
    return json(200, { ok: true, retried: sourceUrl });
  }

  await sql`
    UPDATE blog_cron_runs
    SET retried_at = now()
    WHERE run_date = CURRENT_DATE AND status IN ('failed', 'partial')
  `;
  return json(200, { ok: true, retried: "all" });
}

// ---------- content hygiene (admin only) ----------
// Finds duplicate-slug posts in draft_posts. Groups by the base slug with any
// trailing `-\d{4}` suffix stripped, and returns groups with more than one
// row so the operator can spot collisions (e.g. a base slug plus a
// timestamp-suffixed duplicate).
export async function handleContentHygiene(session) {
  const gate = await requireAdmin(session);
  if (gate) return gate;

  const rows = await sql`
    SELECT id, slug, status, ts
    FROM draft_posts
    ORDER BY ts DESC
  `.catch(() => []);

  const groups = new Map();
  for (const r of rows) {
    const baseSlug = String(r.slug || "").replace(/-\d{4}$/, "");
    if (!baseSlug) continue;
    if (!groups.has(baseSlug)) groups.set(baseSlug, []);
    groups.get(baseSlug).push({
      id: r.id,
      slug: r.slug,
      status: r.status,
      created_at: r.ts,
    });
  }

  const duplicateGroups = [];
  for (const [baseSlug, posts] of groups.entries()) {
    if (posts.length > 1) duplicateGroups.push({ baseSlug, posts });
  }
  duplicateGroups.sort((a, b) => b.posts.length - a.posts.length);

  return json(200, { ok: true, duplicateGroups });
}
