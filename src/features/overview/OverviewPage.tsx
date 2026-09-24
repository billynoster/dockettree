import { Link } from 'react-router'
import { ArrowRight, CalendarClock, ChevronRight, FileCheck2 } from 'lucide-react'
import { api } from '@/api/client'
import { useApp } from '@/app/AppProvider'
import { useServiceQuery } from '@/app/useServiceQuery'
import { ErrorState, StatsSkeleton } from '@/components/States'
import { PageHeader } from '@/components/PageHeader'
import { ReadinessMixBar, READINESS_TONE, StatTile, ToneDot, type Tone } from '@/components/Metrics'
import { Section, SectionHeader } from '@/components/Section'
import { ExpiringSoonChip, ReadinessChip } from '@/components/StatusChips'
import { Timestamp } from '@/components/Timestamp'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/domain/dates'
import { READINESS_EXPLANATION, READINESS_LABEL } from '@/domain/readiness'
import { vendorsLink } from '@/domain/vendorQuery'
import type { ReadinessStatus } from '@/domain/types'

const BUCKETS: ReadinessStatus[] = ['ready', 'awaiting_review', 'not_ready', 'unconfigured']

/** A secondary number that overlaps the four buckets and therefore gets its own card. */
function SecondaryMetric({
  label,
  value,
  tone,
  icon: Icon,
  description,
  to,
  cta,
}: {
  label: string
  value: number
  tone: Tone
  icon: typeof CalendarClock
  description: string
  to: string
  cta: string
}) {
  return (
    <Section className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-[0.8125rem] font-medium">
            <ToneDot tone={tone} />
            {label}
          </h2>
          <p className="text-[1.75rem] leading-none font-semibold">{value}</p>
        </div>
        <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon aria-hidden="true" className="size-4.5" />
        </span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      <Button asChild variant="outline" size="sm" className="mt-auto w-fit">
        <Link to={to}>
          {cta}
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </Section>
  )
}

