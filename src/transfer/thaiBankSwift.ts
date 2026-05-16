/**
 * SWIFT BIC (8 characters) for Thai banks — the provider payout flow may need this
 * with the account number. Verify against your live provider and bank documentation.
 */
const CODE_TO_BIC: Record<string, string> = {
  BBL: "BKKBTHBK",
  KBANK: "KASITHBK",
  SCB: "SICOTHBK",
  KTB: "KRTHTHBK",
  TMB: "TMBKTHBK",
  BAY: "AYUDTHBK",
  GSB: "GSBATHBK",
  CIMBT: "CIBTHBKX",
  TTB: "TMBKTHBK",
  BAAC: "BAABTHBK",
  GHB: "GOHWTHB2",
};

export function getSwiftBicForThaiBank(bankCode: string): string {
  const u = bankCode.toUpperCase().trim();
  return CODE_TO_BIC[u] ?? "BKKBTHBK";
}
