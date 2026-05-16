import type { Express, Request, Response } from "express";
import { loadConfig } from "../config.js";
import { mockRiaProxy } from "../mockRia.js";
import { createRiaClient, RiaHttpError } from "../riaClient.js";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function readQuery(req: Request): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(req.query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      out[key] = value[0] != null ? String(value[0]) : undefined;
    } else if (typeof value === "string") {
      out[key] = value;
    } else if (value != null) {
      out[key] = String(value);
    }
  }
  return out;
}

function readBody(req: Request): Record<string, unknown> {
  return objectValue(req.body);
}

function getCustomerCredentials(req: Request) {
  const body = readBody(req);
  const customerId =
    stringValue(req.headers["x-ria-customer-id"]) ??
    stringValue(body.customerId) ??
    stringValue(readQuery(req).customerId);
  const customerPassword =
    stringValue(req.headers["x-ria-customer-password"]) ??
    stringValue(body.customerPassword) ??
    stringValue(readQuery(req).customerPassword);
  return { customerId, customerPassword };
}

async function getSessionToken(req: Request): Promise<string> {
  const body = readBody(req);
  const direct =
    stringValue(req.headers["x-ria-session-token"]) ??
    stringValue(body.sessionToken) ??
    stringValue(readQuery(req).sessionToken);
  if (direct) return direct;

  const { customerId, customerPassword } = getCustomerCredentials(req);
  if (!customerId || !customerPassword) {
    throw new Error(
      "Ria session token required. Pass x-ria-session-token, or x-ria-customer-id and x-ria-customer-password."
    );
  }

  if (loadConfig().useMock) {
    const result = await mockRiaProxy("GET", "/Authenticate", { customerId, customerPassword });
    if (result.status >= 400) {
      throw new Error(typeof result.data === "object" ? JSON.stringify(result.data) : String(result.data));
    }
    const token = stringValue(objectValue(result.data).token);
    if (!token) throw new Error("Mock Ria authenticate did not return a token.");
    return token;
  }

  const auth = await createRiaClient(loadConfig()).authenticateCustomer<{ token?: string }>(customerId, customerPassword);
  const token = stringValue(objectValue(auth).token);
  if (!token) {
    throw new Error("Ria authenticate did not return a token.");
  }
  return token;
}

function sendRiaError(res: Response, error: unknown) {
  if (error instanceof RiaHttpError) {
    res.status(error.status).json(error.body);
    return;
  }
  res.status(400).json({
    errors: [{ code: "SERVER", message: error instanceof Error ? error.message : "Unexpected error" }],
  });
}

async function callBasic<T>(method: "GET" | "PUT" | "POST", path: string, req: Request): Promise<T> {
  const config = loadConfig();
  if (config.useMock) {
    const result = await mockRiaProxy(method, path, method === "GET" ? null : req.body, method === "GET" ? readQuery(req) : undefined);
    if (result.status >= 400) {
      throw new Error(typeof result.data === "object" ? JSON.stringify(result.data) : String(result.data));
    }
    return result.data as T;
  }
  const client = createRiaClient(config);
  if (method === "GET") return client.basicGet<T>(path, readQuery(req));
  if (method === "PUT") return client.basicPut<T>(path, req.body);
  return client.basicPost<T>(path, req.body);
}

async function callSession<T>(method: "GET" | "PUT" | "POST", path: string, req: Request): Promise<T> {
  const token = await getSessionToken(req);
  const config = loadConfig();
  if (config.useMock) {
    const result = await mockRiaProxy(method, path, method === "GET" ? { sessionToken: token } : { ...readBody(req), sessionToken: token }, method === "GET" ? readQuery(req) : undefined);
    if (result.status >= 400) {
      throw new Error(typeof result.data === "object" ? JSON.stringify(result.data) : String(result.data));
    }
    return result.data as T;
  }
  const client = createRiaClient(config);
  if (method === "GET") return client.sessionGet<T>(path, token, readQuery(req));
  if (method === "PUT") return client.sessionPut<T>(path, token, req.body);
  return client.sessionPost<T>(path, token, req.body);
}

