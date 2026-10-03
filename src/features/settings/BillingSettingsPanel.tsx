import { useEffect, useMemo } from 'react'
import { Link } from 'react-router'
import { ArrowUpRight, Building2, CreditCard, Users } from 'lucide-react'
import { api } from '@/api/client'
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
  OrgBillingState,
  PlanId,
  SubscriptionStatus,
} from '@/domain/pricing'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/utils'

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trialing: 'Trial',
  active: 'Active',
  past_due: 'Past due',
  canceled: 'Canceled',
  expired: 'Expired',
}

const STATUS_TONE: Record<SubscriptionStatus, ChipTone> = {
  trialing: 'info',
  active: 'ok',
  past_due: 'warn',
  canceled: 'neutral',
  expired: 'danger',
}

const STATUS_HINT: Record<SubscriptionStatus, string> = {
  trialing: 'Trial is display-only until Stripe is connected. Workflows stay fully available.',
  active: 'Subscription is active. Payment processing is not wired yet — this is a stub status.',
  past_due:
    'Payment would need attention once Stripe ships. Existing vendors and reviews remain available.',
  canceled:
    'Plan is marked canceled in the stub. No destructive billing actions are available yet.',
  expired:
    'Trial or period has ended in the stub. Upgrade options remain available; nothing is blocked.',
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

function nextPlanName(planId: PlanId): string | null {
  if (planId === 'starter') return 'Growth'
  if (planId === 'growth') return 'Portfolio'
  if (planId === 'portfolio') return 'Enterprise'
  return null
}

function formatLimit(limit: number | null): string {
  if (limit == null) return 'Custom'
  return limit.toLocaleString('en-US')
}

function noticeToneForStatus(status: SubscriptionStatus): ChipTone {
  return STATUS_TONE[status]
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

export function BillingSettingsPanel() {
  const billing = orgBillingStub
  const overview = useServiceQuery(() => api.overview(), [])
  const vendors = useServiceQuery(
    () => api.listVendors({ lifecycle: 'active', pageSize: 1, page: 1 }),
    [],
  )

  useEffect(() => {
    track('billing_settings_viewed', {
      plan_id: billing.planId,
      status: billing.status,
      founding: billing.foundingRateApplied && foundingPricingEnabled,
    })
  }, [billing.foundingRateApplied, billing.planId, billing.status])

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
  const loading = overview.loading || vendors.loading
  const errorMessage = overview.error ?? vendors.error

  if (!plan || !price) {
    return (
      <InlineNotice tone="danger">
        Billing stub references an unknown plan id. Check `orgBillingStub.planId`.
      </InlineNotice>
    )
  }

  const showFounding = foundingPricingEnabled && billing.foundingRateApplied && !plan.enterprise

  // Stub usage does not need live queries; still warm them so flipping useLiveUsageCounts works.
  const showUsageLoading = billing.useLiveUsageCounts && loading
  const showUsageError = billing.useLiveUsageCounts && errorMessage

  return (
    <div className="space-y-4">
      <Section>
        <SectionHeader
          title="Plan"
          description="Stubbed subscription until Stripe is connected. Limits are informational — workflows are never blocked."
          border
          className="px-3 py-2.5"
        />
        <SectionBody className="space-y-4 pt-3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 type-display-sm">
                  <CreditCard aria-hidden="true" className="size-5 text-[var(--clay-text)]" />
                  {plan.name}
                </span>
                <Chip tone={STATUS_TONE[billing.status]}>{STATUS_LABEL[billing.status]}</Chip>
                {showFounding ? <Chip tone="warn">Founding rate</Chip> : null}
              </div>
              <p className="text-sm text-muted-foreground">
                Billed {billing.billingInterval === 'annual' ? 'annually' : 'monthly'}
                {price.isCustom
                  ? ' · Custom pricing'
                  : ` · ${price.label}/mo${price.detail ? ` (${price.detail})` : ''}`}
              </p>
              {billing.status === 'trialing' && billing.trialEndsOn ? (
                <p className="text-sm text-muted-foreground">
                  Trial ends <span className="font-medium text-foreground">{billing.trialEndsOn}</span>
                  . No payment method is collected in this build.
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
              ) : billing.status === 'trialing' ||
                billing.status === 'expired' ||
                billing.status === 'canceled' ? (
                <Button asChild size="sm">
                  <Link
                    to={pricingCtaRoutes.start_trial_setup}
                    onClick={() =>
                      track('billing_cta_clicked', { cta: 'start_trial', source: 'plan_header' })
                    }
                  >
                    Start Free Trial
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>

          <InlineNotice tone={noticeToneForStatus(billing.status)}>
            {STATUS_HINT[billing.status]}
          </InlineNotice>

          {showFounding ? (
            <InlineNotice tone="warn">
              Founding list pricing is applied to this stub. Toggle `foundingPricingEnabled` or
              `foundingRateApplied` when the public founding offer ends.
            </InlineNotice>
          ) : null}

          <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Subscription states (display only)
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
            <ErrorState title="Usage could not be loaded" message={String(errorMessage)} />
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
