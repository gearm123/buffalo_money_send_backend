import { completeTransferClientSide, createTransferWithPaymentIntent } from "../stripeTransfer.js";
import { getTransfer } from "../store.js";
import type { ThailandTransferRail } from "./ThailandTransferRail.js";
import { RAIL_STRIPE_THUNES_PAYOUT } from "./railIds.js";
import type { CreateTransferInput, FinalizeResult, HttpFinalizeContext } from "./types.js";

/**
 * Card via Stripe; bank payout in Thailand still uses the Thunes MT implementation in `thunesPayout.ts`.
 * To change the payout leg only, add a new payout adapter and call it from `executeThunesPayoutByTransferId` or replace that module.
 */
export const stripeThunesPayoutRail: ThailandTransferRail = {
  id: RAIL_STRIPE_THUNES_PAYOUT,

  async beginCollection(input: CreateTransferInput) {
    const { transfer, clientSecret } = await createTransferWithPaymentIntent(input);
    if (!clientSecret) {
      throw new Error("No client secret from Stripe");
    }
    return {
      transfer,
      paymentProvider: "stripe" as const,
      thunesOrderId: "",
      paymentUrl: null,
      orderStatus: "",
      clientSecret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? "",
    };
  },

  async finalizeFromHttpContext(ctx: HttpFinalizeContext): Promise<FinalizeResult> {
    if (ctx.transferId && !ctx.paymentIntentId) {
      const t = getTransfer(ctx.transferId);
      if (t?.paymentIntentId) {
        return completeTransferClientSide(t.paymentIntentId);
      }
      return { ok: false, error: "No PaymentIntent on this transfer yet" };
    }
    if (!ctx.paymentIntentId) {
      return { ok: false, error: "paymentIntentId required" };
    }
    return completeTransferClientSide(ctx.paymentIntentId);
  },
};
