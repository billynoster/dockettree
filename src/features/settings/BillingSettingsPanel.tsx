import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowUpRight, Building2, CreditCard, ExternalLink, LoaderCircle, Users } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api/client'
import { useApp } from '@/app/AppProvider'
import { useServiceQuery } from '@/app/useServiceQuery'
import { Section, SectionBody, SectionHeader } from '@/components/Section'
import { ErrorState, InlineNotice, LoadingState } from '@/components/States'
import { Chip, type ChipTone } from '@/components/StatusChips'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { orgBillingStub } from '@/config/billingStub'
import {
  foundingPricingEnabled,
  limitBehavior,
  planPriceFor,
  pricingCtaRoutes,
  pricingPlans,
  usageMeterCopy,
} from '@/config/pricing'
import type {
  BillingInterval,
  OrgBillingState,
  PlanId,
  SubscriptionStatus,
} from '@/domain/pricing'
import { openBillingPortal, startCheckout } from '@/lib/billingActions'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/utils'

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  none: 'No plan',
  trialing: 'Trial',
  active: 'Active',
  past_due: 'Past due',
  canceled: 'Canceled',
  expired: 'Expired',
  incomplete: 'Incomplete',
}

const STATUS_TONE: Record<SubscriptionStatus, ChipTone> = {
  none: 'neutral',
  trialing: 'info',
  active: 'ok',
  past_due: 'warn',
  canceled: 'neutral',
  expired: 'danger',
  incomplete: 'warn',
}

const STATUS_HINT: Record<SubscriptionStatus, string> = {
  none: 'No Stripe subscription yet. Start a trial from Pricing, or use Manage billing after Checkout.',
  trialing: 'Trial is active. Manage payment method and invoices in the Stripe Customer Portal.',
  active: 'Subscription is active. Open the Customer Portal to update card or invoices.',
  past_due: 'Payment needs attention. Open the Customer Portal to update the payment method.',
  canceled: 'Subscription is canceled. Start Checkout again to resubscribe.',
  expired: 'Trial or period ended. Choose a plan on Pricing to continue.',
  incomplete: 'Checkout did not finish. Start Checkout again or open the Customer Portal.',
}

type UsageLevel = 'ok' | 'approaching' | 'at_limit'

function usageLevel(used: number, limit: number | null): UsageLevel {
  if (limit == null || limit <= 0) return 'ok'
  const ratio = used / limit
  if (ratio >= 1) return 'at_limit'
  if (ratio >= limitBehavior.softWarnThresholdRatio) return 'approaching'
  return 'ok'
}

function usagePercent(used: number, limit: number | null): number {
  if (limit == null || limit <= 0) return 0
  return Math.min(100, Math.round((used / limit) * 100))
}

function nextPlanId(planId: PlanId): PlanId | null {
  if (planId === 'starter') return 'growth'
  if (planId === 'growth') return 'portfolio'
  if (planId === 'portfolio') return 'enterprise'
  return null
}

function nextPlanName(planId: PlanId): string | null {
  const id = nextPlanId(planId)
  return id ? pricingPlans.find((plan) => plan.id === id)?.name ?? null : null
}

function formatLimit(limit: number | null): string {
  if (limit == null) return 'Custom'
  return limit.toLocaleString('en-US')
}

