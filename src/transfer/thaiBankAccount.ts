/**
 * Domestic Thai account number length rules (digit count after stripping non-digits).
 * Thunes will still reject bad accounts at transaction time; this only catches obvious format errors.
 * Sources: common Thai banking references; **verify** against your Thunes corridor docs in production.
 */
const ALLOWED_DIGIT_COUNTS: Record<string, readonly number[]> = {
  BBL: [10],
  KBANK: [10],
  SCB: [10],
  KTB: [10],
  TMB: [10],
  TTB: [10],
  BAY: [10],
  CIMBT: [10],
  GSB: [12],
  GHB: [12],
  /** BAAC issues 10- or 12-digit numbers depending on product */
  BAAC: [10, 12],
};

/**
 * @returns Digits only, for Thunes `bank_account_number`.
 */
export function thaiAccountDigitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

export type ValidateThaiAccountResult = { ok: true } | { ok: false; error: string };

/**
 * Reject account numbers that cannot match the selected bank’s usual domestic length.
 * Does not prove the account exists or matches the beneficiary name.
 */
export function validateThaiBankAccount(bankCode: string, accountRaw: string): ValidateThaiAccountResult {
  const digits = thaiAccountDigitsOnly(accountRaw);
  if (digits.length === 0) {
    return { ok: false, error: "Account number is required." };
  }
  const u = bankCode.toUpperCase().trim();
  const allowed = ALLOWED_DIGIT_COUNTS[u];
  if (allowed) {
    if (!allowed.includes(digits.length)) {
      const hint = allowed.length === 1 ? `${allowed[0]} digits` : `${allowed.join(" or ")} digits`;
      return {
        ok: false,
        error: `For this bank, enter the account as ${hint} (you have ${digits.length} digits).`,
      };
    }
    return { ok: true };
  }
  if (digits.length < 9 || digits.length > 16) {
    return { ok: false, error: "Account number must be between 9 and 16 digits." };
  }
  return { ok: true };
}
