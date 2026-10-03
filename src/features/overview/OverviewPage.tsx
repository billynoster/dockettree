import { Link } from 'react-router'
import { ArrowRight, CalendarClock, ChevronRight, FileCheck2 } from 'lucide-react'
import { api } from '@/api/client'
import { useApp } from '@/app/AppProvider'
import { useServiceQuery } from '@/app/useServiceQuery'
import { ErrorState, StatsSkeleton } from '@/components/States'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { ReadinessMixBar, READINESS_TONE, StatTile, ToneDot, type Tone } from '@/components/Metrics'
import { ScrollRegion } from '@/components/ScrollRegion'
import { Section, SectionHeader } from '@/components/Section'
import { ExpiringSoonChip, ReadinessChip } from '@/components/StatusChips'
import { Timestamp } from '@/components/Timestamp'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/domain/dates'
import { READINESS_EXPLANATION, READINESS_LABEL } from '@/domain/readiness'
import { vendorsLink } from '@/domain/vendorQuery'
import type { ReadinessStatus } from '@/domain/types'

const BUCKETS: ReadinessStatus[] = ['ready', 'awaiting_review', 'not_ready', 'unconfigured']

/** Compact overlapping metric that sits in the primary readiness band. */
function SecondaryMetricLink({
  label,
  value,
  tone,
  icon: Icon,
  to,
}: {
  label: string
  value: number
  tone: Tone
  icon: typeof CalendarClock
  to: string
}) {
  return (
    <Link
      to={to}
      className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl border bg-card px-3 py-2.5 transition-colors hover:border-border-strong hover:bg-muted/50"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="type-subtitle flex items-center gap-1.5">
          <ToneDot tone={tone} />
          {label}
        </span>
        <span className="type-metric-sm block leading-none">{value}</span>
      </span>
      <ArrowRight
        aria-hidden="true"
        className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-clay-text"
      />
    </Link>
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
    <Page density="workspace">
      <PageHeader
        compact
        title="Overview"
        description={
          <>
            Readiness across active vendors · today {formatDate(query.data.today)} (
            {app.organization.timezone})
          </>
        }
      />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] xl:items-start">
        <div className="space-y-3">
          <Section aria-labelledby="active-count">
            <div className="flex flex-col gap-3 p-3 sm:p-3.5">
              <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                <div className="space-y-0.5">
                  <h2 id="active-count" className="type-subtitle text-muted-foreground">
                    Active vendors
                  </h2>
                  <p className="type-metric">{counts.active}</p>
                </div>
                <p className="type-meta max-w-sm">
                  Four buckets sum to the active total. {counts.archived} archived excluded.
                </p>
              </div>

              <ReadinessMixBar counts={counts} total={counts.active} />

              <ul className="grid gap-2 sm:grid-cols-2">
                {BUCKETS.map((status) => (
                  <li key={status}>
                    <StatTile
                      label={READINESS_LABEL[status]}
                      value={counts[status]}
                      tone={READINESS_TONE[status]}
                      description={READINESS_EXPLANATION[status]}
                      to={vendorsLink({ readiness: [status] })}
                      share={counts.active === 0 ? 0 : counts[status] / counts.active}
                      compact
                    />
                  </li>
                ))}
              </ul>
            </div>
          </Section>

          <div className="grid gap-2 sm:grid-cols-2">
            <SecondaryMetricLink
              label="Expiring soon"
              value={counts.expiring_soon}
              tone="warn"
              icon={CalendarClock}
              to={vendorsLink({ expiringSoonOnly: true })}
            />
            <SecondaryMetricLink
              label="Pending review"
              value={pendingReviewCount}
              tone="info"
              icon={FileCheck2}
              to="/review"
            />
          </div>

          <Section aria-labelledby="recent" className="hidden xl:block">
            <SectionHeader
              id="recent"
              title="Recent activity"
              description="Append-only · newest first"
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link to="/activity">
                    View all
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              }
              border
              className="px-3 py-2.5"
            />
            {recentActivity.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                Nothing has happened yet.
              </p>
            ) : (
              <ScrollRegion size="panel" label="Recent activity" className="max-h-44">
                <ul className="divide-y">
                  {recentActivity.slice(0, 6).map((event) => (
                    <li
                      key={event.id}
                      className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-baseline sm:gap-3"
                    >
                      <p className="min-w-0 flex-1 truncate text-sm">
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
              </ScrollRegion>
            )}
          </Section>
        </div>

        <Section aria-labelledby="attention" className="xl:min-h-0">
          <SectionHeader
            id="attention"
            title="Needs attention"
            description={
              attention.length === 0
                ? undefined
                : 'Severity order · expired, revoked, corrections, missing, expiring, reviews'
            }
            action={
              attention.length > 8 ? (
                <Button asChild variant="ghost" size="sm">
                  <Link
                    to={vendorsLink({ readiness: ['not_ready', 'awaiting_review', 'unconfigured'] })}
                  >
                    See all {attention.length}
                  </Link>
                </Button>
              ) : null
            }
            border={attention.length > 0}
            className="px-3 py-2.5"
          />
          {attention.length === 0 ? (
            <div className="space-y-3 px-3 py-6 text-center">
              <p className="mx-auto max-w-prose text-sm text-muted-foreground">
                {organizationIsEmpty
                  ? 'No vendors yet. Add a vendor, assign a checklist, and invite their contact.'
                  : 'Every active vendor is ready and nothing expires in the next 30 days.'}
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
            <ScrollRegion size="panel" label="Vendors that need attention">
              <ul className="divide-y">
                {attention.slice(0, 12).map((item) => {
                  const tone: Tone = item.topBlocker
                    ? READINESS_TONE[item.status]
                    : item.expiringSoon
                      ? 'warn'
                      : 'neutral'
                  return (
                    <li key={item.vendor_id}>
                      <Link
                        to={`/vendors/${item.vendor_id}`}
                        className="group flex flex-col gap-1.5 px-3 py-2.5 transition-colors hover:bg-muted/60 sm:flex-row sm:items-center sm:gap-3"
                      >
                        <span className="flex min-w-0 flex-1 items-start gap-2">
                          <ToneDot tone={tone} className="mt-1.5" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium group-hover:text-clay-text">
                              {item.company_name}
                            </span>
                            <span className="block truncate text-sm text-muted-foreground">
                              {item.reason}
                              {item.blockerCount > 1
                                ? ` · +${item.blockerCount - 1} more blocker${item.blockerCount > 2 ? 's' : ''}`
                                : ''}
                            </span>
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-wrap items-center gap-1.5 pl-5 sm:pl-0">
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
            </ScrollRegion>
          )}
        </Section>
      </div>

      <Section aria-labelledby="recent-mobile" className="xl:hidden">
        <SectionHeader
          id="recent-mobile"
          title="Recent activity"
          description="Append-only · newest first"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link to="/activity">
                View all
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          }
          border
          className="px-3 py-2.5"
        />
        {recentActivity.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Nothing has happened yet.
          </p>
        ) : (
          <ul className="divide-y">
            {recentActivity.slice(0, 5).map((event) => (
              <li
                key={event.id}
                className="flex flex-col gap-0.5 px-3 py-2.5 sm:flex-row sm:items-baseline sm:gap-3"
              >
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
    </Page>
  )
}
