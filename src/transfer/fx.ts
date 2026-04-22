/**
 * Simplified display-only rate: how many THB for 1 unit of fromCurrency.
 * In production, use your pricing engine or a live FX feed.
 */
const THB_PER_UNIT: Record<string, number> = {
  USD: 36.5,
  EUR: 39.2,
  GBP: 45.0,
  THB: 1,
};

export function quoteThbForAmount(amount: number, fromCurrency: string) {
  const c = fromCurrency.toUpperCase();
  const rate = THB_PER_UNIT[c] ?? THB_PER_UNIT.USD;
  return {
    thbReceive: Math.round(amount * rate * 100) / 100,
    rate,
  };
}
