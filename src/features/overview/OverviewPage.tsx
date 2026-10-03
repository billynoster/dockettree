import { Link } from 'react-router'
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileCheck2,
} from 'lucide-react'
import { api } from '@/api/client'
import { useApp } from '@/app/AppProvider'
import { useServiceQuery } from '@/app/useServiceQuery'
import { ErrorState, StatsSkeleton } from '@/components/States'
import { Page } from '@/components/Page'
import { ScrollRegion } from '@/components/ScrollRegion'
import { Section, SectionHeader } from '@/components/Section'
import {
  ExpiringSoonChip,
  ReadinessChip,
  StatusChip,
  statusChipTone,
  type StatusChipStatus,
} from '@/components/StatusChips'
import { Timestamp } from '@/components/Timestamp'
import { ToneDot, type ChipTone } from '@/components/ui/chip'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/domain/dates'
import { vendorsLink } from '@/domain/vendorQuery'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

function dayGreeting(now = new Date()): string {
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function MetricCard({
  label,
  value,
  description,
  status,
  icon: Icon,
  to,
}: {
  label: string
  value: number
  description: string
  status: StatusChipStatus
  icon: LucideIcon
  to: string
}) {
  const tone = statusChipTone(status)
  return (
    <Link
      to={to}
      title={description}
      className="group surface flex flex-col gap-3 p-4 transition-[border-color,background-color] duration-(--duration-quick) ease-(--ease-soft) hover:border-border-strong hover:bg-muted/40 focus-visible:border-ring sm:p-5"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="type-subtitle flex items-center gap-2 text-muted-foreground">
          <ToneDot tone={tone} />
          {label}
        </span>
        <span
          className={cn(
            'flex size-8 items-center justify-center rounded-[10px] border',
            tone === 'ok' && 'tone-ok',
            tone === 'warn' && 'tone-warn',
            tone === 'info' && 'tone-info',
            tone === 'waiting' && 'tone-waiting',
            tone === 'neutral' && 'tone-neutral',
            tone === 'danger' && 'tone-danger',
            tone === 'brand' && 'tone-brand',
          )}
        >
          <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </span>
      </span>
      <span className="type-metric-sm">{value}</span>
      <span className="type-meta line-clamp-2">{description}</span>
      <span className="mt-auto flex items-center gap-1 text-xs font-medium text-clay-text opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        View
        <ArrowRight aria-hidden="true" className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  )
}

export function OverviewPage() {
  const app = useApp()
  const query = useServiceQuery(() => api.overview(), [])

  if (query.loading && !query.data) return <StatsSkeleton label="Loading the dashboard" />
  if (query.error) return <ErrorState message={query.error} onRetry={query.reload} />
  if (!query.data) return null

  const { counts, pendingReviewCount, attention, recentActivity } = query.data
  const organizationIsEmpty = counts.active === 0 && counts.archived === 0
  const needsActionCount = counts.not_ready + counts.unconfigured
  const upcomingExpirations = attention
    .filter((item) => item.expiringSoon && item.nextExpiration)
    .slice(0, 8)

  return (
    <Page density="workspace" className="space-y-6 lg:space-y-8">
      <header className="space-y-1">
        <p className="type-eyebrow">Today · {formatDate(query.data.today)}</p>
        <h2 className="type-display">
          {dayGreeting()}. Here’s what needs attention.
        </h2>
        <p className="type-body max-w-2xl text-muted-foreground">
          Know who can work, what’s missing or expiring, and what to do next · {app.organization.timezone}
        </p>
      </header>

      <section aria-label="Readiness metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Ready"
          value={counts.ready}
          description="Everything currently required is in place."
          status="ready"
          icon={CheckCircle2}
          to={vendorsLink({ readiness: ['ready'] })}
        />
        <MetricCard
          label="Needs Action"
          value={needsActionCount}
          description="Something needs attention before work can move forward."
          status="needs-action"
          icon={CircleAlert}
          to={vendorsLink({ readiness: ['not_ready', 'unconfigured'] })}
        />
        <MetricCard
          label="In Review"
          value={pendingReviewCount}
          description="Documents or information currently being reviewed."
          status="in-review"
          icon={Clock3}
          to="/review"
        />
        <MetricCard
          label="Expiring Soon"
          value={counts.expiring_soon}
          description="An active requirement is approaching its expiration date."
          status="expiring"
          icon={CalendarClock}
          to={vendorsLink({ expiringSoonOnly: true })}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] xl:items-start">
        <Section aria-labelledby="attention">
          <SectionHeader
            id="attention"
            title="Needs Attention"
            description={
              attention.length === 0
                ? undefined
                : 'Severity order · expired, corrections, missing, expiring, reviews'
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
          />
          {attention.length === 0 ? (
            <div className="space-y-3 px-4 py-8 text-center sm:px-5">
              <p className="mx-auto max-w-prose text-sm text-muted-foreground">
                {organizationIsEmpty
                  ? 'No vendors yet. Add a vendor, assign a checklist, and invite their contact.'
                  : 'Everyone’s ready. Nothing needs your attention right now.'}
              </p>
              {organizationIsEmpty && app.can('vendor.manage') ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button asChild size="sm">
                    <Link to="/vendors/new">Add your first vendor</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/requirements">Set up documents</Link>
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <ScrollRegion size="panel" label="Vendors that need attention">
              <ul className="divide-y">
                {attention.slice(0, 12).map((item) => {
                  const tone: ChipTone = item.topBlocker
                    ? statusChipTone(
                        item.status === 'awaiting_review'
                          ? 'in-review'
                          : item.status === 'ready'
                            ? 'ready'
                            : item.status === 'unconfigured'
                              ? 'not-started'
                              : 'needs-action',
                      )
                    : item.expiringSoon
                      ? 'warn'
                      : 'neutral'
                  return (
                    <li key={item.vendor_id}>
                      <Link
                        to={`/vendors/${item.vendor_id}`}
                        className="group flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-3 sm:px-5"
                      >
                        <span className="flex min-w-0 flex-1 items-start gap-2.5">
                          <ToneDot tone={tone} className="mt-1.5" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium group-hover:text-clay-text">
                              {item.company_name}
                            </span>
                            <span className="block truncate text-sm text-muted-foreground">
                              {item.reason}
                              {item.blockerCount > 1
                                ? ` · +${item.blockerCount - 1} more`
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

        <div className="space-y-6">
          <Section aria-labelledby="expirations">
            <SectionHeader
              id="expirations"
              title="Upcoming Expirations"
              description="Active requirements approaching their dates"
              action={
                counts.expiring_soon > 0 ? (
                  <Button asChild variant="ghost" size="sm">
                    <Link to={vendorsLink({ expiringSoonOnly: true })}>
                      <FileCheck2 aria-hidden="true" />
                      View all
                    </Link>
                  </Button>
                ) : null
              }
              border={upcomingExpirations.length > 0}
            />
            {upcomingExpirations.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground sm:px-5">
                No expirations in the next window.
              </p>
            ) : (
              <ul className="divide-y">
                {upcomingExpirations.map((item) => (
                  <li key={`exp-${item.vendor_id}`}>
                    <Link
                      to={`/vendors/${item.vendor_id}`}
                      className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50 sm:px-5"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] border tone-warn">
                        <CalendarClock aria-hidden="true" className="size-4" strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium group-hover:text-clay-text">
                          {item.company_name}
                        </span>
                        <span className="block truncate text-sm text-muted-foreground">
                          {item.daysUntilExpiration === null
                            ? 'Expires soon'
                            : `Expires in ${item.daysUntilExpiration} day${item.daysUntilExpiration === 1 ? '' : 's'}`}
                          {item.nextExpiration ? ` · ${formatDate(item.nextExpiration)}` : ''}
                        </span>
                      </span>
                      <StatusChip status="expiring" size="sm" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section aria-labelledby="recent" className="hidden xl:block">
            <SectionHeader
              id="recent"
              title="Recent Activity"
              description="Newest first"
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link to="/activity">
                    View all
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              }
              border={recentActivity.length > 0}
            />
            {recentActivity.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground sm:px-5">
                Nothing has happened yet.
              </p>
            ) : (
              <ScrollRegion size="panel" label="Recent activity" className="max-h-56">
                <ul className="divide-y">
                  {recentActivity.slice(0, 8).map((event) => (
                    <li
                      key={event.id}
                      className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:items-baseline sm:gap-3 sm:px-5"
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
      </div>

      <Section aria-labelledby="recent-mobile" className="xl:hidden">
        <SectionHeader
          id="recent-mobile"
          title="Recent Activity"
          description="Newest first"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link to="/activity">
                View all
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          }
          border={recentActivity.length > 0}
        />
        {recentActivity.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground sm:px-5">
            Nothing has happened yet.
          </p>
        ) : (
          <ul className="divide-y">
            {recentActivity.slice(0, 5).map((event) => (
              <li
                key={event.id}
                className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:items-baseline sm:gap-3 sm:px-5"
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
