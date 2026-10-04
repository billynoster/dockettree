import { useEffect, useId, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  Check,
  ChevronDown,
  Minus,
  LoaderCircle,
} from 'lucide-react'
import { useSession } from '@/app/AppProvider'
import {
  activeVendorDefinition,
  annualSavingsPercent,
  claritySection,
  comparisonRows,
  coreWorkflowMessage,
  foundingOffer,
  foundingPricingEnabled,
  planPriceFor,
  pricingCtaRoutes,
  pricingFaq,
  pricingHero,
  pricingPlans,
  pricingSeo,
  trialCopy,
} from '@/config/pricing'
import { BrandLockupHorizontal, BrandMark } from '@/components/brand/Brand'
import { Button } from '@/components/ui/button'
import { startCheckout } from '@/lib/billingActions'
import { cn } from '@/lib/utils'
import { track } from '@/lib/analytics'
import type { BillingInterval, PlanId, PricingPlan } from '@/domain/pricing'
import { toast } from 'sonner'

function useDocumentSeo(title: string, description: string) {
  useEffect(() => {
    const previousTitle = document.title
    document.title = title
    let meta = document.querySelector('meta[name="description"]')
    const previousDescription = meta?.getAttribute('content') ?? null
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'description')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', description)
    return () => {
      document.title = previousTitle
      if (meta && previousDescription != null) {
        meta.setAttribute('content', previousDescription)
      }
    }
  }, [title, description])
}

