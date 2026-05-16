import { saveLedgerEntry } from "../accounting/store.js";
import { loadConfig } from "../config.js";
import { mockRiaProxy } from "../mockRia.js";
import { createRiaClient, RIA_COLLECTION_PREFIX, RIA_PAYOUT_PREFIX } from "../riaClient.js";
import { getTransfer, getTransferByCollectionOrderId } from "../transfer/store.js";
import {
  getRiaCollectionOrderById,
  markRiaNotificationProcessed,
  saveRiaNotification,
  upsertRiaCollectionOrder,
  upsertRiaPayoutQuote,
  upsertRiaPayoutTransfer,
} from "./store.js";

type Json = Record<string, unknown>;

export type RiaCollectionOrderResponse = {
  id: string;
  external_id?: string;
  status?: string;
  requested?: { amount?: number | string; currency?: string };
  payment_url?: string | null;
  merchant_id?: string;
  payment_page_id?: string;
  integration_mode?: string;
  creation_date?: string;
  [key: string]: unknown;
};

export type RiaPayoutQuoteResponse = {
  id: number;
  external_id?: string;
  payer_id?: number | string;
  source?: { amount?: number | string; currency?: string; country_iso_code?: string };
  destination?: { amount?: number | string; currency?: string };
  fee?: { amount?: number | string; currency?: string };
  creation_date?: string;
  [key: string]: unknown;
};

export type RiaPayoutTransferResponse = {
  id: number;
  external_id?: string;
  status?: string;
  status_class?: string;
  status_message?: string;
  payer_transfer_reference?: string;
  creation_date?: string;
  [key: string]: unknown;
};

function objectValue(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function normalizeRiaStatus(status: string | undefined): string {
  return (status || "").toUpperCase().replace(/\s/g, "_");
}

async function riaRequest<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const config = loadConfig();
  if (config.useMock) {
    const { status, data } = await mockRiaProxy(method, path, body === undefined ? null : body, undefined);
    if (status >= 400) {
      throw new Error(typeof data === "object" ? JSON.stringify(data) : String(data));
    }
    return data as T;
  }
  const client = createRiaClient(config);
  if (method === "GET") {
    return client.get<T>(path);
  }
  return client.post<T>(path, body);
}

