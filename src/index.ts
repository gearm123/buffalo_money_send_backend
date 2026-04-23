import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { loadConfig } from "./config.js";
import { createThunesClient, MT_PREFIX, ThunesHttpError } from "./thunesClient.js";
import { mockThunesProxy } from "./mockThunes.js";
import { getPaymentProvider } from "./payment/paymentConfig.js";
import { registerTransferHttpRoutes } from "./transfer/httpRoutes.js";
import { resolveThailandTransferRail } from "./transfer/rail/registry.js";
import { getTransferByCollectionOrderId } from "./transfer/store.js";
import { handleStripeWebhook } from "./transfer/webhookHandler.js";

dotenv.config();

const config = loadConfig();
const app = express();

app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const sig = req.get("stripe-signature");
    void (async () => {
      const body = req.body as Buffer;
      const r = await handleStripeWebhook(body, sig);
      if (r.kind === "ok") {
        res.sendStatus(200);
        return;
      }
      res.status(r.status).send(r.message);
    })();
  }
);

app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Stripe-Signature"],
  })
);
app.use(express.json({ limit: "1mb" }));

registerTransferHttpRoutes(app);

/** Thunes Accept server-to-server notification — ack fast; idempotency is in thunesPayout. */
app.post("/api/thunes/accept/notification", (req, res) => {
  res.sendStatus(200);
  const body = req.body as { id?: string; payment_order_id?: string; status?: string } | null;
  const orderId = body && typeof body === "object" ? String(body.id ?? body.payment_order_id ?? "") : "";
  if (!orderId) return;
  const t = getTransferByCollectionOrderId(orderId);
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

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    thunesMode: config.useMock ? "mock" : "live",
    hasBaseUrl: Boolean(config.thunesBaseUrl),
    paymentProvider: getPaymentProvider(),
    stripe: Boolean(process.env.STRIPE_SECRET_KEY),
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
    `global-send-api on http://localhost:${config.port} (Thunes: ${config.useMock ? "MOCK" : "live"}) | payment: ${getPaymentProvider()} | Stripe: ${process.env.STRIPE_SECRET_KEY ? "on" : "off"}`
  );
});
