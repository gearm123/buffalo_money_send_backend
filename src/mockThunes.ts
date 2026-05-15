/**
 * Offline stand-in for Thunes Money Transfer API v2 responses when
 * THUNES_USE_MOCK=true or credentials are missing. Shapes follow public docs.
 */

const store = {
  quotationSeq: 700000,
  transactionSeq: 800000,
  paymentOrders: new Map<string, MockPaymentOrder>(),
};

function nextQid() {
  store.quotationSeq += 1;
  return store.quotationSeq;
}

function nextTid() {
  store.transactionSeq += 1;
  return store.transactionSeq;
}

type Json = Record<string, unknown>;

type MockPaymentOrder = {
  id: string;
  external_id?: string;
  status: string;
  requested?: { amount?: number; currency?: string };
  payment_url: string | null;
  creation_date: string;
  merchant_id?: string;
  integration_mode?: string;
  return_url?: string;
  notification_url?: string;
  error_url?: string;
  aborted_url?: string;
};

function paymentOrderBaseUrl(body: Json): string {
  const merchantUrls = (body.merchant_urls as Json | undefined) ?? {};
  const notificationUrl = typeof merchantUrls.notification_url === "string" ? merchantUrls.notification_url : "";
  if (notificationUrl) {
    try {
      return new URL(notificationUrl).origin;
    } catch {
      // fall through to env/default
    }
  }
  return (process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, "");
}

