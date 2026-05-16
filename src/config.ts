export type AppConfig = {
  port: number;
  riaBaseUrl: string;
  apiKey: string;
  apiSecret: string;
  riaClientIpAddress: string;
  useMock: boolean;
  riaActive: boolean;
};

export function loadConfig(): AppConfig {
  const port = Number(process.env.PORT) || 4000;
  const riaBaseUrl = (process.env.RIA_BASE_URL || "").replace(/\/$/, "");
  const apiKey = process.env.RIA_API_KEY || "";
  const apiSecret = process.env.RIA_API_SECRET || "";
  const riaClientIpAddress = (process.env.RIA_CLIENT_IP_ADDRESS || "127.0.0.1").trim();
  const riaActive = process.env.RIA_ACTIVE === "true";

  const explicitMock = process.env.RIA_USE_MOCK;
  const useMock =
    explicitMock === "true" || (explicitMock !== "false" && (!apiKey || !apiSecret || !riaBaseUrl));

  return { port, riaBaseUrl, apiKey, apiSecret, riaClientIpAddress, useMock, riaActive };
}
