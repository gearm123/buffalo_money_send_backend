/**
 * Storable ids for `TransferRecord.railId`. Add a new const when you wire a second provider,
 * then register it in `registry.ts` and set `THAILAND_TRANSFER_RAIL` to test it.
 */
export const RAIL_THUNES_E2E = "thunes_e2e" as const;
export const RAIL_STRIPE_THUNES_PAYOUT = "stripe_thunes_payout" as const;

export type KnownThailandRailId = typeof RAIL_THUNES_E2E | typeof RAIL_STRIPE_THUNES_PAYOUT;
/** Allow future string ids without redeploying types */
export type ThailandRailId = KnownThailandRailId | (string & {});
