/**
 * Offline stand-in for a future Ria integration. This lets Buffalo go online
 * with a stable backend contract and later swap to real Ria credentials.
 */

const store = {
  collectionSeq: 710000,
  payoutSeq: 810000,
  payoutTransferSeq: 910000,
  authSeq: 610000,
  collectionOrders: new Map<string, MockRiaCollectionOrder>(),
  payoutQuotes: new Map<number, MockRiaPayoutQuote>(),
  payoutTransfers: new Map<number, MockRiaPayoutTransfer>(),
  sessions: new Map<string, { customerId: string; createdAt: string }>(),
};

type Json = Record<string, unknown>;

type MockRiaCollectionOrder = {
  id: string;
  external_id?: string;
  status: string;
  requested?: { amount?: number; currency?: string };
  payment_url: string | null;
  creation_date: string;
  merchant_id?: string;
  payment_page_id?: string;
  integration_mode?: string;
  return_url?: string;
  notification_url?: string;
  error_url?: string;
  aborted_url?: string;
};

type MockRiaPayoutQuote = {
  id: number;
  external_id?: string;
  payer_id?: number;
  source?: { amount?: number; currency?: string; country_iso_code?: string };
  destination?: { amount?: number; currency?: string };
  fee?: { amount?: number; currency?: string };
  creation_date: string;
  expiration_date: string;
};

type MockRiaPayoutTransfer = {
  id: number;
  quote_id: number;
  external_id?: string;
  status: string;
  status_class: string;
  status_message: string;
  payer_transfer_reference: string;
  creation_date: string;
};

function nextCollectionId() {
  store.collectionSeq += 1;
  return `ria-col-${store.collectionSeq}`;
}

function nextSessionToken() {
  store.authSeq += 1;
  return `ria-session-${store.authSeq}`;
}

function nextPayoutQuoteId() {
  store.payoutSeq += 1;
  return store.payoutSeq;
}

function nextPayoutTransferId() {
  store.payoutTransferSeq += 1;
  return store.payoutTransferSeq;
}

