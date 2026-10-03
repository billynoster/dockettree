import type { OrgBillingState } from '@/domain/pricing'

/**
 * Stub organization billing until Stripe + persisted subscription records exist.
 *
 * Default demo posture: **Growth · Annual · Trialing** with founding rate applied,
 * and stubbed usage near the Growth vendor limit (~84%) so approaching-limit copy
 * is visible. Flip `useLiveUsageCounts` to `true` to drive meters from overview /
 * vendor-list totals instead.
 *
 * Documented in docs/docket-tree-pricing.md (Billing settings section).
 */
export const orgBillingStub: OrgBillingState = {
  planId: 'growth',
  billingInterval: 'annual',
  status: 'trialing',
  foundingRateApplied: true,
  trialEndsOn: '2026-11-02',
  currentPeriodEndsOn: null,
  useLiveUsageCounts: false,
  stubUsage: {
    activeVendors: 210,
    properties: 8,
  },
}

/** Alternate stubs for manual UI checks — not selected by default. */
export const orgBillingStubPresets = {
  activeComfortable: {
    ...orgBillingStub,
    status: 'active' as const,
    foundingRateApplied: true,
    trialEndsOn: null,
    currentPeriodEndsOn: '2027-10-03',
    stubUsage: { activeVendors: 42, properties: 4 },
  },
  atVendorLimit: {
    ...orgBillingStub,
    status: 'active' as const,
    foundingRateApplied: false,
    trialEndsOn: null,
    currentPeriodEndsOn: '2027-10-03',
    stubUsage: { activeVendors: 250, properties: 22 },
  },
  pastDue: {
    ...orgBillingStub,
    status: 'past_due' as const,
    foundingRateApplied: true,
    trialEndsOn: null,
    currentPeriodEndsOn: '2026-09-15',
    stubUsage: { activeVendors: 180, properties: 12 },
  },
} as const
