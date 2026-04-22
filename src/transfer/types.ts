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
  amountSend: number;
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
