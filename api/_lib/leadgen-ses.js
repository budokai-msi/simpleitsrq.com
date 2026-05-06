// AWS SES v2 send adapter for the lead-gen outreach pipeline.
//
// Why SES (and not Resend / Postmark / etc.)? Cold B2B outreach is gray-zone
// for transactional providers — we already established Resend is forbidden
// for this. SES gives us:
//   - Pay-per-send pricing ($0.10/1k) with no "warmth" pricing tier
//   - Per-domain reputation that we control via our own SPF/DKIM/DMARC
//   - Easy bounce/complaint feedback via SNS topics (wired in v2 follow-up)
//
// Required env vars:
//   AWS_ACCESS_KEY_ID
//   AWS_SECRET_ACCESS_KEY
//   AWS_REGION                       (default us-east-1)
//   LEADGEN_SES_FROM_DEFAULT         e.g. "outreach@outreach.simpleitsrq.com"
//   LEADGEN_PUBLIC_BASE_URL          e.g. "https://simpleitsrq.com"
//   LEADGEN_SES_CONFIG_SET           (optional) SES configuration set name
//                                     for engagement tracking via SNS.
//
// Compliance notes baked in:
//   - Every outgoing message gets a List-Unsubscribe header (RFC 8058
//     one-click) pointing at /api/portal?action=leadgen-u&t=<token>.
//     CAN-SPAM mandates this be honored.
//   - Body is rewritten to inject a 1×1 open-tracking pixel and to route
//     anchor hrefs through a click-tracking redirect — both keyed by
//     per-send open_token / unsubscribe_token, NOT a global secret.
//   - Headers carry X-Campaign-Id and X-Send-Id so when SES SNS bounce
//     notifications arrive we can match them back.
//
// This module is import-safe even when AWS env is missing: the SES client
// is lazy-constructed on first send so cold-start doesn't fail when an
// admin opens the dashboard before ops has plumbed SES.

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const TRANSPARENT_PIXEL_HTML_HINT = "1×1 transparent gif served by /api/portal?action=leadgen-o";

let _client = null;
function client() {
  if (_client) return _client;
  const region = process.env.AWS_REGION || "us-east-1";
  // The SDK pulls AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY from env
  // automatically when no credentials are supplied; we pass region only.
  _client = new SESv2Client({ region });
  return _client;
}

// ---------- template rendering ----------

/**
 * Replace {{placeholder}} tokens. Unknown placeholders pass through as
 * empty strings so a missing field doesn't ship raw "{{first_name}}" in
 * a customer-visible email. Caller is responsible for escaping if the
 * template is HTML.
 */
export function renderTemplate(tmpl, vars) {
  return String(tmpl || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => {
    const v = vars?.[k];
    return v == null ? "" : String(v);
  });
}

// ---------- engagement injection ----------

const escapeAttr = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Build an HTML body from a plain-text template. Adds:
 *   - Newlines preserved with <br>
 *   - All bare URLs rewritten through the click-tracker
 *   - Trailing tracking pixel
 *   - Visible unsubscribe footer (CAN-SPAM physical address sentence
 *     comes from LEADGEN_PHYSICAL_ADDRESS env var; falls back to a
 *     generic "Sarasota, FL" string)
 *
 * The text/plain MIME part is the original template (with click-tracking
 * applied to URLs) so non-HTML clients still see something useful.
 */
