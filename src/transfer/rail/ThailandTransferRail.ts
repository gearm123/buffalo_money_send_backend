import type { BeginCollectionResult, CreateTransferInput, FinalizeResult, HttpFinalizeContext } from "./types.js";
import type { ThailandRailId } from "./railIds.js";

/**
 * Pluggable “Thailand send” product: start payment + (after pay) pay out to a Thai account.
 * Replace **Thunes** with another vendor by adding a new implementation and registering it.
 *
 * - **thunes_e2e**: Thunes Accept (card) + Thunes Money Transfer (Thai bank).
 * - Future providers can reuse the same interface and be selected through `registry.ts`.
 */
export interface ThailandTransferRail {
  /** Must match `TransferRecord.railId` */
  id: ThailandRailId;
  /** Create DB record + start collection (PI, Thunes order, or future). */
  beginCollection(input: CreateTransferInput): Promise<BeginCollectionResult>;
  /**
   * Verify payment, then run Thailand bank delivery for this record.
   * Each implementation knows which HTTP fields it needs (e.g. PI id vs transfer id).
   */
  finalizeFromHttpContext(ctx: HttpFinalizeContext): Promise<FinalizeResult>;
}
