import { getPool } from "../db.js";

export type ReferralRow = {
  name: string;
  value: number;
  updatedAt: string;
};

let initPromise: Promise<void> | null = null;

function normalizeReferralName(name: string): { key: string; display: string } {
  const display = name.trim().replace(/\s+/g, " ");
  if (!display) {
    throw new Error("name is required");
  }
  return { key: display.toLowerCase(), display };
}

async function ensureReferralStore() {
  if (!initPromise) {
    initPromise = (async () => {
      const pool = getPool();
      await pool.query(`
        create table if not exists referrals (
          name_key text primary key,
          name text not null,
          value integer not null default 0,
          updated_at timestamptz not null default now()
        )
      `);
      await pool.query(`create index if not exists referrals_name_idx on referrals (name)`);
      await pool.query(`create index if not exists referrals_updated_at_idx on referrals (updated_at desc)`);
    })();
  }
  await initPromise;
}

function mapReferralRow(row: { name: string; value: number; updated_at: Date | string }): ReferralRow {
  return {
    name: row.name,
    value: Number(row.value),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function incrementReferral(name: string): Promise<ReferralRow> {
  await ensureReferralStore();
  const { key, display } = normalizeReferralName(name);
  const result = await getPool().query<{ name: string; value: number; updated_at: Date | string }>(
    `
      insert into referrals (name_key, name, value, updated_at)
      values ($1, $2, 1, now())
      on conflict (name_key) do update set
        name = excluded.name,
        value = referrals.value + 1,
        updated_at = now()
      returning name, value, updated_at
    `,
    [key, display]
  );
  return mapReferralRow(result.rows[0]);
}

export async function resetReferral(name: string): Promise<ReferralRow> {
  await ensureReferralStore();
  const { key, display } = normalizeReferralName(name);
  const result = await getPool().query<{ name: string; value: number; updated_at: Date | string }>(
    `
      insert into referrals (name_key, name, value, updated_at)
      values ($1, $2, 0, now())
      on conflict (name_key) do update set
        name = excluded.name,
        value = 0,
        updated_at = now()
      returning name, value, updated_at
    `,
    [key, display]
  );
  return mapReferralRow(result.rows[0]);
}

export async function resetAllReferrals(): Promise<number> {
  await ensureReferralStore();
  const result = await getPool().query(`update referrals set value = 0, updated_at = now()`);
  return result.rowCount ?? 0;
}

export async function listReferrals(): Promise<ReferralRow[]> {
  await ensureReferralStore();
  const result = await getPool().query<{ name: string; value: number; updated_at: Date | string }>(
    `select name, value, updated_at from referrals order by lower(name) asc`
  );
  return result.rows.map(mapReferralRow);
}
