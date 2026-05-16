import { completeRiaByTransferId, createTransferWithRiaCollection } from "../riaCollectionTransfer.js";
import type { ThailandTransferRail } from "./ThailandTransferRail.js";
import { RAIL_RIA_E2E } from "./railIds.js";
import type { CreateTransferInput, FinalizeResult, HttpFinalizeContext } from "./types.js";

/**
 * Ria-branded mock path for collection + payout while live credentials are pending.
 */
export const riaEndToEndRail: ThailandTransferRail = {
  id: RAIL_RIA_E2E,

  async beginCollection(input: CreateTransferInput) {
    const result = await createTransferWithRiaCollection(input);
    return {
      transfer: result.transfer,
      paymentProvider: "ria" as const,
      riaOrderId: result.riaOrderId,
      paymentUrl: result.paymentUrl,
      orderStatus: result.orderStatus,
      clientSecret: "",
      publishableKey: "",
    };
  },

  async finalizeFromHttpContext(ctx: HttpFinalizeContext): Promise<FinalizeResult> {
    if (ctx.paymentIntentId) {
      return { ok: false, error: "This transfer uses the Ria redirect flow - complete it with transferId." };
    }
    if (!ctx.transferId) {
      return { ok: false, error: "transferId required" };
    }
    return completeRiaByTransferId(ctx.transferId);
  },
};
