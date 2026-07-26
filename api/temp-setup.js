import Stripe from "stripe";
import { json } from "./_lib/http.js";

export async function GET(request) {
  try {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return json(500, { error: "No STRIPE_SECRET_KEY" });
    const stripe = new Stripe(key, { apiVersion: "2023-10-16" });

    const newEndpoint = await stripe.webhookEndpoints.create({
      url: "https://simpleitsrq.com/api/webhook-stripe",
      enabled_events: ["checkout.session.completed"],
      description: "Leadgen Webhook (auto-created)",
    });

    return json(200, { ok: true, secret: newEndpoint.secret, id: newEndpoint.id });
  } catch (err) {
    return json(500, { error: err.message });
  }
}
