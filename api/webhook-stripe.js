import Stripe from "stripe";
import { sql } from "./_lib/db.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2023-10-16",
});

function parseLeadgenCheckoutReference(value) {
  const raw = value || "";
  if (!raw) return {};
  const parts = raw.split("_").filter(Boolean);
  const parsed = {};
  if (parts.includes("growth")) parsed.tier = "growth";
  else if (parts.includes("pro")) parsed.tier = "pro";
  else if (parts.includes("sample") || parts.includes("free")) parsed.tier = "sample";
  
  if (parts.includes("annual")) parsed.cadence = "annual";
  else if (parts.includes("monthly")) parsed.cadence = "monthly";
  
  const readAfter = (key) => {
    const index = parts.indexOf(key);
    return index >= 0 ? parts[index + 1] : "";
  };
  
  const zip = readAfter("zip");
  if (/^\d{5}$/.test(zip)) parsed.zip = zip;
  
  const kept = readAfter("kept");
  if (/^\d+$/.test(kept)) parsed.kept = kept;
  
  const nicheIndex = parts.indexOf("niche");
  if (nicheIndex >= 0) {
    const stopKeys = new Set(["kept", "cap", "src"]);
    const nicheParts = [];
    for (let i = nicheIndex + 1; i < parts.length; i++) {
      if (stopKeys.has(parts[i])) break;
      nicheParts.push(parts[i]);
    }
    if (nicheParts.length > 0) parsed.niche = nicheParts.join(" ");
  }
  return parsed;
}

export async function POST(request) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("[webhook-stripe] Missing STRIPE_WEBHOOK_SECRET");
    return new Response("Missing STRIPE_WEBHOOK_SECRET", { status: 500 });
  }

  const sig = request.headers.get("stripe-signature");
  let event;
  
  try {
    const bodyText = await request.text();
    event = stripe.webhooks.constructEvent(bodyText, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[webhook-stripe] Signature verification failed:", err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const clientRef = session.client_reference_id || "";
    
    if (clientRef.startsWith("lg_")) {
      const details = parseLeadgenCheckoutReference(clientRef);
      const email = session.customer_details?.email || "unknown@example.com";
      const name = session.customer_details?.name || "Unknown Customer";
      
      const ticketCode = `LG-OB-${Date.now().toString(36).toUpperCase()}`;
      const subject = `Leadgen Onboarding: ${name} (${details.tier || "Unknown"} ${details.cadence || ""})`;
      
      const description = \`
New Leadgen purchase completed via Stripe!

Customer: \${name}
Email: \${email}
Tier: \${details.tier || "Unknown"}
Billing: \${details.cadence || "Unknown"}
Target Zip: \${details.zip || "Not specified"}
Target Niche: \${details.niche || "Not specified"}
Stripe Session ID: \${session.id}

Please reach out to the customer to set up their workspace or execute their initial scan.
      \`.trim();

      try {
        await sql\`
          INSERT INTO tickets (
            ticket_code, user_id, email, name, company, phone,
            priority, category, subject, description, status
          ) VALUES (
            \${ticketCode}, NULL, \${email}, \${name}, '', '',
            'high', 'support', \${subject}, \${description}, 'open'
          )
        \`;
        console.log(\`[webhook-stripe] Created onboarding ticket \${ticketCode} for \${email}\`);
      } catch (e) {
        console.error("[webhook-stripe] Failed to create ticket:", e);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
