# Billing live-readiness checklist

This tracks what still has to be true before prepaid platform credits can safely
take real PayPal payments.

## Current implementation

- Users can choose `Platform credits` in Settings when accounts and platform keys
  are enabled.
- The API can create PayPal orders, capture approved PayPal orders, receive PayPal
  webhooks, and credit the user's paid balance.
- The web app renders PayPal JS SDK v6 buttons when `VITE_PAYPAL_CLIENT_ID` is
  configured. PayPal secrets and capture calls stay server-side.
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
  - `VITE_PAYPAL_ENVIRONMENT=live`
  - `VITE_PAYPAL_CLIENT_ID`
  - final `CREDIT_PACKAGES_JSON`
- Configure the PayPal live webhook URL:
  - `https://<your-domain>/api/billing/paypal/webhook`
  - Required event: `PAYMENT.CAPTURE.COMPLETED`
  - Recommended events: `CHECKOUT.ORDER.APPROVED`,
    `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`,
    `CUSTOMER.DISPUTE.CREATED`, `CUSTOMER.DISPUTE.RESOLVED`
- Confirm the app is served over HTTPS and PayPal can reach the webhook endpoint.
- Run full sandbox QA before flipping to `PAYPAL_ENVIRONMENT=live`.

## Dashboard changes

### Railway API service

Set these on the API service:

- `SUPABASE_URL`
- `SUPABASE_DB_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SETTINGS_ENC_KEY`
- `ALLOW_PLATFORM_KEYS=true`
- `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY`
- `PAYPAL_ENVIRONMENT=sandbox` for QA, then `PAYPAL_ENVIRONMENT=live`
- `PAYPAL_CLIENT_ID` from the matching PayPal REST app
- `PAYPAL_CLIENT_SECRET` from the matching PayPal REST app
- `PAYPAL_WEBHOOK_ID` from the PayPal webhook configured for this API URL
- `CREDIT_PACKAGES_JSON` if the default packages should be overridden

Do not set `VITE_PAYPAL_*` only on Railway unless Railway also builds/serves the
web bundle. The API uses `PAYPAL_*`; the browser bundle uses `VITE_PAYPAL_*`.

### Vercel web app

Set these on the web project and redeploy so Vite bakes them into the bundle:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_PAYPAL_ENVIRONMENT=sandbox` for QA, then `VITE_PAYPAL_ENVIRONMENT=live`
- `VITE_PAYPAL_CLIENT_ID` from the matching PayPal REST app

Do not set `PAYPAL_CLIENT_SECRET` in Vercel for the browser app.

### Supabase

- Apply migrations through `supabase/migrations/0004_billing_credits.sql`.
- Confirm the app has the required tables: `credit_balances`, `credit_ledger`,
  `paypal_orders`, and the `ai_usage_source` profile setting.
- Use the Supabase project URL as `SUPABASE_URL` / `VITE_SUPABASE_URL`.
- Use the anon key only in `VITE_SUPABASE_ANON_KEY`.
- Use the service-role key only on the Railway API.

### PayPal developer dashboard

- Create separate sandbox and live REST apps.
- Copy each app's client ID to both API and web env for that environment:
  `PAYPAL_CLIENT_ID` and `VITE_PAYPAL_CLIENT_ID`.
- Copy each app's secret only to the Railway API: `PAYPAL_CLIENT_SECRET`.
- Create a webhook for the deployed API URL:
  `https://<your-domain>/api/billing/paypal/webhook`.
- Subscribe at minimum to `PAYMENT.CAPTURE.COMPLETED`.
- Copy the webhook ID to Railway as `PAYPAL_WEBHOOK_ID`.
- Use sandbox credentials while `PAYPAL_ENVIRONMENT` and
  `VITE_PAYPAL_ENVIRONMENT` are `sandbox`; switch both to live together.

Official references:

- PayPal production checklist:
  https://developer.paypal.com/api/rest/production/
- PayPal Checkout create/capture flow:
  https://developer.paypal.com/studio/checkout/standard/integrate
- PayPal JS SDK v6 setup:
  https://docs.paypal.ai/developer/how-to/sdk/js/v6/configuration
- PayPal React SDK v6 reference:
  https://docs.paypal.ai/reference/sdk/react
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
- Done: render PayPal JS SDK v6 checkout buttons in the web app.
- Partially done: admin role setup and read-only billing endpoints. Still needed:
  manual credit grant/revoke, reviewed-state workflow, and PayPal transaction
  reconciliation scripts.

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
5. PayPal sandbox purchase creates an order from the JS SDK v6 button and opens
   approval.
6. Capturing the same order twice credits only once.
7. Webhook replay credits only once.
8. Closing the tab after PayPal approval is recoverable by webhook or manual
   capture.
9. Refund/reversal/dispute webhook updates the local order status for review.
10. Live mode refuses to start if PayPal credentials or platform model keys are
    missing.
