/**
 * Stripe Test-mode billing config. Secret key unset → mock mode so local dev still boots.
 * Live mode is never enabled from this codebase.
 */
import { env } from '../config'
import { listConfiguredPriceIds, type StripePriceKey } from './prices'

export type StripeBillingMode = 'mock' | 'stripe'

export interface StripeBillingConfig {
  mode: StripeBillingMode
  /** Present only in `stripe` mode. Never log this value. */
  secretKey: string | null
  webhookSecret: string | null
  /** Publishable key is optional; Checkout is server-redirect only. */
  publishableKey: string | null
  prices: Record<StripePriceKey, string | null>
  trialDays: number
}

export function loadStripeBillingConfig(): StripeBillingConfig {
  const secretKey = env('STRIPE_SECRET_KEY') ?? null
  const webhookSecret = env('STRIPE_WEBHOOK_SECRET') ?? null
  const publishableKey = env('STRIPE_PUBLISHABLE_KEY', 'VITE_STRIPE_PUBLISHABLE_KEY') ?? null

  if (secretKey && !secretKey.startsWith('sk_test_')) {
    console.warn(
      '[docksy] STRIPE_SECRET_KEY does not look like a Test-mode key (sk_test_…). Live mode is not supported; Checkout stays disabled until a Test key is set.',
    )
    return {
      mode: 'mock',
      secretKey: null,
      webhookSecret: null,
      publishableKey: null,
      prices: listConfiguredPriceIds(),
      trialDays: 30,
    }
  }

  return {
    mode: secretKey ? 'stripe' : 'mock',
    secretKey,
    webhookSecret,
    publishableKey,
    prices: listConfiguredPriceIds(),
    trialDays: Number(env('STRIPE_TRIAL_DAYS') ?? 30),
  }
}
