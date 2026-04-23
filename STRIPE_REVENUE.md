# How your fee and your bank account work (Stripe)

## Example: $100 send with 4% platform fee (`PLATFORM_FEE_PERCENT=4`)

| | Amount |
|---|--------|
| Send (remittance the user intends) | $100.00 |
| Your platform fee (4% of send) | $4.00 |
| **Customer’s card is charged** | **$104.00** |
| **Thunes payout instruction (this repo)** | Uses **$100.00** only (`amountSend`). The **$4.00** is not sent via Thunes—it is your margin left in **Stripe** (same charge, undivided balance until you pay out to your bank). |
| Stripe’s card processing fee | Taken by Stripe from **you** (merchant) out of the $104, per your Stripe pricing—not shown as a separate line to the payer in this app. |

Funding Thunes from your business (top-ups, settlement, etc.) is **separate** from Stripe: you must align operations so the **$100** (or THB equivalent per Thunes) is available in your Thunes float when the API confirms a transaction.

## How you “take” your fee

1. You set **`PLATFORM_FEE_PERCENT`** on the server (e.g. `4` for 4% of the send amount).
2. When a customer pays, the **PaymentIntent amount** = **send amount** + **platform fee** (both in the customer’s currency).
3. **Stripe** keeps their **processing fee** from that charge (see their pricing).
4. The **remaining balance** is in **your Stripe account**. That includes both the remittance portion and your platform margin, as one charge—there is no separate “send my fee to another bank” API for a standard integration.

## Where you add your bank account

Not in this repo. In the **Stripe Dashboard**:

**Settings → Banks and scheduling** (or **Payouts**) → add your **business bank account** and complete verification.

Stripe pays out on a schedule (e.g. daily) to that account. That is how you receive **your** money, including whatever margin you built into the price after Stripe’s fee.

## What this code does

- **`amountSend`** — what the customer entered as the transfer amount (THB estimate is based on this). **Thunes quotations use this amount** for the remittance, not the card total.
- **`platformFee`** — your cut, computed from `PLATFORM_FEE_PERCENT`.
- **`totalCharged`** — what the card is actually charged (`amountSend + platformFee`).

This is **not** legal or tax advice; run your pricing and disclosures by the rules in your markets.