export function registerRiaHttpRoutes(app: Express) {
  app.get("/api/ria/Authenticate", async (req, res) => {
    try {
      const { customerId, customerPassword } = getCustomerCredentials(req);
      if (!customerId || !customerPassword) {
        res.status(400).json({
          errors: [{ code: "SERVER", message: "customerId and customerPassword are required." }],
        });
        return;
      }
      const config = loadConfig();
      const data = config.useMock
        ? (
            await mockRiaProxy("GET", "/Authenticate", {
              customerId,
              customerPassword,
            })
          ).data
        : await createRiaClient(config).authenticateCustomer(customerId, customerPassword);
      res.json(data);
    } catch (error) {
      sendRiaError(res, error);
    }
  });

  app.get("/api/ria/v1/Location/GetSendToCountries", async (req, res) => {
    try {
      res.json(await callBasic("GET", "/v1/Location/GetSendToCountries", req));
    } catch (error) {
      sendRiaError(res, error);
    }
  });

  app.put("/api/ria/v1/Location/GetAvailableCurrenciesForCountry", async (req, res) => {
    try {
      res.json(await callBasic("PUT", "/v1/Location/GetAvailableCurrenciesForCountry", req));
    } catch (error) {
      sendRiaError(res, error);
    }
  });

  app.put("/api/ria/v1/Location/GetAvailableDeliveryMethodsForCountry", async (req, res) => {
    try {
      res.json(await callBasic("PUT", "/v1/Location/GetAvailableDeliveryMethodsForCountry", req));
    } catch (error) {
      sendRiaError(res, error);
    }
  });

  app.post("/api/ria/v1/Partner/CalculateFee", async (req, res) => {
    try {
      res.json(await callBasic("POST", "/v1/Partner/CalculateFee", req));
    } catch (error) {
      sendRiaError(res, error);
    }
  });

  app.post("/api/ria/v1/Partner/ValidateOrder", async (req, res) => {
    try {
      res.json(await callSession("POST", "/v1/Partner/ValidateOrder", req));
    } catch (error) {
      sendRiaError(res, error);
    }
  });

  app.put("/api/ria/v1/Pricing/GetServicesAvailable", async (req, res) => {
    try {
      res.json(await callSession("PUT", "/v1/Pricing/GetServicesAvailable", req));
    } catch (error) {
      sendRiaError(res, error);
    }
  });

  app.put("/api/ria/v1/Pricing/CalculateFee", async (req, res) => {
    try {
      res.json(await callSession("PUT", "/v1/Pricing/CalculateFee", req));
    } catch (error) {
      sendRiaError(res, error);
    }
  });

  app.get("/api/ria/v1/Payment/GetAvailablePaymentMethods", async (req, res) => {
    try {
      res.json(await callSession("GET", "/v1/Payment/GetAvailablePaymentMethods", req));
    } catch (error) {
      sendRiaError(res, error);
    }
  });

  app.put("/api/ria/v1/Order/ValidateMoneyTransferOrder", async (req, res) => {
    try {
      res.json(await callSession("PUT", "/v1/Order/ValidateMoneyTransferOrder", req));
    } catch (error) {
      sendRiaError(res, error);
    }
  });

  app.put("/api/ria/v1/Order/CreateMoneyTransferOrderV2", async (req, res) => {
    try {
      res.json(await callSession("PUT", "/v1/Order/CreateMoneyTransferOrderV2", req));
    } catch (error) {
      sendRiaError(res, error);
    }
  });

  app.put("/api/ria/v1/Order/ConfirmOrder", async (req, res) => {
    try {
      res.json(await callSession("PUT", "/v1/Order/ConfirmOrder", req));
    } catch (error) {
      sendRiaError(res, error);
    }
  });

  app.put("/api/ria/v1/Order/CancelOrder", async (req, res) => {
    try {
      res.json(await callSession("PUT", "/v1/Order/CancelOrder", req));
    } catch (error) {
      sendRiaError(res, error);
    }
  });

  app.put("/api/ria/v1/Order/RefundOrder", async (req, res) => {
    try {
      res.json(await callSession("PUT", "/v1/Order/RefundOrder", req));
    } catch (error) {
      sendRiaError(res, error);
    }
  });

  app.put("/api/ria/v1/Order/GetOrderDetailsByOrderId", async (req, res) => {
    try {
      res.json(await callSession("PUT", "/v1/Order/GetOrderDetailsByOrderId", req));
    } catch (error) {
      sendRiaError(res, error);
    }
  });

  app.get("/api/ria/v1/Order/ProcessOrderStatusChangeNotifications", async (req, res) => {
    try {
      res.json(await callSession("GET", "/v1/Order/ProcessOrderStatusChangeNotifications", req));
    } catch (error) {
      sendRiaError(res, error);
    }
  });
}
