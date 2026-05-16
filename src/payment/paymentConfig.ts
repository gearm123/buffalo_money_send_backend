import { loadConfig } from "../config.js";

/**
 * Buffalo currently keeps the Ria implementation in the backend, but it can stay
 * inactive for the normal app flow until commercial approval and rollout.
 * Keep this helper so callers can stay provider-agnostic if another supplier is added later.
 */
export function getPaymentProvider(): "ria" {
  return "ria";
}

export function getRiaMode(): "mock" | "live" {
  return loadConfig().useMock ? "mock" : "live";
}

export function isRiaActive(): boolean {
  return loadConfig().riaActive;
}

/** Live Ria setup needs a configured collection page id and credentials. */
export function riaCollectionIsConfigured(): boolean {
  const c = loadConfig();
  if (c.useMock) return true;
  return Boolean(
    c.riaBaseUrl &&
      c.apiKey &&
      c.apiSecret &&
      process.env.RIA_COLLECTION_MERCHANT_ID &&
      process.env.RIA_COLLECTION_PAGE_ID
  );
}

export function checkoutIsAvailable(): boolean {
  return isRiaActive() && riaCollectionIsConfigured();
}
