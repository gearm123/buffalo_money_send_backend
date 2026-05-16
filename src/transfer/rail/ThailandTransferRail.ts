import type { BeginCollectionResult, CreateTransferInput, FinalizeResult, HttpFinalizeContext } from "./types.js";
import type { ThailandRailId } from "./railIds.js";

/**
 * Pluggable “Thailand send” product: start payment + (after pay) pay out to a Thai account.
 * Replace **Ria** with another vendor by adding a new implementation and registering it.
 *
 * - **ria_e2e**: Ria-branded redirect collection + Ria-branded payout mock.
 * - Future providers can reuse the same interface and be selected through `registry.ts`.
 */
export interface ThailandTransferRail {
  /** Must match `TransferRecord.railId` */
  id: ThailandRailId;
  /** Create DB record + start collection (redirect order or future provider token). */
  beginCollection(input: CreateTransferInput): Promise<BeginCollectionResult>;
  /**
   * Verify payment, then run Thailand bank delivery for this record.
   * Each implementation knows which HTTP fields it needs (e.g. PI id vs transfer id).
   */
  finalizeFromHttpContext(ctx: HttpFinalizeContext): Promise<FinalizeResult>;
}
