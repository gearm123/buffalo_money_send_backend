import type { Express } from "express";
import { incrementReferral, listReferrals, resetAllReferrals, resetReferral } from "./store.js";

function toCsvValue(value: string | number): string {
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function wantsPretty(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function toPrettyReferralText(items: { name: string; value: number }[]): string {
  const widestName = items.reduce((max, item) => Math.max(max, item.name.length), 4);
  return items.map((item) => `${item.name.padEnd(widestName)} : ${item.value}`).join("\n");
}

export function registerReferralHttpRoutes(app: Express) {
  app.post("/api/referrals/record", async (req, res) => {
    try {
      const name = String((req.body as { name?: unknown } | null)?.name ?? "");
      const referral = await incrementReferral(name);
      res.json({ ok: true, referral });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Could not record referral" });
    }
  });

  app.post("/api/referrals/reset", async (req, res) => {
    try {
      const name = String((req.body as { name?: unknown } | null)?.name ?? "").trim();
      if (name) {
        const referral = await resetReferral(name);
        res.json({ ok: true, scope: "one", referral });
        return;
      }

      const updated = await resetAllReferrals();
      res.json({ ok: true, scope: "all", updated });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Could not reset referrals" });
    }
  });

  app.get("/api/referrals", async (req, res) => {
    const items = await listReferrals();
    const pretty = Array.isArray(req.query.pretty) ? req.query.pretty[0] : req.query.pretty;
    if (wantsPretty(pretty)) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.send(toPrettyReferralText(items));
      return;
    }
    res.json({ items });
  });

  app.get("/api/referrals/export", async (_req, res) => {
    const items = await listReferrals();
    const csvLines = [
      "name,value,updated_at",
      ...items.map((item) => [item.name, item.value, item.updatedAt].map(toCsvValue).join(",")),
    ];

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="referrals.csv"');
    res.send(csvLines.join("\n"));
  });
}
