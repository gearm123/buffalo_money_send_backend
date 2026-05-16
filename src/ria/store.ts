import { getPool } from "../db.js";

export type RiaCollectionOrderRecord = {
  id: string;
  externalId: string | null;
  transferId: string | null;
  merchantId: string | null;
  paymentPageId: string | null;
  integrationMode: string | null;
  status: string;
  requestedAmount: number | null;
  requestedCurrency: string | null;
  paymentUrl: string | null;
  latestPayload: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export type RiaPayoutQuoteRecord = {
  id: number;
  externalId: string | null;
  transferId: string | null;
  payerId: number | null;
  sourceAmount: number | null;
  sourceCurrency: string | null;
  sourceCountryIsoCode: string | null;
  destinationAmount: number | null;
  destinationCurrency: string | null;
  feeAmount: number | null;
  feeCurrency: string | null;
  latestPayload: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export type RiaPayoutTransferRecord = {
  id: number;
  quoteId: number | null;
  externalId: string | null;
  transferId: string | null;
  status: string | null;
  statusClass: string | null;
  statusMessage: string | null;
  payerTransferReference: string | null;
  latestPayload: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  confirmedAt?: string | null;
};

export type RiaNotificationRecord = {
  collectionOrderId: string | null;
  transferId: string | null;
  status: string | null;
  headers: Record<string, unknown>;
  payload: Record<string, unknown>;
  processed: boolean;
  processingError: string | null;
  receivedAt?: string;
  processedAt?: string | null;
};

let initPromise: Promise<void> | null = null;

async function ensureRiaStore() {
  if (!initPromise) {
    initPromise = (async () => {
      const pool = getPool();
      await pool.query(`
        create table if not exists ria_collection_orders (
          id text primary key,
          external_id text,
          transfer_id text,
          merchant_id text,
          payment_page_id text,
          integration_mode text,
          status text not null,
          requested_amount numeric,
          requested_currency text,
          payment_url text,
          latest_payload jsonb not null,
          created_at timestamptz not null,
          updated_at timestamptz not null
        )
      `);
      await pool.query(`create index if not exists ria_collection_orders_external_idx on ria_collection_orders (external_id)`);
      await pool.query(`create index if not exists ria_collection_orders_transfer_idx on ria_collection_orders (transfer_id, updated_at desc)`);

      await pool.query(`
        create table if not exists ria_payout_quotes (
          id bigint primary key,
          external_id text,
          transfer_id text,
          payer_id bigint,
          source_amount numeric,
          source_currency text,
          source_country_iso_code text,
          destination_amount numeric,
          destination_currency text,
          fee_amount numeric,
          fee_currency text,
          latest_payload jsonb not null,
          created_at timestamptz not null,
          updated_at timestamptz not null
        )
      `);
      await pool.query(`create index if not exists ria_payout_quotes_transfer_idx on ria_payout_quotes (transfer_id, updated_at desc)`);

      await pool.query(`
        create table if not exists ria_payout_transfers (
          id bigint primary key,
          quote_id bigint,
          external_id text,
          transfer_id text,
          status text,
          status_class text,
          status_message text,
          payer_transfer_reference text,
          latest_payload jsonb not null,
          created_at timestamptz not null,
          updated_at timestamptz not null,
          confirmed_at timestamptz
        )
      `);
      await pool.query(`create index if not exists ria_payout_transfers_transfer_idx on ria_payout_transfers (transfer_id, updated_at desc)`);

      await pool.query(`
        create table if not exists ria_notifications (
          id bigserial primary key,
          collection_order_id text,
          transfer_id text,
          status text,
          headers jsonb not null,
          payload jsonb not null,
          processed boolean not null default false,
          processing_error text,
          received_at timestamptz not null,
          processed_at timestamptz
        )
      `);
      await pool.query(`create index if not exists ria_notifications_order_idx on ria_notifications (collection_order_id, received_at desc)`);
    })();
  }
  await initPromise;
}

function asNumber(value: string | number | null): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function upsertRiaCollectionOrder(record: RiaCollectionOrderRecord) {
  await ensureRiaStore();
  const createdAt = record.createdAt ?? new Date().toISOString();
  const updatedAt = record.updatedAt ?? createdAt;
  await getPool().query(
    `
      insert into ria_collection_orders (
        id, external_id, transfer_id, merchant_id, payment_page_id, integration_mode, status,
        requested_amount, requested_currency, payment_url, latest_payload, created_at, updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::timestamptz, $13::timestamptz)
      on conflict (id) do update set
        external_id = excluded.external_id,
        transfer_id = excluded.transfer_id,
        merchant_id = excluded.merchant_id,
        payment_page_id = excluded.payment_page_id,
        integration_mode = excluded.integration_mode,
        status = excluded.status,
        requested_amount = excluded.requested_amount,
        requested_currency = excluded.requested_currency,
        payment_url = excluded.payment_url,
        latest_payload = excluded.latest_payload,
        updated_at = excluded.updated_at
    `,
    [
      record.id,
      record.externalId,
      record.transferId,
      record.merchantId,
      record.paymentPageId,
      record.integrationMode,
      record.status,
      record.requestedAmount,
      record.requestedCurrency,
      record.paymentUrl,
      JSON.stringify(record.latestPayload),
      createdAt,
      updatedAt,
    ]
  );
}

export async function upsertRiaPayoutQuote(record: RiaPayoutQuoteRecord) {
  await ensureRiaStore();
  const createdAt = record.createdAt ?? new Date().toISOString();
  const updatedAt = record.updatedAt ?? createdAt;
  await getPool().query(
    `
      insert into ria_payout_quotes (
        id, external_id, transfer_id, payer_id, source_amount, source_currency, source_country_iso_code,
        destination_amount, destination_currency, fee_amount, fee_currency, latest_payload, created_at, updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::timestamptz, $14::timestamptz)
      on conflict (id) do update set
        external_id = excluded.external_id,
        transfer_id = excluded.transfer_id,
        payer_id = excluded.payer_id,
        source_amount = excluded.source_amount,
        source_currency = excluded.source_currency,
        source_country_iso_code = excluded.source_country_iso_code,
        destination_amount = excluded.destination_amount,
        destination_currency = excluded.destination_currency,
        fee_amount = excluded.fee_amount,
        fee_currency = excluded.fee_currency,
        latest_payload = excluded.latest_payload,
        updated_at = excluded.updated_at
    `,
    [
      record.id,
      record.externalId,
      record.transferId,
      record.payerId,
      record.sourceAmount,
      record.sourceCurrency,
      record.sourceCountryIsoCode,
      record.destinationAmount,
      record.destinationCurrency,
      record.feeAmount,
      record.feeCurrency,
      JSON.stringify(record.latestPayload),
      createdAt,
      updatedAt,
    ]
  );
}

export async function upsertRiaPayoutTransfer(record: RiaPayoutTransferRecord) {
  await ensureRiaStore();
  const createdAt = record.createdAt ?? new Date().toISOString();
  const updatedAt = record.updatedAt ?? createdAt;
  await getPool().query(
    `
      insert into ria_payout_transfers (
        id, quote_id, external_id, transfer_id, status, status_class, status_message,
        payer_transfer_reference, latest_payload, created_at, updated_at, confirmed_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::timestamptz, $11::timestamptz, $12::timestamptz)
      on conflict (id) do update set
        quote_id = excluded.quote_id,
        external_id = excluded.external_id,
        transfer_id = excluded.transfer_id,
        status = excluded.status,
        status_class = excluded.status_class,
        status_message = excluded.status_message,
        payer_transfer_reference = excluded.payer_transfer_reference,
        latest_payload = excluded.latest_payload,
        updated_at = excluded.updated_at,
        confirmed_at = coalesce(excluded.confirmed_at, ria_payout_transfers.confirmed_at)
    `,
    [
      record.id,
      record.quoteId,
      record.externalId,
      record.transferId,
      record.status,
      record.statusClass,
      record.statusMessage,
      record.payerTransferReference,
      JSON.stringify(record.latestPayload),
      createdAt,
      updatedAt,
      record.confirmedAt ?? null,
    ]
  );
}

export async function saveRiaNotification(record: RiaNotificationRecord) {
  await ensureRiaStore();
  const receivedAt = record.receivedAt ?? new Date().toISOString();
  const result = await getPool().query<{ id: string }>(
    `
      insert into ria_notifications (
        collection_order_id, transfer_id, status, headers, payload, processed, processing_error, received_at, processed_at
      )
      values ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8::timestamptz, $9::timestamptz)
      returning id
    `,
    [
      record.collectionOrderId,
      record.transferId,
      record.status,
      JSON.stringify(record.headers),
      JSON.stringify(record.payload),
      record.processed,
      record.processingError,
      receivedAt,
      record.processedAt ?? null,
    ]
  );
  return Number(result.rows[0]?.id ?? 0);
}

export async function markRiaNotificationProcessed(id: number, processingError?: string | null) {
  await ensureRiaStore();
  await getPool().query(
    `
      update ria_notifications
      set processed = true,
          processing_error = $2,
          processed_at = now()
      where id = $1
    `,
    [id, processingError ?? null]
  );
}

export async function getRiaCollectionOrderById(id: string) {
  await ensureRiaStore();
  const result = await getPool().query<{
    id: string;
    external_id: string | null;
    transfer_id: string | null;
    merchant_id: string | null;
    payment_page_id: string | null;
    integration_mode: string | null;
    status: string;
    requested_amount: string | number | null;
    requested_currency: string | null;
    payment_url: string | null;
    latest_payload: Record<string, unknown>;
    created_at: string;
    updated_at: string;
  }>(
    `select id, external_id, transfer_id, merchant_id, payment_page_id, integration_mode, status, requested_amount::text,
            requested_currency, payment_url, latest_payload, created_at, updated_at
     from ria_collection_orders
     where id = $1
     limit 1`,
    [id]
  );
  const row = result.rows[0];
  if (!row) return undefined;
  return {
    id: row.id,
    externalId: row.external_id,
    transferId: row.transfer_id,
    merchantId: row.merchant_id,
    paymentPageId: row.payment_page_id,
    integrationMode: row.integration_mode,
    status: row.status,
    requestedAmount: asNumber(row.requested_amount),
    requestedCurrency: row.requested_currency,
    paymentUrl: row.payment_url,
    latestPayload: row.latest_payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } satisfies RiaCollectionOrderRecord;
}
