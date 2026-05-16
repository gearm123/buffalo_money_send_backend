/**
 * Storable ids for `TransferRecord.railId`. Add a new const when you wire a second provider,
 * then register it in `registry.ts` and set `THAILAND_TRANSFER_RAIL` to test it.
 */
export const RAIL_RIA_E2E = "ria_e2e" as const;

export type KnownThailandRailId = typeof RAIL_RIA_E2E;
/** Allow future string ids without redeploying types */
export type ThailandRailId = KnownThailandRailId | (string & {});
