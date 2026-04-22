import Stripe from "stripe";
import { quoteThbForAmount } from "./fx.js";
import { getTransfer, getTransferByPaymentIntent, saveTransfer } from "./store.js";
import type { TransferRecord } from "./types.js";

const STRIPE = process.env.STRIPE_SECRET_KEY;

function getStripe() {
  if (!STRIPE) return null;
  return new Stripe(STRIPE);
}

export function stripeIsConfigured() {
  return Boolean(STRIPE);
}

type CreateInput = {
  fromCountry: string;
  toCountry: string;
  fromCurrency: string;
  amount: number;
  senderName: string;
  senderEmail: string;
  recipientName: string;
  thaiBankCode: string;
  thaiAccountNumber: string;
};

export async function createTransferWithPaymentIntent(input: CreateInput) {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error("STRIPE_SECRET_KEY is not set in server environment");
  }

  const ccy = input.fromCurrency.toLowerCase();
  if (!["usd", "eur", "gbp"].includes(ccy)) {
    throw new Error("fromCurrency must be USD, EUR, or GBP for this demo");
  }

  if (input.amount < 1 || input.amount > 15_000) {
    throw new Error("Amount must be between 1 and 15000 (demo limits)");
  }

  if (input.toCountry !== "THA" && input.toCountry !== "TH") {
    throw new Error("Receiver country must be Thailand (THA) for this product");
  }

  const { thbReceive, rate } = quoteThbForAmount(input.amount, input.fromCurrency);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const record: TransferRecord = {
    id,
    createdAt: now,
    fromCountry: input.fromCountry,
    toCountry: "THA",
    fromCurrency: input.fromCurrency.toUpperCase(),
    amountSend: input.amount,
    thbReceiveEstimate: thbReceive,
    fxRateUsed: rate,
    sender: { fullName: input.senderName, email: input.senderEmail },
    thaiRecipient: {
      fullName: input.recipientName,
      bankCode: input.thaiBankCode,
      accountNumber: input.thaiAccountNumber.replace(/\s/g, ""),
    },
    paymentIntentId: null,
    status: "awaiting_payment",
  };

  const amountMinor = Math.round(input.amount * 100);

  const pi = await stripe.paymentIntents.create({
    amount: amountMinor,
    currency: ccy,
    automatic_payment_methods: { enabled: true },
    metadata: {
      transfer_id: id,
      to_country: "THA",
      thb_est: String(thbReceive),
      bank_code: input.thaiBankCode,
      account_last4: input.thaiAccountNumber.replace(/\D/g, "").slice(-4),
    },
    receipt_email: input.senderEmail,
    description: `Remittance to TH — ${input.recipientName} (${input.thaiBankCode})`.slice(0, 999),
  });

  record.paymentIntentId = pi.id;
  saveTransfer(record);

  return { transfer: record, clientSecret: pi.client_secret };
}

export async function markPaidFromIntent(paymentIntentId: string) {
  const stripe = getStripe();
  if (!stripe) return;

  const t = getTransferByPaymentIntent(paymentIntentId);
  if (!t) return;

  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (pi.status !== "succeeded") return;

  t.status = "payout_queued_simulation";
  t.lastError = undefined;
  saveTransfer(t);
}

export async function completeTransferClientSide(paymentIntentId: string) {
  const stripe = getStripe();
  if (!stripe) {
    return { ok: false as const, error: "Stripe not configured" };
  }
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (pi.status !== "succeeded") {
    return { ok: false as const, error: `Payment status: ${pi.status}` };
  }
  const id = typeof pi.metadata.transfer_id === "string" ? pi.metadata.transfer_id : null;
  if (!id) {
    return { ok: false as const, error: "Missing transfer_id on PaymentIntent" };
  }
  const t = getTransfer(id);
  if (!t) {
    return { ok: false as const, error: "Transfer not found" };
  }
  t.status = "payout_queued_simulation";
  t.lastError = undefined;
  saveTransfer(t);
  return { ok: true as const, transfer: t };
}

export { getStripe };
