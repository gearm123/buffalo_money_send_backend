# BuffaloMoneySend — API (Express)

Partner repo for the **BuffaloMoneySend** web app. Deploy on **Render** (or any Node host).  
This was split from a monorepo: **push this directory as its own GitHub repository** (e.g. `git init` here, add remote, `git push`).

**Sibling front end** (Vite + React) lives in a separate project folder: `../global-send` (or your own clone) — not included here.

## Run locally

```bash
cd buffalomoneysend-backend
cp .env.example .env
# set DATABASE_URL (required). Leave THUNES_USE_MOCK=true for the local hosted mock payment flow.
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
   - `THUNES_BASE_URL`
   - `THUNES_API_KEY`
   - `THUNES_API_SECRET`
   - `THUNES_THAILAND_PAYER_ID`
   - `THUNES_ACCEPT_MERCHANT_ID`
   - `THUNES_ACCEPT_PAYMENT_PAGE_ID`
   - `PUBLIC_API_URL`
   - `PUBLIC_WEB_APP_URL`
   - `PLATFORM_FEE_PERCENT`
4. For **Thailand bank payout** via the Thunes Money Transfer API, set `THUNES_THAILAND_PAYER_ID` to the payer Thunes gives you for that corridor. With `THUNES_USE_MOCK=true`, the mock defaults to `90002` if this is unset.

## Front end

The Vite + React app lives in a **separate repository**. Point it at this API with `VITE_API_BASE=https://<your-service>.onrender.com` and rebuild.

## Checkout and payout

- **Checkout:** [Thunes Accept](https://docs.thunes.com/accept/v1) creates a hosted **payment order**. In mock mode, Buffalo serves a local hosted payment page with pay / cancel / fail actions but keeps the same redirect contract as live.
- **Payout:** [Thunes Money Transfer](https://docs.thunes.com/money-transfer/v2) sends `amountSend` to the recipient’s Thai bank account after payment clears.
- **Profit / margin:** the customer is charged `totalCharged = amountSend + platformFee`, while the payout side still sends only `amountSend`. That difference is your margin on the collection side, subject to your Thunes settlement model and Thunes fees.

You need Thunes business **API access** for both product lines (Accept and MT) in the corridors you use—onboarding is still required; this repo only wires the calls.

## Mock Thunes quickstart

Use this when you want the full Buffalo send flow working before Thunes approves your live account.

1. Set `DATABASE_URL` in `.env`.
2. Keep `THUNES_USE_MOCK=true`.
3. Set `PUBLIC_API_URL=http://localhost:4000`.
4. Set `PUBLIC_WEB_APP_URL=http://localhost:5173`.
5. Start the API with `npm run dev`.

When the front end creates a transfer in mock mode, step 4 opens a hosted mock payment page served by this API. Choosing **Pay now** returns to the app and completes the mock payout; **Cancel payment** and **Simulate payment error** exercise the return/error paths.

When you are approved for live Thunes, keep the same flow and replace only the environment values:

- set `THUNES_BASE_URL`
- set `THUNES_API_KEY`
- set `THUNES_API_SECRET`
- set `THUNES_ACCEPT_MERCHANT_ID`
- set `THUNES_ACCEPT_PAYMENT_PAGE_ID`
- set `THUNES_THAILAND_PAYER_ID`
- set `THUNES_USE_MOCK=false`

## Swapping the Thailand “rail” (provider)

End-to-end sends are behind a pluggable interface in **`src/transfer/rail/`**:

- **`ThailandTransferRail`** — `beginCollection` + `finalizeFromHttpContext`.
- **Registry** — `getThailandTransferRailForNewTransfer()` (env `THAILAND_TRANSFER_RAIL` or default rail).
- **Implementation today** — `thunes_e2e` (Thunes Accept + Thunes MT).

To add **another vendor** (e.g. Wise, Rapyd): implement `ThailandTransferRail` in a new file, import it in **`registry.ts`**, and register it. Set `THAILAND_TRANSFER_RAIL=<your_id>` to route new creates through it. `TransferRecord.railId` and generic `collectionOrderId` keep HTTP independent of a single brand.

Payout to Thai banks is still under **`thunesPayout.ts`** for the Thunes MT path; a second provider would add its own client module and call it from a new rail (or a shared `payout/` adapter if you only swap the last mile).

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
