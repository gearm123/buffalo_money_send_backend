/**
 * Product model (example: 4% fee, user sends $100):
 * - Customer is charged totalCharged = amountSend + platformFee → e.g. $104.
 * - Thunes remittance uses amountSend only → e.g. $100 to the recipient rail; platformFee stays in your Stripe balance (after Stripe processing fees).
 * Set PLATFORM_FEE_PERCENT in server env (e.g. "4" = 4% of send → $4 fee on $100; card $104).
 */
export function getPlatformFeePercent(): number {
  const raw = process.env.PLATFORM_FEE_PERCENT;
  if (raw === undefined || raw === "") return 0;
  const p = Number(raw);
  if (!Number.isFinite(p) || p < 0) return 0;
  if (p > 100) return 100;
  return p;
}

export function computePlatformFee(sendAmount: number) {
  const percent = getPlatformFeePercent();
  if (sendAmount <= 0) {
    return { platformFee: 0, totalCharged: 0 };
  }
  if (percent <= 0) {
    return { platformFee: 0, totalCharged: sendAmount };
  }
  const sendCents = Math.round(sendAmount * 100);
  const feeCents = Math.round((sendCents * percent) / 100);
  const totalCents = sendCents + feeCents;
  return {
    platformFee: feeCents / 100,
    totalCharged: totalCents / 100,
  };
}
