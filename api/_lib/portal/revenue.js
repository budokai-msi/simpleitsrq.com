// api/_lib/portal/revenue.js
//
// Revenue/billing /api/portal actions: revenue-signals, affiliate-stats,
// revenue-summary, and the Stripe invoice pair create-invoice/send-invoice.

import Stripe from "stripe";
import { sql } from "../db.js";
import { json } from "../http.js";
import { requireAdmin } from "./shared.js";

// Revenue Signals: what's earning money. Combines three inputs:
//   1. Blog traffic — visits to /blog/:slug grouped by post in last 30 days
//   2. Affiliate clicks — outbound affiliate-link clicks grouped by slug + network
// Intentionally lightweight — all data already lives in the visits + new
// affiliate_clicks tables, so this is just aggregate queries.
export async function handleRevenueSignals(session) {
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


// Stripe revenue summary for the last 30 days + active subscriptions.
// Pulls paid invoices and active subscriptions directly from Stripe so
// the admin panel reflects the live account state (no local cache). When
// STRIPE_SECRET_KEY is unset, returns a `stripe_not_configured` shape so
// the widget can show a "Stripe not configured" pill instead of 500-ing.
// Per-network + per-day affiliate click counts for the last N days.
// Internal affiliate stats endpoint. Admin-gated. Pure SELECT —
// no Stripe call, no upstream API, just the affiliate_clicks table.
export async function handleAffiliateStats(session, url) {
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

export async function handleRevenueSummary(session) {
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

// ---------- stripe invoices (admin only, two-step draft→send) ----------

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export async function handleCreateInvoice(session, request) {
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

export async function handleSendInvoice(session, request) {
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
