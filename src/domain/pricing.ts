/**
 * Pricing and plan types. Payment processing (Stripe) is intentionally absent —
 * these shapes are the contract for the public pricing page and a future Billing settings tab.
 */

export type PlanId = 'starter' | 'growth' | 'portfolio' | 'enterprise'

export type BillingInterval = 'monthly' | 'annual'

export type PlanCtaKind = 'start_trial' | 'contact_sales' | 'book_demo'

export type FeatureAvailability = boolean | string

export type ComparisonValue = FeatureAvailability

export interface PlanLimits {
  /** Active (non-archived) vendors. `null` means custom / negotiated. */
  activeVendors: number | null
  /** Properties the org can track readiness against. `null` means custom. */
  properties: number | null
  /** Internal seats are unlimited on every published plan. */
  internalSeats: 'unlimited'
}

export interface PlanPrice {
  /** List price in USD cents for the billing interval. `null` = custom / contact sales. */
  amountCents: number | null
  /** Optional founding / early-adopter price in USD cents when the founding flag is on. */
  foundingAmountCents: number | null
  /** Human label when amount is null, e.g. "Custom". */
  customLabel?: string
}

export interface PricingPlan {
  id: PlanId
  name: string
  /** One-line positioning under the plan name. */
  tagline: string
  highlighted: boolean
  badge?: string
  enterprise: boolean
  limits: PlanLimits
  prices: Record<BillingInterval, PlanPrice>
  /** Short bullets shown on the plan card. */
  features: string[]
  cta: {
    kind: PlanCtaKind
    label: string
  }
}

export interface ComparisonRow {
  id: string
  category: string
  label: string
  hint?: string
  values: Record<PlanId, ComparisonValue>
}

export interface PricingFaqItem {
  id: string
  question: string
  answer: string
}

export interface UsageMeterCopy {
  vendors: {
    title: string
    description: string
    nearLimit: string
    atLimit: string
  }
  properties: {
    title: string
    description: string
    nearLimit: string
    atLimit: string
  }
}

export interface LimitBehaviorCopy {
  softWarnThresholdRatio: number
  summary: string
  whenApproaching: string
  whenAtLimit: string
  archivedDoNotCount: string
  vendorsDoNotPay: string
}
