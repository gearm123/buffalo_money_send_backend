import type { Express, Request, Response } from "express";
import { quoteThbForAmount } from "./fx.js";
import { computePlatformFee } from "./platformFee.js";
import { getTransfer, listTransfers } from "./store.js";
import { completeTransferClientSide, createTransferWithPaymentIntent, stripeIsConfigured } from "./stripeTransfer.js";
import { THAI_BANKS } from "./thaiBanks.js";

export function registerTransferHttpRoutes(app: Express) {
  app.get("/api/transfer/config", (_req, res) => {
    res.json({
      stripe: stripeIsConfigured(),
      thaiBanks: THAI_BANKS,
      receiveToCountry: "THA",
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

  app.post("/api/transfer/create", async (req, res) => {
    if (!stripeIsConfigured()) {
      res.status(503).json({
        error: "Stripe is not configured. Set STRIPE_SECRET_KEY in server/.env",
      });
      return;
    }
    try {
      const b = req.body as Record<string, unknown>;
      const result = await createTransferWithPaymentIntent({
        fromCountry: String(b.fromCountry ?? "USA"),
        toCountry: "THA",
        fromCurrency: String(b.fromCurrency ?? "USD"),
        amount: Number(b.amount),
        senderName: String(b.senderName ?? "").trim(),
        senderEmail: String(b.senderEmail ?? "").trim(),
        recipientName: String(b.recipientName ?? "").trim(),
        thaiBankCode: String(b.thaiBankCode ?? "").trim(),
        thaiAccountNumber: String(b.thaiAccountNumber ?? "").trim(),
      });
      if (!result.clientSecret) {
        res.status(500).json({ error: "No client secret from Stripe" });
        return;
      }
      res.json({
        transfer: result.transfer,
        clientSecret: result.clientSecret,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? "",
      });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Create failed" });
    }
  });

  app.post("/api/transfer/complete", async (req, res) => {
    const { paymentIntentId } = (req.body ?? {}) as { paymentIntentId?: string };
    if (!paymentIntentId) {
      res.status(400).json({ error: "paymentIntentId required" });
      return;
    }
    const r = await completeTransferClientSide(paymentIntentId);
    if (!r.ok) {
      res.status(400).json(r);
      return;
    }
    res.json(r);
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
