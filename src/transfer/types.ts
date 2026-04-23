export type PayoutToThailandStatus =
  | "awaiting_payment"
  | "payment_succeeded"
  | "payout_queued_simulation"
  | "payout_error";

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
  status: PayoutToThailandStatus;
  lastError?: string;
};
