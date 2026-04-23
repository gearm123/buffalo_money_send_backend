import { loadConfig, type AppConfig } from "../config.js";
import { createThunesClient, MT_PREFIX, ThunesHttpError } from "../thunesClient.js";
import { mockThunesProxy } from "../mockThunes.js";
import { getTransfer, saveTransfer } from "./store.js";
import { thaiAccountDigitsOnly, validateThaiBankAccount } from "./thaiBankAccount.js";
import { getSwiftBicForThaiBank } from "./thaiBankSwift.js";
import type { TransferRecord } from "./types.js";

const locks = new Set<string>();

type QuotationRes = { id: number; [k: string]: unknown };
type TransactionRes = { id: number; status?: string; [k: string]: unknown };
type ConfirmRes = { id: number; status?: string; [k: string]: unknown };

function splitName(full: string): { first: string; last: string } {
  const t = full.trim();
  if (!t) return { first: "Unknown", last: "Recipient" };
  const sp = t.split(/\s+/);
  if (sp.length === 1) return { first: sp[0], last: sp[0] };
  return { first: sp[0], last: sp.slice(1).join(" ") || sp[0] };
}

async function thunesRequest<T>(
  config: AppConfig,
  method: "GET" | "POST",
  mtSubPath: string,
  body?: unknown
): Promise<T> {
  const mtPath = `${MT_PREFIX}${mtSubPath}`;
  if (config.useMock) {
    const { status, data } = await mockThunesProxy(
      method,
      mtPath,
      body === undefined ? null : body,
      undefined
    );
    if (status >= 400) {
      throw new Error(typeof data === "object" ? JSON.stringify(data) : String(data));
    }
    return data as T;
  }
  const client = createThunesClient(config);
  if (method === "GET") {
    return (await client.get<T>(mtPath)) as T;
  }
  return (await client.post<T>(mtPath, body)) as T;
}

/**
 * After Stripe has captured funds, create a Thunes MT quotation → transaction → confirm
 * so funds are instructed toward the recipient's Thai bank account.
 * **Idempotent:** safe if webhook and client /complete both call; uses DB fields + in-memory lock.
 */
export async function executeThunesPayoutByTransferId(transferId: string): Promise<void> {
  if (locks.has(transferId)) {
    return;
  }

  const current = getTransfer(transferId);
  if (!current) return;
  if (current.thunesTransactionId != null) {
    return;
  }
  if (current.status === "payout_completed") {
    return;
  }
  if (current.status === "payout_error") {
    return;
  }

  locks.add(transferId);
  let t = getTransfer(transferId);
  if (!t) {
    locks.delete(transferId);
    return;
  }

  if (t.thunesTransactionId != null) {
    locks.delete(transferId);
    return;
  }

  const config = loadConfig();
  const senderParts = splitName(t.sender.fullName);
  const benParts = splitName(t.thaiRecipient.fullName);
  const swift = getSwiftBicForThaiBank(t.thaiRecipient.bankCode);
  const acctCheck = validateThaiBankAccount(t.thaiRecipient.bankCode, t.thaiRecipient.accountNumber);
  if (!acctCheck.ok) {
    t.status = "payout_error";
    t.lastError = acctCheck.error;
    saveTransfer(t);
    locks.delete(transferId);
    return;
  }
  const accountDigits = thaiAccountDigitsOnly(t.thaiRecipient.accountNumber);

  t.status = "payout_processing";
  t.lastError = undefined;
  saveTransfer(t);

  try {
    const payerId = Number(
      process.env.THUNES_THAILAND_PAYER_ID || (config.useMock ? 90002 : 0)
    );
    if (!payerId) {
      throw new Error("Set THUNES_THAILAND_PAYER_ID (Thunes payer id for Thailand bank payout).");
    }

    // Source amount = remittance only (amountSend). Card was charged amountSend + platformFee; do not pass totalCharged here.
    const quoteBody = {
      external_id: t.id,
      payer_id: payerId,
      mode: "SOURCE_AMOUNT" as const,
      transaction_type: "C2C" as const,
      source: {
        amount: String(t.amountSend),
        currency: t.fromCurrency,
        country_iso_code: t.fromCountry,
      },
      destination: {
        amount: null as string | null,
        currency: "THB",
      },
    };

    const quotation = (await thunesRequest<QuotationRes>(config, "POST", "/quotations", quoteBody)) as QuotationRes;
    const qid = quotation.id;
    if (typeof qid !== "number") {
      throw new Error("Thunes quotation missing id");
    }

    const txBody = {
      external_id: `${t.id}-payout`,
      credit_party_identifier: {
        bank_account_number: accountDigits,
        swift_bic_code: swift,
      },
      sender: {
        firstname: senderParts.first,
        lastname: senderParts.last,
        email: t.sender.email,
      },
      beneficiary: {
        firstname: benParts.first,
        lastname: benParts.last,
      },
      purpose_of_remittance: "FAMILY_SUPPORT" as const,
    };

    const created = (await thunesRequest<TransactionRes>(
      config,
      "POST",
      `/quotations/${qid}/transactions`,
      txBody
    )) as TransactionRes;
    const tid = created.id;
    if (typeof tid !== "number") {
      throw new Error("Thunes transaction missing id");
    }

    await thunesRequest<ConfirmRes>(config, "POST", `/transactions/${tid}/confirm`, {});

    t = getTransfer(transferId) ?? t;
    t.thunesQuotationId = qid;
    t.thunesTransactionId = tid;
    t.status = "payout_completed";
    t.lastError = undefined;
    saveTransfer(t);
  } catch (e) {
    const msg =
      e instanceof ThunesHttpError
        ? typeof e.body === "object"
          ? JSON.stringify(e.body)
          : e.message
        : e instanceof Error
          ? e.message
          : String(e);
    t = getTransfer(transferId) ?? t;
    t.status = "payout_error";
    t.lastError = msg.slice(0, 2000);
    saveTransfer(t);
    console.error("[thunesPayout] failed for", transferId, msg);
  } finally {
    locks.delete(transferId);
  }
}