function CtaButton({
  plan,
  interval,
  className,
}: {
  plan: PricingPlan
  interval: BillingInterval
  className?: string
}) {
  const navigate = useNavigate()
  const { state } = useSession()
  const [busy, setBusy] = useState(false)
  const session = state.info
  const authenticated = Boolean(session?.authenticated)
  const canManageBilling = Boolean(session?.capabilities?.includes('settings.manage'))
  const setupRequired = Boolean(session?.setupRequired)

  if (plan.cta.kind === 'contact_sales' || plan.enterprise) {
    return (
      <Button asChild className={className} size="lg" variant={plan.highlighted ? 'default' : 'outline'}>
        <a
          href={pricingCtaRoutes.contact_sales}
          onClick={() =>
            track('plan_cta_clicked', {
              plan_id: plan.id,
              cta_kind: 'contact_sales',
              billing_interval: interval,
              founding: foundingPricingEnabled,
            })
          }
        >
          {plan.cta.label}
        </a>
      </Button>
    )
  }

  const onCheckout = async () => {
    if (setupRequired || state.status === 'loading') {
      track('plan_cta_clicked', {
        plan_id: plan.id,
        cta_kind: 'start_trial',
        billing_interval: interval,
        source: 'pricing_card_setup',
      })
      navigate(pricingCtaRoutes.start_trial_setup)
      return
    }
    if (!authenticated) {
      track('plan_cta_clicked', {
        plan_id: plan.id,
        cta_kind: 'start_trial',
        billing_interval: interval,
        source: 'pricing_card_login',
      })
      navigate(
        `/login?from=${encodeURIComponent(`/pricing?checkout=1&plan=${plan.id}&interval=${interval}`)}&intent=checkout`,
      )
      return
    }
    if (!canManageBilling) {
      toast.error('Ask an organization admin to start Checkout or manage billing.')
      return
    }
    setBusy(true)
    const result = await startCheckout({
      planId: plan.id,
      interval,
      source: 'pricing_card',
    })
    if (result !== 'redirected') setBusy(false)
  }

  return (
    <Button
      className={className}
      size="lg"
      variant={plan.highlighted ? 'default' : 'outline'}
      disabled={busy || state.status === 'loading'}
      onClick={() => void onCheckout()}
    >
      {busy ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
      {busy ? 'Starting Checkout…' : plan.cta.label}
    </Button>
  )
}

function BillingToggle({
  value,
  onChange,
}: {
  value: BillingInterval
  onChange: (next: BillingInterval) => void
}) {
  const groupId = useId()
  return (
    <div
      role="group"
      aria-labelledby={`${groupId}-label`}
      className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-card p-1"
    >
      <span id={`${groupId}-label`} className="sr-only">
        Billing interval
      </span>
      {([
        { id: 'monthly' as const, label: 'Monthly' },
        { id: 'annual' as const, label: 'Annual' },
      ]).map((option) => {
        const selected = value === option.id
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.id)}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-[background-color,color] duration-(--duration-quick) ease-(--ease-soft)',
              selected
                ? 'bg-primary text-primary-foreground'
                : 'text-foreground-soft hover:bg-muted hover:text-foreground',
            )}
          >
            {option.label}
            {option.id === 'annual' ? (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  selected
                    ? 'bg-primary-foreground/15 text-primary-foreground'
                    : 'tone-brand border',
                )}
              >
                Save ~{annualSavingsPercent}%
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

function PlanCard({ plan, interval }: { plan: PricingPlan; interval: BillingInterval }) {
  const price = planPriceFor(plan, interval, foundingPricingEnabled)

  return (
    <article
      className={cn(
        'relative flex h-full flex-col gap-5 rounded-2xl border bg-card p-6',
        plan.highlighted
          ? 'border-[var(--tone-brand-border)] ring-2 ring-[var(--primary)]/20'
          : 'border-border',
      )}
    >
      {plan.badge ? (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
          {plan.badge}
        </span>
      ) : null}

      <header className="space-y-2 pt-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="type-display-sm">{plan.name}</h3>
          {price.isFounding ? (
            <span className="tone-warn rounded-full border px-2 py-0.5 text-xs font-medium">
              Founding
            </span>
          ) : null}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{plan.tagline}</p>
      </header>

      <div className="space-y-1">
        <p className="flex items-baseline gap-1">
          <span className="text-3xl font-semibold tracking-tight text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
            {price.label}
          </span>
          {price.isCustom ? null : (
            <span className="text-sm text-muted-foreground">/ mo</span>
          )}
        </p>
        {price.detail ? (
          <p className="text-xs text-muted-foreground">{price.detail}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {plan.limits.activeVendors == null
            ? 'Custom active vendor scale'
            : `${plan.limits.activeVendors.toLocaleString('en-US')} active vendors`}
          {' · '}
          {plan.limits.properties == null
            ? 'Custom property scale'
            : `${plan.limits.properties.toLocaleString('en-US')} properties`}
        </p>
      </div>

      <CtaButton plan={plan} interval={interval} className="w-full" />

      <ul className="space-y-2.5 border-t border-border pt-4">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-2.5 text-sm leading-snug text-foreground-soft">
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--clay-text)]" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </article>
  )
}

function ComparisonCell({ value }: { value: boolean | string }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center justify-center text-[var(--clay-text)]">
        <Check aria-label="Included" className="size-4" />
      </span>
    )
  }
  if (value === false) {
    return (
      <span className="inline-flex items-center justify-center text-muted-foreground">
        <Minus aria-label="Not included" className="size-4" />
      </span>
    )
  }
  return <span className="text-sm text-foreground-soft">{value}</span>
}

