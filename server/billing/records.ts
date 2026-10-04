/** Read/write organization_billing rows. */
import type { BillingInterval, PlanId, SubscriptionStatus } from '@/domain/pricing'
import type { OrganizationBilling, UUID } from '@/domain/types'
import type { Database, UnitOfWork } from '@/repositories/types'
import { planFromStripePriceId } from './prices'

export function emptyBilling(organizationId: UUID, nowIso: string): OrganizationBilling {
  return {
    organization_id: organizationId,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    stripe_price_id: null,
    plan_id: null,
    billing_interval: null,
    status: 'none',
    founding_rate_applied: false,
    trial_ends_at: null,
    current_period_ends_at: null,
    created_at: nowIso,
    updated_at: nowIso,
  }
}

export async function getBilling(
  db: Database,
  organizationId: UUID,
): Promise<OrganizationBilling | undefined> {
  return await db.read((uow) => uow.organizationBilling.get(organizationId))
}

export async function getOrCreateBilling(
  uow: UnitOfWork,
  organizationId: UUID,
  nowIso: string,
): Promise<OrganizationBilling> {
  const existing = await uow.organizationBilling.get(organizationId)
  if (existing) return existing
  const created = emptyBilling(organizationId, nowIso)
  await uow.organizationBilling.put(created)
  return created
}

export async function findBillingByCustomerId(
  db: Database,
  customerId: string,
): Promise<OrganizationBilling | undefined> {
  const rows = await db.read((uow) => uow.organizationBilling.where('by_customer', customerId))
  return rows[0]
}

export async function findBillingBySubscriptionId(
  db: Database,
  subscriptionId: string,
): Promise<OrganizationBilling | undefined> {
  const rows = await db.read((uow) =>
    uow.organizationBilling.where('by_subscription', subscriptionId),
  )
  return rows[0]
}

export function mapStripeSubscriptionStatus(status: string | null | undefined): SubscriptionStatus {
  switch (status) {
    case 'trialing':
      return 'trialing'
    case 'active':
      return 'active'
    case 'past_due':
    case 'unpaid':
      return 'past_due'
    case 'canceled':
      return 'canceled'
    case 'incomplete':
    case 'incomplete_expired':
      return 'incomplete'
    case 'paused':
      return 'canceled'
    default:
      return 'expired'
  }
}

export function isoDateFromUnix(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null
  return new Date(seconds * 1000).toISOString()
}

export function dateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null
  return iso.slice(0, 10)
}

export interface BillingView {
  planId: PlanId
  billingInterval: BillingInterval
  status: SubscriptionStatus
  foundingRateApplied: boolean
  trialEndsOn: string | null
  currentPeriodEndsOn: string | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  stripePriceId: string | null
}

export function toBillingView(
  row: OrganizationBilling | undefined,
  fallback: BillingView,
): BillingView {
  if (!row || row.status === 'none') return fallback
  const fromPrice = planFromStripePriceId(row.stripe_price_id)
  const planId = (row.plan_id as PlanId | null) ?? fromPrice?.planId ?? fallback.planId
  const billingInterval =
    (row.billing_interval as BillingInterval | null) ??
    fromPrice?.billingInterval ??
    fallback.billingInterval
  return {
    planId: planId === 'enterprise' ? fallback.planId : planId,
    billingInterval,
    status: (row.status as SubscriptionStatus) || 'none',
    foundingRateApplied: row.founding_rate_applied,
    trialEndsOn: dateOnly(row.trial_ends_at),
    currentPeriodEndsOn: dateOnly(row.current_period_ends_at),
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    stripePriceId: row.stripe_price_id,
  }
}
