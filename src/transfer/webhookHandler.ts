import Stripe from "stripe";
import { getStripe, markPaidFromIntent } from "./stripeTransfer.js";

export async function handleStripeWebhook(body: Buffer, signature: string | undefined) {
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripe = getStripe();
  if (!stripe || !whSecret || !signature) {
    return { kind: "err" as const, message: "Webhook not configured", status: 500 };
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, whSecret);
  } catch (e) {
    return { kind: "err" as const, message: String(e), status: 400 };
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    await markPaidFromIntent(pi.id);
  }

  return { kind: "ok" as const, status: 200 };
}
