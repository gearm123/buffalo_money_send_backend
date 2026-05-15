import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { loadConfig } from "./config.js";
import { isDatabaseUrlConfigured, pingDatabase } from "./db.js";
import { createThunesClient, MT_PREFIX, ThunesHttpError } from "./thunesClient.js";
import { getMockPaymentOrder, mockThunesProxy, setMockPaymentOrderStatus } from "./mockThunes.js";
import { getPaymentProvider } from "./payment/paymentConfig.js";
import { registerReferralHttpRoutes } from "./referrals/httpRoutes.js";
import { registerTransferHttpRoutes } from "./transfer/httpRoutes.js";
import { resolveThailandTransferRail } from "./transfer/rail/registry.js";
import { getTransferByCollectionOrderId } from "./transfer/store.js";

dotenv.config();

const config = loadConfig();
const app = express();

app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
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

app.get("/mock/thunes/pay/:id", (req, res) => {
  const order = getMockPaymentOrder(req.params.id);
  if (!order) {
    res.status(404).send("Mock payment order not found.");
    return;
  }

  const action = typeof req.query.action === "string" ? req.query.action : "";
  if (action === "pay") {
    const updated = setMockPaymentOrderStatus(order.id, "CHARGED");
    res.redirect(updated?.return_url || "/");
    return;
  }
  if (action === "cancel") {
    const updated = setMockPaymentOrderStatus(order.id, "ABORTED");
    res.redirect(updated?.aborted_url || "/");
    return;
  }
  if (action === "fail") {
    const updated = setMockPaymentOrderStatus(order.id, "FAILED");
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
    <title>Mock Thunes Checkout</title>
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
      <p class="eyebrow">Mock Thunes Accept</p>
      <h1>Hosted payment page</h1>
      <p>This mock page keeps the same redirect-based flow as live Thunes so you can test the full BuffaloMoneySend checkout journey before approval.</p>
      <section class="summary">
        <div class="row"><span class="k">Order</span><span class="v">${escapeHtml(externalId)}</span></div>
        <div class="row"><span class="k">Amount</span><span class="v">${escapeHtml(amount)} ${escapeHtml(currency)}</span></div>
        <div class="row"><span class="k">Status</span><span class="v">${escapeHtml(status)}</span></div>
      </section>
      <div class="actions">
        <a class="primary" href="/mock/thunes/pay/${orderId}?action=pay">Pay now</a>
        <a class="ghost" href="/mock/thunes/pay/${orderId}?action=cancel">Cancel payment</a>
        <a class="danger" href="/mock/thunes/pay/${orderId}?action=fail">Simulate payment error</a>
      </div>
      <p class="fine">After payment, the app returns to your site and completes the mock payout flow automatically.</p>
    </main>
  </body>
</html>`);
});

registerTransferHttpRoutes(app);
registerReferralHttpRoutes(app);

/** Thunes Accept server-to-server notification — ack fast; idempotency is in thunesPayout. */
app.post("/api/thunes/accept/notification", (req, res) => {
  res.sendStatus(200);
  const body = req.body as { id?: string; payment_order_id?: string; status?: string } | null;
  const orderId = body && typeof body === "object" ? String(body.id ?? body.payment_order_id ?? "") : "";
  if (!orderId) return;
  void (async () => {
    const t = await getTransferByCollectionOrderId(orderId);
    const rail = resolveThailandTransferRail(t);
    if (t && rail) {
      void rail
        .finalizeFromHttpContext({ transferId: t.id })
        .then((r) => {
          if (!r.ok) {
            console.error("[thunes accept notification] finalize", r.error);
          }
        })
        .catch((err) => {
          console.error("[thunes accept notification] complete", err);
        });
    }
  })().catch((err) => {
    console.error("[thunes accept notification] lookup", err);
  });
});

function stringifyQuery(q: express.Request["query"]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      out[k] = v[0] != null ? String(v[0]) : undefined;
    } else if (typeof v === "string") {
      out[k] = v;
    } else if (v != null) {
      out[k] = String(v);
    }
  }
  return out;
}

async function proxyMoneyTransfer(
  method: "GET" | "POST",
  mtSubPath: string,
  req: express.Request,
  res: express.Response,
  body?: unknown
) {
  const mtPath = `${MT_PREFIX}${mtSubPath}`;

  try {
    if (config.useMock) {
      const { status, data } = await mockThunesProxy(
        method,
        mtPath,
        body ?? null,
        method === "GET" ? stringifyQuery(req.query) : undefined
      );
      res.status(status).json(data);
      return;
    }

    const client = createThunesClient(config);
    if (method === "GET") {
      const data = await client.get<unknown>(mtPath, stringifyQuery(req.query));
      res.json(data);
      return;
    }

    const data = await client.post<unknown>(mtPath, body);
    const isCreate =
      mtSubPath === "/quotations" || /\/quotations\/\d+\/transactions$/.test(mtSubPath);
    res.status(isCreate ? 201 : 200).json(data);
  } catch (e) {
    if (e instanceof ThunesHttpError) {
      res.status(e.status).json(e.body);
      return;
    }
    console.error(e);
    res.status(500).json({
      errors: [{ code: "SERVER", message: e instanceof Error ? e.message : "Unexpected error" }],
    });
  }
}

app.get("/api/health", async (_req, res) => {
  const databaseUrlConfigured = isDatabaseUrlConfigured();
  const databaseConnected = await pingDatabase();
  res.json({
    ok: databaseUrlConfigured && databaseConnected,
    thunesMode: config.useMock ? "mock" : "live",
    hasBaseUrl: Boolean(config.thunesBaseUrl),
    paymentProvider: getPaymentProvider(),
    databaseUrlConfigured,
    databaseConnected,
  });
});

app.get("/api/payers", (req, res) => {
  void proxyMoneyTransfer("GET", "/payers", req, res);
});

app.post("/api/quotations", (req, res) => {
  void proxyMoneyTransfer("POST", "/quotations", req, res, req.body);
});

app.post("/api/quotations/:id/transactions", (req, res) => {
  const id = req.params.id;
  void proxyMoneyTransfer("POST", `/quotations/${id}/transactions`, req, res, req.body);
});

app.post("/api/transactions/:id/confirm", (req, res) => {
  const id = req.params.id;
  void proxyMoneyTransfer("POST", `/transactions/${id}/confirm`, req, res, req.body ?? {});
});

app.get("/api/transactions/:id", (req, res) => {
  const id = req.params.id;
  void proxyMoneyTransfer("GET", `/transactions/${id}`, req, res);
});

app.listen(config.port, () => {
  console.log(
    `global-send-api on http://localhost:${config.port} (Thunes: ${config.useMock ? "MOCK" : "live"}) | payment: ${getPaymentProvider()}`
  );
});
