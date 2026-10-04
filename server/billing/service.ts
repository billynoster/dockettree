/**
 * Checkout Session + Customer Portal + local billing status.
 * Mock mode (no STRIPE_SECRET_KEY) simulates redirects so local/dev still boots.
 */
import { forbidden, validationError } from '@/domain/errors'
import type { BillingInterval, SelfServePlanId } from '@/domain/pricing'
import { can } from '@/domain/permissions'
import type { Organization, UUID } from '@/domain/types'
import type { AppDependencies } from '../http/context'
import { loadStripeBillingConfig } from './config'

/** Keep in sync with `foundingPricingEnabled` in src/config/pricing.ts. */
const FOUNDING_PRICING_ENABLED = true
import {
  emptyBilling,
  getBilling,
  getOrCreateBilling,
  toBillingView,
  type BillingView,
} from './records'
import { resolveStripePriceId } from './prices'
import { getStripeClient } from './stripeClient'

const SELF_SERVE: SelfServePlanId[] = ['starter', 'growth', 'portfolio']

function assertSelfServe(planId: string): SelfServePlanId {
  if (!SELF_SERVE.includes(planId as SelfServePlanId)) {
    throw validationError('Choose Starter, Growth, or Portfolio for self-serve checkout.', {
      planId: 'Enterprise is sold through Contact Sales.',
    })
  }
  return planId as SelfServePlanId
}

function assertInterval(interval: string): BillingInterval {
  if (interval !== 'monthly' && interval !== 'annual') {
    throw validationError('Choose monthly or annual billing.', {
      interval: 'Use monthly or annual.',
    })
  }
  return interval
}

export function requireBillingAdmin(role: string): void {
  if (!can(role as 'admin', 'settings.manage')) {
    throw forbidden('Only an organization admin can manage billing.')
  }
}

const DEMO_FALLBACK: BillingView = {
  planId: 'growth',
  billingInterval: 'annual',
  status: 'none',
  foundingRateApplied: FOUNDING_PRICING_ENABLED,
  trialEndsOn: null,
  currentPeriodEndsOn: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  stripePriceId: null,
}

export async function getOrganizationBillingStatus(
  deps: AppDependencies,
  organizationId: UUID,
) {
  const stripe = loadStripeBillingConfig()
  const row = await getBilling(deps.db, organizationId)
  const view = toBillingView(row, DEMO_FALLBACK)
  return {
    ...view,
    billingMode: stripe.mode,
    pricesConfigured: stripe.prices,
    hasCustomer: Boolean(view.stripeCustomerId),
    hasSubscription: Boolean(view.stripeSubscriptionId) && view.status !== 'none',
  }
}

export interface CheckoutResult {
  mode: 'mock' | 'stripe'
  url: string
  sessionId: string | null
  message?: string
}

export async function createCheckoutSession(
  deps: AppDependencies,
  input: {
    organization: Organization
    organizationId: UUID
    actorEmail: string
    actorName: string
    planId: string
    interval: string
    successUrl: string
    cancelUrl: string
  },
): Promise<CheckoutResult> {
  const planId = assertSelfServe(input.planId)
  const interval = assertInterval(input.interval)
  const priceId = resolveStripePriceId(planId, interval)
  if (!priceId) {
    throw validationError('That plan price is not configured yet.', {
      planId: `Missing Stripe price for ${planId} (${interval}). Set the matching STRIPE_PRICE_* env.`,
    })
  }

  const stripeConfig = loadStripeBillingConfig()
  const nowIso = deps.clock.nowIso()

  if (stripeConfig.mode === 'mock' || !stripeConfig.secretKey) {
    await deps.db.write(async (uow) => {
      const billing = await getOrCreateBilling(uow, input.organizationId, nowIso)
      const trialEnd = new Date(deps.clock.now())
      trialEnd.setUTCDate(trialEnd.getUTCDate() + stripeConfig.trialDays)
      await uow.organizationBilling.put({
        ...billing,
        plan_id: planId,
        billing_interval: interval,
        stripe_price_id: priceId,
        status: 'trialing',
        founding_rate_applied: FOUNDING_PRICING_ENABLED,
        trial_ends_at: trialEnd.toISOString(),
        stripe_customer_id: billing.stripe_customer_id ?? `cus_mock_${input.organizationId.slice(0, 8)}`,
        stripe_subscription_id:
          billing.stripe_subscription_id ?? `sub_mock_${input.organizationId.slice(0, 8)}`,
        updated_at: nowIso,
      })
    })
    const url = new URL(input.successUrl)
    url.searchParams.set('checkout', 'mock')
    url.searchParams.set('plan', planId)
    url.searchParams.set('interval', interval)
    return {
      mode: 'mock',
      url: url.toString(),
      sessionId: null,
      message:
        'Stripe Test keys are not configured. Mock checkout marked this organization as trialing locally.',
    }
  }

  const stripe = getStripeClient(stripeConfig)
  if (!stripe) {
    throw validationError('Stripe is not available.', { stripe: 'Check STRIPE_SECRET_KEY.' })
  }

  const billing = await deps.db.write(async (uow) =>
    getOrCreateBilling(uow, input.organizationId, nowIso),
  )

  let customerId = billing.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: input.actorEmail,
      name: input.organization.name,
      metadata: {
        organization_id: input.organizationId,
        organization_name: input.organization.name,
      },
    })
    customerId = customer.id
    await deps.db.write(async (uow) => {
      const current = await getOrCreateBilling(uow, input.organizationId, nowIso)
      await uow.organizationBilling.put({
        ...current,
        stripe_customer_id: customerId,
        updated_at: nowIso,
      })
    })
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: input.organizationId,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    allow_promotion_codes: true,
    metadata: {
      organization_id: input.organizationId,
      plan_id: planId,
      billing_interval: interval,
    },
    subscription_data: {
      trial_period_days: stripeConfig.trialDays,
      metadata: {
        organization_id: input.organizationId,
        plan_id: planId,
        billing_interval: interval,
      },
    },
    line_items: [{ price: priceId, quantity: 1 }],
  })

  if (!session.url) {
    throw validationError('Stripe Checkout did not return a redirect URL.', {
      checkout: 'Try again in a moment.',
    })
  }

  return { mode: 'stripe', url: session.url, sessionId: session.id }
}

export interface PortalResult {
  mode: 'mock' | 'stripe'
  url: string
  message?: string
}

export async function createCustomerPortalSession(
  deps: AppDependencies,
  input: { organizationId: UUID; returnUrl: string },
): Promise<PortalResult> {
  const stripeConfig = loadStripeBillingConfig()
  const billing =
    (await getBilling(deps.db, input.organizationId)) ??
    emptyBilling(input.organizationId, deps.clock.nowIso())

  if (stripeConfig.mode === 'mock' || !stripeConfig.secretKey) {
    const url = new URL(input.returnUrl)
    url.searchParams.set('portal', 'mock')
    return {
      mode: 'mock',
      url: url.toString(),
      message:
        'Stripe Test keys are not configured. Mock portal returns you to Billing settings.',
    }
  }

  if (!billing.stripe_customer_id) {
    throw validationError('No Stripe customer is linked yet. Start a trial or upgrade first.', {
      billing: 'Complete Checkout before opening the Customer Portal.',
    })
  }

  const stripe = getStripeClient(stripeConfig)
  if (!stripe) {
    throw validationError('Stripe is not available.', { stripe: 'Check STRIPE_SECRET_KEY.' })
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: billing.stripe_customer_id,
    return_url: input.returnUrl,
  })

  return { mode: 'stripe', url: session.url }
}
