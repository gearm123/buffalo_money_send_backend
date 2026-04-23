import { loadConfig } from "../config.js";

/**
 * - `thunes`: Thunes **Accept** (card / collections) + **Money Transfer** (Thai account).
 * - `stripe`: Stripe + Thunes MT only.
 * Default: Thunes if `STRIPE_SECRET_KEY` is unset; otherwise Stripe (existing deployments).
 */
export function getPaymentProvider(): "stripe" | "thunes" {
  const p = (process.env.PAYMENT_PROVIDER || "").toLowerCase();
  if (p === "thunes") return "thunes";
  if (p === "stripe") return "stripe";
  return process.env.STRIPE_SECRET_KEY ? "stripe" : "thunes";
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
  if (getPaymentProvider() === "stripe") {
    return Boolean(process.env.STRIPE_SECRET_KEY);
  }
  return thunesCollectionIsConfigured();
}
