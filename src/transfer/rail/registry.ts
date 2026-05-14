import type { TransferRecord } from "../types.js";
import { RAIL_THUNES_E2E, type ThailandRailId } from "./railIds.js";
import { thunesEndToEndRail } from "./thunesEndToEndRail.js";
import type { ThailandTransferRail } from "./ThailandTransferRail.js";

/**
 * All registered rails. To add e.g. Wise: implement `ThailandTransferRail`, import here, and add a key.
 */
const rails: Record<string, ThailandTransferRail> = {
  [RAIL_THUNES_E2E]: thunesEndToEndRail,
};

const KNOWN = Object.keys(rails).join(", ");

export function getThailandTransferRailById(id: string): ThailandTransferRail {
  const r = rails[id];
  if (!r) {
    throw new Error(
      `Unknown THAILAND_TRANSFER_RAIL / railId "${id}". Register the implementation in src/transfer/rail/registry.ts. Known: ${KNOWN}`
    );
  }
  return r;
}

/**
 * New transfers: which rail to use.
 * - `THAILAND_TRANSFER_RAIL` wins when set and registered.
 * - Otherwise use the default Thunes end-to-end rail.
 */
export function getThailandTransferRailForNewTransfer(): ThailandTransferRail {
  const override = (process.env.THAILAND_TRANSFER_RAIL || "").trim();
  if (override) {
    return getThailandTransferRailById(override);
  }
  return thunesEndToEndRail;
}

export function listThailandTransferRailIds(): ThailandRailId[] {
  return Object.keys(rails) as ThailandRailId[];
}

export function isRegisteredThailandRailId(id: string): id is string {
  return id in rails;
}

/**
 * For HTTP complete / webhooks: pick the rail for an existing row (supports records created before `railId` existed).
 */
export function resolveThailandTransferRail(t: TransferRecord | undefined): ThailandTransferRail | null {
  if (!t) return null;
  if (t.railId && t.railId in rails) {
    return rails[t.railId] as ThailandTransferRail;
  }
  if (t.collectionOrderId) return thunesEndToEndRail;
  return null;
}
