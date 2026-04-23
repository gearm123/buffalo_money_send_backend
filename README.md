# BuffaloMoneySend — API (Express)

Partner repo for the **BuffaloMoneySend** web app. Deploy on **Render** (or any Node host).  
This was split from a monorepo: **push this directory as its own GitHub repository** (e.g. `git init` here, add remote, `git push`).

**Sibling front end** (Vite + React) lives in a separate project folder: `../global-send` (or your own clone) — not included here.

## Run locally

```bash
cd buffalomoneysend-backend
cp .env.example .env
# set STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, etc.
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
3. Set environment variables (see `.env.example`), including `PLATFORM_FEE_PERCENT` (your per-transfer margin) and see `STRIPE_REVENUE.md` for how payouts work.

## Front end

The Vite + React app lives in a **separate repository**. Point it at this API with `VITE_API_BASE=https://<your-service>.onrender.com` and rebuild.
