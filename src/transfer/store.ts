import type { TransferRecord } from "./types.js";
import { getPool } from "../db.js";

let initPromise: Promise<void> | null = null;

async function ensureTransferStore() {
  if (!initPromise) {
    initPromise = (async () => {
      const pool = getPool();
      await pool.query(`
        create table if not exists transfers (
          id text primary key,
          created_at timestamptz not null,
          payment_intent_id text,
          collection_order_id text,
          status text not null,
          payload jsonb not null
        )
      `);
      await pool.query(`create index if not exists transfers_created_at_idx on transfers (created_at desc)`);
      await pool.query(`create index if not exists transfers_payment_intent_idx on transfers (payment_intent_id)`);
      await pool.query(`create index if not exists transfers_collection_order_idx on transfers (collection_order_id)`);
      await pool.query(`create index if not exists transfers_status_idx on transfers (status)`);
    })();
  }
  await initPromise;
}

function parseTransfer(payload: unknown): TransferRecord {
  if (typeof payload === "string") {
    return JSON.parse(payload) as TransferRecord;
  }
  return payload as TransferRecord;
}

export async function saveTransfer(t: TransferRecord) {
  await ensureTransferStore();
  await getPool().query(
    `
      insert into transfers (id, created_at, payment_intent_id, collection_order_id, status, payload)
      values ($1, $2::timestamptz, $3, $4, $5, $6::jsonb)
      on conflict (id) do update set
        created_at = excluded.created_at,
        payment_intent_id = excluded.payment_intent_id,
        collection_order_id = excluded.collection_order_id,
        status = excluded.status,
        payload = excluded.payload
    `,
    [t.id, t.createdAt, t.paymentIntentId, t.collectionOrderId, t.status, JSON.stringify(t)]
  );
}

export async function getTransfer(id: string) {
  await ensureTransferStore();
  const result = await getPool().query<{ payload: unknown }>("select payload from transfers where id = $1 limit 1", [id]);
  return result.rows[0] ? parseTransfer(result.rows[0].payload) : undefined;
}

export async function listTransfers() {
  await ensureTransferStore();
  const result = await getPool().query<{ payload: unknown }>(
    "select payload from transfers order by created_at desc"
  );
  return result.rows.map((row) => parseTransfer(row.payload));
}

export async function getTransferByPaymentIntent(paymentIntentId: string) {
  await ensureTransferStore();
  const result = await getPool().query<{ payload: unknown }>(
    "select payload from transfers where payment_intent_id = $1 order by created_at desc limit 1",
    [paymentIntentId]
  );
  return result.rows[0] ? parseTransfer(result.rows[0].payload) : undefined;
}

export async function getTransferByCollectionOrderId(orderId: string) {
  await ensureTransferStore();
  const result = await getPool().query<{ payload: unknown }>(
    "select payload from transfers where collection_order_id = $1 order by created_at desc limit 1",
    [orderId]
  );
  return result.rows[0] ? parseTransfer(result.rows[0].payload) : undefined;
}
