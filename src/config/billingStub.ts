import type { OrgBillingState } from '@/domain/pricing'

/**
 * Fallback organization billing when the API has no Stripe row yet (status `none`)
 * or the billing request fails. Usage meters still use stub counts unless
 * `useLiveUsageCounts` is flipped.
 *
 * Documented in docs/docket-tree-pricing.md (Billing settings section).
 */
export const orgBillingStub: OrgBillingState = {
  planId: 'growth',
  billingInterval: 'annual',
  status: 'none',
  foundingRateApplied: true,
  trialEndsOn: null,
  currentPeriodEndsOn: null,
  billingMode: 'mock',
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
