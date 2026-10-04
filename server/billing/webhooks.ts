/**
 * Stripe webhook handler for subscription lifecycle.
 * Verifies signatures when STRIPE_WEBHOOK_SECRET is set; mock mode acknowledges without work.
 */
import type Stripe from 'stripe'
import type { OrganizationBilling } from '@/domain/types'
import type { AppDependencies } from '../http/context'
import { loadStripeBillingConfig } from './config'
import {
  findBillingByCustomerId,
  findBillingBySubscriptionId,
  getOrCreateBilling,
  isoDateFromUnix,
  mapStripeSubscriptionStatus,
} from './records'
import { planFromStripePriceId } from './prices'
import { getStripeClient } from './stripeClient'

async function alreadyProcessed(deps: AppDependencies, eventId: string): Promise<boolean> {
  const existing = await deps.db.read((uow) => uow.stripeWebhookEvents.get(eventId))
  return Boolean(existing)
}

async function markProcessed(deps: AppDependencies, event: Stripe.Event): Promise<void> {
  await deps.db.write(async (uow) => {
    await uow.stripeWebhookEvents.put({
      id: event.id,
      type: event.type,
      processed_at: deps.clock.nowIso(),
    })
  })
}

function priceIdFromSubscription(subscription: Stripe.Subscription): string | null {
  const item = subscription.items?.data?.[0]
  const price = item?.price
  if (!price) return null
  return typeof price === 'string' ? price : price.id
}

function periodEndFromSubscription(subscription: Stripe.Subscription): number | null {
  const item = subscription.items?.data?.[0]
  return item?.current_period_end ?? null
}

function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent
  const details = parent?.subscription_details
  if (!details) return null
  const subscription = details.subscription
  if (!subscription) return null
  return typeof subscription === 'string' ? subscription : subscription.id
}

async function upsertFromSubscription(
  deps: AppDependencies,
  subscription: Stripe.Subscription,
  organizationIdHint?: string | null,
): Promise<void> {
  const nowIso = deps.clock.nowIso()
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id
  const priceId = priceIdFromSubscription(subscription)
  const mapped = planFromStripePriceId(priceId)
  const status = mapStripeSubscriptionStatus(subscription.status)

  let organizationId =
    organizationIdHint ||
    subscription.metadata?.organization_id ||
    (typeof subscription.metadata?.organizationId === 'string'
      ? subscription.metadata.organizationId
      : null)

  if (!organizationId && customerId) {
    const byCustomer = await findBillingByCustomerId(deps.db, customerId)
    organizationId = byCustomer?.organization_id ?? null
  }
  if (!organizationId) {
    const bySub = await findBillingBySubscriptionId(deps.db, subscription.id)
    organizationId = bySub?.organization_id ?? null
  }
  if (!organizationId) {
    console.warn(
      `[docksy] Stripe subscription ${subscription.id} has no organization mapping; skipped.`,
    )
    return
  }

  await deps.db.write(async (uow) => {
    const current = await getOrCreateBilling(uow, organizationId!, nowIso)
    const next: OrganizationBilling = {
      ...current,
      stripe_customer_id: customerId ?? current.stripe_customer_id,
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId ?? current.stripe_price_id,
      plan_id: mapped?.planId ?? current.plan_id,
      billing_interval: mapped?.billingInterval ?? current.billing_interval,
      status,
      trial_ends_at: isoDateFromUnix(subscription.trial_end) ?? current.trial_ends_at,
      current_period_ends_at:
        isoDateFromUnix(periodEndFromSubscription(subscription)) ?? current.current_period_ends_at,
      updated_at: nowIso,
    }
    await uow.organizationBilling.put(next)
  })
}

async function handleCheckoutCompleted(
  deps: AppDependencies,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const organizationId =
    session.metadata?.organization_id || session.client_reference_id || null
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
  const nowIso = deps.clock.nowIso()

  if (organizationId) {
    await deps.db.write(async (uow) => {
      const current = await getOrCreateBilling(uow, organizationId, nowIso)
      await uow.organizationBilling.put({
        ...current,
        stripe_customer_id: customerId ?? current.stripe_customer_id,
        stripe_subscription_id: subscriptionId ?? current.stripe_subscription_id,
        plan_id: session.metadata?.plan_id ?? current.plan_id,
        billing_interval: session.metadata?.billing_interval ?? current.billing_interval,
        status: current.status === 'none' ? 'trialing' : current.status,
        updated_at: nowIso,
      })
    })
  }

  if (subscriptionId) {
    const stripeConfig = loadStripeBillingConfig()
    const stripe = getStripeClient(stripeConfig)
    if (stripe) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      await upsertFromSubscription(deps, subscription, organizationId)
    }
  }
}

export async function processStripeWebhook(
  deps: AppDependencies,
  rawBody: string,
  signature: string | undefined,
): Promise<{ received: boolean; mode: 'mock' | 'stripe'; type?: string }> {
  const stripeConfig = loadStripeBillingConfig()

  if (stripeConfig.mode === 'mock' || !stripeConfig.secretKey) {
    return { received: true, mode: 'mock' }
  }

  const stripe = getStripeClient(stripeConfig)
  if (!stripe) return { received: true, mode: 'mock' }

  let event: Stripe.Event
  if (stripeConfig.webhookSecret) {
    if (!signature) {
      throw new Error('Missing Stripe-Signature header.')
    }
    event = stripe.webhooks.constructEvent(rawBody, signature, stripeConfig.webhookSecret)
  } else {
    console.warn(
      '[docksy] STRIPE_WEBHOOK_SECRET unset — accepting unsigned webhook body (Test only).',
    )
    event = JSON.parse(rawBody) as Stripe.Event
  }

  if (await alreadyProcessed(deps, event.id)) {
    return { received: true, mode: 'stripe', type: event.type }
  }

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(deps, event.data.object as Stripe.Checkout.Session)
      break
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await upsertFromSubscription(deps, event.data.object as Stripe.Subscription)
      break
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const subscriptionId = subscriptionIdFromInvoice(invoice)
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        await upsertFromSubscription(deps, subscription)
      }
      break
    }
    default:
      break
  }

  await markProcessed(deps, event)
  return { received: true, mode: 'stripe', type: event.type }
}
