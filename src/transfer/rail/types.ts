import type { TransferRecord } from "../types.js";

/**
 * Shared input for starting a send — all Thailand rails use the same shape.
 */
export type CreateTransferInput = {
  fromCountry: string;
  toCountry: "THA";
  fromCurrency: string;
  amount: number;
  senderName: string;
  senderEmail: string;
  recipientName: string;
  thaiBankCode: string;
  thaiAccountNumber: string;
};

export type BeginCollectionResult = {
  transfer: TransferRecord;
  paymentProvider: "thunes" | "stripe";
  thunesOrderId: string;
  paymentUrl: string | null;
  orderStatus: string;
  clientSecret: string;
  publishableKey: string;
};

export type FinalizeResult = { ok: true; transfer: TransferRecord } | { ok: false; error: string };

export type HttpFinalizeContext = {
  transferId?: string;
  paymentIntentId?: string;
};
