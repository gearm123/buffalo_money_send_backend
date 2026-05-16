import { loadConfig } from "../config.js";
import { createRiaCollectionOrder, getRiaCollectionOrder, normalizeRiaStatus, writeRiaCreateLedger } from "../ria/service.js";
import { quoteThbForAmount } from "./fx.js";
import { computePlatformFee } from "./platformFee.js";
import { executeRiaPayoutByTransferId } from "./riaPayout.js";
import { RAIL_RIA_E2E } from "./rail/railIds.js";
import { assertAllowedSourceCountry } from "./sourceCountries.js";
import { validateThaiBankAccount } from "./thaiBankAccount.js";
import { getTransfer, saveTransfer } from "./store.js";
import type { TransferRecord } from "./types.js";

type Json = Record<string, unknown>;

function publicApiBase(): string {
  const value = (process.env.PUBLIC_API_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/$/, "");
  if (value) return value;
  return `http://localhost:${process.env.PORT || 4000}`;
}

function publicWebBase(): string {
  return (process.env.PUBLIC_WEB_APP_URL || "http://localhost:5173").replace(/\/$/, "");
}

type CreateInput = {
  fromCountry: string;
  toCountry: string;
  fromCurrency: string;
  amount: number;
  senderName: string;
  senderEmail: string;
  senderPhone?: string;
  recipientName: string;
  thaiBankCode: string;
  thaiAccountNumber: string;
  recipientBankName?: string;
  deliveryMethod?: "bank" | "cash" | "wallet";
  recipientPhone?: string;
  payoutCity?: string;
  billingAddress1?: string;
  billingAddress2?: string;
  billingCity?: string;
  billingState?: string;
  billingPostalCode?: string;
  returnPath?: string;
  flowMode?: "public" | "partner";
};

function normalizeReturnPath(value: string | undefined) {
  const trimmed = (value || "/").trim();
  if (!trimmed.startsWith("/")) return "/";
  if (trimmed.startsWith("//")) return "/";
  return trimmed;
}

export async function getRiaCollectionStatus(orderId: string) {
  return getRiaCollectionOrder(orderId);
}

export async function createTransferWithRiaCollection(input: CreateInput) {
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

  const fromCountryU = input.fromCountry.toUpperCase().trim();
  assertAllowedSourceCountry(fromCountryU);

  const accountCheck = validateThaiBankAccount(input.thaiBankCode, input.thaiAccountNumber);
  if (!accountCheck.ok) {
    throw new Error(accountCheck.error);
  }

  const { thbReceive, rate } = quoteThbForAmount(input.amount, input.fromCurrency);
  const { platformFee, totalCharged } = computePlatformFee(input.amount);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const record: TransferRecord = {
    id,
    createdAt: now,
    fromCountry: fromCountryU,
    toCountry: "THA",
    fromCurrency: input.fromCurrency.toUpperCase(),
    amountSend: input.amount,
    platformFee,
    totalCharged,
    thbReceiveEstimate: thbReceive,
    fxRateUsed: rate,
    sender: {
      fullName: input.senderName,
      email: input.senderEmail,
      phone: input.senderPhone || undefined,
      billingAddress1: input.billingAddress1 || undefined,
      billingAddress2: input.billingAddress2 || undefined,
      billingCity: input.billingCity || undefined,
      billingState: input.billingState || undefined,
      billingPostalCode: input.billingPostalCode || undefined,
    },
    thaiRecipient: {
      fullName: input.recipientName,
      bankCode: input.thaiBankCode,
      accountNumber: input.thaiAccountNumber.replace(/\s/g, ""),
      bankName: input.recipientBankName || undefined,
      deliveryMethod: input.deliveryMethod || "bank",
      phone: input.recipientPhone || undefined,
      payoutCity: input.payoutCity || undefined,
    },
    paymentIntentId: null,
    railId: RAIL_RIA_E2E,
    collectionOrderId: null,
    status: "awaiting_payment",
    flowMode: input.flowMode || "public",
  };

  const config = loadConfig();
  const merchantId = process.env.RIA_COLLECTION_MERCHANT_ID || (config.useMock ? "ria_mock_merchant" : "");
  const paymentPageId = process.env.RIA_COLLECTION_PAGE_ID || (config.useMock ? "ria_mock_checkout" : "");

  if (!config.useMock && (!merchantId || !paymentPageId)) {
    throw new Error("Set RIA_COLLECTION_MERCHANT_ID and RIA_COLLECTION_PAGE_ID, or run in RIA_USE_MOCK=true.");
  }

  const webBase = publicWebBase();
  const apiBase = publicApiBase();
  const returnPath = normalizeReturnPath(input.returnPath);
  const senderParts = input.senderName.trim().split(/\s+/);
  const firstName = senderParts[0] || "Sender";
  const lastName = senderParts.slice(1).join(" ") || firstName;

  const orderBody: Json = {
    type: "C2C",
    requested: {
      amount: Number(totalCharged.toFixed(2)),
      currency: record.fromCurrency,
    },
    external_id: id,
    merchant_id: merchantId,
    merchant_urls: {
      return_url: `${webBase}${returnPath}?transferReturn=1&transferId=${encodeURIComponent(id)}`,
      notification_url: `${apiBase}/api/ria/collection/notification`,
      error_url: `${webBase}${returnPath}?transferError=1&transferId=${encodeURIComponent(id)}`,
      aborted_url: `${webBase}${returnPath}?transferAborted=1&transferId=${encodeURIComponent(id)}`,
    },
    payment_page_id: paymentPageId,
    integration_mode: "REDIRECT",
    customer: {
      email: input.senderEmail,
      first_name: firstName,
      last_name: lastName,
      source_country_iso_code: fromCountryU,
    },
  };

  const created = await createRiaCollectionOrder(orderBody, record.id);
  const orderId = String(created.id ?? "");
  if (!orderId) {
    throw new Error("Ria collection order missing id");
  }

  record.collectionOrderId = orderId;
  await saveTransfer(record);
  await writeRiaCreateLedger(record.id, orderId);

  return {
    transfer: record,
    riaOrderId: orderId,
    paymentUrl: typeof created.payment_url === "string" && created.payment_url ? created.payment_url : null,
    orderStatus: normalizeRiaStatus(created.status),
  };
}

export async function completeRiaByTransferId(transferId: string) {
  const transfer = await getTransfer(transferId);
  if (!transfer) {
    return { ok: false as const, error: "Transfer not found" };
  }
  if (!transfer.collectionOrderId) {
    return { ok: false as const, error: "Not a collection-order transfer" };
  }

  const order = await getRiaCollectionOrder(transfer.collectionOrderId, transfer.id);
  const status = normalizeRiaStatus(order.status);
  if (status !== "PAID" && status !== "COMPLETED") {
    return { ok: false as const, error: `Ria order not paid yet (status: ${order.status ?? "unknown"})` };
  }

  await executeRiaPayoutByTransferId(transferId);
  const refreshed = await getTransfer(transferId);
  return { ok: true as const, transfer: refreshed ?? transfer };
}