function UsageMeter({
  title,
  description,
  used,
  limit,
  planId,
  planName,
  kind,
}: {
  title: string
  description: string
  used: number
  limit: number | null
  planId: PlanId
  planName: string
  kind: 'vendors' | 'properties'
}) {
  const level = usageLevel(used, limit)
  const percent = usagePercent(used, limit)
  const upgradeName = nextPlanName(planId)

  const approachingCopy =
    kind === 'vendors'
      ? `You're approaching your ${planName} plan vendor limit.`
      : `You're approaching your ${planName} plan property limit.`
  const atLimitCopy =
    kind === 'vendors'
      ? `You've reached your active vendor limit.`
      : `You've reached your property limit.`

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="type-subtitle flex items-center gap-2">
            {kind === 'vendors' ? (
              <Users aria-hidden="true" className="size-4 text-[var(--clay-text)]" />
            ) : (
              <Building2 aria-hidden="true" className="size-4 text-[var(--clay-text)]" />
            )}
            {title}
          </p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <p className="shrink-0 text-sm font-medium tabular-nums text-foreground">
          {used.toLocaleString('en-US')} of {formatLimit(limit)}
        </p>
      </div>

      <Progress
        value={percent}
        aria-label={`${title}: ${used} of ${formatLimit(limit)}`}
        className={cn(
          level === 'approaching' && '[&_[data-slot=progress-indicator]]:bg-[var(--tone-warn-solid)]',
          level === 'at_limit' && '[&_[data-slot=progress-indicator]]:bg-[var(--tone-danger-solid)]',
        )}
      />

      {level === 'approaching' ? (
        <div className="space-y-2">
          <p className="text-sm text-foreground-soft">{approachingCopy}</p>
          <p className="text-xs text-muted-foreground">
            {kind === 'vendors' ? usageMeterCopy.vendors.nearLimit : usageMeterCopy.properties.nearLimit}
          </p>
          <Button asChild size="sm" variant="outline">
            <Link
              to="/pricing"
              onClick={() =>
                track('billing_cta_clicked', { cta: 'view_plans', reason: 'approaching', kind })
              }
            >
              View Plans
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      ) : null}

      {level === 'at_limit' ? (
        <div className="space-y-2">
          <p className="text-sm text-foreground-soft">{atLimitCopy}</p>
          <p className="text-xs text-muted-foreground">
            {upgradeName
              ? `Upgrade to ${upgradeName} when you need more headroom. Existing vendors and reviews stay available — limits are not enforced yet.`
              : kind === 'vendors'
                ? usageMeterCopy.vendors.atLimit
                : usageMeterCopy.properties.atLimit}
          </p>
          <Button asChild size="sm">
            <Link
              to="/pricing"
              onClick={() =>
                track('billing_cta_clicked', {
                  cta: 'view_upgrade_options',
                  reason: 'at_limit',
                  kind,
                })
              }
            >
              View Upgrade Options
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function resolveUsage(
  billing: OrgBillingState,
  live: { activeVendors: number; properties: number } | null,
): { activeVendors: number; properties: number; source: 'live' | 'stub' } {
  if (billing.useLiveUsageCounts && live) {
    return { ...live, source: 'live' }
  }
  return { ...billing.stubUsage, source: 'stub' }
}

function mergeBillingState(
  apiBilling:
    | {
        planId: PlanId
        billingInterval: BillingInterval
        status: SubscriptionStatus
        foundingRateApplied: boolean
        trialEndsOn: string | null
        currentPeriodEndsOn: string | null
        stripeCustomerId: string | null
        stripeSubscriptionId: string | null
        stripePriceId: string | null
        billingMode: 'mock' | 'stripe'
      }
    | null
    | undefined,
): OrgBillingState {
  if (!apiBilling) return orgBillingStub
  return {
    ...orgBillingStub,
    planId: apiBilling.planId,
    billingInterval: apiBilling.billingInterval,
    status: apiBilling.status,
    foundingRateApplied: apiBilling.foundingRateApplied,
    trialEndsOn: apiBilling.trialEndsOn,
    currentPeriodEndsOn: apiBilling.currentPeriodEndsOn,
    stripeCustomerId: apiBilling.stripeCustomerId,
    stripeSubscriptionId: apiBilling.stripeSubscriptionId,
    stripePriceId: apiBilling.stripePriceId,
    billingMode: apiBilling.billingMode,
  }
}

export function BillingSettingsPanel() {
  const app = useApp()
  const canManage = app.can('settings.manage')
  const [searchParams, setSearchParams] = useSearchParams()
  const [portalBusy, setPortalBusy] = useState(false)
  const [checkoutBusy, setCheckoutBusy] = useState(false)

  const billingQuery = useServiceQuery(() => api.billing(), [])
  const overview = useServiceQuery(() => api.overview(), [])
  const vendors = useServiceQuery(
    () => api.listVendors({ lifecycle: 'active', pageSize: 1, page: 1 }),
    [],
  )

  const billing = mergeBillingState(billingQuery.data)

  useEffect(() => {
    track('billing_settings_viewed', {
      plan_id: billing.planId,
      status: billing.status,
      founding: billing.foundingRateApplied && foundingPricingEnabled,
      mode: billing.billingMode,
    })
  }, [billing.billingMode, billing.foundingRateApplied, billing.planId, billing.status])

  useEffect(() => {
    const checkout = searchParams.get('checkout')
    const portal = searchParams.get('portal')
    if (!checkout && !portal) return
    if (checkout === 'success' || checkout === 'mock') {
      toast.success(
        checkout === 'mock'
          ? 'Mock checkout complete — organization marked trialing locally.'
          : 'Checkout complete. Subscription status updates when the Stripe webhook arrives.',
      )
      billingQuery.reload()
    }
    if (portal === 'mock') {
      toast.message('Returned from mock Customer Portal.')
    }
    const next = new URLSearchParams(searchParams)
    next.delete('checkout')
    next.delete('portal')
    next.delete('plan')
    next.delete('interval')
    setSearchParams(next, { replace: true })
    // Intentionally depend on the search string only — avoid reload loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()])

  const plan = pricingPlans.find((entry) => entry.id === billing.planId)
  const price = plan
    ? planPriceFor(
        plan,
        billing.billingInterval,
        billing.foundingRateApplied && foundingPricingEnabled,
      )
    : null

  const liveUsage = useMemo(() => {
    if (overview.loading || vendors.loading || !overview.data || !vendors.data) return null
    return {
      activeVendors: overview.data.counts.active,
      properties: vendors.data.properties.length,
    }
  }, [overview.data, overview.loading, vendors.data, vendors.loading])

  const usage = resolveUsage(billing, liveUsage)
  const loading = billingQuery.loading
  const errorMessage = billingQuery.error

  if (loading && !billingQuery.data) {
    return <LoadingState label="Loading billing…" rows={3} />
  }

  if (errorMessage && !billingQuery.data) {
    return <ErrorState title="Billing could not be loaded" message={String(errorMessage)} />
  }

  if (!plan || !price) {
    return (
      <InlineNotice tone="danger">
        Billing references an unknown plan id. Check the organization billing record.
      </InlineNotice>
    )
  }

  const showFounding = foundingPricingEnabled && billing.foundingRateApplied && !plan.enterprise
  const showUsageLoading = billing.useLiveUsageCounts && (overview.loading || vendors.loading)
  const showUsageError = billing.useLiveUsageCounts && (overview.error ?? vendors.error)
  const upgradeId = nextPlanId(billing.planId)

  const onManageBilling = async () => {
    if (!canManage) {
      toast.error('Only an organization admin can open the Customer Portal.')
      return
    }
    setPortalBusy(true)
    const result = await openBillingPortal('billing_settings')
    if (result !== 'redirected') setPortalBusy(false)
  }

  const onStartCheckout = async (planId: PlanId, interval: BillingInterval) => {
    if (!canManage) {
      toast.error('Only an organization admin can start Checkout.')
      return
    }
    if (planId === 'enterprise') {
      window.location.href = pricingCtaRoutes.contact_sales
      return
    }
    setCheckoutBusy(true)
    const result = await startCheckout({
      planId,
      interval,
      source: 'billing_settings',
    })
    if (result !== 'redirected') setCheckoutBusy(false)
  }

  return (
    <div className="space-y-4">
      <Section>
        <SectionHeader
          title="Plan"
          description={
            billing.billingMode === 'stripe'
              ? 'Stripe Test-mode subscription for this organization. Limits stay informational.'
              : 'Mock billing mode (STRIPE_SECRET_KEY unset). Checkout/Portal simulate locally so dev still boots.'
          }
          border
          className="px-3 py-2.5"
        />
        <SectionBody className="space-y-4 pt-3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 type-display-sm">
                  <CreditCard aria-hidden="true" className="size-5 text-[var(--clay-text)]" />
                  {billing.status === 'none' ? 'No active plan' : plan.name}
                </span>
                <Chip tone={STATUS_TONE[billing.status]}>{STATUS_LABEL[billing.status]}</Chip>
                {showFounding && billing.status !== 'none' ? (
                  <Chip tone="warn">Founding rate</Chip>
                ) : null}
                <Chip tone="neutral">{billing.billingMode === 'stripe' ? 'Stripe Test' : 'Mock'}</Chip>
              </div>
              {billing.status !== 'none' ? (
                <p className="text-sm text-muted-foreground">
                  Billed {billing.billingInterval === 'annual' ? 'annually' : 'monthly'}
                  {price.isCustom
                    ? ' · Custom pricing'
                    : ` · ${price.label}/mo${price.detail ? ` (${price.detail})` : ''}`}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Choose a self-serve plan on Pricing to start a 30-day trial via Checkout.
                </p>
              )}
              {billing.status === 'trialing' && billing.trialEndsOn ? (
                <p className="text-sm text-muted-foreground">
                  Trial ends <span className="font-medium text-foreground">{billing.trialEndsOn}</span>.
                </p>
              ) : null}
              {billing.currentPeriodEndsOn ? (
                <p className="text-sm text-muted-foreground">
                  Current period ends{' '}
                  <span className="font-medium text-foreground">{billing.currentPeriodEndsOn}</span>.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link
                  to="/pricing"
                  onClick={() =>
                    track('billing_cta_clicked', { cta: 'view_plans', source: 'plan_header' })
                  }
                >
                  View Plans
                </Link>
              </Button>
              {canManage ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={portalBusy}
                  onClick={() => void onManageBilling()}
                >
                  {portalBusy ? (
                    <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                  ) : (
                    <ExternalLink aria-hidden="true" className="size-4" />
                  )}
                  Manage billing
                </Button>
              ) : null}
              {plan.enterprise || billing.planId === 'portfolio' ? (
                <Button asChild size="sm" variant="outline">
                  <a
                    href={pricingCtaRoutes.contact_sales}
                    onClick={() =>
                      track('billing_cta_clicked', { cta: 'contact_sales', source: 'plan_header' })
                    }
                  >
                    Contact Sales
                  </a>
                </Button>
              ) : null}
              {canManage &&
              (billing.status === 'none' ||
                billing.status === 'expired' ||
                billing.status === 'canceled' ||
                billing.status === 'incomplete') ? (
                <Button
                  size="sm"
                  disabled={checkoutBusy}
                  onClick={() => void onStartCheckout(billing.planId === 'enterprise' ? 'growth' : billing.planId, billing.billingInterval)}
                >
                  {checkoutBusy ? (
                    <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                  ) : null}
                  Start Free Trial
                </Button>
              ) : null}
              {canManage && upgradeId && upgradeId !== 'enterprise' && billing.status !== 'none' ? (
                <Button
                  size="sm"
                  disabled={checkoutBusy}
                  onClick={() => void onStartCheckout(upgradeId, billing.billingInterval)}
                >
                  {checkoutBusy ? (
                    <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                  ) : null}
                  Upgrade to {nextPlanName(billing.planId)}
                </Button>
              ) : null}
            </div>
          </div>

          <InlineNotice tone={STATUS_TONE[billing.status]}>
            {STATUS_HINT[billing.status]}
          </InlineNotice>

          {billing.billingMode === 'mock' ? (
            <InlineNotice tone="info">
              Stripe Test keys are not set. Checkout and the Customer Portal use a local mock so
              development still boots. Set `STRIPE_SECRET_KEY` (sk_test_…) and
              `STRIPE_WEBHOOK_SECRET` on Cloud Run for real Test-mode sessions.
            </InlineNotice>
          ) : null}

          {showFounding && billing.status !== 'none' ? (
            <InlineNotice tone="warn">
              Founding list pricing is recorded on this organization. Public founding rates can be
              turned off from the pricing config when the early-adopter offer ends.
            </InlineNotice>
          ) : null}

          <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Subscription states
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {(Object.keys(STATUS_LABEL) as SubscriptionStatus[]).map((status) => (
                <li key={status}>
                  <Chip
                    tone={STATUS_TONE[status]}
                    className={cn(status !== billing.status && 'opacity-45')}
                  >
                    {STATUS_LABEL[status]}
                  </Chip>
                </li>
              ))}
            </ul>
          </div>
        </SectionBody>
      </Section>

      <Section>
        <SectionHeader
          title="Usage"
          description={
            usage.source === 'stub'
              ? 'Stubbed counts for UI demo (see orgBillingStub). Flip useLiveUsageCounts to use live totals.'
              : 'Live active-vendor and property totals from this workspace.'
          }
          border
          className="px-3 py-2.5"
        />
        <SectionBody className="space-y-3 pt-3">
          {showUsageLoading ? <LoadingState label="Loading usage…" rows={2} /> : null}
          {showUsageError ? (
            <ErrorState title="Usage could not be loaded" message={String(showUsageError)} />
          ) : null}
          {!showUsageLoading && !showUsageError ? (
            <>
              <UsageMeter
                kind="vendors"
                title={usageMeterCopy.vendors.title}
                description={usageMeterCopy.vendors.description}
                used={usage.activeVendors}
                limit={plan.limits.activeVendors}
                planId={plan.id}
                planName={plan.name}
              />
              <UsageMeter
                kind="properties"
                title={usageMeterCopy.properties.title}
                description={usageMeterCopy.properties.description}
                used={usage.properties}
                limit={plan.limits.properties}
                planId={plan.id}
                planName={plan.name}
              />
              <p className="text-xs text-muted-foreground">{limitBehavior.summary}</p>
            </>
          ) : null}
        </SectionBody>
      </Section>
    </div>
  )
}
