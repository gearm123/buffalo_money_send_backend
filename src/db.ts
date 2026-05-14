import { readFileSync } from "node:fs";
import { Pool } from "pg";

let pool: Pool | null = null;

function optionalEnv(key: string): string {
  return (process.env[key] || "").trim();
}

function normalizeDatabaseUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith("postgres://")) {
    return "postgresql://" + trimmed.slice("postgres://".length);
  }
  return trimmed;
}

function rawDatabaseUrlFromEnvironment(): string {
  for (const key of ["DATABASE_URL", "POSTGRES_URL"]) {
    const value = optionalEnv(key).replace(/^\uFEFF/, "");
    if (value) return value;
  }

  const path = optionalEnv("DATABASE_URL_FILE");
  if (path) {
    try {
      const firstLine = (readFileSync(path, "utf8").split(/\r?\n/, 1)[0] || "").trim().replace(/^\uFEFF/, "");
      if (firstLine) return firstLine;
    } catch {
      // Health checks expose whether the URL is configured; callers handle missing/invalid files.
    }
  }

  return "";
}

export function isDatabaseUrlConfigured(): boolean {
  return rawDatabaseUrlFromEnvironment().length > 0;
}

export function getDatabaseUrl(): string {
  const raw = rawDatabaseUrlFromEnvironment();
  if (!raw) {
    throw new Error(
      "DATABASE_URL is not set. On Render, set DATABASE_URL to the Internal Database URL from your Postgres service."
    );
  }
  return normalizeDatabaseUrl(raw);
}

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
      max: 10,
      idleTimeoutMillis: 30_000,
    });
  }
  return pool;
}

export async function pingDatabase(): Promise<boolean> {
  if (!isDatabaseUrlConfigured()) return false;
  try {
    const client = await getPool().connect();
    try {
      await client.query("select 1");
      return true;
    } finally {
      client.release();
    }
  } catch {
    return false;
  }
}
