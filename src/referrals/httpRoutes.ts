import type { Express } from "express";
import { incrementReferral, listReferrals, resetAllReferrals, resetReferral } from "./store.js";

function toCsvValue(value: string | number): string {
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
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

  app.get("/api/referrals", async (_req, res) => {
    res.json({ items: await listReferrals() });
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