function baseUrl(body: Json): string {
  const merchantUrls = (body.merchant_urls as Json | undefined) ?? {};
  const notificationUrl = typeof merchantUrls.notification_url === "string" ? merchantUrls.notification_url : "";
  if (notificationUrl) {
    try {
      return new URL(notificationUrl).origin;
    } catch {
      // fall through to defaults
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

export async function mockRiaProxy(
  method: string,
  path: string,
  body: unknown,
  query?: Record<string, string | undefined>
): Promise<{ status: number; data: unknown }> {
  const collection = "/v1/collection";
  const payout = "/v1/payout";

  if (method === "GET" && path === "/Authenticate") {
    const payload = body as Json | null;
    const customerId =
      (payload && typeof payload.customerId === "string" ? payload.customerId : undefined) ||
      "mock.customer@example.com";
    const token = nextSessionToken();
    store.sessions.set(token, { customerId, createdAt: new Date().toISOString() });
    return {
      status: 200,
      data: {
        token,
        expiresInMinutes: 15,
        customerId,
      },
    };
  }

  if (method === "GET" && path === "/v1/Location/GetSendToCountries") {
    return {
      status: 200,
      data: [
        { CountryCode: "THA", CountryName: "Thailand" },
        { CountryCode: "PHL", CountryName: "Philippines" },
        { CountryCode: "MEX", CountryName: "Mexico" },
      ],
    };
  }

  if (method === "PUT" && path === "/v1/Location/GetAvailableCurrenciesForCountry") {
    const payload = body as Json;
    const countryCode = typeof payload.CountryCode === "string" ? payload.CountryCode : "THA";
    const currencies =
      countryCode === "PHL"
        ? [{ CurrencyCode: "PHP", CurrencyName: "Philippine Peso" }]
        : countryCode === "MEX"
          ? [{ CurrencyCode: "MXN", CurrencyName: "Mexican Peso" }]
          : [{ CurrencyCode: "THB", CurrencyName: "Thai Baht" }];
    return { status: 200, data: currencies };
  }

  if (method === "PUT" && path === "/v1/Location/GetAvailableDeliveryMethodsForCountry") {
    return {
      status: 200,
      data: [
        { DeliveryMethodCode: "BANK", DeliveryMethodName: "Bank Deposit" },
        { DeliveryMethodCode: "CASH", DeliveryMethodName: "Cash Pickup" },
      ],
    };
  }

  if (method === "PUT" && path === "/v1/Pricing/GetServicesAvailable") {
    return {
      status: 200,
      data: [
        { ServiceCode: "BANK_DEPOSIT", ServiceName: "Bank Deposit" },
        { ServiceCode: "CASH_PICKUP", ServiceName: "Cash Pickup" },
      ],
    };
  }

  if (method === "PUT" && path === "/v1/Pricing/CalculateFee") {
    const payload = body as Json;
    const amount = asAmount(payload.AmountToSend) ?? asAmount(payload.SendAmount) ?? 100;
    const fee = Math.max(2, amount * 0.015);
    return {
      status: 200,
      data: {
        FeeAmount: Number(fee.toFixed(2)),
        TotalAmount: Number((amount + fee).toFixed(2)),
        SendAmount: Number(amount.toFixed(2)),
      },
    };
  }

  if (method === "POST" && path === "/v1/Partner/CalculateFee") {
    const payload = body as Json;
    const amount = asAmount(payload.AmountToSend) ?? asAmount(payload.SendAmount) ?? 100;
    const fee = Math.max(1.75, amount * 0.012);
    return {
      status: 200,
      data: {
        FeeAmount: Number(fee.toFixed(2)),
        TotalAmount: Number((amount + fee).toFixed(2)),
        SendAmount: Number(amount.toFixed(2)),
      },
    };
  }

  if (method === "GET" && path === "/v1/Payment/GetAvailablePaymentMethods") {
    return {
      status: 200,
      data: [
        { PaymentMethodCode: "CARD", PaymentMethodName: "Credit or debit card" },
        { PaymentMethodCode: "BANK", PaymentMethodName: "Bank account" },
      ],
    };
  }

  if (method === "POST" && path === "/v1/Partner/ValidateOrder") {
    return {
      status: 200,
      data: {
        IsValid: true,
        ValidationToken: `ria-validate-${Date.now()}`,
        PreOrderValues: body,
      },
    };
  }

  if (method === "PUT" && path === "/v1/Order/ValidateMoneyTransferOrder") {
    return {
      status: 200,
      data: {
        IsValid: true,
        TransactionId: `ria-tx-${Date.now()}`,
        ValidationToken: `ria-order-validate-${Date.now()}`,
      },
    };
  }

  if (method === "PUT" && path === "/v1/Order/CreateMoneyTransferOrderV2") {
    const payload = body as Json;
    const id = nextCollectionId();
    const paymentUrl = `${baseUrl(payload)}/mock/ria/pay/${encodeURIComponent(id)}`;
    const order: MockRiaCollectionOrder = {
      id,
      external_id:
        typeof payload.ExternalId === "string"
          ? payload.ExternalId
          : typeof payload.external_id === "string"
            ? payload.external_id
            : undefined,
      status: "PENDING",
      requested: {
        amount: asAmount(payload.SendAmount) ?? asAmount(payload.AmountToSend),
        currency:
          typeof payload.CurrencyFrom === "string"
            ? payload.CurrencyFrom
            : typeof payload.Currency === "string"
              ? payload.Currency
              : "USD",
      },
      payment_url: paymentUrl,
      creation_date: new Date().toISOString(),
    };
    store.collectionOrders.set(id, order);
    return {
      status: 200,
      data: {
        OrderId: id,
        TransactionId: payload.TransactionId ?? `ria-tx-${Date.now()}`,
        Status: order.status,
        PaymentUrl: paymentUrl,
      },
    };
  }

  if (method === "PUT" && path === "/v1/Order/ConfirmOrder") {
    const payload = body as Json;
    const orderId = typeof payload.OrderId === "string" ? payload.OrderId : "";
    const order = orderId ? store.collectionOrders.get(orderId) : undefined;
    if (order) order.status = "PAID";
    return {
      status: 200,
      data: {
        OrderId: orderId || `ria-confirm-${Date.now()}`,
        Status: order?.status ?? "PAID",
      },
    };
  }

  if (method === "PUT" && path === "/v1/Order/CancelOrder") {
    const payload = body as Json;
    const orderId = typeof payload.OrderId === "string" ? payload.OrderId : "";
    const order = orderId ? store.collectionOrders.get(orderId) : undefined;
    if (order) order.status = "CANCELLED";
    return { status: 200, data: { OrderId: orderId, Status: order?.status ?? "CANCELLED" } };
  }

  if (method === "PUT" && path === "/v1/Order/RefundOrder") {
    const payload = body as Json;
    const orderId = typeof payload.OrderId === "string" ? payload.OrderId : "";
    const order = orderId ? store.collectionOrders.get(orderId) : undefined;
    if (order) order.status = "REFUNDED";
    return { status: 200, data: { OrderId: orderId, Status: order?.status ?? "REFUNDED" } };
  }

  if (method === "PUT" && path === "/v1/Order/GetOrderDetailsByOrderId") {
    const payload = body as Json;
    const orderId = typeof payload.OrderId === "string" ? payload.OrderId : "";
    const order = orderId ? store.collectionOrders.get(orderId) : undefined;
    if (!order) {
      return { status: 404, data: { errors: [{ code: "RIA_404", message: `Order not found: ${orderId}` }] } };
    }
    return {
      status: 200,
      data: {
        OrderId: order.id,
        ExternalId: order.external_id ?? null,
        Status: order.status,
        SendAmount: order.requested?.amount ?? null,
        CurrencyFrom: order.requested?.currency ?? null,
      },
    };
  }

  if (method === "GET" && path === "/v1/Order/ProcessOrderStatusChangeNotifications") {
    return {
      status: 200,
      data: Array.from(store.collectionOrders.values()).map((order) => ({
        OrderId: order.id,
        Status: order.status,
        UpdateDate: new Date().toISOString(),
      })),
    };
  }

  if (method === "POST" && path === `${collection}/orders`) {
    const payload = body as Json;
    const id = nextCollectionId();
    const merchantUrls = (payload.merchant_urls as Json | undefined) ?? {};
    const paymentUrl = `${baseUrl(payload)}/mock/ria/pay/${encodeURIComponent(id)}`;
    const order: MockRiaCollectionOrder = {
      id,
      external_id: typeof payload.external_id === "string" ? payload.external_id : undefined,
      status: "PENDING",
      requested: {
        amount: asAmount((payload.requested as Json | undefined)?.amount),
        currency:
          typeof (payload.requested as Json | undefined)?.currency === "string"
            ? String((payload.requested as Json).currency)
            : undefined,
      },
      payment_url: paymentUrl,
      creation_date: new Date().toISOString(),
      merchant_id: typeof payload.merchant_id === "string" ? payload.merchant_id : undefined,
      payment_page_id: typeof payload.payment_page_id === "string" ? payload.payment_page_id : undefined,
      integration_mode: typeof payload.integration_mode === "string" ? payload.integration_mode : "REDIRECT",
      return_url: typeof merchantUrls.return_url === "string" ? merchantUrls.return_url : undefined,
      notification_url: typeof merchantUrls.notification_url === "string" ? merchantUrls.notification_url : undefined,
      error_url: typeof merchantUrls.error_url === "string" ? merchantUrls.error_url : undefined,
      aborted_url: typeof merchantUrls.aborted_url === "string" ? merchantUrls.aborted_url : undefined,
    };
    store.collectionOrders.set(id, order);
    return { status: 201, data: order };
  }

  if (method === "GET" && new RegExp(`^${collection}/orders/[^/]+$`).test(path)) {
    const id = path.split("/").pop() as string;
    const order = store.collectionOrders.get(id);
    if (!order) {
      return { status: 404, data: { errors: [{ code: "RIA_404", message: `Collection order not found: ${id}` }] } };
    }
    return { status: 200, data: order };
  }

  if (method === "GET" && path.startsWith(`${payout}/payers`)) {
    const country = query?.country_iso_code ?? "THA";
    const payers = [
      {
        id: 92001,
        name: "Ria Mock Thailand Bank",
        currency: "THB",
        country_iso_code: "THA",
        service_name: "BankTransfer",
      },
      {
        id: 93001,
        name: "Ria Mock Philippines Wallet",
        currency: "PHP",
        country_iso_code: "PHL",
        service_name: "Wallet",
      },
    ];
    return { status: 200, data: payers.filter((payer) => !country || payer.country_iso_code === country) };
  }

  if (method === "POST" && path === `${payout}/quotes`) {
    const payload = body as Json;
    const id = nextPayoutQuoteId();
    const source = (payload.source as Json | undefined) ?? {};
    const destination = (payload.destination as Json | undefined) ?? {};
    const sourceAmount = asAmount(source.amount) ?? 0;
    const sourceCurrency = typeof source.currency === "string" ? source.currency : "USD";
    const destinationCurrency = typeof destination.currency === "string" ? destination.currency : "THB";
    const fxRate = destinationCurrency === "PHP" ? 58.2 : 36.15;
    const feeAmount = Math.max(1.25, sourceAmount * 0.0075 + 1.5);
    const quote: MockRiaPayoutQuote = {
      id,
      external_id: typeof payload.external_id === "string" ? payload.external_id : undefined,
      payer_id: asAmount(payload.payer_id),
      source: {
        amount: sourceAmount,
        currency: sourceCurrency,
        country_iso_code: typeof source.country_iso_code === "string" ? source.country_iso_code : undefined,
      },
      destination: {
        amount: Number((sourceAmount * fxRate).toFixed(2)),
        currency: destinationCurrency,
      },
      fee: {
        amount: Number(feeAmount.toFixed(2)),
        currency: sourceCurrency,
      },
      creation_date: new Date().toISOString(),
      expiration_date: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    };
    store.payoutQuotes.set(id, quote);
    return { status: 201, data: quote };
  }

  if (method === "POST" && /\/quotes\/\d+\/transfers$/.test(path)) {
    const payload = body as Json;
    const quoteId = Number(path.match(/\/quotes\/(\d+)\/transfers$/)?.[1]);
    if (!store.payoutQuotes.has(quoteId)) {
      return { status: 404, data: { errors: [{ code: "RIA_404", message: `Payout quote not found: ${quoteId}` }] } };
    }
    const id = nextPayoutTransferId();
    const transfer: MockRiaPayoutTransfer = {
      id,
      quote_id: quoteId,
      external_id: typeof payload.external_id === "string" ? payload.external_id : undefined,
      status: "CREATED",
      status_class: "1",
      status_message: "CREATED",
      payer_transfer_reference: `RIA-MOCK-${id}`,
      creation_date: new Date().toISOString(),
    };
    store.payoutTransfers.set(id, transfer);
    return { status: 201, data: transfer };
  }

  if (method === "POST" && /\/transfers\/\d+\/confirm$/.test(path)) {
    const id = Number(path.match(/\/transfers\/(\d+)\/confirm$/)?.[1]);
    const transfer = store.payoutTransfers.get(id);
    if (!transfer) {
      return { status: 404, data: { errors: [{ code: "RIA_404", message: `Payout transfer not found: ${id}` }] } };
    }
    transfer.status = "COMPLETED";
    transfer.status_class = "7";
    transfer.status_message = "COMPLETED";
    return { status: 200, data: transfer };
  }

  if (method === "GET" && /\/transfers\/\d+$/.test(path) && !path.endsWith("/confirm")) {
    const id = Number(path.match(/\/transfers\/(\d+)$/)?.[1]);
    const transfer = store.payoutTransfers.get(id);
    if (!transfer) {
      return { status: 404, data: { errors: [{ code: "RIA_404", message: `Payout transfer not found: ${id}` }] } };
    }
    return { status: 200, data: transfer };
  }

  return {
    status: 404,
    data: { errors: [{ code: "RIA_404", message: `No mock for ${method} ${path}` }] },
  };
}

export function getMockRiaCollectionOrder(id: string): MockRiaCollectionOrder | undefined {
  return store.collectionOrders.get(id);
}

export function setMockRiaCollectionOrderStatus(id: string, status: "PENDING" | "PAID" | "FAILED" | "ABORTED") {
  const order = store.collectionOrders.get(id);
  if (!order) return undefined;
  order.status = status;
  return order;
}
