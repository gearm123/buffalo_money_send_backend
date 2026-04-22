export type AppConfig = {
  port: number;
  thunesBaseUrl: string;
  apiKey: string;
  apiSecret: string;
  useMock: boolean;
};

export function loadConfig(): AppConfig {
  const port = Number(process.env.PORT) || 4000;
  const thunesBaseUrl = (process.env.THUNES_BASE_URL || "").replace(/\/$/, "");
  const apiKey = process.env.THUNES_API_KEY || "";
  const apiSecret = process.env.THUNES_API_SECRET || "";

  const explicitMock = process.env.THUNES_USE_MOCK;
  const useMock =
    explicitMock === "true" || (explicitMock !== "false" && (!apiKey || !apiSecret || !thunesBaseUrl));

  return { port, thunesBaseUrl, apiKey, apiSecret, useMock };
}
