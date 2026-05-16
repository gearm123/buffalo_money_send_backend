import { getPool } from "../db.js";

export type LedgerEntryType =
  | "customer_charge"
  | "platform_fee"
  | "provider_fee_estimate"
  | "payout_principal"
  | "refund"
  | "adjustment";

export type LedgerEntryRecord = {
  entryKey: string;
  transferId: string | null;
  providerFamily: "ria" | "internal";
  providerEntityType: string;
  providerEntityId: string | null;
  entryType: LedgerEntryType;
  amount: number;
  currency: string;
  metadata: Record<string, unknown>;
  createdAt?: string;
};

let initPromise: Promise<void> | null = null;

async function ensureLedgerStore() {
  if (!initPromise) {
    initPromise = (async () => {
      const pool = getPool();
      await pool.query(`
        create table if not exists ledger_entries (
          id bigserial primary key,
          entry_key text not null unique,
          transfer_id text,
          provider_family text not null,
          provider_entity_type text not null,
          provider_entity_id text,
          entry_type text not null,
          amount numeric not null,
          currency text not null,
          metadata jsonb not null,
          created_at timestamptz not null
        )
      `);
      await pool.query(`create index if not exists ledger_entries_transfer_idx on ledger_entries (transfer_id, created_at desc)`);
      await pool.query(`create index if not exists ledger_entries_entity_idx on ledger_entries (provider_family, provider_entity_type, provider_entity_id)`);
      await pool.query(`create index if not exists ledger_entries_type_idx on ledger_entries (entry_type, created_at desc)`);
    })();
  }
  await initPromise;
}

export async function saveLedgerEntry(entry: LedgerEntryRecord) {
  await ensureLedgerStore();
  const createdAt = entry.createdAt ?? new Date().toISOString();
  await getPool().query(
    `
      insert into ledger_entries (
        entry_key,
        transfer_id,
        provider_family,
        provider_entity_type,
        provider_entity_id,
        entry_type,
        amount,
        currency,
        metadata,
        created_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::timestamptz)
      on conflict (entry_key) do nothing
    `,
    [
      entry.entryKey,
      entry.transferId,
      entry.providerFamily,
      entry.providerEntityType,
      entry.providerEntityId,
      entry.entryType,
      entry.amount,
      entry.currency,
      JSON.stringify(entry.metadata),
      createdAt,
    ]
  );
}

export async function listLedgerEntries(transferId?: string) {
  await ensureLedgerStore();
  const result = transferId
    ? await getPool().query<{
        entry_key: string;
        transfer_id: string | null;
        provider_family: "ria" | "internal";
        provider_entity_type: string;
        provider_entity_id: string | null;
        entry_type: LedgerEntryType;
        amount: string;
        currency: string;
        metadata: Record<string, unknown>;
        created_at: string;
      }>(
        `
          select entry_key, transfer_id, provider_family, provider_entity_type, provider_entity_id, entry_type, amount::text, currency, metadata, created_at
          from ledger_entries
          where transfer_id = $1
          order by created_at desc, id desc
        `,
        [transferId]
      )
    : await getPool().query<{
        entry_key: string;
        transfer_id: string | null;
        provider_family: "ria" | "internal";
        provider_entity_type: string;
        provider_entity_id: string | null;
        entry_type: LedgerEntryType;
        amount: string;
        currency: string;
        metadata: Record<string, unknown>;
        created_at: string;
      }>(
        `
          select entry_key, transfer_id, provider_family, provider_entity_type, provider_entity_id, entry_type, amount::text, currency, metadata, created_at
          from ledger_entries
          order by created_at desc, id desc
        `
      );

  return result.rows.map((row) => ({
    entryKey: row.entry_key,
    transferId: row.transfer_id,
    providerFamily: row.provider_family,
    providerEntityType: row.provider_entity_type,
    providerEntityId: row.provider_entity_id,
    entryType: row.entry_type,
    amount: Number(row.amount),
    currency: row.currency,
    metadata: row.metadata,
    createdAt: row.created_at,
  }));
}