export async function createRiaCollectionOrder(body: unknown, transferId?: string | null) {
  const response = await riaRequest<RiaCollectionOrderResponse>("POST", `${RIA_COLLECTION_PREFIX}/orders`, body);
  await upsertRiaCollectionOrder({
    id: response.id,
    externalId: stringValue(response.external_id),
    transferId: transferId ?? stringValue(response.external_id),
    merchantId: stringValue(response.merchant_id),
    paymentPageId: stringValue(response.payment_page_id),
    integrationMode: stringValue(response.integration_mode),
    status: normalizeRiaStatus(response.status),
    requestedAmount: numberValue(objectValue(response.requested).amount),
    requestedCurrency: stringValue(objectValue(response.requested).currency),
    paymentUrl: stringValue(response.payment_url),
    latestPayload: objectValue(response),
    createdAt: stringValue(response.creation_date) ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return response;
}

export async function getRiaCollectionOrder(id: string, transferId?: string | null) {
  const response = await riaRequest<RiaCollectionOrderResponse>("GET", `${RIA_COLLECTION_PREFIX}/orders/${encodeURIComponent(id)}`);
  await upsertRiaCollectionOrder({
    id: response.id,
    externalId: stringValue(response.external_id),
    transferId: transferId ?? stringValue(response.external_id),
    merchantId: stringValue(response.merchant_id),
    paymentPageId: stringValue(response.payment_page_id),
    integrationMode: stringValue(response.integration_mode),
    status: normalizeRiaStatus(response.status),
    requestedAmount: numberValue(objectValue(response.requested).amount),
    requestedCurrency: stringValue(objectValue(response.requested).currency),
    paymentUrl: stringValue(response.payment_url),
    latestPayload: objectValue(response),
    createdAt: stringValue(response.creation_date) ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return response;
}

export async function createRiaPayoutQuote(body: unknown, transferId?: string | null) {
  const response = await riaRequest<RiaPayoutQuoteResponse>("POST", `${RIA_PAYOUT_PREFIX}/quotes`, body);
  await upsertRiaPayoutQuote({
    id: response.id,
    externalId: stringValue(response.external_id),
    transferId: transferId ?? stringValue(response.external_id),
    payerId: numberValue(response.payer_id),
    sourceAmount: numberValue(objectValue(response.source).amount),
    sourceCurrency: stringValue(objectValue(response.source).currency),
    sourceCountryIsoCode: stringValue(objectValue(response.source).country_iso_code),
    destinationAmount: numberValue(objectValue(response.destination).amount),
    destinationCurrency: stringValue(objectValue(response.destination).currency),
    feeAmount: numberValue(objectValue(response.fee).amount),
    feeCurrency: stringValue(objectValue(response.fee).currency),
    latestPayload: objectValue(response),
    createdAt: stringValue(response.creation_date) ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return response;
}

export async function createRiaPayoutTransfer(quoteId: number, body: unknown, transferId?: string | null) {
  const response = await riaRequest<RiaPayoutTransferResponse>(
    "POST",
    `${RIA_PAYOUT_PREFIX}/quotes/${quoteId}/transfers`,
    body
  );
  await upsertRiaPayoutTransfer({
    id: response.id,
    quoteId,
    externalId: stringValue(response.external_id),
    transferId: transferId ?? stringValue(response.external_id),
    status: stringValue(response.status),
    statusClass: stringValue(response.status_class),
    statusMessage: stringValue(response.status_message),
    payerTransferReference: stringValue(response.payer_transfer_reference),
    latestPayload: objectValue(response),
    createdAt: stringValue(response.creation_date) ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return response;
}

export async function confirmRiaPayoutTransfer(transferId: number, body: unknown = {}, appTransferId?: string | null) {
  const response = await riaRequest<RiaPayoutTransferResponse>(
    "POST",
    `${RIA_PAYOUT_PREFIX}/transfers/${transferId}/confirm`,
    body
  );
  await upsertRiaPayoutTransfer({
    id: response.id,
    quoteId: null,
    externalId: stringValue(response.external_id),
    transferId: appTransferId ?? stringValue(response.external_id),
    status: stringValue(response.status),
    statusClass: stringValue(response.status_class),
    statusMessage: stringValue(response.status_message),
    payerTransferReference: stringValue(response.payer_transfer_reference),
    latestPayload: objectValue(response),
    createdAt: stringValue(response.creation_date) ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    confirmedAt: new Date().toISOString(),
  });
  return response;
}

export function getRiaPayoutTransfer(transferId: number) {
  return riaRequest<RiaPayoutTransferResponse>("GET", `${RIA_PAYOUT_PREFIX}/transfers/${transferId}`);
}

export function getRiaPayers() {
  return riaRequest<unknown[]>("GET", `${RIA_PAYOUT_PREFIX}/payers`);
}

export async function recordRiaNotification(input: {
  headers: Record<string, unknown>;
  payload: Record<string, unknown>;
  transferId?: string | null;
}) {
  const collectionOrderId =
    stringValue(input.payload.id) ??
    stringValue(input.payload.collection_order_id) ??
    stringValue(input.payload.collectionOrderId);
  const id = await saveRiaNotification({
    collectionOrderId,
    transferId: input.transferId ?? null,
    status: stringValue(input.payload.status),
    headers: input.headers,
    payload: input.payload,
    processed: false,
    processingError: null,
  });
  return { id, collectionOrderId };
}

export function finalizeRiaNotification(id: number, processingError?: string | null) {
  return markRiaNotificationProcessed(id, processingError);
}

export function getStoredRiaCollectionOrder(id: string) {
  return getRiaCollectionOrderById(id);
}

export async function writeRiaCreateLedger(transferId: string, collectionOrderId: string) {
  const transfer = await getTransfer(transferId);
  if (!transfer) return;
  await saveLedgerEntry({
    entryKey: `ria-charge:${collectionOrderId}`,
    transferId: transfer.id,
    providerFamily: "ria",
    providerEntityType: "collection_order",
    providerEntityId: collectionOrderId,
    entryType: "customer_charge",
    amount: transfer.totalCharged,
    currency: transfer.fromCurrency,
    metadata: { amountSend: transfer.amountSend, platformFee: transfer.platformFee },
  });
  await saveLedgerEntry({
    entryKey: `ria-platform-fee:${collectionOrderId}`,
    transferId: transfer.id,
    providerFamily: "internal",
    providerEntityType: "platform_fee_plan",
    providerEntityId: collectionOrderId,
    entryType: "platform_fee",
    amount: transfer.platformFee,
    currency: transfer.fromCurrency,
    metadata: { amountSend: transfer.amountSend, totalCharged: transfer.totalCharged },
  });
}

export async function writeRiaPayoutLedger(transferId: string, payoutTransferId: number, providerFee?: { amount: number; currency: string } | null) {
  const transfer = await getTransfer(transferId);
  if (!transfer) return;
  if (providerFee) {
    await saveLedgerEntry({
      entryKey: `ria-provider-fee:${payoutTransferId}`,
      transferId: transfer.id,
      providerFamily: "ria",
      providerEntityType: "payout_fee",
      providerEntityId: String(payoutTransferId),
      entryType: "provider_fee_estimate",
      amount: providerFee.amount,
      currency: providerFee.currency,
      metadata: { payoutTransferId },
    });
  }
  await saveLedgerEntry({
    entryKey: `ria-payout:${payoutTransferId}`,
    transferId: transfer.id,
    providerFamily: "ria",
    providerEntityType: "payout_transfer",
    providerEntityId: String(payoutTransferId),
    entryType: "payout_principal",
    amount: transfer.amountSend,
    currency: transfer.fromCurrency,
    metadata: { destinationCurrency: "THB", recipient: transfer.thaiRecipient.fullName },
  });
}

export async function inferTransferForCollectionOrder(collectionOrderId: string) {
  const direct = await getTransferByCollectionOrderId(collectionOrderId);
  if (direct) return direct;
  const stored = await getStoredRiaCollectionOrder(collectionOrderId);
  if (stored?.transferId) {
    return getTransfer(stored.transferId);
  }
  return undefined;
}
