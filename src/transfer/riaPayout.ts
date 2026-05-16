import { RiaHttpError } from "../riaClient.js";
import { createRiaPayoutQuote, createRiaPayoutTransfer, confirmRiaPayoutTransfer, writeRiaPayoutLedger } from "../ria/service.js";
import { loadConfig } from "../config.js";
import { getTransfer, saveTransfer } from "./store.js";
import { thaiAccountDigitsOnly, validateThaiBankAccount } from "./thaiBankAccount.js";
import { getSwiftBicForThaiBank } from "./thaiBankSwift.js";

const locks = new Set<string>();

function splitName(full: string): { first: string; last: string } {
  const trimmed = full.trim();
  if (!trimmed) return { first: "Unknown", last: "Recipient" };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: parts[0] };
  return { first: parts[0], last: parts.slice(1).join(" ") || parts[0] };
}

export async function executeRiaPayoutByTransferId(transferId: string): Promise<void> {
  if (locks.has(transferId)) return;

  const current = await getTransfer(transferId);
  if (!current) return;
  if (current.riaTransferId != null) return;
  if (current.status === "payout_completed" || current.status === "payout_error") return;

  locks.add(transferId);
  let transfer = await getTransfer(transferId);
  if (!transfer) {
    locks.delete(transferId);
    return;
  }
  if (transfer.riaTransferId != null) {
    locks.delete(transferId);
    return;
  }

  const config = loadConfig();
  const sender = splitName(transfer.sender.fullName);
  const recipient = splitName(transfer.thaiRecipient.fullName);
  const swift = getSwiftBicForThaiBank(transfer.thaiRecipient.bankCode);
  const accountCheck = validateThaiBankAccount(transfer.thaiRecipient.bankCode, transfer.thaiRecipient.accountNumber);
  if (!accountCheck.ok) {
    transfer.status = "payout_error";
    transfer.lastError = accountCheck.error;
    await saveTransfer(transfer);
    locks.delete(transferId);
    return;
  }

  transfer.status = "payout_processing";
  transfer.lastError = undefined;
  await saveTransfer(transfer);

  try {
    const payerId = Number(process.env.RIA_THAILAND_PAYER_ID || (config.useMock ? 92001 : 0));
    if (!payerId) {
      throw new Error("Set RIA_THAILAND_PAYER_ID for Thailand bank payout.");
    }

    const quoteBody = {
      external_id: transfer.id,
      payer_id: payerId,
      source: {
        amount: String(transfer.amountSend),
        currency: transfer.fromCurrency,
        country_iso_code: transfer.fromCountry,
      },
      destination: {
        currency: "THB",
      },
    };

    const quote = await createRiaPayoutQuote(quoteBody, transfer.id);
    const quoteId = quote.id;
    if (typeof quoteId !== "number") {
      throw new Error("Ria payout quote missing id");
    }

    const payoutBody = {
      external_id: `${transfer.id}-payout`,
      recipient: {
        first_name: recipient.first,
        last_name: recipient.last,
        bank_account_number: thaiAccountDigitsOnly(transfer.thaiRecipient.accountNumber),
        swift_bic_code: swift,
      },
      sender: {
        first_name: sender.first,
        last_name: sender.last,
        email: transfer.sender.email,
      },
    };

    const payout = await createRiaPayoutTransfer(quoteId, payoutBody, transfer.id);
    const payoutTransferId = payout.id;
    if (typeof payoutTransferId !== "number") {
      throw new Error("Ria payout transfer missing id");
    }

    await confirmRiaPayoutTransfer(payoutTransferId, {}, transfer.id);
    await writeRiaPayoutLedger(transfer.id, payoutTransferId, {
      amount: typeof quote.fee?.amount === "number" ? quote.fee.amount : Number(quote.fee?.amount ?? 0),
      currency: typeof quote.fee?.currency === "string" ? quote.fee.currency : transfer.fromCurrency,
    });

    transfer = (await getTransfer(transferId)) ?? transfer;
    transfer.riaQuoteId = quoteId;
    transfer.riaTransferId = payoutTransferId;
    transfer.status = "payout_completed";
    transfer.lastError = undefined;
    await saveTransfer(transfer);
  } catch (error) {
    const message =
      error instanceof RiaHttpError
        ? typeof error.body === "object"
          ? JSON.stringify(error.body)
          : error.message
        : error instanceof Error
          ? error.message
          : String(error);
    transfer = (await getTransfer(transferId)) ?? transfer;
    transfer.status = "payout_error";
    transfer.lastError = message.slice(0, 2000);
    await saveTransfer(transfer);
    console.error("[riaPayout] failed for", transferId, message);
  } finally {
    locks.delete(transferId);
  }
}
