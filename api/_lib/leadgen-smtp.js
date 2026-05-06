// Generic SMTP send adapter for the lead-gen outreach pipeline.
//
// Provider-agnostic: any SMTP server works. Tested mental model is:
//   - Mailgun       (smtp.mailgun.org:587, allows cold B2B outreach)
//   - Brevo         (smtp-relay.brevo.com:587, allows cold B2B)
//   - Scaleway TEM  (smtp.tem.scaleway.com:587)
//   - Zoho ZeptoMail, Postmark, SMTP2GO, etc.
//   - Self-hosted Postfix
//
// Required env vars (all SMTP_*):
//   SMTP_HOST                e.g. smtp.mailgun.org
//   SMTP_PORT                e.g. 587 (STARTTLS) or 465 (TLS)
//   SMTP_USER
//   SMTP_PASS
//   SMTP_SECURE              "true" only when port=465 (implicit TLS)
//
// Lead-gen specific:
//   LEADGEN_SMTP_FROM_DEFAULT  e.g. "Simple IT SRQ <outreach@outreach.simpleitsrq.com>"
//   LEADGEN_PUBLIC_BASE_URL    e.g. "https://simpleitsrq.com"
//   LEADGEN_PHYSICAL_ADDRESS   CAN-SPAM postal address footer string
//
// Compliance baked in (same as the SES version this replaces):
//   - List-Unsubscribe + List-Unsubscribe-Post (RFC 8058 one-click)
//   - Visible "Unsubscribe" link in body footer
//   - 1×1 open-tracking pixel keyed to per-send open_token
//   - All anchors rewritten through a click-tracking redirect
//   - X-Campaign-Id / X-Send-Id headers for bounce correlation
//
// The transporter is lazy-constructed so cold-start doesn't fail when an
// admin opens the dashboard before ops has plumbed SMTP.

import nodemailer from "nodemailer";

let _transporter = null;
function transporter() {
  if (_transporter) return _transporter;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    throw new Error("SMTP_HOST / SMTP_USER / SMTP_PASS not configured");
  }
  // Implicit TLS only on port 465 (or when SMTP_SECURE=true). Everything
  // else uses STARTTLS via nodemailer's auto upgrade.
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  _transporter = nodemailer.createTransport({
    host, port, secure,
    auth: { user, pass },
    // Pool keeps connections open across sends in the same cron tick.
    pool: true,
    maxConnections: 2,
    maxMessages: 50,
  });
  return _transporter;
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
 * Build text + HTML bodies from a plain-text template. Adds open pixel,
 * click-tracking link rewrites, unsubscribe footer.
 */
function buildBodies({ textTemplate, openToken, unsubscribeToken, baseUrl }) {
  const physicalAddress = process.env.LEADGEN_PHYSICAL_ADDRESS
    || "Simple IT SRQ · Sarasota, FL";

  const unsubUrl = `${baseUrl}/api/portal?action=leadgen-u&t=${encodeURIComponent(unsubscribeToken)}`;
  const pixelUrl = `${baseUrl}/api/portal?action=leadgen-o&t=${encodeURIComponent(openToken)}`;

  // URL → click-tracker URL. Link IDs aren't pre-allocated; the public
  // click handler upserts a lead_campaign_links row on first hit.
  const wrapClick = (rawUrl) => {
    const u = encodeURIComponent(rawUrl);
    return `${baseUrl}/api/portal?action=leadgen-c&t=${encodeURIComponent(openToken)}&u=${u}`;
  };

  const text = String(textTemplate || "").replace(
    /\bhttps?:\/\/[^\s<>"')]+/gi,
    (m) => wrapClick(m),
  ) + `\n\n---\nUnsubscribe: ${unsubUrl}\n${physicalAddress}\n`;

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

// Errors classified as 'permanent' should NOT be retried. Anything else
// stays on the queue for the next cron tick.
function classifyError(err) {
  const msg = String(err?.message || err || "");
  // SMTP 5xx codes = permanent reject. Standard nodemailer surface:
  // err.responseCode is the numeric SMTP reply code.
  const code = err?.responseCode;
  if (code && code >= 500 && code < 600) return true;
  if (/EAUTH|EENVELOPE|invalid recipient|550|553|554|user unknown|no such user/i.test(msg)) return true;
  return false;
}

// ---------- public send function ----------

/**
 * Send one outreach email via SMTP. Returns
 *   { ok: true, messageId } on success
 *   { ok: false, error, permanent } on failure
 */
export async function sendCampaignEmail({
  to, subject, textBody, from, replyTo,
  openToken, unsubscribeToken,
  campaignId, sendId,
}) {
  const fromAddr = from || process.env.LEADGEN_SMTP_FROM_DEFAULT;
  if (!fromAddr) return { ok: false, error: "LEADGEN_SMTP_FROM_DEFAULT not set", permanent: true };
  if (!to)       return { ok: false, error: "missing recipient", permanent: true };

  const baseUrl = process.env.LEADGEN_PUBLIC_BASE_URL || "https://simpleitsrq.com";
  const { text, html, unsubUrl } = buildBodies({
    textTemplate: textBody, openToken, unsubscribeToken, baseUrl,
  });

  try {
    const out = await transporter().sendMail({
      from: fromAddr,
      to,
      replyTo: replyTo || undefined,
      subject: subject || "(no subject)",
      text,
      html,
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>`,
        // RFC 8058 one-click: providers that honor this will POST the
        // unsubscribe instead of waiting for the user to click.
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        "X-Campaign-Id": String(campaignId ?? ""),
        "X-Send-Id": String(sendId ?? ""),
      },
    });
    return { ok: true, messageId: out?.messageId || null };
  } catch (err) {
    return {
      ok: false,
      error: String(err?.message || err).slice(0, 300),
      permanent: classifyError(err),
    };
  }
}