function asAmount(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export async function mockThunesProxy(
  method: string,
  path: string,
  body: unknown,
  query?: Record<string, string | undefined>
): Promise<{ status: number; data: unknown }> {
  const base = "/v2/money-transfer";
  const acceptP = "/v1/payment";

  /** Thunes Collection (Accept) – instant CHARGED in mock for local e2e without a hosted pay page. */
  if (method === "POST" && path === `${acceptP}/payment-orders`) {
    const b = body as Json;
    const id = `acc-mock-${7000000 + nextQid()}`;
    const merchantUrls = (b.merchant_urls as Json | undefined) ?? {};
    const paymentUrl = `${paymentOrderBaseUrl(b)}/mock/thunes/pay/${encodeURIComponent(id)}`;
    const order: MockPaymentOrder = {
      id,
      external_id: typeof b.external_id === "string" ? b.external_id : undefined,
      status: "PENDING",
      requested: {
        amount: asAmount((b.requested as Json | undefined)?.amount),
        currency: typeof (b.requested as Json | undefined)?.currency === "string" ? String((b.requested as Json).currency) : undefined,
      },
      payment_url: paymentUrl,
      creation_date: new Date().toISOString(),
      merchant_id: typeof b.merchant_id === "string" ? b.merchant_id : undefined,
      integration_mode: typeof b.integration_mode === "string" ? b.integration_mode : "REDIRECT",
      return_url: typeof merchantUrls.return_url === "string" ? merchantUrls.return_url : undefined,
      notification_url: typeof merchantUrls.notification_url === "string" ? merchantUrls.notification_url : undefined,
      error_url: typeof merchantUrls.error_url === "string" ? merchantUrls.error_url : undefined,
      aborted_url: typeof merchantUrls.aborted_url === "string" ? merchantUrls.aborted_url : undefined,
    };
    store.paymentOrders.set(id, order);
    return {
      status: 201,
      data: order,
    };
  }
  if (method === "GET" && new RegExp(`^${acceptP}/payment-orders/[^/]+$`).test(path)) {
    const id = path.split("/").pop() as string;
    const order = store.paymentOrders.get(id);
    if (!order) {
      return {
        status: 404,
        data: { errors: [{ code: "MOCK_404", message: `Mock payment order not found: ${id}` }] },
      };
    }
    return {
      status: 200,
      data: order,
    };
  }

  if (method === "GET" && path.startsWith(`${base}/payers`) && !path.startsWith(`${base}/payers/`)) {
    const c = query?.country_iso_code ?? "THA";
    const th = [
      {
        id: 90001,
        name: "Mock TH — Wallet (sandbox)",
        precision: 2,
        increment: 0.01,
        currency: "THB",
        country_iso_code: "THA",
        service: { id: 4, name: "MobileWallet" },
        transaction_types: {
          C2C: {
            minimum_transaction_amount: 1,
            maximum_transaction_amount: 10000,
            credit_party_identifiers_accepted: [["msisdn"]],
            required_sending_entity_fields: [["firstname", "lastname", "email"]],
            required_receiving_entity_fields: [["firstname", "lastname"]],
            required_documents: [[]],
            purpose_of_remittance_values_accepted: ["FAMILY_SUPPORT", "EDUCATION"],
          },
        },
      },
      {
        id: 90002,
        name: "Mock TH — Bank payout",
        precision: 2,
        increment: 0.01,
        currency: "THB",
        country_iso_code: "THA",
        service: { id: 2, name: "BankAccount" },
        transaction_types: {
          C2C: {
            minimum_transaction_amount: 5,
            maximum_transaction_amount: 50000,
            credit_party_identifiers_accepted: [["bank_account_number", "swift_bic_code"]],
            required_sending_entity_fields: [["firstname", "lastname", "email"]],
            required_receiving_entity_fields: [["firstname", "lastname"]],
            required_documents: [[]],
            purpose_of_remittance_values_accepted: ["FAMILY_SUPPORT"],
          },
        },
      },
    ];
    const ph = [
      {
        id: 91001,
        name: "Mock PH — Mobile wallet",
        precision: 2,
        increment: 0.01,
        currency: "PHP",
        country_iso_code: "PHL",
        service: { id: 4, name: "MobileWallet" },
        transaction_types: {
          C2C: {
            minimum_transaction_amount: 1,
            maximum_transaction_amount: 50000,
            credit_party_identifiers_accepted: [["msisdn"]],
            required_sending_entity_fields: [["firstname", "lastname", "email"]],
            required_receiving_entity_fields: [["firstname", "lastname"]],
            required_documents: [[]],
            purpose_of_remittance_values_accepted: ["FAMILY_SUPPORT"],
          },
        },
      },
    ];
    if (c === "PHL") return { status: 200, data: ph };
    if (c === "THA") return { status: 200, data: th };
    return {
      status: 200,
      data: [
        ...th.map((p) => ({ ...p, id: p.id + 1000 })),
        ...ph.map((p) => ({ ...p, id: p.id + 1000 })),
      ],
    };
  }

  if (method === "POST" && path === `${base}/quotations`) {
    const b = body as Json;
    const qid = nextQid();
    const srcAmt = Number((b.source as Json)?.amount ?? 0);
    const srcCur = String((b.source as Json)?.currency ?? "USD");
    const destCur = String((b.destination as Json)?.currency ?? "THB");
    const feeAmt = Math.max(1.5, srcAmt * 0.008 + 2);
    const rate =
      destCur === "PHP" ? 58.2 : destCur === "MXN" ? 17.1 : destCur === "THB" ? 36.2 : 36.2;
    const destAmt = srcAmt * rate;

    return {
      status: 201,
      data: {
        id: qid,
        external_id: b.external_id,
        payer: {
          id: Number(b.payer_id) || 90001,
          name: "Mock TH — Wallet (sandbox)",
          currency: destCur,
          country_iso_code: "THA",
          service: { id: 4, name: "MobileWallet" },
        },
        mode: b.mode ?? "SOURCE_AMOUNT",
        transaction_type: b.transaction_type ?? "C2C",
        source: {
          ...((b.source as Json) || {}),
          amount: srcAmt,
          currency: srcCur,
        },
        destination: {
          amount: Number(destAmt.toFixed(2)),
          currency: destCur,
        },
        sent_amount: { currency: srcCur, amount: srcAmt },
        wholesale_fx_rate: 36.2,
        fee: { currency: srcCur, amount: Number(feeAmt.toFixed(2)) },
        creation_date: new Date().toISOString(),
        expiration_date: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      },
    };
  }

  if (method === "POST" && /\/quotations\/\d+\/transactions$/.test(path)) {
    const b = body as Json;
    const tid = nextTid();
    return {
      status: 201,
      data: {
        id: tid,
        status: "10000",
        status_message: "CREATED",
        status_class: "1",
        status_class_message: "CREATED",
        external_id: b.external_id,
        transaction_type: "C2C",
        payer_transaction_reference: `MOCK-REF-${tid}`,
        creation_date: new Date().toISOString(),
        expiration_date: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        credit_party_identifier: b.credit_party_identifier,
        source: { country_iso_code: "USA", currency: "USD", amount: 100 },
        destination: { currency: "THB", amount: 3620 },
        fee: { currency: "USD", amount: 4.2 },
        purpose_of_remittance: b.purpose_of_remittance ?? "FAMILY_SUPPORT",
      },
    };
  }

  if (method === "POST" && /\/transactions\/\d+\/confirm$/.test(path)) {
    const tid = Number(path.match(/\/transactions\/(\d+)\/confirm$/)?.[1]);
    return {
      status: 200,
      data: {
        id: tid,
        status: "20000",
        status_message: "CONFIRMED",
        status_class: "2",
      },
    };
  }

  if (method === "GET" && /\/transactions\/\d+$/.test(path) && !path.includes("/confirm")) {
    const tid = Number(path.match(/\/transactions\/(\d+)$/)?.[1]);
    return {
      status: 200,
      data: {
        id: tid,
        status: "70000",
        status_message: "COMPLETED",
        status_class: "7",
        status_class_message: "COMPLETED",
      },
    };
  }

  return {
    status: 404,
    data: { errors: [{ code: "MOCK_404", message: `No mock for ${method} ${path}` }] },
  };
}

export function getMockPaymentOrder(id: string): MockPaymentOrder | undefined {
  return store.paymentOrders.get(id);
}

export function setMockPaymentOrderStatus(id: string, status: "PENDING" | "CHARGED" | "FAILED" | "ABORTED") {
  const order = store.paymentOrders.get(id);
  if (!order) return undefined;
  order.status = status;
  return order;
}
