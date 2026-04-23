import { completeThunesByTransferId, createTransferWithThunesCollection } from "../thunesCollectionTransfer.js";
import type { ThailandTransferRail } from "./ThailandTransferRail.js";
import { RAIL_THUNES_E2E } from "./railIds.js";
import type { CreateTransferInput, FinalizeResult, HttpFinalizeContext } from "./types.js";

/**
 * Thunes-only path: Accept (collections) + Money Transfer (Thai bank).
 * Swap this file’s dependencies for another vendor that exposes the same capabilities.
 */
export const thunesEndToEndRail: ThailandTransferRail = {
  id: RAIL_THUNES_E2E,

  async beginCollection(input: CreateTransferInput) {
    const result = await createTransferWithThunesCollection(input);
    return {
      transfer: result.transfer,
      paymentProvider: "thunes" as const,
      thunesOrderId: result.thunesOrderId,
      paymentUrl: result.paymentUrl,
      orderStatus: result.orderStatus,
      clientSecret: "",
      publishableKey: "",
    };
  },

  async finalizeFromHttpContext(ctx: HttpFinalizeContext): Promise<FinalizeResult> {
    if (ctx.paymentIntentId) {
      return { ok: false, error: "This transfer is Thunes end-to-end — use transferId, not a Stripe payment intent." };
    }
    if (!ctx.transferId) {
      return { ok: false, error: "transferId required" };
    }
    return completeThunesByTransferId(ctx.transferId);
  },
};
