/**
 * Your platform margin is included in the card charge (see stripeTransfer).
 * It lands in your Stripe account balance; add your bank under Dashboard → Payouts.
 * Set PLATFORM_FEE_PERCENT in server env (e.g. "4" = 4% → $4 on a $100 send; card total $104).
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
