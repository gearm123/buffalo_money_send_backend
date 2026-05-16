import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { loadConfig } from "./config.js";
import { isDatabaseUrlConfigured, pingDatabase } from "./db.js";
import { getMockRiaCollectionOrder, setMockRiaCollectionOrderStatus } from "./mockRia.js";
import { registerRiaHttpRoutes } from "./ria/httpRoutes.js";
import { getPaymentProvider, isRiaActive } from "./payment/paymentConfig.js";
import { registerReferralHttpRoutes } from "./referrals/httpRoutes.js";
import { registerTransferHttpRoutes } from "./transfer/httpRoutes.js";

dotenv.config();

const config = loadConfig();
const app = express();

app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-ria-session-token",
      "x-ria-customer-id",
      "x-ria-customer-password",
    ],
  })
);
app.use(express.json({ limit: "1mb" }));

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

app.get("/mock/ria/pay/:id", (req, res) => {
  const order = getMockRiaCollectionOrder(req.params.id);
  if (!order) {
    res.status(404).send("Mock Ria collection order not found.");
    return;
  }

  const action = typeof req.query.action === "string" ? req.query.action : "";
  if (action === "pay") {
    const updated = setMockRiaCollectionOrderStatus(order.id, "PAID");
    res.redirect(updated?.return_url || "/");
    return;
  }
  if (action === "cancel") {
    const updated = setMockRiaCollectionOrderStatus(order.id, "ABORTED");
    res.redirect(updated?.aborted_url || "/");
    return;
  }
  if (action === "fail") {
    const updated = setMockRiaCollectionOrderStatus(order.id, "FAILED");
    res.redirect(updated?.error_url || "/");
    return;
  }

  const amount = typeof order.requested?.amount === "number" ? order.requested.amount.toFixed(2) : "0.00";
  const currency = order.requested?.currency || "USD";
  const externalId = order.external_id || order.id;
  const status = order.status;
  const orderId = encodeURIComponent(order.id);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mock Ria Checkout</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: Inter, system-ui, sans-serif;
        background: linear-gradient(180deg, #0f172a 0%, #111827 100%);
        color: #e5eefb;
        display: grid;
        place-items: center;
        padding: 24px;
      }
      .card {
        width: min(420px, 100%);
        border-radius: 18px;
        padding: 24px;
        background: rgba(15, 23, 42, 0.92);
        border: 1px solid rgba(56, 189, 248, 0.18);
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
      }
      .eyebrow {
        margin: 0 0 8px;
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #7dd3fc;
        font-weight: 700;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 28px;
        line-height: 1.1;
      }
      p {
        margin: 0 0 16px;
        color: #cbd5e1;
        line-height: 1.5;
      }
      .summary {
        border-radius: 14px;
        padding: 16px;
        background: rgba(255, 255, 255, 0.04);
        margin-bottom: 20px;
      }
      .row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 10px;
      }
      .row:last-child { margin-bottom: 0; }
      .k { color: #94a3b8; font-size: 13px; }
      .v { font-weight: 700; }
      .actions {
        display: grid;
        gap: 10px;
      }
      a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 46px;
        border-radius: 12px;
        text-decoration: none;
        font-weight: 700;
      }
      .primary { background: linear-gradient(145deg, #0284c7, #1d4ed8); color: white; }
      .ghost { background: rgba(255,255,255,0.06); color: #e2e8f0; }
      .danger { background: rgba(239,68,68,0.14); color: #fecaca; }
      .fine { margin-top: 14px; font-size: 12px; color: #94a3b8; }
    </style>
  </head>
  <body>
    <main class="card">
      <p class="eyebrow">Mock Ria Checkout</p>
      <h1>Hosted payment page</h1>
      <p>This mock page keeps the same redirect-based flow Buffalo will use with a future live Ria integration.</p>
      <section class="summary">
        <div class="row"><span class="k">Order</span><span class="v">${escapeHtml(externalId)}</span></div>
        <div class="row"><span class="k">Amount</span><span class="v">${escapeHtml(amount)} ${escapeHtml(currency)}</span></div>
        <div class="row"><span class="k">Status</span><span class="v">${escapeHtml(status)}</span></div>
      </section>
      <div class="actions">
        <a class="primary" href="/mock/ria/pay/${orderId}?action=pay">Pay now</a>
        <a class="ghost" href="/mock/ria/pay/${orderId}?action=cancel">Cancel payment</a>
        <a class="danger" href="/mock/ria/pay/${orderId}?action=fail">Simulate payment error</a>
      </div>
      <p class="fine">After payment, the app returns to your site and completes the mock payout flow automatically.</p>
    </main>
  </body>
</html>`);
});

registerTransferHttpRoutes(app);
registerReferralHttpRoutes(app);
registerRiaHttpRoutes(app);

app.get("/api/health", async (_req, res) => {
  const databaseUrlConfigured = isDatabaseUrlConfigured();
  const databaseConnected = await pingDatabase();
  res.json({
    ok: databaseUrlConfigured && databaseConnected,
    riaMode: config.useMock ? "mock" : "live",
    riaActive: isRiaActive(),
    hasBaseUrl: Boolean(config.riaBaseUrl),
    paymentProvider: getPaymentProvider(),
    databaseUrlConfigured,
    databaseConnected,
  });
});

app.listen(config.port, () => {
  console.log(
    `global-send-api on http://localhost:${config.port} (Ria: ${config.useMock ? "MOCK" : "live"}, active: ${isRiaActive() ? "yes" : "no"}) | payment: ${getPaymentProvider()}`
  );
});
