# Billing live-readiness checklist

This tracks what still has to be true before prepaid platform credits can safely
take real PayPal payments.

## Current implementation

- Users can choose `Platform credits` in Settings when accounts and platform keys
  are enabled.
- The API can create PayPal orders, capture approved PayPal orders, receive PayPal
  webhooks, and credit the user's paid balance.
- Agent runs consume one credit per generated variation and refund the reservation
  if generation fails before completing.
- Supabase migration `0004_billing_credits.sql` adds `credit_balances`,
  `credit_ledger`, `paypal_orders`, and `ai_usage_source`.

## Required production setup

- Apply all Supabase migrations through `0004_billing_credits.sql`.
- Use a verified PayPal Business account and create a live REST app.
- Configure production environment:
  - `SUPABASE_URL`
  - `SUPABASE_DB_URL`
  - `SETTINGS_ENC_KEY`
  - `ALLOW_PLATFORM_KEYS=true`
  - `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY`
  - `PAYPAL_ENVIRONMENT=live`
  - `PAYPAL_CLIENT_ID`
  - `PAYPAL_CLIENT_SECRET`
  - `PAYPAL_WEBHOOK_ID`
  - final `CREDIT_PACKAGES_JSON`
- Configure the PayPal live webhook URL:
  - `https://<your-domain>/api/billing/paypal/webhook`
  - Required event: `PAYMENT.CAPTURE.COMPLETED`
  - Recommended events: `CHECKOUT.ORDER.APPROVED`,
    `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`,
    `CUSTOMER.DISPUTE.CREATED`, `CUSTOMER.DISPUTE.RESOLVED`
- Confirm the app is served over HTTPS and PayPal can reach the webhook endpoint.
- Run full sandbox QA before flipping to `PAYPAL_ENVIRONMENT=live`.

Official references:

- PayPal production checklist:
  https://developer.paypal.com/api/rest/production/
- PayPal Checkout create/capture flow:
  https://developer.paypal.com/studio/checkout/standard/integrate
- PayPal webhook integration:
  https://developer.paypal.com/api/rest/webhooks/rest/
- PayPal idempotency:
  https://developer.paypal.com/api/rest/reference/idempotency/

## Live-blocking code hardening

- Done: add PayPal idempotency headers to order create/capture requests.
- Done: validate captured amount and currency against the stored package before
  crediting.
- Done: record refund/reversal/dispute webhook signals for reconciliation.
- Done: add basic in-process rate limiting to credit-package order creation.
- Partially done: admin role setup and read-only billing endpoints. Still needed:
  manual credit grant/revoke, reviewed-state workflow, and PayPal transaction
  reconciliation scripts.
- Add a smoother post-approval UX: PayPal JS SDK buttons, or return/cancel URLs
  that automatically capture after approval.

## Operational requirements

- Define final credit packages from real model-cost assumptions.
- Decide refund policy for unused credits and consumed generations.
- Add Terms, Privacy, and prepaid digital-credit wording in the product.
- Confirm tax/VAT/sales-tax handling with an accountant or merchant-of-record
  provider.
- Monitor:
  - PayPal auth failures
  - failed captures
  - webhook verification failures
  - balances below zero
  - paid ledger entries without matching PayPal capture IDs

## Sandbox QA script

Run these before live:

1. New user receives only configured bonus credits once.
2. User with no BYO key can select platform credits and generate.
3. Insufficient credits returns `402` and does not consume daily quota.
4. Failed generation refunds the reserved credit.
5. PayPal sandbox purchase creates an order and opens approval.
6. Capturing the same order twice credits only once.
7. Webhook replay credits only once.
8. Closing the tab after PayPal approval is recoverable by webhook or manual
   capture.
9. Refund/reversal/dispute webhook updates the local order status for review.
10. Live mode refuses to start if PayPal credentials or platform model keys are
    missing.
