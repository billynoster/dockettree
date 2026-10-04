# Docket Tree — Stripe Billing (Test mode)

**Status:** Wired (Prebuilt Checkout + Customer Portal + webhooks)  
**Mode:** Test only — Live mode is rejected by config  
**Captured:** 2026-10-04

Self-serve plans (Starter / Growth / Portfolio) start a **Stripe Checkout Session** from the pricing page or Settings → Billing. Admins open the **Customer Portal** from Manage billing. Enterprise stays Contact Sales.

When `STRIPE_SECRET_KEY` is unset, the API runs in **mock mode**: Checkout marks the org as `trialing` locally and redirects back to Billing; Portal returns to Billing with a notice. The app still boots with no Stripe credentials.

## Env vars (never commit secrets)

| Variable | Required | Purpose |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | For real Checkout/Portal | Test key only (`sk_test_…`). Live keys are ignored. |
| `STRIPE_WEBHOOK_SECRET` | For signed webhooks | `whsec_…` from the Stripe CLI or Dashboard endpoint |
| `STRIPE_PUBLISHABLE_KEY` | Optional | `pk_test_…` — exposed on `/api/public-config` only if set; Checkout does not need Stripe.js |
| `STRIPE_TRIAL_DAYS` | Optional | Default `30` |
| `STRIPE_PRICE_STARTER_MONTHLY` | Optional | Default Test price `price_1UMvTEBCRPfnmwQJLrgf7hV6` |
| `STRIPE_PRICE_STARTER_YEARLY` | Optional | Default Test price `price_1UMvgCBCRPfnmwQJjcwXqPgS` |
| `STRIPE_PRICE_GROWTH_MONTHLY` | Optional | Default Test price `price_1UMvXrBCRPfnmwQJy6cTykHu` |
| `STRIPE_PRICE_GROWTH_YEARLY` | Optional | Default Test price `price_1UMvgZBCRPfnmwQJPXi9cIlk` |
| `STRIPE_PRICE_PORTFOLIO_MONTHLY` | Optional | Default Test price `price_1UMvZLBCRPfnmwQJ5VWgacyD` |
| `STRIPE_PRICE_PORTFOLIO_YEARLY` | Optional | Default Test price `price_1UMvguBCRPfnmwQJl5rLKMjp` |

Price IDs are not secrets. Secret keys must live in **Secret Manager** (or Cloud Shell env) — never in git.

## API

| Method | Path | Auth | Behavior |
| --- | --- | --- | --- |
| `GET` | `/api/billing` | Session | Org plan / status / Stripe ids + `billingMode` |
| `POST` | `/api/billing/checkout` | Admin (`settings.manage`) | `{ planId, interval }` → `{ url, mode }` |
| `POST` | `/api/billing/portal` | Admin | Customer Portal session URL |
| `POST` | `/api/billing/webhook` | Stripe signature | Lifecycle sync (see below) |

Webhook events handled: `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`.

## Cloud Run / Secret Manager (Billy)

1. Create secrets (values from Stripe Dashboard → Test mode; do not paste into chat/git):

```bash
# Interactive stdin — do not put the secret on the command line history if you can avoid it
printf '%s' 'sk_test_…' | gcloud secrets create stripe-secret-key --data-file=-
printf '%s' 'whsec_…' | gcloud secrets create stripe-webhook-secret --data-file=-
# Or versions add if the secret already exists:
# printf '%s' 'sk_test_…' | gcloud secrets versions add stripe-secret-key --data-file=-
```

2. Grant the Cloud Run runtime service account `roles/secretmanager.secretAccessor` on those secrets.

3. Point the service at the secrets and (optionally) pin Price IDs:

```bash
gcloud run services update docket-tree \
  --region=us-central1 \
  --update-secrets=STRIPE_SECRET_KEY=stripe-secret-key:latest,STRIPE_WEBHOOK_SECRET=stripe-webhook-secret:latest \
  --update-env-vars=STRIPE_PRICE_STARTER_MONTHLY=price_1UMvTEBCRPfnmwQJLrgf7hV6,STRIPE_PRICE_STARTER_YEARLY=price_1UMvgCBCRPfnmwQJjcwXqPgS,STRIPE_PRICE_GROWTH_MONTHLY=price_1UMvXrBCRPfnmwQJy6cTykHu,STRIPE_PRICE_GROWTH_YEARLY=price_1UMvgZBCRPfnmwQJPXi9cIlk,STRIPE_PRICE_PORTFOLIO_MONTHLY=price_1UMvZLBCRPfnmwQJ5VWgacyD,STRIPE_PRICE_PORTFOLIO_YEARLY=price_1UMvguBCRPfnmwQJl5rLKMjp
```

4. In Stripe Dashboard (Test mode) → Developers → Webhooks, add endpoint:

```
https://<your-cloud-run-host>/api/billing/webhook
```

Select at least: `checkout.session.completed`, `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`. Put the signing secret into `stripe-webhook-secret`.

5. Enable Customer Portal in Stripe Dashboard → Settings → Billing → Customer portal (Test mode).

6. Local webhook forwarding (optional):

```bash
stripe listen --forward-to localhost:43218/api/billing/webhook
# export STRIPE_WEBHOOK_SECRET from the CLI output (whsec_…)
```

## UI

- **Pricing** (`/pricing`): self-serve plan CTAs start Checkout when an admin is signed in; otherwise setup/login. Enterprise → Contact Sales.
- **Settings → Billing**: plan/status from `GET /api/billing`, **Manage billing** → Portal, trial/upgrade CTAs → Checkout. Loading / error / empty (`none`) states covered. Mock mode shows an informational banner.

## Data

Postgres/SQLite tables:

- `organization_billing` — org ↔ Stripe customer / subscription / plan / status
- `stripe_webhook_events` — idempotent webhook ledger

## Growth yearly

Configured: `price_1UMvgZBCRPfnmwQJPXi9cIlk` (all six prices present).
