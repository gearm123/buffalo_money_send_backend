# BuffaloMoneySend — API (Express)

Partner repo for the **BuffaloMoneySend** web app. Deploy on **Render** (or any Node host).  
This was split from a monorepo: **push this directory as its own GitHub repository** (e.g. `git init` here, add remote, `git push`).

**Sibling front end** (Vite + React) lives in a separate project folder: `../global-send` (or your own clone) — not included here.

## Run locally

```bash
cd buffalomoneysend-backend
cp .env.example .env
# set Thunes and/or Stripe env (see .env.example), including PAYMENT_PROVIDER
npm install
npm run dev
```

Listens on `http://localhost:4000` (or `PORT`). Health: `GET /api/health`.

## Deploy (Render)

1. Push this repository to GitHub.
2. Render → **New** → **Blueprint** → select this repo, or **Web Service** with:
   - **Build:** `npm install`  
   - **Start:** `npm start`  
   - **Health check path:** `/api/health`
3. Set environment variables (see `.env.example`), including `PLATFORM_FEE_PERCENT` (your per-transfer margin) and see `STRIPE_REVENUE.md` for how Stripe settlement works.
4. For **Thailand bank payout** via the Thunes Money Transfer API, set `THUNES_THAILAND_PAYER_ID` to the payer Thunes gives you for that corridor. With `THUNES_USE_MOCK=true`, the mock defaults to `90002` if this is unset. Card capture stays on **Stripe**; the API then creates a Thunes quotation → transaction → confirm toward the recipient account collected on your site.

## Front end

The Vite + React app lives in a **separate repository**. Point it at this API with `VITE_API_BASE=https://<your-service>.onrender.com` and rebuild.

## Card checkout: Thunes vs Stripe

- **`PAYMENT_PROVIDER=thunes` (default when `STRIPE_SECRET_KEY` is empty):** [Thunes Accept](https://docs.thunes.com/accept/v1) creates a **payment order** (hosted redirect in production; mock can mark **CHARGED** immediately). On success, [Money Transfer](https://docs.thunes.com/money-transfer/v2) sends `amountSend` to the recipient’s Thai bank; your **fee** is `totalCharged - amountSend` in your Thunes **collection** balance (funding and settlement are still per your Thunes contract). Set **`THUNES_ACCEPT_MERCHANT_ID`** and **`THUNES_ACCEPT_PAYMENT_PAGE_ID`** in live mode (and **`PUBLIC_API_URL` / `PUBLIC_WEB_APP_URL`** for redirects).
- **`PAYMENT_PROVIDER=stripe`:** **Stripe** captures the card; the API then uses **Thunes MT** for the TH payout (as before). One vendor for card+rails is **Thunes**; Stripe is optional for embedded Elements.

You need Thunes business **API access** for both product lines (Accept and MT) in the corridors you use—onboarding is still required; this repo only wires the calls.

## Swapping the Thailand “rail” (provider)

End-to-end sends are behind a pluggable interface in **`src/transfer/rail/`**:

- **`ThailandTransferRail`** — `beginCollection` + `finalizeFromHttpContext`.
- **Registry** — `getThailandTransferRailForNewTransfer()` (env `THAILAND_TRANSFER_RAIL` or `PAYMENT_PROVIDER` default).
- **Implementations** — `thunes_e2e` (Thunes Accept + Thunes MT) and `stripe_thunes_payout` (Stripe + Thunes MT for payout).

To add **another vendor** (e.g. Wise, Rapyd): implement `ThailandTransferRail` in a new file, import it in **`registry.ts`**, and register it. Set `THAILAND_TRANSFER_RAIL=<your_id>` to route new creates through it. `TransferRecord.railId` and generic `collectionOrderId` keep HTTP independent of a single brand.

Payout to Thai banks is still under **`thunesPayout.ts`** for the Thunes MT path; a second provider would add its own client module and call it from a new rail (or a shared `payout/` adapter if you only swap the last mile).
