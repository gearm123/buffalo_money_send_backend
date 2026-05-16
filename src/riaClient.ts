import type { AppConfig } from "./config.js";

export class RiaHttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown
  ) {
    super(message);
    this.name = "RiaHttpError";
  }
}

export type RiaAuthMode = "basic" | "session";

type RequestOptions = {
  query?: Record<string, string | undefined>;
  body?: unknown;
  authMode?: RiaAuthMode;
  sessionToken?: string;
  customerId?: string;
  customerPassword?: string;
};

function buildUrl(base: string, path: string, query?: Record<string, string | undefined>): string {
  const u = new URL(path.replace(/^\//, ""), base.endsWith("/") ? base : `${base}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") u.searchParams.set(key, value);
    }
  }
  return u.toString();
}

export function createRiaClient(config: AppConfig) {
  const { riaBaseUrl, apiKey, apiSecret, riaClientIpAddress } = config;
  const basicAuth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

  async function request<T>(
    method: string,
    path: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const url = buildUrl(riaBaseUrl, path, options.query);
    const headers: Record<string, string> = {
      Accept: "application/json",
      ClientIpAddress: riaClientIpAddress,
    };

    const authMode = options.authMode ?? "basic";
    if (authMode === "session") {
      if (!options.sessionToken) {
        throw new Error("Ria session token is required for this call.");
      }
      headers.Authorization = `Session ${options.sessionToken}`;
    } else {
      headers.Authorization = `Basic ${basicAuth}`;
    }

    if (options.customerId) headers.CustomerId = options.customerId;
    if (options.customerPassword) headers.CustomerPassword = options.customerPassword;

    let body: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    const response = await fetch(url, { method, headers, body });
    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        parsed = text;
      }
    }

    if (!response.ok) {
      throw new RiaHttpError(`Ria API ${response.status}`, response.status, parsed);
    }
    return parsed as T;
  }

  return {
    request,
    get: <T>(path: string, query?: Record<string, string | undefined>) =>
      request<T>("GET", path, { query }),
    post: <T>(path: string, body?: unknown) => request<T>("POST", path, { body }),
    put: <T>(path: string, body?: unknown, options: Omit<RequestOptions, "body"> = {}) =>
      request<T>("PUT", path, { ...options, body }),
    basicGet: <T>(path: string, query?: Record<string, string | undefined>) =>
      request<T>("GET", path, { query, authMode: "basic" }),
    basicPost: <T>(path: string, body?: unknown) =>
      request<T>("POST", path, { body, authMode: "basic" }),
    basicPut: <T>(path: string, body?: unknown) =>
      request<T>("PUT", path, { body, authMode: "basic" }),
    sessionGet: <T>(path: string, sessionToken: string, query?: Record<string, string | undefined>) =>
      request<T>("GET", path, { query, authMode: "session", sessionToken }),
    sessionPost: <T>(path: string, sessionToken: string, body?: unknown) =>
      request<T>("POST", path, { body, authMode: "session", sessionToken }),
    sessionPut: <T>(path: string, sessionToken: string, body?: unknown) =>
      request<T>("PUT", path, { body, authMode: "session", sessionToken }),
    authenticateCustomer: <T>(customerId: string, customerPassword: string) =>
      request<T>("GET", "/Authenticate", {
        authMode: "basic",
        customerId,
        customerPassword,
      }),
  };
}

// Legacy placeholder paths kept only for the inactive transfer-flow scaffolding.
export const RIA_COLLECTION_PREFIX = "/v1/collection";
export const RIA_PAYOUT_PREFIX = "/v1/payout";