export function OverviewPage() {
  const app = useApp()
  const query = useServiceQuery(() => api.overview(), [])

  if (query.loading && !query.data) return <StatsSkeleton label="Loading the overview" />
  if (query.error) return <ErrorState message={query.error} onRetry={query.reload} />
  if (!query.data) return null

  const { counts, pendingReviewCount, attention, recentActivity } = query.data
  const organizationIsEmpty = counts.active === 0 && counts.archived === 0

  return (
    <div className="animate-rise space-y-5 lg:space-y-6">
      <PageHeader
        title="Overview"
        description={
          <>
            Readiness across every active vendor at {app.organization.name}. Expirations are judged
            against today, {formatDate(query.data.today)} in {app.organization.timezone}.
          </>
        }
      />

      <Section aria-labelledby="active-count">
        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="space-y-1">
              <h2 id="active-count" className="text-[0.8125rem] font-medium text-muted-foreground">
                Active vendors
              </h2>
              <p className="text-4xl leading-none font-semibold">{counts.active}</p>
            </div>
            <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
              Ready, Awaiting review, Not ready and Unconfigured add up to the active total. The{' '}
              {counts.archived} archived vendor{counts.archived === 1 ? '' : 's'}{' '}
              {counts.archived === 1 ? 'is' : 'are'} excluded from every count on this page.
            </p>
          </div>

          <ReadinessMixBar counts={counts} total={counts.active} />

          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {BUCKETS.map((status) => (
              <li key={status}>
                <StatTile
                  label={READINESS_LABEL[status]}
                  value={counts[status]}
                  tone={READINESS_TONE[status]}
                  description={READINESS_EXPLANATION[status]}
                  to={vendorsLink({ readiness: [status] })}
                  share={counts.active === 0 ? 0 : counts[status] / counts.active}
                />
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <SecondaryMetric
          label="Expiring soon"
          value={counts.expiring_soon}
          tone="warn"
          icon={CalendarClock}
          description="Active vendors whose required documents expire within 30 days, including today. They are also counted in one of the four buckets above, so this number overlaps."
          to={vendorsLink({ expiringSoonOnly: true })}
          cta="View expiring vendors"
        />
        <SecondaryMetric
          label="Submissions pending review"
          value={pendingReviewCount}
          tone="info"
          icon={FileCheck2}
          description="Counted as submissions rather than vendors, because one vendor can have several documents waiting. Archived vendors are excluded."
          to="/review"
          cta="Open review queue"
        />
      </div>

      <Section aria-labelledby="attention">
        <SectionHeader
          id="attention"
          title="Needs attention"
          description={
            attention.length === 0
              ? undefined
              : 'Ordered by severity: expired documents first, then revoked, corrections, missing items, upcoming expirations and reviews.'
          }
          action={
            attention.length > 8 ? (
              <Button asChild variant="ghost" size="sm">
                <Link to={vendorsLink({ readiness: ['not_ready', 'awaiting_review', 'unconfigured'] })}>
                  See all {attention.length}
                </Link>
              </Button>
            ) : null
          }
          border={attention.length > 0}
        />
        {attention.length === 0 ? (
          <div className="space-y-4 border-t px-4 py-8 text-center">
            <p className="mx-auto max-w-prose text-sm text-muted-foreground">
              {organizationIsEmpty
                ? 'No vendors yet. Add your first vendor, assign a checklist, and invite their contact to upload documents.'
                : 'Every active vendor is ready and nothing expires in the next 30 days. New exceptions appear here as soon as they happen.'}
            </p>
            {organizationIsEmpty && app.can('vendor.manage') ? (
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild size="sm">
                  <Link to="/vendors/new">Add your first vendor</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to="/requirements">Set up a checklist template</Link>
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y">
            {attention.slice(0, 8).map((item) => {
              const tone: Tone = item.topBlocker
                ? READINESS_TONE[item.status]
                : item.expiringSoon
                  ? 'warn'
                  : 'neutral'
              return (
                <li key={item.vendor_id}>
                  {/*
                   * The whole row is the link so the pointer target matches the visible row and
                   * the keyboard reaches one stop per vendor instead of two.
                   */}
                  <Link
                    to={`/vendors/${item.vendor_id}`}
                    className="group flex flex-col gap-2 px-4 py-3.5 transition-colors hover:bg-muted/60 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <span className="flex min-w-0 flex-1 items-start gap-2.5">
                      <ToneDot tone={tone} className="mt-1.5" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium group-hover:text-primary">
                          {item.company_name}
                        </span>
                        <span className="block text-sm text-muted-foreground">
                          {item.reason}
                          {item.blockerCount > 1
                            ? ` · +${item.blockerCount - 1} more blocker${item.blockerCount > 2 ? 's' : ''}`
                            : ''}
                        </span>
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-wrap items-center gap-2 pl-5 sm:pl-0">
                      <ReadinessChip status={item.status} size="sm" />
                      {item.expiringSoon ? (
                        <ExpiringSoonChip nextExpiration={item.nextExpiration} size="sm" />
                      ) : null}
                      <ChevronRight
                        aria-hidden="true"
                        className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block"
                      />
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      <Section aria-labelledby="recent">
        <SectionHeader
          id="recent"
          title="Recent activity"
          description="Append-only: nothing on this list can be edited or removed."
          action={
            <Button asChild variant="ghost" size="sm">
              <Link to="/activity">
                View all activity
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          }
          border
        />
        {recentActivity.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nothing has happened yet. Every vendor change, submission and decision is recorded here.
          </p>
        ) : (
          <ul className="divide-y">
            {recentActivity.map((event) => (
              <li key={event.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4">
                <p className="min-w-0 flex-1 text-sm">
                  {event.summary}
                  <span className="text-muted-foreground"> · {event.actor_label}</span>
                </p>
                <Timestamp
                  value={event.created_at}
                  timezone={app.organization.timezone}
                  className="shrink-0 text-xs text-muted-foreground"
                />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
