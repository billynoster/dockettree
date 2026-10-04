/** Thin Stripe SDK wrapper. Returns null in mock mode (no secret key). */
import Stripe from 'stripe'
import type { StripeBillingConfig } from './config'

let cached: { key: string; client: Stripe } | null = null

export function getStripeClient(config: StripeBillingConfig): Stripe | null {
  if (config.mode !== 'stripe' || !config.secretKey) return null
  if (cached && cached.key === config.secretKey) return cached.client
  const client = new Stripe(config.secretKey, {
    apiVersion: '2025-08-27.basil',
    typescript: true,
  })
  cached = { key: config.secretKey, client }
  return client
}
