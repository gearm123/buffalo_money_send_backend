import { loadConfig } from "../config.js";

/**
 * Buffalo currently runs the hosted checkout through Thunes only.
 * Keep this helper so callers can stay provider-agnostic if another supplier is added later.
 */
export function getPaymentProvider(): "thunes" {
  return "thunes";
}

/** Live Accept API needs a configured card payment page in Thunes Portal. */
export function thunesCollectionIsConfigured(): boolean {
  const c = loadConfig();
  if (c.useMock) return true;
  return Boolean(
    c.thunesBaseUrl &&
      c.apiKey &&
      c.apiSecret &&
      process.env.THUNES_ACCEPT_MERCHANT_ID &&
      process.env.THUNES_ACCEPT_PAYMENT_PAGE_ID
  );
}

export function checkoutIsAvailable(): boolean {
  return thunesCollectionIsConfigured();
}
