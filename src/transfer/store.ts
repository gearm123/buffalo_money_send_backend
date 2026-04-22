import type { TransferRecord } from "./types.js";

const transfers = new Map<string, TransferRecord>();

export function saveTransfer(t: TransferRecord) {
  transfers.set(t.id, t);
}

export function getTransfer(id: string) {
  return transfers.get(id);
}

export function listTransfers() {
  return Array.from(transfers.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getTransferByPaymentIntent(paymentIntentId: string) {
  for (const t of transfers.values()) {
    if (t.paymentIntentId === paymentIntentId) return t;
  }
  return undefined;
}