function buildBodies({ textTemplate, openToken, unsubscribeToken, baseUrl }) {
  const physicalAddress = process.env.LEADGEN_PHYSICAL_ADDRESS
    || "Simple IT SRQ · Sarasota, FL";

  const unsubUrl = `${baseUrl}/api/portal?action=leadgen-u&t=${encodeURIComponent(unsubscribeToken)}`;
  const pixelUrl = `${baseUrl}/api/portal?action=leadgen-o&t=${encodeURIComponent(openToken)}`;

  // URL → click tracker URL. Link IDs aren't pre-allocated in v1 — the
  // public click handler matches the destination URL against
  // lead_campaign_links and creates a row on first hit. This keeps the
  // sender stateless.
  const wrapClick = (rawUrl) => {
    const u = encodeURIComponent(rawUrl);
    return `${baseUrl}/api/portal?action=leadgen-c&t=${encodeURIComponent(openToken)}&u=${u}`;
  };

  // Plain-text body: rewrite naked http(s):// URLs.
  const text = String(textTemplate || "").replace(
    /\bhttps?:\/\/[^\s<>"')]+/gi,
    (m) => wrapClick(m),
  ) + `\n\n---\nUnsubscribe: ${unsubUrl}\n${physicalAddress}\n`;

  // HTML body: same wrap, plus the pixel and a styled footer.
  const escaped = String(textTemplate || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const linkified = escaped.replace(
    /(https?:\/\/[^\s<>"')]+)/gi,
    (m) => `<a href="${escapeAttr(wrapClick(m))}" style="color:#0F6CBD">${m}</a>`,
  ).replace(/\n/g, "<br>");

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;font-size:14px;line-height:1.5">
<div>${linkified}</div>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0">
<p style="font-size:11px;color:#6b7280">
  ${escapeAttr(physicalAddress)}<br>
  Don't want these? <a href="${escapeAttr(unsubUrl)}" style="color:#6b7280">Unsubscribe</a>.
</p>
<img src="${escapeAttr(pixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px">
</body></html>`;

  return { text, html, unsubUrl };
}

// ---------- public send function ----------

/**
 * Send one outreach email via SES v2.
 *
 * Returns { ok: true, messageId } on success, or { ok: false, error,
 * permanent } on failure. `permanent` is true when retrying would not
 * help (auth error, bad recipient, bad domain) so the caller can flip
 * the send row to 'failed' rather than re-queue.
 */
export async function sendCampaignEmail({
  to, subject, textBody, from, replyTo,
  openToken, unsubscribeToken,
  campaignId, sendId,
}) {
  const fromAddr = from || process.env.LEADGEN_SES_FROM_DEFAULT;
  if (!fromAddr) return { ok: false, error: "LEADGEN_SES_FROM_DEFAULT not set", permanent: true };
  if (!to)       return { ok: false, error: "missing recipient", permanent: true };

  const baseUrl = process.env.LEADGEN_PUBLIC_BASE_URL || "https://simpleitsrq.com";
  const { text, html, unsubUrl } = buildBodies({
    textTemplate: textBody, openToken, unsubscribeToken, baseUrl,
  });

  // Headers map: SESv2 takes a list of { Name, Value }.
  const headers = [
    { Name: "List-Unsubscribe", Value: `<${unsubUrl}>` },
    // RFC 8058 one-click: SES will fire a POST when the recipient client
    // (Gmail, Outlook) honors the header. Our handler ignores POST body.
    { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
    { Name: "X-Campaign-Id", Value: String(campaignId ?? "") },
    { Name: "X-Send-Id",     Value: String(sendId ?? "") },
  ];

  const cmd = new SendEmailCommand({
    FromEmailAddress: fromAddr,
    Destination: { ToAddresses: [to] },
    ReplyToAddresses: replyTo ? [replyTo] : undefined,
    ConfigurationSetName: process.env.LEADGEN_SES_CONFIG_SET || undefined,
    Content: {
      Simple: {
        Subject: { Data: subject || "(no subject)", Charset: "UTF-8" },
        Body: {
          Text: { Data: text, Charset: "UTF-8" },
          Html: { Data: html, Charset: "UTF-8" },
        },
        Headers: headers,
      },
    },
  });

  try {
    const out = await client().send(cmd);
    return { ok: true, messageId: out?.MessageId || null };
  } catch (err) {
    // Classify the failure. SES v2 throws AWS SDK errors with .name.
    const name = String(err?.name || "");
    const permanent = /InvalidParameter|MessageRejected|MailFromDomainNotVerified|SendingPaused|AccessDenied|UnauthorizedOperation/i.test(name);
    return {
      ok: false,
      error: `${name}: ${String(err?.message || err).slice(0, 300)}`,
      permanent,
    };
  }
}

export const _internal = { TRANSPARENT_PIXEL_HTML_HINT };