function ComparisonTable({ open }: { open: boolean }) {
  const planIds = pricingPlans.map((plan) => plan.id)
  const categories = useMemo(() => {
    const order: string[] = []
    for (const row of comparisonRows) {
      if (!order.includes(row.category)) order.push(row.category)
    }
    return order
  }, [])

  if (!open) return null

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[44rem] border-collapse text-left">
        <caption className="sr-only">Feature comparison across Docket Tree plans</caption>
        <thead>
          <tr className="border-b border-border bg-muted/60">
            <th scope="col" className="px-4 py-3 text-sm font-medium text-foreground">
              Feature
            </th>
            {pricingPlans.map((plan) => (
              <th
                key={plan.id}
                scope="col"
                className={cn(
                  'px-3 py-3 text-center text-sm font-medium',
                  plan.highlighted ? 'text-[var(--tone-brand-foreground)]' : 'text-foreground',
                )}
              >
                {plan.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => {
            const rows = comparisonRows.filter((row) => row.category === category)
            return (
              <FragmentCategory key={category} category={category} rows={rows} planIds={planIds} />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function FragmentCategory({
  category,
  rows,
  planIds,
}: {
  category: string
  rows: typeof comparisonRows
  planIds: PlanId[]
}) {
  return (
    <>
      <tr className="border-b border-border bg-[var(--tone-brand-surface)]/50">
        <th
          colSpan={planIds.length + 1}
          scope="colgroup"
          className="px-4 py-2 text-xs font-semibold tracking-wide text-[var(--tone-brand-foreground)] uppercase"
        >
          {category}
        </th>
      </tr>
      {rows.map((row) => (
        <tr key={row.id} className="border-b border-border last:border-0">
          <th scope="row" className="px-4 py-3 text-sm font-medium text-foreground">
            <span className="block">{row.label}</span>
            {row.hint ? (
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                {row.hint}
              </span>
            ) : null}
          </th>
          {planIds.map((id) => (
            <td key={id} className="px-3 py-3 text-center">
              <ComparisonCell value={row.values[id]} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

function FaqList() {
  return (
    <div className="divide-y divide-border rounded-2xl border border-border bg-card">
      {pricingFaq.map((item) => (
        <details
          key={item.id}
          className="group px-5 py-1"
          onToggle={(event) => {
            if ((event.currentTarget as HTMLDetailsElement).open) {
              track('faq_expanded', { faq_id: item.id })
            }
          }}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 text-sm font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
            {item.question}
            <ChevronDown
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground transition-transform duration-(--duration-quick) group-open:rotate-180"
            />
          </summary>
          <p className="pb-4 text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
        </details>
      ))}
    </div>
  )
}

export function PricingPage() {
  const [interval, setInterval] = useState<BillingInterval>('annual')
  const [comparisonOpen, setComparisonOpen] = useState(false)

  useDocumentSeo(pricingSeo.title, pricingSeo.description)

  useEffect(() => {
    track('pricing_viewed', {
      founding: foundingPricingEnabled,
      default_interval: 'annual',
    })
    if (foundingPricingEnabled) {
      track('founding_offer_viewed')
    }
  }, [])

  const onIntervalChange = (next: BillingInterval) => {
    setInterval(next)
    track('billing_toggle_changed', { billing_interval: next })
  }

  return (
    <div className="min-h-dvh bg-background">
      {/* Soft atmosphere — Warm Ivory with a faint evergreen wash, not a flat fill. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, color-mix(in oklch, var(--primary) 12%, transparent), transparent 55%), radial-gradient(ellipse 60% 40% at 100% 20%, color-mix(in oklch, var(--moss) 10%, transparent), transparent 50%), var(--paper)',
        }}
      />

      <header className="border-b border-border/80 bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex h-(--header-height) max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/pricing" className="flex items-center" aria-label="Docket Tree pricing">
            <BrandLockupHorizontal className="h-8 sm:h-9" />
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3" aria-label="Pricing actions">
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link
                to={pricingCtaRoutes.start_trial_setup}
                onClick={() =>
                  track('plan_cta_clicked', {
                    plan_id: 'growth',
                    cta_kind: 'start_trial',
                    source: 'header',
                  })
                }
              >
                Start Free Trial
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <section className="mx-auto max-w-3xl space-y-5 text-center">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-[var(--clay-text)]">
            <BrandMark className="size-5" />
            {pricingHero.brand}
          </p>
          <h1 className="type-display text-[1.875rem] sm:text-[2.25rem]">
            {pricingHero.headline}
          </h1>
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-muted-foreground">
            {pricingHero.supporting}
          </p>
          <div className="flex flex-col items-center gap-3 pt-2">
            <BillingToggle value={interval} onChange={onIntervalChange} />
            <p className="text-xs text-muted-foreground">
              Annual is selected by default — about two months free versus monthly.
            </p>
          </div>
        </section>

        {foundingOffer.enabled ? (
          <aside
            className="tone-warn mx-auto mt-10 max-w-3xl rounded-2xl border px-5 py-4 text-left sm:px-6"
            aria-label="Founding pricing offer"
          >
            <p className="text-xs font-semibold tracking-wide uppercase">{foundingOffer.badge}</p>
            <p className="mt-1 type-subtitle text-[var(--tone-warn-foreground)]">
              {foundingOffer.headline}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--tone-warn-foreground)]/90">
              {foundingOffer.body}
            </p>
          </aside>
        ) : null}

        <section
          aria-label="Plans"
          className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4"
        >
          {pricingPlans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} interval={interval} />
          ))}
        </section>

        <section className="mt-10 flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card/70 px-6 py-8 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="space-y-1">
            <p className="type-subtitle">{trialCopy.summary}</p>
            <p className="text-sm text-muted-foreground">
              Prefer a walkthrough? We will show readiness, requests, and review on your workflows.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <CtaButton
              plan={pricingPlans.find((plan) => plan.id === 'growth')!}
              interval={interval}
            />
            <Button asChild size="lg" variant="outline">
              <a
                href={trialCopy.bookDemoHref}
                onClick={() => track('book_demo_clicked', { source: 'trial_band' })}
              >
                {trialCopy.bookDemoLabel}
              </a>
            </Button>
          </div>
        </section>

        <section className="mt-16 space-y-8">
          <div className="mx-auto max-w-2xl space-y-2 text-center">
            <h2 className="type-title">{claritySection.title}</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {claritySection.points.map((point) => (
              <div key={point.title} className="rounded-2xl border border-border bg-card p-5">
                <h3 className="type-subtitle">{point.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{point.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="type-subtitle">{activeVendorDefinition.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {activeVendorDefinition.body}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="type-subtitle">{coreWorkflowMessage.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {coreWorkflowMessage.body}
            </p>
          </div>
        </section>

        <section className="mt-16 space-y-5">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div className="space-y-1">
              <h2 className="type-title">Compare plans</h2>
              <p className="text-sm text-muted-foreground">
                Scale and enterprise controls differ; the core readiness workflow does not.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              aria-expanded={comparisonOpen}
              onClick={() => {
                const next = !comparisonOpen
                setComparisonOpen(next)
                track('comparison_toggled', { open: next })
              }}
            >
              {comparisonOpen ? 'Hide comparison' : 'Show full comparison'}
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  'size-4 transition-transform duration-(--duration-quick)',
                  comparisonOpen && 'rotate-180',
                )}
              />
            </Button>
          </div>
          <ComparisonTable open={comparisonOpen} />
        </section>

        <section className="mt-16 space-y-5">
          <div className="mx-auto max-w-2xl space-y-2 text-center">
            <h2 className="type-title">Questions teams ask</h2>
            <p className="text-sm text-muted-foreground">
              Straight answers on vendors, seats, trials, and limits.
            </p>
          </div>
          <div className="mx-auto max-w-3xl">
            <FaqList />
          </div>
        </section>

        <footer className="mt-16 border-t border-border pt-8 text-center text-sm text-muted-foreground">
          <p>
            Self-serve plans open Stripe Checkout (Test mode when keys are set; local mock
            otherwise). Enterprise stays Contact Sales.
          </p>
          <p className="mt-2">
            <Link className="text-clay-text underline-offset-4 hover:underline" to="/login">
              Sign in to your workspace
            </Link>
          </p>
        </footer>
      </main>
    </div>
  )
}
