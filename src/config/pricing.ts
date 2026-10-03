import type {
  ComparisonRow,
  LimitBehaviorCopy,
  PricingFaqItem,
  PricingPlan,
  UsageMeterCopy,
} from '@/domain/pricing'

/**
 * Central pricing configuration. Stripe / subscription billing is not wired yet —
 * CTAs route to setup, login, mailto, or placeholder demo links documented below.
 *
 * Keep `/cursor/stores/.../docs/docket-tree-pricing.md` in sync when changing this file.
 */

/** Flip to surface founding / early-adopter list prices on the public pricing page. */
export const foundingPricingEnabled = true

/** Annual discount vs paying monthly for twelve months (~two months free ≈ 16.7%). */
export const annualSavingsPercent = 17

export const pricingSeo = {
  title: 'Pricing · Docket Tree',
  description:
    'Simple vendor-readiness pricing that grows with your active vendor network. No per-seat fees. No vendor subscription fees. Start a 30-day free trial.',
} as const

export const pricingHero = {
  brand: 'Docket Tree',
  headline: 'Simple pricing that grows with your vendor network.',
  supporting:
    'No per-seat fees. No vendor subscription fees. Pay for the active vendors and properties you manage — not for how many teammates or vendors log in.',
} as const

export const trialCopy = {
  days: 30,
  summary: 'Every paid plan includes a 30-day free trial. No credit card required in this build.',
  bookDemoLabel: 'Book a Demo',
  bookDemoHref: 'mailto:sales@dockettree.example?subject=Docket%20Tree%20demo',
} as const

/**
 * CTA destinations until Stripe exists.
 * - start_trial → `/setup` (first-run org creation) when the server still needs setup;
 *   otherwise `/login` with `from=/pricing` so staff can sign in and continue.
 * - contact_sales / book_demo → mailto placeholder (documented; no calendly yet).
 */
export const pricingCtaRoutes = {
  start_trial_setup: '/setup',
  start_trial_login: '/login?from=/pricing&intent=trial',
  contact_sales: 'mailto:sales@dockettree.example?subject=Docket%20Tree%20Enterprise',
  book_demo: trialCopy.bookDemoHref,
} as const

export const foundingOffer = {
  enabled: foundingPricingEnabled,
  badge: 'Founding pricing',
  headline: 'Lock in founding rates while they last.',
  body: 'Early teams get a lower list price on Starter, Growth, and Portfolio. Founding rates apply to annual billing first; monthly founding rates are shown when Monthly is selected. Enterprise remains custom.',
} as const

export const claritySection = {
  title: 'Built around how property teams actually work',
  points: [
    {
      title: 'Unlimited internal teammates',
      body: 'Coordinators, reviewers, and admins never add a seat fee. Invite your whole operations team on every plan.',
    },
    {
      title: 'Vendors never pay to respond',
      body: 'Vendor contacts upload documents and reply through the portal at no cost. You are not asking contractors to buy software.',
    },
    {
      title: 'One vendor, counted once',
      body: 'A vendor linked to several properties still counts as a single active vendor toward your plan limit.',
    },
  ],
} as const

export const activeVendorDefinition = {
  title: 'What counts as an active vendor?',
  body: 'An active vendor is any vendor record that is not archived. Ready, Needs Action, In Review, Waiting, and Not Started all count. Archiving a vendor frees the slot immediately. The same vendor across multiple properties still counts as one.',
} as const

export const coreWorkflowMessage = {
  title: 'Core vendor-readiness on every paid plan',
  body: 'Document requests, vendor portal uploads, review decisions, reminders, expiration tracking, and the readiness overview ship on Starter through Enterprise. Higher tiers unlock scale, integrations, reporting depth, and enterprise controls — not a fragmented “lite” workflow.',
} as const

