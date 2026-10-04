/**
 * Stripe Test-mode Price ID mapping for Docket Tree self-serve plans.
 * Price IDs are not secrets; override via env for alternate sandboxes.
 * Never commit secret keys (`sk_…` / `whsec_…`).
 */
import type { BillingInterval, SelfServePlanId } from '@/domain/pricing'
import { env } from '../config'

export type StripePriceKey =
  | 'starter_monthly'
  | 'starter_yearly'
  | 'growth_monthly'
  | 'growth_yearly'
  | 'portfolio_monthly'
  | 'portfolio_yearly'

/** Documented Test-mode defaults (sandbox). Env overrides win when set. */
export const DEFAULT_STRIPE_TEST_PRICES: Record<StripePriceKey, string> = {
  starter_monthly: 'price_1UMvTEBCRPfnmwQJLrgf7hV6',
  starter_yearly: 'price_1UMvgCBCRPfnmwQJjcwXqPgS',
  growth_monthly: 'price_1UMvXrBCRPfnmwQJy6cTykHu',
  growth_yearly: 'price_1UMvgZBCRPfnmwQJPXi9cIlk',
  portfolio_monthly: 'price_1UMvZLBCRPfnmwQJ5VWgacyD',
  portfolio_yearly: 'price_1UMvguBCRPfnmwQJl5rLKMjp',
}

const ENV_KEYS: Record<StripePriceKey, string> = {
  starter_monthly: 'STRIPE_PRICE_STARTER_MONTHLY',
  starter_yearly: 'STRIPE_PRICE_STARTER_YEARLY',
  growth_monthly: 'STRIPE_PRICE_GROWTH_MONTHLY',
  growth_yearly: 'STRIPE_PRICE_GROWTH_YEARLY',
  portfolio_monthly: 'STRIPE_PRICE_PORTFOLIO_MONTHLY',
  portfolio_yearly: 'STRIPE_PRICE_PORTFOLIO_YEARLY',
}

export function priceKeyFor(planId: SelfServePlanId, interval: BillingInterval): StripePriceKey {
  const suffix = interval === 'annual' ? 'yearly' : 'monthly'
  return `${planId}_${suffix}` as StripePriceKey
}

export function resolveStripePriceId(planId: SelfServePlanId, interval: BillingInterval): string | null {
  const key = priceKeyFor(planId, interval)
  const fromEnv = env(ENV_KEYS[key])
  if (fromEnv) return fromEnv
  return DEFAULT_STRIPE_TEST_PRICES[key] || null
}

export function planFromStripePriceId(
  priceId: string | null | undefined,
): { planId: SelfServePlanId; billingInterval: BillingInterval } | null {
  if (!priceId) return null
  const entries = (Object.keys(DEFAULT_STRIPE_TEST_PRICES) as StripePriceKey[]).map((key) => {
    const resolved = env(ENV_KEYS[key]) ?? DEFAULT_STRIPE_TEST_PRICES[key]
    return { key, priceId: resolved }
  })
  const match = entries.find((entry) => entry.priceId === priceId)
  if (!match) return null
  const [planId, suffix] = match.key.split('_') as [SelfServePlanId, 'monthly' | 'yearly']
  return {
    planId,
    billingInterval: suffix === 'yearly' ? 'annual' : 'monthly',
  }
}

export function listConfiguredPriceIds(): Record<StripePriceKey, string | null> {
  return {
    starter_monthly: resolveStripePriceId('starter', 'monthly'),
    starter_yearly: resolveStripePriceId('starter', 'annual'),
    growth_monthly: resolveStripePriceId('growth', 'monthly'),
    growth_yearly: resolveStripePriceId('growth', 'annual'),
    portfolio_monthly: resolveStripePriceId('portfolio', 'monthly'),
    portfolio_yearly: resolveStripePriceId('portfolio', 'annual'),
  }
}
