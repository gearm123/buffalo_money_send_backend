import type { AppConfig } from "./config.js";

export class ThunesHttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown
  ) {
    super(message);
    this.name = "ThunesHttpError";
  }
}

function buildUrl(base: string, path: string, query?: Record<string, string | undefined>): string {
  const u = new URL(path.replace(/^\//, ""), base.endsWith("/") ? base : `${base}/`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") u.searchParams.set(k, v);
    }
  }
  return u.toString();
}

export function createThunesClient(config: AppConfig) {
  const { thunesBaseUrl, apiKey, apiSecret } = config;
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

  async function request<T>(
    method: string,
    path: string,
    options: { query?: Record<string, string | undefined>; body?: unknown } = {}
  ): Promise<T> {
    const url = buildUrl(thunesBaseUrl, path, options.query);
    const headers: Record<string, string> = {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    };

    let body: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    const res = await fetch(url, { method, headers, body });
    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        parsed = text;
      }
    }

    if (!res.ok) {
      throw new ThunesHttpError(`Thunes API ${res.status}`, res.status, parsed);
    }
    return parsed as T;
  }

  return {
    get: <T>(path: string, query?: Record<string, string | undefined>) =>
      request<T>("GET", path, { query }),
    post: <T>(path: string, body?: unknown) => request<T>("POST", path, { body }),
  };
}

export const MT_PREFIX = "/v2/money-transfer";
