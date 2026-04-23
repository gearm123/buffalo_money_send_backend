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
  /** What Stripe actually charges: amountSend + platformFee. */
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
  paymentIntentId: string | null;
  /**
   * Which `ThailandTransferRail` created this row — see `src/transfer/rail/registry.ts`.
   * e.g. `thunes_e2e`, `stripe_thunes_payout`, or a future provider id.
   */
  railId: string;
  /**
   * Provider-agnostic pay-in reference (Thunes Accept order id, etc.).
   * Null when card is a Stripe PaymentIntent only.
   */
  collectionOrderId: string | null;
  status: PayoutToThailandStatus;
  lastError?: string;
  /** Thunes Money Transfer API — set after a successful flow */
  thunesQuotationId?: number;
  thunesTransactionId?: number;
};
