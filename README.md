# BuffaloMoneySend — API (Express)

Partner repo for the **BuffaloMoneySend** web app. Deploy on **Render** (or any Node host).  
This was split from a monorepo: **push this directory as its own GitHub repository** (e.g. `git init` here, add remote, `git push`).

**Sibling front end** (Vite + React) lives in a separate project folder: `../global-send` (or your own clone) — not included here.

## Run locally

```bash
cd buffalomoneysend-backend
cp .env.example .env
# set DATABASE_URL (required). Leave RIA_ACTIVE=false and RIA_USE_MOCK=true for now.
npm install
npm run dev
```

Listens on `http://localhost:4000` (or `PORT`). Health: `GET /api/health`.

## Database

This API now uses **PostgreSQL** for persistent storage:

- **Transfers** are stored in Postgres instead of process memory.
- **Referrals** are stored in a separate table with per-name counters.
- Connection config follows the same pattern as the `translate_chat` project: `DATABASE_URL`, `POSTGRES_URL`, or `DATABASE_URL_FILE`.

On **Render**, create a Postgres service and set the web service's **`DATABASE_URL`** to the Postgres service's **Internal Database URL**.

## Deploy (Render)

1. Push this repository to GitHub.
2. Render → **New** → **Blueprint** → select this repo, or **Web Service** with:
   - **Build:** `npm install`  
   - **Start:** `npm start`  
   - **Health check path:** `/api/health`
3. Set environment variables from `.env.example`, especially:
   - `DATABASE_URL`
   - `RIA_ACTIVE`
   - `RIA_BASE_URL`
   - `RIA_API_KEY`
   - `RIA_API_SECRET`
   - `RIA_CLIENT_IP_ADDRESS`
   - `PUBLIC_API_URL`
   - `PUBLIC_WEB_APP_URL`
   - `PLATFORM_FEE_PERCENT`
4. Keep `RIA_ACTIVE=false` until you are ready to let the normal transfer flow use Ria directly.

## Front end

The Vite + React app lives in a **separate repository**. Point it at this API with `VITE_API_BASE=https://<your-service>.onrender.com` and rebuild.

## Checkout and payout

- The backend now exposes a **Ria official staging-style API layer** for internal use under `/api/ria/*`.
- The normal app transfer flow remains **inactive** for Ria while `RIA_ACTIVE=false`.
- This lets you keep Ria implemented on the backend now, while you use a separate first-stage affiliate/referral path before activating direct transfer flows later.

This backend keeps the **Ria integration implemented but inactive by default**. The dedicated `/api/ria/*` routes are intended for internal testing and later rollout work.

## Mock Ria quickstart

Use this when you want the Ria backend routes available for internal testing before real Ria access is active.

1. Set `DATABASE_URL` in `.env`.
2. Keep `RIA_ACTIVE=false`.
3. Keep `RIA_USE_MOCK=true`.
4. Set `RIA_CLIENT_IP_ADDRESS=127.0.0.1`.
4. Set `PUBLIC_API_URL=http://localhost:4000`.
5. Set `PUBLIC_WEB_APP_URL=http://localhost:5173`.
6. Start the API with `npm run dev`.

At this stage, the normal app transfer flow is intentionally blocked from using Ria. Instead, use the `/api/ria/*` endpoints only for internal testing.

When you are ready to connect and activate a live Ria integration:

- set `RIA_ACTIVE=true`
- set `RIA_BASE_URL`
- set `RIA_API_KEY`
- set `RIA_API_SECRET`
- set `RIA_CLIENT_IP_ADDRESS`
- set `RIA_USE_MOCK=false`

## Ria Auth Model

The current backend follows the public Ria staging documentation pattern:

- **Basic auth** with `RIA_API_KEY` and `RIA_API_SECRET`
- required `ClientIpAddress` header on every Ria call
- **customer authentication** through `/Authenticate`
- subsequent customer-scoped calls use a **Session** token

For internal testing, pass these headers to customer-authenticated backend routes:

- `x-ria-customer-id`
- `x-ria-customer-password`

Or pass:

- `x-ria-session-token`

If no session token is supplied, the backend will try to authenticate first using the customer-id/password headers.

## Official Ria Routes

The backend currently exposes these official staging-style Ria routes:

- `GET /api/ria/Authenticate`
- `GET /api/ria/v1/Location/GetSendToCountries`
- `PUT /api/ria/v1/Location/GetAvailableCurrenciesForCountry`
- `PUT /api/ria/v1/Location/GetAvailableDeliveryMethodsForCountry`
- `POST /api/ria/v1/Partner/CalculateFee`
- `POST /api/ria/v1/Partner/ValidateOrder`
- `PUT /api/ria/v1/Pricing/GetServicesAvailable`
- `PUT /api/ria/v1/Pricing/CalculateFee`
- `GET /api/ria/v1/Payment/GetAvailablePaymentMethods`
- `PUT /api/ria/v1/Order/ValidateMoneyTransferOrder`
- `PUT /api/ria/v1/Order/CreateMoneyTransferOrderV2`
- `PUT /api/ria/v1/Order/ConfirmOrder`
- `PUT /api/ria/v1/Order/CancelOrder`
- `PUT /api/ria/v1/Order/RefundOrder`
- `PUT /api/ria/v1/Order/GetOrderDetailsByOrderId`
- `GET /api/ria/v1/Order/ProcessOrderStatusChangeNotifications`

## Swapping the Thailand “rail” (provider)

End-to-end sends are behind a pluggable interface in **`src/transfer/rail/`**:

- **`ThailandTransferRail`** — `beginCollection` + `finalizeFromHttpContext`.
- **Registry** — `getThailandTransferRailForNewTransfer()` (env `THAILAND_TRANSFER_RAIL` or default rail).
- **Implementation today** — `ria_e2e`, but the normal transfer flow only uses it when `RIA_ACTIVE=true`.

To add **another vendor** (e.g. Wise, Rapyd): implement `ThailandTransferRail` in a new file, import it in **`registry.ts`**, and register it. Set `THAILAND_TRANSFER_RAIL=<your_id>` to route new creates through it. `TransferRecord.railId` and generic `collectionOrderId` keep HTTP independent of a single brand.

The existing `ria_e2e` transfer rail remains a dormant scaffold and is not the primary integration path right now. The official internal `/api/ria/*` API layer is the part aligned to Ria staging docs.

## Referral endpoints

The API also tracks referral counts by name in Postgres.

- `POST /api/referrals/record`
  - body: `{ "name": "Alice" }`
  - increments the stored value for that name
- `POST /api/referrals/reset`
  - body: `{ "name": "Alice" }` resets just one name to `0`
  - body: `{}` resets **all** names to `0`
- `GET /api/referrals`
  - returns the current list as JSON
  - add `?pretty=1` to get a plain-text human-readable list like `Alice : 3`
- `GET /api/referrals/export`
  - returns a CSV download suitable for `curl`

Examples:

```bash
curl -X POST http://localhost:4000/api/referrals/record \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Alice\"}"
```

```bash
curl http://localhost:4000/api/referrals
```

```bash
curl http://localhost:4000/api/referrals?pretty=1
```

```bash
curl -L http://localhost:4000/api/referrals/export -o referrals.csv
```
