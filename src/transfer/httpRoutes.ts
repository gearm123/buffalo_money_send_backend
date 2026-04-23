import type { Express, Request, Response } from "express";
import { quoteThbForAmount } from "./fx.js";
import { computePlatformFee } from "./platformFee.js";
import type { TransferRecord } from "./types.js";
import { getTransfer, getTransferByPaymentIntent, listTransfers } from "./store.js";
import { checkoutIsAvailable, getPaymentProvider } from "../payment/paymentConfig.js";
import { getThailandTransferRailForNewTransfer, resolveThailandTransferRail } from "./rail/registry.js";
import { completeTransferClientSide, stripeIsConfigured } from "./stripeTransfer.js";
import { validateThaiBankAccount } from "./thaiBankAccount.js";
import { assertAllowedSourceCountry, SOURCE_COUNTRIES } from "./sourceCountries.js";
import { THAI_BANKS } from "./thaiBanks.js";

export function registerTransferHttpRoutes(app: Express) {
  app.get("/api/transfer/config", (_req, res) => {
    const paymentProvider = getPaymentProvider();
    const rail = getThailandTransferRailForNewTransfer();
    res.json({
      /** @deprecated use paymentProvider + checkoutReady */
      stripe: paymentProvider === "stripe" && stripeIsConfigured(),
      paymentProvider,
      /** Card checkout available (Stripe or Thunes Accept, depending on paymentProvider) */
      checkoutReady: checkoutIsAvailable(),
      /** Default rail for new transfers; override with THAILAND_TRANSFER_RAIL. See `src/transfer/rail/`. */
      thailandTransferRail: rail.id,
      thaiBanks: THAI_BANKS,
      receiveToCountry: "THA",
      /** Must match Thunes `source.country_iso_code` on the MT quotation (alpha-3). */
      sourceCountries: SOURCE_COUNTRIES,
    });
  });

  app.get("/api/transfer/list", (_req, res) => {
    res.json(listTransfers());
  });

  app.post("/api/transfer/quote", (req, res) => {
    const { amount, fromCurrency } = req.body as { amount?: number; fromCurrency?: string };
    if (typeof amount !== "number" || !fromCurrency) {
      res.status(400).json({ error: "amount and fromCurrency required" });
      return;
    }
    const { thbReceive, rate } = quoteThbForAmount(amount, fromCurrency);
    const ccyU = fromCurrency.toUpperCase();
    const { platformFee, totalCharged } = computePlatformFee(amount);
    res.json({
      thbReceive,
      rate,
      fromCurrency: ccyU,
      amount,
      platformFee,
      totalCharged,
    });
  });

  app.post("/api/transfer/validate-bank", (req, res) => {
    const b = req.body as { thaiBankCode?: string; thaiAccountNumber?: string };
    const thaiBankCode = String(b.thaiBankCode ?? "").trim();
    const thaiAccountNumber = String(b.thaiAccountNumber ?? "");
    if (!thaiBankCode) {
      res.status(400).json({ error: "thaiBankCode required" });
      return;
    }
    const r = validateThaiBankAccount(thaiBankCode, thaiAccountNumber);
    if (!r.ok) {
      res.json({ ok: false as const, error: r.error });
      return;
    }
    res.json({ ok: true as const });
  });

  app.post("/api/transfer/create", async (req, res) => {
    if (!checkoutIsAvailable()) {
      res.status(503).json({
        error:
          getPaymentProvider() === "stripe"
            ? "Stripe is not configured. Set STRIPE_SECRET_KEY in server/.env"
            : "Thunes checkout is not configured. Set Thunes API + THUNES_ACCEPT_MERCHANT_ID + THUNES_ACCEPT_PAYMENT_PAGE_ID, or use mock (THUNES_USE_MOCK=true).",
      });
      return;
    }
    try {
      const b = req.body as Record<string, unknown>;
      const fromCountry = String(b.fromCountry ?? "USA").toUpperCase().trim();
      assertAllowedSourceCountry(fromCountry);
      const input = {
        fromCountry,
        toCountry: "THA" as const,
        fromCurrency: String(b.fromCurrency ?? "USD"),
        amount: Number(b.amount),
        senderName: String(b.senderName ?? "").trim(),
        senderEmail: String(b.senderEmail ?? "").trim(),
        recipientName: String(b.recipientName ?? "").trim(),
        thaiBankCode: String(b.thaiBankCode ?? "").trim(),
        thaiAccountNumber: String(b.thaiAccountNumber ?? "").trim(),
      };
      const result = await getThailandTransferRailForNewTransfer().beginCollection(input);
      res.json({
        transfer: result.transfer,
        paymentProvider: result.paymentProvider,
        thunesOrderId: result.thunesOrderId,
        paymentUrl: result.paymentUrl,
        orderStatus: result.orderStatus,
        clientSecret: result.clientSecret,
        publishableKey: result.publishableKey,
      });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Create failed" });
    }
  });

  app.post("/api/transfer/complete", async (req, res) => {
    const body = (req.body ?? {}) as { paymentIntentId?: string; transferId?: string };
    let t: TransferRecord | undefined;
    if (body.transferId) {
      t = getTransfer(String(body.transferId));
      if (!t) {
        res.status(404).json({ error: "Transfer not found" });
        return;
      }
    } else if (body.paymentIntentId) {
      t = getTransferByPaymentIntent(body.paymentIntentId);
    }
    const rail = resolveThailandTransferRail(t);
    if (rail) {
      const r = await rail.finalizeFromHttpContext({
        transferId: body.transferId,
        paymentIntentId: body.paymentIntentId,
      });
      if (!r.ok) {
        res.status(400).json(r);
        return;
      }
      res.json(r);
      return;
    }
    if (body.paymentIntentId) {
      const r = await completeTransferClientSide(body.paymentIntentId);
      if (!r.ok) {
        res.status(400).json(r);
        return;
      }
      res.json(r);
      return;
    }
    res.status(400).json({ error: "paymentIntentId or transferId required" });
  });

  app.get("/api/transfer/:id", (req, res) => {
    const t = getTransfer(req.params.id);
    if (!t) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(t);
  });

}
