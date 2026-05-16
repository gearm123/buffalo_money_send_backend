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

export type BeginCollectionResult = {
  transfer: TransferRecord;
  paymentProvider: "ria" | (string & {});
  riaOrderId: string;
  paymentUrl: string | null;
  orderStatus: string;
  /** Provider-specific embedded checkout token; empty for redirect flows like the current Ria mock. */
  clientSecret: string;
  /** Provider-specific public key; empty when not needed by the active supplier. */
  publishableKey: string;
};

export type FinalizeResult = { ok: true; transfer: TransferRecord } | { ok: false; error: string };

export type HttpFinalizeContext = {
  transferId?: string;
  paymentIntentId?: string;
};
