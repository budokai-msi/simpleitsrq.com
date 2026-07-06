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

import { getSession } from "./_lib/session.js";
import { json } from "./_lib/http.js";
import { csrfValid, originAllowed } from "./_lib/csrf.js";
import { timingSafeEqual } from "node:crypto";
import {
  handleMeGet,
  handleMePatch,
  handleExportData,
  handleDeleteAccount,
  handleInvoices,
} from "./_lib/portal/me.js";
import {
  handleTickets,
  handleTicket,
  handleTicketPatch,
  handleTicketMessage,
  handleTicketCc,
  handleTicketAppointment,
  handleTicketAppointmentCancel,
  handleIcs,
  handleInboundEmail,
} from "./_lib/portal/tickets.js";
import {
  handleVisitors,
  handleBehaviorInsights,
  handleInvestigateIp,
  handleThreatIntel,
  handleEnumIntel,
  handleCredIntel,
  handleGeoIntel,
  handleAdsenseHealth,
  handleCountermeasures,
  handleGrantImmunity,
  handleOpsStatus,
  handleOsintStatus,
  handleOsintRefresh,
  handleHoneypotCreds,
  handleBlockIp,
} from "./_lib/portal/intel.js";
import {
  handleAdminStatus,
  handleHealth,
  handleAuditVerify,
  handleRunAuditMigration,
  handleRunTicketMigration,
  handleResetAuditChain,
} from "./_lib/portal/ops.js";
import {
  handleTestimonialsList,
  handleTestimonialSave,
  handleTestimonialDelete,
  handleDrafts,
  handlePublishDraft,
  handleRejectDraft,
  handleNewsletterCount,
  handleNewsletterSend,
  handleGithubHealth,
} from "./_lib/portal/content.js";
import {
  handleRevenueSignals,
  handleAffiliateStats,
  handleRevenueSummary,
  handleCreateInvoice,
  handleSendInvoice,
} from "./_lib/portal/revenue.js";
import {
  handleLeadgenStatus,
  handleLeadgenInsights,
  handleLeadgenDiscover,
  handleLeadgenCrawlEmails,
  handleLeadgenBusinesses,
  handleLeadgenBusinessDetail,
  handleLeadgenBusinessUpdate,
  handleLeadgenReclassify,
  handleLeadgenExport,
  handleLeadgenAi,
  handleLeadgenBrevoSync,
  handleLeadgenCampaigns,
  handleLeadgenCampaignSave,
  handleLeadgenCampaignSetStatus,
  handleLeadgenCampaignStart,
  handleLeadgenCampaignTest,
  handleLeadgenCampaignSends,
  handleLeadgenJobs,
  handleLeadgenRunJobs,
  handleLeadgenOpenPixel,
  handleLeadgenClick,
  handleLeadgenUnsubscribe,
} from "./_lib/portal/leadgen.js";
import {
  handleOpsecData,
  handleOpsecHuntBrief,
  handleOpsecDomainAdd,
  handleOpsecDomainToggle,
  handleOpsecIocAdd,
  handleOpsecIocToggle,
  handleOpsecNoteSave,
  handleOpsecNoteDelete,
} from "./_lib/portal/opsec.js";
import {
  handleHotLeads,
  handleLeadIntel,
  handleLeadsInbox,
  handleLeadStatus,
} from "./_lib/portal/leads.js";

// Vercel function config: lead-gen Discover + Crawl run their workers
// inline (Overpass + outbound HTTP fetches), so we need the higher
// 60s budget instead of the 10s Hobby default.
export const config = { maxDuration: 60 };

async function requireSession(request) {
  const session = await getSession(request);
  if (!session) return { error: json(401, { ok: false, error: "unauthorized" }) };
  return { session };
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
  "run-ticket-migration",
  "leadgen-reclassify",
  "leadgen-run-jobs",
  "leadgen-discover",
  "leadgen-crawl-emails",
  "leadgen-business-update",
  "leadgen-ai",
  // opsec portal — defensive personal ops dashboard
  "opsec-data",
  "opsec-hunt-brief",
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

// ---------- entry points ----------
// CSRF is enforced in two layers:
//   1. csrfCheck() — Origin must be present AND match an allowed host.
//      Browsers always set Origin on cross-origin non-GET fetches, so a
//      missing Origin on a mutation is itself a CSRF signal. GET skips.
//   2. csrfValid() (from _lib/csrf.js) — double-submit cookie pattern;
//      mutating requests must echo the `sit_csrf` cookie back as the
//      `x-csrf-token` header.
// Both must pass for any mutation. Defense in depth.
function csrfCheck(request, method) {
  if (method === "GET") return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return originAllowed(origin);
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

  // Inbound email webhook (Resend `email.received`). Signature-verified, no
  // session/CSRF. Customer replies to a ticket land here.
  if (action === "inbound-email" && method === "POST") return handleInboundEmail(request);

  // Public .ics download. Token-gated by a signed ?t= so the link in the
  // customer's appointment email works without a portal login.
  if (action === "ics" && method === "GET") return handleIcs(url);

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
  if (action === "ticket-cc"       && method === "POST")  return handleTicketCc(session, request);
  if (action === "ticket-appointment"        && method === "POST") return handleTicketAppointment(session, request);
  if (action === "ticket-appointment-cancel" && method === "POST") return handleTicketAppointmentCancel(session, request);
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
  if (action === "run-ticket-migration" && method === "POST") return handleRunTicketMigration(session);
  if (action === "reset-audit-chain"    && method === "POST") return handleResetAuditChain(session);
  if (action === "osint-status"         && method === "GET")  return handleOsintStatus(session);
  if (action === "ops-status"           && method === "GET")  return handleOpsStatus(session);
  if (action === "countermeasures"      && method === "GET")  return handleCountermeasures(session);
  if (action === "revenue-signals"      && method === "GET")  return handleRevenueSignals(session);
  if (action === "behavior-insights"    && method === "GET")  return handleBehaviorInsights(session);
  if (action === "hot-leads"            && method === "GET")  return handleHotLeads(session);
  if (action === "lead-intel"           && method === "GET")  return handleLeadIntel(session);
  if (action === "leads-inbox"          && method === "GET")  return handleLeadsInbox(session, url);
  if (action === "lead-status"          && method === "POST") return handleLeadStatus(session, request);
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
  if (action === "opsec-hunt-brief"    && method === "GET")  return handleOpsecHuntBrief(session);
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
