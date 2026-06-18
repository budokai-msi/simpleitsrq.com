// Cloudflare Email Worker — inbound ticket replies for Simple IT SRQ.
//
// Bind this as the Email Routing **catch-all** action for simpleitsrq.com.
// When a customer replies to a ticket email, it's addressed to
// reply+TICKET.sig@simpleitsrq.com; this Worker forwards that raw message to
// our webhook, which threads it onto the ticket. Anything that is NOT a ticket
// reply (e.g. mail to other addresses that fall through to catch-all) is
// forwarded to the normal mailbox, so existing email behavior is preserved.
//
// Free: Email Routing + Workers free tier easily cover ticket-reply volume.
//
// Required Worker variables (Workers & Pages → this Worker → Settings →
// Variables and Secrets):
//   INBOUND_API_URL  = https://simpleitsrq.com/api/portal?action=inbound-email
//   INBOUND_SECRET   = <same random value as INBOUND_SHARED_SECRET in Vercel>  (encrypt it)
//   FORWARD_TO       = ivanovspccenter@gmail.com  (must be a verified Email Routing destination)
//
// Setup: Cloudflare dashboard → your domain → Email → Email Routing →
//   1. Email Workers → Create → paste this file → Deploy.
//   2. Routing rules → Catch-all address → action "Send to a Worker" → this Worker.
//   (Your explicit hello@ → Gmail rule keeps priority over the catch-all.)

export default {
  async email(message, env) {
    const to = String(message.to || "").toLowerCase();
    const isTicketReply = /reply\+[^@]+@/.test(to);

    if (!isTicketReply) {
      // Not a ticket reply — preserve normal delivery.
      if (env.FORWARD_TO) {
        try { await message.forward(env.FORWARD_TO); } catch { /* destination must be verified */ }
      }
      return;
    }

    if (!env.INBOUND_API_URL || !env.INBOUND_SECRET) {
      // Misconfigured — don't lose the mail.
      if (env.FORWARD_TO) { try { await message.forward(env.FORWARD_TO); } catch { /* noop */ } }
      return;
    }

    // Read the full raw RFC 822 message; the server parses out the body.
    let raw = "";
    try { raw = await new Response(message.raw).text(); } catch { /* best effort */ }

    const payload = {
      to: message.to,
      from: message.headers.get("from") || "",
      subject: message.headers.get("subject") || "",
      messageId: message.headers.get("message-id") || "",
      raw,
    };

    try {
      const res = await fetch(env.INBOUND_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-inbound-secret": env.INBOUND_SECRET,
        },
        body: JSON.stringify(payload),
      });
      // If the webhook rejects/errors, fall back to forwarding so the customer's
      // reply is never silently dropped.
      if (!res.ok && env.FORWARD_TO) {
        try { await message.forward(env.FORWARD_TO); } catch { /* noop */ }
      }
    } catch {
      if (env.FORWARD_TO) { try { await message.forward(env.FORWARD_TO); } catch { /* noop */ } }
    }
  },
};
