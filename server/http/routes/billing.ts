/**
 * Stripe Test-mode billing routes: status, Checkout, Customer Portal, webhooks.
 */
import { Hono } from 'hono'
import { validationError } from '@/domain/errors'
import {
  createCheckoutSession,
  createCustomerPortalSession,
  getOrganizationBillingStatus,
  requireBillingAdmin,
} from '../../billing/service'
import { processStripeWebhook } from '../../billing/webhooks'
import {
  organizationOf,
  requirePrincipal,
  serviceContextFor,
  type AppEnv,
} from '../context'
import { handle } from '../handler'

export const billingRoutes = new Hono<AppEnv>()

function absoluteUrl(base: string, pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl
  return new URL(pathOrUrl, base.endsWith('/') ? base : `${base}/`).toString()
}

billingRoutes.get(
  '/billing',
  handle(async (c) => {
    const deps = c.get('deps')
    const principal = requirePrincipal(c)
    const ctx = await serviceContextFor(deps, principal)
    return await getOrganizationBillingStatus(deps, ctx.organizationId)
  }),
)

billingRoutes.post(
  '/billing/checkout',
  handle(async (c) => {
    const deps = c.get('deps')
    const principal = requirePrincipal(c)
    requireBillingAdmin(principal.role)
    const ctx = await serviceContextFor(deps, principal)
    const organization = await organizationOf(deps, ctx.organizationId)
    const body = await c.req.json<{
      planId?: string
      interval?: string
      successUrl?: string
      cancelUrl?: string
    }>()

    if (!body.planId || !body.interval) {
      const fieldErrors: Record<string, string> = {}
      if (!body.planId) fieldErrors.planId = 'Required.'
      if (!body.interval) fieldErrors.interval = 'Required.'
      throw validationError('Choose a plan and billing interval.', fieldErrors)
    }

    const publicUrl = deps.config.publicUrl
    const successUrl = absoluteUrl(
      publicUrl,
      body.successUrl ?? '/settings?tab=billing&checkout=success',
    )
    const cancelUrl = absoluteUrl(
      publicUrl,
      body.cancelUrl ?? '/pricing?checkout=canceled',
    )

    return await createCheckoutSession(deps, {
      organization,
      organizationId: ctx.organizationId,
      actorEmail: principal.user.email,
      actorName: principal.user.display_name,
      planId: body.planId,
      interval: body.interval,
      successUrl,
      cancelUrl,
    })
  }),
)

billingRoutes.post(
  '/billing/portal',
  handle(async (c) => {
    const deps = c.get('deps')
    const principal = requirePrincipal(c)
    requireBillingAdmin(principal.role)
    const ctx = await serviceContextFor(deps, principal)
    const body = await c.req.json<{ returnUrl?: string }>().catch(() => ({} as { returnUrl?: string }))
    const returnUrl = absoluteUrl(
      deps.config.publicUrl,
      body.returnUrl ?? '/settings?tab=billing',
    )
    return await createCustomerPortalSession(deps, {
      organizationId: ctx.organizationId,
      returnUrl,
    })
  }),
)

billingRoutes.post('/billing/webhook', async (c) => {
  const deps = c.get('deps')
  try {
    const rawBody = await c.req.text()
    const signature = c.req.header('stripe-signature') ?? undefined
    const result = await processStripeWebhook(deps, rawBody, signature)
    return c.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook rejected.'
    console.warn(`[docksy] Stripe webhook error: ${message}`)
    return c.json({ error: { code: 'validation', message } }, 400)
  }
})
