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
  };
  thaiRecipient: {
    fullName: string;
    bankCode: string;
    accountNumber: string;
  };
  /** Legacy embedded-card field; unused by the current Thunes checkout path. */
  paymentIntentId: string | null;
  /**
   * Which `ThailandTransferRail` created this row — see `src/transfer/rail/registry.ts`.
   * e.g. `thunes_e2e` today, or a future provider-specific rail id.
   */
  railId: string;
  /**
   * Provider-agnostic pay-in reference (Thunes Accept order id, future supplier order id, etc.).
   */
  collectionOrderId: string | null;
  status: PayoutToThailandStatus;
  lastError?: string;
  /** Thunes Money Transfer API — set after a successful flow */
  thunesQuotationId?: number;
  thunesTransactionId?: number;
};
