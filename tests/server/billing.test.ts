/**
 * Stripe Test-mode billing: price mapping, mock checkout/portal, webhook mock path.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_STRIPE_TEST_PRICES, resolveStripePriceId } from '../../server/billing/prices'
import { loadStripeBillingConfig } from '../../server/billing/config'
import { createTestServer } from './testServer'

const KEYS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PUBLISHABLE_KEY',
  'STRIPE_PRICE_STARTER_MONTHLY',
  'STRIPE_PRICE_GROWTH_YEARLY',
] as const

const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {}

function stashEnv(): void {
  for (const key of KEYS) saved[key] = process.env[key]
}

function restoreEnv(): void {
  for (const key of KEYS) {
    const value = saved[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

beforeEach(() => {
  stashEnv()
  for (const key of KEYS) delete process.env[key]
})

afterEach(() => {
  restoreEnv()
})

describe('stripe price ids', () => {
  it('resolves all six Test-mode defaults including Growth yearly', () => {
    expect(resolveStripePriceId('starter', 'monthly')).toBe(DEFAULT_STRIPE_TEST_PRICES.starter_monthly)
    expect(resolveStripePriceId('starter', 'annual')).toBe(DEFAULT_STRIPE_TEST_PRICES.starter_yearly)
    expect(resolveStripePriceId('growth', 'monthly')).toBe(DEFAULT_STRIPE_TEST_PRICES.growth_monthly)
    expect(resolveStripePriceId('growth', 'annual')).toBe('price_1UMvgZBCRPfnmwQJPXi9cIlk')
    expect(resolveStripePriceId('portfolio', 'monthly')).toBe(
      DEFAULT_STRIPE_TEST_PRICES.portfolio_monthly,
    )
    expect(resolveStripePriceId('portfolio', 'annual')).toBe(
      DEFAULT_STRIPE_TEST_PRICES.portfolio_yearly,
    )
  })

  it('allows env overrides', () => {
    process.env.STRIPE_PRICE_GROWTH_YEARLY = 'price_override_growth_year'
    expect(resolveStripePriceId('growth', 'annual')).toBe('price_override_growth_year')
  })
})

describe('stripe billing config', () => {
  it('defaults to mock mode without secret key', () => {
    const config = loadStripeBillingConfig()
    expect(config.mode).toBe('mock')
    expect(config.secretKey).toBeNull()
  })

  it('rejects non-test secret keys', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_should_not_enable'
    const config = loadStripeBillingConfig()
    expect(config.mode).toBe('mock')
  })

  it('enables stripe mode for sk_test_ keys', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_example_not_real'
    const config = loadStripeBillingConfig()
    expect(config.mode).toBe('stripe')
  })
})

describe('mock checkout and portal HTTP', () => {
  it('marks the org trialing and returns a local success URL', async () => {
    const server = await createTestServer()
    try {
      const cookie = await server.signIn('dana.whitfield@example.com', 'test-staff-password')

      const checkout = await server.request('/api/billing/checkout', {
        method: 'POST',
        cookie,
        body: JSON.stringify({
          planId: 'growth',
          interval: 'annual',
          successUrl: '/settings?tab=billing&checkout=success',
          cancelUrl: '/pricing',
        }),
      })
      expect(checkout.status).toBe(200)
      expect(checkout.body.mode).toBe('mock')
      expect(checkout.body.url).toContain('checkout=mock')
      expect(checkout.body.url).toContain('plan=growth')

      const status = await server.request('/api/billing', { cookie })
      expect(status.status).toBe(200)
      expect(status.body.status).toBe('trialing')
      expect(status.body.planId).toBe('growth')
      expect(status.body.billingInterval).toBe('annual')
      expect(status.body.stripePriceId).toBe(DEFAULT_STRIPE_TEST_PRICES.growth_yearly)
      expect(status.body.billingMode).toBe('mock')

      const portal = await server.request('/api/billing/portal', {
        method: 'POST',
        cookie,
        body: JSON.stringify({ returnUrl: '/settings?tab=billing' }),
      })
      expect(portal.status).toBe(200)
      expect(portal.body.mode).toBe('mock')
      expect(portal.body.url).toContain('portal=mock')

      const webhook = await server.request('/api/billing/webhook', {
        method: 'POST',
        body: '{}',
        headers: { 'Content-Type': 'application/json' },
      })
      expect(webhook.status).toBe(200)
      expect(webhook.body).toEqual({ received: true, mode: 'mock' })
    } finally {
      server.close()
    }
  })
})
