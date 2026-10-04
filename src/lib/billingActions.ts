/**
 * Browser helpers for Stripe Checkout / Customer Portal redirects.
 * Prefer server-created session URLs (no Stripe.js required).
 */
import { toast } from 'sonner'
import { api, UnauthenticatedError } from '@/api/client'
import type { BillingInterval, PlanId } from '@/domain/pricing'
import { track } from '@/lib/analytics'

export async function startCheckout(input: {
  planId: PlanId
  interval: BillingInterval
  source: string
}): Promise<'redirected' | 'error' | 'unauthenticated'> {
  track('plan_cta_clicked', {
    plan_id: input.planId,
    cta_kind: 'checkout',
    billing_interval: input.interval,
    source: input.source,
  })
  try {
    const result = await api.createCheckoutSession({
      planId: input.planId,
      interval: input.interval,
      successUrl: '/settings?tab=billing&checkout=success',
      cancelUrl: `/pricing?checkout=canceled&plan=${input.planId}`,
    })
    if (result.mode === 'mock' && result.message) {
      toast.message('Mock checkout', { description: result.message })
    }
    window.location.assign(result.url)
    return 'redirected'
  } catch (error) {
    if (error instanceof UnauthenticatedError) return 'unauthenticated'
    const message = error instanceof Error ? error.message : 'Checkout could not start.'
    toast.error(message)
    return 'error'
  }
}

export async function openBillingPortal(source: string): Promise<'redirected' | 'error'> {
  track('billing_cta_clicked', { cta: 'manage_billing', source })
  try {
    const result = await api.createBillingPortalSession({
      returnUrl: '/settings?tab=billing',
    })
    if (result.mode === 'mock' && result.message) {
      toast.message('Mock customer portal', { description: result.message })
    }
    window.location.assign(result.url)
    return 'redirected'
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Billing portal could not open.'
    toast.error(message)
    return 'error'
  }
}
