import type { Express, Request, Response } from "express";
import { quoteThbForAmount } from "./fx.js";
import { computePlatformFee } from "./platformFee.js";
import type { TransferRecord } from "./types.js";
import { getTransfer, listTransfers } from "./store.js";
import {
  checkoutIsAvailable,
  getPaymentProvider,
  getRiaMode,
  isRiaActive,
  riaCollectionIsConfigured,
} from "../payment/paymentConfig.js";
import { getThailandTransferRailForNewTransfer, resolveThailandTransferRail } from "./rail/registry.js";
import type { CreateTransferInput } from "./rail/types.js";
import { validateThaiBankAccount } from "./thaiBankAccount.js";
import { assertAllowedSourceCountry, SOURCE_COUNTRIES } from "./sourceCountries.js";
import { THAI_BANKS } from "./thaiBanks.js";

function buildCreateInput(body: Record<string, unknown>, mode: "public" | "partner") {
  const fromCountry = String(body.fromCountry ?? "USA").toUpperCase().trim();
  assertAllowedSourceCountry(fromCountry);
  const rawDeliveryMethod = String(body.deliveryMethod ?? "bank").trim().toLowerCase();
  const deliveryMethod: CreateTransferInput["deliveryMethod"] =
    rawDeliveryMethod === "wallet" ? "wallet" : rawDeliveryMethod === "cash" ? "cash" : "bank";
  return {
    fromCountry,
    toCountry: "THA" as const,
    fromCurrency: String(body.fromCurrency ?? "USD"),
    amount: Number(body.amount),
    senderName: String(body.senderName ?? "").trim(),
    senderEmail: String(body.senderEmail ?? "").trim(),
    senderPhone: String(body.senderPhone ?? "").trim() || undefined,
    recipientName: String(body.recipientName ?? "").trim(),
    thaiBankCode: String(body.thaiBankCode ?? "").trim(),
    thaiAccountNumber: String(body.thaiAccountNumber ?? "").trim(),
    recipientBankName: String(body.recipientBankName ?? "").trim() || undefined,
    deliveryMethod,
    recipientPhone: String(body.recipientPhone ?? "").trim() || undefined,
    payoutCity: String(body.payoutCity ?? "").trim() || undefined,
    billingAddress1: String(body.billingAddress1 ?? "").trim() || undefined,
    billingAddress2: String(body.billingAddress2 ?? "").trim() || undefined,
    billingCity: String(body.billingCity ?? "").trim() || undefined,
    billingState: String(body.billingState ?? "").trim() || undefined,
    billingPostalCode: String(body.billingPostalCode ?? "").trim() || undefined,
    returnPath: mode === "partner" ? "/partner" : "/",
    flowMode: mode,
  };
}

export function registerTransferHttpRoutes(app: Express) {
  app.get("/api/transfer/config", (_req, res) => {
    const paymentProvider = getPaymentProvider();
    const rail = getThailandTransferRailForNewTransfer();
    res.json({
      /** @deprecated kept for older frontends; Buffalo now runs Ria-only checkout. */
      stripe: false,
      paymentProvider,
      riaMode: getRiaMode(),
      riaActive: isRiaActive(),
      /** Hosted card checkout availability for the active supplier. */
      checkoutReady: checkoutIsAvailable(),
      /** Default rail for new transfers; override with THAILAND_TRANSFER_RAIL. See `src/transfer/rail/`. */
      thailandTransferRail: rail.id,
      thaiBanks: THAI_BANKS,
      receiveToCountry: "THA",
      /** Must match the provider source country code on the payout quote (alpha-3). */
      sourceCountries: SOURCE_COUNTRIES,
    });
  });

  app.get("/api/partner-transfer/config", (_req, res) => {
    const rail = getThailandTransferRailForNewTransfer();
    res.json({
      paymentProvider: getPaymentProvider(),
      riaMode: getRiaMode(),
      checkoutReady: riaCollectionIsConfigured(),
      thailandTransferRail: rail.id,
      thaiBanks: THAI_BANKS,
      receiveToCountry: "THA",
      sourceCountries: SOURCE_COUNTRIES,
    });
  });

  app.get("/api/transfer/list", async (_req, res) => {
    res.json(await listTransfers());
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
          isRiaActive()
            ? "Ria checkout is not configured. Set RIA_API_* + RIA_COLLECTION_MERCHANT_ID + RIA_COLLECTION_PAGE_ID, or use mock (RIA_USE_MOCK=true)."
            : "Ria is implemented in the backend but not active for the normal transfer flow yet.",
      });
      return;
    }
    try {
      const b = req.body as Record<string, unknown>;
      const input = buildCreateInput(b, "public");
      const result = await getThailandTransferRailForNewTransfer().beginCollection(input);
      res.json({
        transfer: result.transfer,
        paymentProvider: result.paymentProvider,
        riaOrderId: result.riaOrderId,
        paymentUrl: result.paymentUrl,
        orderStatus: result.orderStatus,
        clientSecret: result.clientSecret,
        publishableKey: result.publishableKey,
      });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Create failed" });
    }
  });

  app.post("/api/partner-transfer/create", async (req, res) => {
    if (!riaCollectionIsConfigured()) {
      res.status(503).json({
        error: "Ria partner checkout is not configured. Set RIA credentials and collection page settings, or use RIA_USE_MOCK=true.",
      });
      return;
    }
    try {
      const b = req.body as Record<string, unknown>;
      const input = buildCreateInput(b, "partner");
      const result = await getThailandTransferRailForNewTransfer().beginCollection(input);
      res.json({
        transfer: result.transfer,
        paymentProvider: result.paymentProvider,
        riaOrderId: result.riaOrderId,
        paymentUrl: result.paymentUrl,
        orderStatus: result.orderStatus,
        clientSecret: result.clientSecret,
        publishableKey: result.publishableKey,
      });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Partner create failed" });
    }
  });

  app.post("/api/transfer/complete", async (req, res) => {
    const body = (req.body ?? {}) as { paymentIntentId?: string; transferId?: string };
    let t: TransferRecord | undefined;
    if (body.transferId) {
      t = await getTransfer(String(body.transferId));
      if (!t) {
        res.status(404).json({ error: "Transfer not found" });
        return;
      }
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
      res.status(400).json({
        error: "Embedded-card completion is no longer supported. Complete the transfer with transferId.",
      });
      return;
    }
    res.status(400).json({ error: "transferId required" });
  });

  app.post("/api/partner-transfer/complete", async (req, res) => {
    const body = (req.body ?? {}) as { transferId?: string };
    if (!body.transferId) {
      res.status(400).json({ error: "transferId required" });
      return;
    }
    const t = await getTransfer(String(body.transferId));
    if (!t) {
      res.status(404).json({ error: "Transfer not found" });
      return;
    }
    const rail = resolveThailandTransferRail(t);
    if (!rail) {
      res.status(400).json({ error: "No rail found for transfer" });
      return;
    }
    const r = await rail.finalizeFromHttpContext({ transferId: body.transferId });
    if (!r.ok) {
      res.status(400).json(r);
      return;
    }
    res.json(r);
  });

  app.get("/api/transfer/:id", async (req, res) => {
    const t = await getTransfer(req.params.id);
    if (!t) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(t);
  });

  app.get("/api/partner-transfer/:id", async (req, res) => {
    const t = await getTransfer(req.params.id);
    if (!t) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(t);
  });

}
