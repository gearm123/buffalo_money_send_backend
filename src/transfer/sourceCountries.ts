/**
 * Source countries for the send leg — **ISO 3166-1 alpha-3** (same as Thunes Money Transfer
 * `source.country_iso_code` and Accept address `country_iso_code` where used).
 * Trim your live list to corridors Thunes actually enables for you.
 */
export const SOURCE_COUNTRIES = [
  { code: "USA", label: "United States" },
  { code: "GBR", label: "United Kingdom" },
  { code: "DEU", label: "Germany" },
  { code: "FRA", label: "France" },
  { code: "AUS", label: "Australia" },
  { code: "CAN", label: "Canada" },
] as const;

const ALLOWED = new Set<string>(SOURCE_COUNTRIES.map((c) => c.code));

export function isAllowedSourceCountry(code: string): boolean {
  return ALLOWED.has(code.toUpperCase().trim());
}

export function assertAllowedSourceCountry(code: string) {
  const u = code.toUpperCase().trim();
  if (!isAllowedSourceCountry(u)) {
    throw new Error(
      `Source country must be one of: ${[...ALLOWED].sort().join(", ")} (Thunes country_iso_code / ISO 3166-1 alpha-3).`
    );
  }
}
