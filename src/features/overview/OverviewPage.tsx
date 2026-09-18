import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { useApp } from '@/app/AppProvider'
import { useServiceQuery } from '@/app/useServiceQuery'
import { ErrorState, LoadingState } from '@/components/States'
import { PageHeader } from '@/components/PageHeader'
import { ExpiringSoonChip, ReadinessChip } from '@/components/StatusChips'
import { Button } from '@/components/ui/button'
import { formatDate, formatDateTime } from '@/domain/dates'
import { READINESS_EXPLANATION } from '@/domain/readiness'
import { getOverview } from '@/services/overviewService'
import { vendorsLink } from '@/features/vendors/vendorQuery'

export function OverviewPage() {
  const app = useApp()
  const query = useServiceQuery((ctx) => getOverview(ctx), [])

  if (query.loading && !query.data) return <LoadingState label="Loading the overview" rows={4} />
  if (query.error) return <ErrorState message={query.error} onRetry={query.reload} />
  if (!query.data) return null

  const { counts, pendingReviewCount, attention, recentActivity } = query.data

  const primary = [
    {
      label: 'Ready',
      value: counts.ready,
      to: vendorsLink({ readiness: ['ready'] }),
      description: READINESS_EXPLANATION.ready,
    },
    {
      label: 'Awaiting review',
      value: counts.awaiting_review,
      to: vendorsLink({ readiness: ['awaiting_review'] }),
      description: READINESS_EXPLANATION.awaiting_review,
    },
    {
      label: 'Not ready',
      value: counts.not_ready,
      to: vendorsLink({ readiness: ['not_ready'] }),
      description: READINESS_EXPLANATION.not_ready,
    },
    {
      label: 'Unconfigured',
      value: counts.unconfigured,
      to: vendorsLink({ readiness: ['unconfigured'] }),
      description: READINESS_EXPLANATION.unconfigured,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description={`Vendor readiness for ${app.organization.name} as of ${formatDate(query.data.today)} (${app.organization.timezone}).`}
      />

      <section aria-labelledby="active-count" className="rounded-lg border bg-background p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 id="active-count" className="text-sm font-medium text-muted-foreground">
              Active vendors
            </h2>
            <p className="text-3xl font-semibold tabular-nums">{counts.active}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Ready + Awaiting review + Not ready + Unconfigured = Active vendors.{' '}
            {counts.archived} archived vendor{counts.archived === 1 ? '' : 's'} excluded.
          </p>
        </div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {primary.map((card) => (
            <li key={card.label}>
              <Link
                to={card.to}
                className="flex h-full flex-col gap-1 rounded-lg border bg-background p-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <span className="text-sm font-medium">{card.label}</span>
                <span className="text-2xl font-semibold tabular-nums">{card.value}</span>
                <span className="text-xs text-muted-foreground">{card.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border bg-background p-4">
          <h2 className="text-sm font-medium text-muted-foreground">
            Expiring soon <span className="font-normal">(secondary, overlapping count)</span>
          </h2>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{counts.expiring_soon}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Active vendors whose required documents expire within 30 days, including today. These
            vendors are also counted in one of the four readiness buckets above.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link to={vendorsLink({ expiringSoonOnly: true })}>
              View expiring vendors
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </section>

        <section className="rounded-lg border bg-background p-4">
          <h2 className="text-sm font-medium text-muted-foreground">Submissions pending review</h2>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{pendingReviewCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Counted as submissions, not vendors. Archived vendors are excluded.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link to="/review">
              Open review queue
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </section>
      </div>

      <section aria-labelledby="attention" className="rounded-lg border bg-background">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 id="attention" className="text-sm font-semibold">
            Needs attention
          </h2>
          <p className="text-xs text-muted-foreground">Highest-impact exceptions first</p>
        </div>
        {attention.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            Every active vendor is ready and nothing expires in the next 30 days.
          </p>
        ) : (
          <ul className="divide-y">
            {attention.slice(0, 8).map((item) => (
              <li key={item.vendor_id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <Link
                    to={`/vendors/${item.vendor_id}`}
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {item.company_name}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {item.reason}
                    {item.blockerCount > 1 ? ` · +${item.blockerCount - 1} more blocker` : ''}
                    {item.blockerCount > 2 ? 's' : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ReadinessChip status={item.status} />
                  {item.expiringSoon ? <ExpiringSoonChip nextExpiration={item.nextExpiration} /> : null}
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/vendors/${item.vendor_id}`}>Open vendor</Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent" className="rounded-lg border bg-background">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 id="recent" className="text-sm font-semibold">
            Recent activity
          </h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/activity">View all activity</Link>
          </Button>
        </div>
        <ul className="divide-y">
          {recentActivity.map((event) => (
            <li key={event.id} className="px-4 py-3">
              <p className="text-sm">{event.summary}</p>
              <p className="text-xs text-muted-foreground">
                {event.actor_label} · {formatDateTime(event.created_at, app.organization.timezone)}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
