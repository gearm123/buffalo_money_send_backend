import { loadConfig, type AppConfig } from "../config.js";
import { createThunesClient } from "../thunesClient.js";
import { mockThunesProxy } from "../mockThunes.js";
import { quoteThbForAmount } from "./fx.js";
import { computePlatformFee } from "./platformFee.js";
import { executeThunesPayoutByTransferId } from "./thunesPayout.js";
import { validateThaiBankAccount } from "./thaiBankAccount.js";
import { RAIL_THUNES_E2E } from "./rail/railIds.js";
import { assertAllowedSourceCountry } from "./sourceCountries.js";
import { getTransfer, saveTransfer } from "./store.js";
import type { TransferRecord } from "./types.js";

const ACCEPT_PREFIX = "/v1/payment";

type Json = Record<string, unknown>;

type PaymentOrderRes = {
  id: string;
  status?: string;
  payment_url?: string;
  external_id?: string;
};

function publicApiBase(): string {
  const u = (process.env.PUBLIC_API_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/$/, "");
  if (u) return u;
  return `http://localhost:${process.env.PORT || 4000}`;
}

function publicWebBase(): string {
  return (process.env.PUBLIC_WEB_APP_URL || "http://localhost:5173").replace(/\/$/, "");
}

async function acceptRequest<T>(
  config: AppConfig,
  method: "GET" | "POST",
  subPath: string,
  body?: unknown
): Promise<T> {
  const path = `${ACCEPT_PREFIX}${subPath}`;
  if (config.useMock) {
    const { status, data } = await mockThunesProxy(
      method,
      path,
      body === undefined ? null : body,
      undefined
    );
    if (status >= 400) {
      throw new Error(typeof data === "object" ? JSON.stringify(data) : String(data));
    }
    return data as T;
  }
  const client = createThunesClient(config);
  if (method === "GET") {
    return (await client.get<T>(path)) as T;
  }
  return (await client.post<T>(path, body)) as T;
}

function normalizeOrderStatus(s: string | undefined): string {
  return (s || "").toUpperCase().replace(/\s/g, "_");
}

export async function getThunesCollectionOrder(orderId: string): Promise<PaymentOrderRes> {
  const config = loadConfig();
  return acceptRequest<PaymentOrderRes>(config, "GET", `/payment-orders/${encodeURIComponent(orderId)}`);
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

/**
 * Create transfer + Thunes Accept payment order (REDIRECT or mock-instant CHARGED).
 * Your margin is in `totalCharged - amountSend`; Thunes MT still sends `amountSend` to TH.
 */
export async function createTransferWithThunesCollection(input: CreateInput) {
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

  const acctCheck = validateThaiBankAccount(input.thaiBankCode, input.thaiAccountNumber);
  if (!acctCheck.ok) {
    throw new Error(acctCheck.error);
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
    sender: { fullName: input.senderName, email: input.senderEmail },
    thaiRecipient: {
      fullName: input.recipientName,
      bankCode: input.thaiBankCode,
      accountNumber: input.thaiAccountNumber.replace(/\s/g, ""),
    },
    paymentIntentId: null,
    railId: RAIL_THUNES_E2E,
    collectionOrderId: null,
    status: "awaiting_payment",
  };

  const config = loadConfig();
  const merchantId = process.env.THUNES_ACCEPT_MERCHANT_ID || (config.useMock ? "mock_merchant" : "");
  const paymentPageId = process.env.THUNES_ACCEPT_PAYMENT_PAGE_ID || (config.useMock ? "mock_card_page" : "");

  if (!config.useMock && (!merchantId || !paymentPageId)) {
    throw new Error(
      "Set THUNES_ACCEPT_MERCHANT_ID and THUNES_ACCEPT_PAYMENT_PAGE_ID from the Thunes Portal (card payment page)."
    );
  }

  const apiBase = publicApiBase();
  const webBase = publicWebBase();
  const parts = input.senderName.trim().split(/\s+/);
  const firstName = parts[0] || "Sender";
  const lastName = parts.slice(1).join(" ") || firstName;

  const orderBody: Json = {
    type: "C2B",
    requested: {
      amount: Number(totalCharged.toFixed(2)),
      currency: record.fromCurrency,
    },
    external_id: id,
    merchant_id: merchantId,
    merchant_urls: {
      return_url: `${webBase}/?transferReturn=1&transferId=${encodeURIComponent(id)}`,
      notification_url: `${apiBase}/api/thunes/accept/notification`,
      error_url: `${webBase}/?transferError=1&transferId=${encodeURIComponent(id)}`,
      aborted_url: `${webBase}/?transferAborted=1&transferId=${encodeURIComponent(id)}`,
    },
    payment_page_id: paymentPageId,
    integration_mode: "REDIRECT",
    merchant_order: {
      total: { amount: Number(totalCharged.toFixed(2)), currency: record.fromCurrency },
      customer: {
        email: input.senderEmail,
        first_name: firstName,
        last_name: lastName,
      },
      /** Same alpha-3 code as MT quotation `source.country_iso_code`. */
      searchable_custom_data_1: fromCountryU,
    },
  };

  const created = (await acceptRequest<PaymentOrderRes>(config, "POST", "/payment-orders", orderBody)) as PaymentOrderRes;
  const orderId = String(created.id ?? "");
  if (!orderId) {
    throw new Error("Thunes payment order missing id");
  }

  record.collectionOrderId = orderId;
  saveTransfer(record);

  const status = normalizeOrderStatus(created.status);
  const paymentUrl =
    typeof created.payment_url === "string" && created.payment_url.length > 0 ? created.payment_url : null;

  return {
    transfer: record,
    thunesOrderId: orderId,
    /** If null and status already CHARGED (mock), complete on the client without redirect. */
    paymentUrl,
    orderStatus: status,
  };
}

/**
 * After Thunes shows payment as CHARGED, run Money Transfer to Thailand.
 */
export async function completeThunesByTransferId(transferId: string) {
  const t = getTransfer(transferId);
  if (!t) {
    return { ok: false as const, error: "Transfer not found" };
  }
  if (!t.collectionOrderId) {
    return { ok: false as const, error: "Not a collection-order transfer" };
  }

  const order = await getThunesCollectionOrder(t.collectionOrderId);
  const st = normalizeOrderStatus(order.status);
  if (st !== "CHARGED" && st !== "COMPLETED" && st !== "PAID") {
    return { ok: false as const, error: `Thunes order not paid yet (status: ${order.status ?? "unknown"})` };
  }

  await executeThunesPayoutByTransferId(transferId);
  const t2 = getTransfer(transferId);
  return { ok: true as const, transfer: t2 ?? t };
}
