export type PayoutToThailandStatus =
  | "awaiting_payment"
  | "payout_processing"
  | "payout_completed"
  | "payout_error"
  /** @deprecated */
  | "payout_queued_simulation"
  | "payment_succeeded";

export type TransferRecord = {
  id: string;
  createdAt: string;
  fromCountry: string;
  toCountry: string;
  fromCurrency: string;
  /** Remittance / corridor amount the customer chose (drives the THB estimate). */
  amountSend: number;
  /** Your platform fee, same currency as amountSend (on top of amountSend for the card total). */
  platformFee: number;
  /** What the active collection provider charges: amountSend + platformFee. */
  totalCharged: number;
  thbReceiveEstimate: number;
  fxRateUsed: number;
  sender: {
    fullName: string;
    email: string;
    phone?: string;
    billingAddress1?: string;
    billingAddress2?: string;
    billingCity?: string;
    billingState?: string;
    billingPostalCode?: string;
  };
  thaiRecipient: {
    fullName: string;
    bankCode: string;
    accountNumber: string;
    bankName?: string;
    deliveryMethod?: "bank" | "cash" | "wallet";
    phone?: string;
    payoutCity?: string;
  };
  /** Legacy embedded-card field; unused by the current redirect checkout path. */
  paymentIntentId: string | null;
  /**
   * Which `ThailandTransferRail` created this row — see `src/transfer/rail/registry.ts`.
   * e.g. `ria_e2e` today, or a future provider-specific rail id.
   */
  railId: string;
  /**
   * Provider-agnostic pay-in reference (Ria collection order id, future supplier order id, etc.).
   */
  collectionOrderId: string | null;
  status: PayoutToThailandStatus;
  lastError?: string;
  flowMode?: "public" | "partner";
  /** Ria payout quote id — set after a successful payout flow. */
  riaQuoteId?: number;
  /** Ria payout transfer id — set after a successful payout flow. */
  riaTransferId?: number;
};