export const pricingPlans: PricingPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'For a focused property team getting vendors work-ready.',
    highlighted: false,
    enterprise: false,
    limits: {
      activeVendors: 50,
      properties: 5,
      internalSeats: 'unlimited',
    },
    prices: {
      monthly: { amountCents: 9900, foundingAmountCents: 7900 },
      annual: { amountCents: 99000, foundingAmountCents: 79000 },
    },
    features: [
      '50 active vendors',
      '5 properties',
      'Unlimited internal teammates',
      'Vendor portal & document requests',
      'Review queue & reminders',
      'Expiration tracking & readiness overview',
      'Email delivery queue',
      '30-day free trial',
    ],
    cta: { kind: 'start_trial', label: 'Start Free Trial' },
  },
  {
    id: 'growth',
    name: 'Growth',
    tagline: 'For teams scaling vendor readiness across a portfolio.',
    highlighted: true,
    badge: 'Most Popular',
    enterprise: false,
    limits: {
      activeVendors: 250,
      properties: 25,
      internalSeats: 'unlimited',
    },
    prices: {
      monthly: { amountCents: 24900, foundingAmountCents: 19900 },
      annual: { amountCents: 249000, foundingAmountCents: 199000 },
    },
    features: [
      '250 active vendors',
      '25 properties',
      'Everything in Starter',
      'CSV vendor import',
      'Requirement templates',
      'Bulk reminders',
      'Activity export',
      'Priority email support',
    ],
    cta: { kind: 'start_trial', label: 'Start Free Trial' },
  },
  {
    id: 'portfolio',
    name: 'Portfolio',
    tagline: 'For multi-site operators who need depth and control.',
    highlighted: false,
    enterprise: false,
    limits: {
      activeVendors: 1000,
      properties: 100,
      internalSeats: 'unlimited',
    },
    prices: {
      monthly: { amountCents: 59900, foundingAmountCents: 44900 },
      annual: { amountCents: 599000, foundingAmountCents: 449000 },
    },
    features: [
      '1,000 active vendors',
      '100 properties',
      'Everything in Growth',
      'Advanced readiness reporting',
      'Audit-friendly activity retention',
      'Custom reminder cadences',
      'Dedicated onboarding session',
      'Success check-ins',
    ],
    cta: { kind: 'start_trial', label: 'Start Free Trial' },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'For large portfolios, security reviews, and custom scale.',
    highlighted: false,
    enterprise: true,
    limits: {
      activeVendors: null,
      properties: null,
      internalSeats: 'unlimited',
    },
    prices: {
      monthly: {
        amountCents: null,
        foundingAmountCents: null,
        customLabel: 'Custom',
      },
      annual: {
        amountCents: null,
        foundingAmountCents: null,
        customLabel: 'Custom',
      },
    },
    features: [
      '1,000+ active vendors',
      '100+ properties',
      'Everything in Portfolio',
      'SSO / SAML (roadmap)',
      'Custom integrations & API access',
      'Security questionnaire support',
      'MSA / custom terms',
      'Named customer success',
    ],
    cta: { kind: 'contact_sales', label: 'Contact Sales' },
  },
]

export const comparisonRows: ComparisonRow[] = [
  {
    id: 'vendors',
    category: 'Scale',
    label: 'Active vendors',
    hint: 'Non-archived vendor records',
    values: {
      starter: '50',
      growth: '250',
      portfolio: '1,000',
      enterprise: '1,000+',
    },
  },
  {
    id: 'properties',
    category: 'Scale',
    label: 'Properties',
    values: {
      starter: '5',
      growth: '25',
      portfolio: '100',
      enterprise: '100+',
    },
  },
  {
    id: 'seats',
    category: 'Scale',
    label: 'Internal teammates',
    values: {
      starter: 'Unlimited',
      growth: 'Unlimited',
      portfolio: 'Unlimited',
      enterprise: 'Unlimited',
    },
  },
  {
    id: 'vendor-portal',
    category: 'Core workflow',
    label: 'Vendor portal uploads',
    values: { starter: true, growth: true, portfolio: true, enterprise: true },
  },
  {
    id: 'document-requests',
    category: 'Core workflow',
    label: 'Document requests & review',
    values: { starter: true, growth: true, portfolio: true, enterprise: true },
  },
  {
    id: 'reminders',
    category: 'Core workflow',
    label: 'Reminders & expirations',
    values: { starter: true, growth: true, portfolio: true, enterprise: true },
  },
  {
    id: 'readiness',
    category: 'Core workflow',
    label: 'Readiness overview',
    values: { starter: true, growth: true, portfolio: true, enterprise: true },
  },
  {
    id: 'csv-import',
    category: 'Operations',
    label: 'CSV vendor import',
    values: { starter: false, growth: true, portfolio: true, enterprise: true },
  },
  {
    id: 'templates',
    category: 'Operations',
    label: 'Requirement templates',
    values: { starter: false, growth: true, portfolio: true, enterprise: true },
  },
  {
    id: 'bulk-reminders',
    category: 'Operations',
    label: 'Bulk reminders',
    values: { starter: false, growth: true, portfolio: true, enterprise: true },
  },
  {
    id: 'exports',
    category: 'Operations',
    label: 'Activity export',
    values: { starter: false, growth: true, portfolio: true, enterprise: true },
  },
  {
    id: 'reporting',
    category: 'Reporting & retention',
    label: 'Advanced readiness reporting',
    values: { starter: false, growth: false, portfolio: true, enterprise: true },
  },
  {
    id: 'retention',
    category: 'Reporting & retention',
    label: 'Extended activity retention',
    values: { starter: false, growth: false, portfolio: true, enterprise: true },
  },
  {
    id: 'custom-cadence',
    category: 'Reporting & retention',
    label: 'Custom reminder cadences',
    values: { starter: false, growth: false, portfolio: true, enterprise: true },
  },
  {
    id: 'sso',
    category: 'Enterprise',
    label: 'SSO / SAML',
    hint: 'Roadmap — structured for later',
    values: {
      starter: false,
      growth: false,
      portfolio: false,
      enterprise: 'Available',
    },
  },
  {
    id: 'api',
    category: 'Enterprise',
    label: 'API & custom integrations',
    values: {
      starter: false,
      growth: false,
      portfolio: false,
      enterprise: 'Available',
    },
  },
  {
    id: 'msa',
    category: 'Enterprise',
    label: 'MSA / custom terms',
    values: { starter: false, growth: false, portfolio: false, enterprise: true },
  },
  {
    id: 'success',
    category: 'Enterprise',
    label: 'Named customer success',
    values: { starter: false, growth: false, portfolio: 'Onboarding', enterprise: true },
  },
]

export const pricingFaq: PricingFaqItem[] = [
  {
    id: 'how-billed',
    question: 'How is Docket Tree priced?',
    answer:
      'Plans are based on active vendors and properties — not seats. Internal teammates are unlimited on every plan, and vendors never pay to use the portal.',
  },
  {
    id: 'active-vendor',
    question: 'What is an active vendor?',
    answer:
      'Any vendor that is not archived. Status (Ready, Needs Action, In Review, and so on) does not change the count. One vendor linked to many properties still counts as one active vendor.',
  },
  {
    id: 'annual-savings',
    question: 'Why choose annual billing?',
    answer:
      'Annual billing is priced at roughly ten months of the monthly rate — about two months free, shown as Save ~17% on the pricing page.',
  },
  {
    id: 'trial',
    question: 'Is there a free trial?',
    answer:
      'Yes. Starter, Growth, and Portfolio include a 30-day free trial. Payment processing is not wired in this build; the trial CTA opens setup or sign-in so you can evaluate the product.',
  },
  {
    id: 'vendors-pay',
    question: 'Do vendors need their own subscription?',
    answer:
      'No. Vendors respond and upload documents through your branded portal at no cost. Only your organization subscribes.',
  },
  {
    id: 'over-limit',
    question: 'What happens if we reach our vendor limit?',
    answer:
      'This build does not block workflows on limits yet. When billing ships, you will see usage meters and soft warnings as you approach the plan cap, with a clear path to upgrade. Archived vendors stop counting immediately.',
  },
  {
    id: 'founding',
    question: 'What is founding pricing?',
    answer:
      'When founding pricing is enabled, early customers see a lower list price on Starter, Growth, and Portfolio. Enterprise remains custom. Toggle the foundingPricingEnabled flag in the pricing config to hide the offer.',
  },
  {
    id: 'enterprise',
    question: 'When should we talk about Enterprise?',
    answer:
      'If you need more than 1,000 active vendors or 100 properties, SSO, custom integrations, security review support, or an MSA, Contact Sales or Book a Demo and we will scope a fit.',
  },
]

export const usageMeterCopy: UsageMeterCopy = {
  vendors: {
    title: 'Active vendors',
    description: 'Non-archived vendors count once, even across properties.',
    nearLimit: 'You are approaching your plan’s active vendor limit. Archive unused vendors or upgrade when you are ready.',
    atLimit:
      'You are at your active vendor limit. New vendors will be allowed once billing enforcement ships; upgrade or archive vendors to stay within plan.',
  },
  properties: {
    title: 'Properties',
    description: 'Properties used for readiness context and vendor assignments.',
    nearLimit: 'You are approaching your property limit. Upgrade when you add sites.',
    atLimit:
      'You are at your property limit. Enforcement is not active yet; upgrade when you need more sites.',
  },
}

export const limitBehavior: LimitBehaviorCopy = {
  softWarnThresholdRatio: 0.8,
  summary:
    'Limits are informational in this build. Workflows are not blocked. Soft warnings are prepared for Settings → Billing once that surface ships.',
  whenApproaching:
    'At 80% of a limit, surface a calm notice with upgrade and archive guidance — never an alarmist block.',
  whenAtLimit:
    'At 100%, keep existing work flowing. Discourage new active vendors/properties with copy and an upgrade CTA; hard blocks wait for Stripe-backed enforcement.',
  archivedDoNotCount: 'Archived vendors do not count toward the active vendor limit.',
  vendorsDoNotPay: 'Vendor contacts never consume a paid seat and never owe a subscription.',
}

export function formatUsdFromCents(cents: number): string {
  if (cents % 100 === 0) {
    return `$${Math.round(cents / 100).toLocaleString('en-US')}`
  }
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
}

export function planPriceFor(
  plan: PricingPlan,
  interval: 'monthly' | 'annual',
  founding: boolean,
): { label: string; detail: string | null; isCustom: boolean; isFounding: boolean } {
  const price = plan.prices[interval]
  if (price.amountCents == null) {
    return {
      label: price.customLabel ?? 'Custom',
      detail: 'Talk with us about scale, security, and terms.',
      isCustom: true,
      isFounding: false,
    }
  }

  const useFounding =
    founding && price.foundingAmountCents != null && price.foundingAmountCents < price.amountCents
  const amount = useFounding ? price.foundingAmountCents! : price.amountCents
  const perMonth =
    interval === 'annual' ? Math.round(amount / 12) : amount

  return {
    label: formatUsdFromCents(perMonth),
    detail:
      interval === 'annual'
        ? `${formatUsdFromCents(amount)} billed annually`
        : 'billed monthly',
    isCustom: false,
    isFounding: useFounding,
  }
}
