import { Link, useSearchParams } from 'react-router'
import { api } from '@/api/client'
import { ACTIVITY_TYPE_LABEL } from '@/domain/activity'
import { useApp } from '@/app/AppProvider'
import { useServiceQuery } from '@/app/useServiceQuery'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorState, FilteredEmptyState, LoadingState } from '@/components/States'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDateTime } from '@/domain/dates'
import type { ActivityEventType } from '@/domain/types'

export function ActivityPage() {
  const app = useApp()
  const [searchParams, setSearchParams] = useSearchParams()
  const vendorId = searchParams.get('vendor')
  const eventType = searchParams.get('type')

  const vendors = useServiceQuery(
    () => api.listVendors({ lifecycle: 'all', pageSize: 200, sort: 'name' }),
    [],
  )
  const activity = useServiceQuery(
    () => api.listActivity({
        vendorId: vendorId ?? 'all',
        eventType: (eventType as ActivityEventType | null) ?? 'all',
        limit: 200,
      }),
    [vendorId, eventType],
  )

  const setFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Activity"
        description="Append-only history of vendor changes, invitations, submissions, decisions and reminders. Events cannot be edited."
      />

      <div className="grid gap-3 rounded-lg border bg-background p-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="activity-vendor">Vendor</Label>
          <Select
            value={vendorId ?? 'all'}
            onValueChange={(value) => setFilter('vendor', value === 'all' ? null : value)}
          >
            <SelectTrigger id="activity-vendor">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vendors</SelectItem>
              {(vendors.data?.rows ?? []).map((row) => (
                <SelectItem key={row.vendor.id} value={row.vendor.id}>
                  {row.vendor.company_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="activity-type">Event type</Label>
          <Select
            value={eventType ?? 'all'}
            onValueChange={(value) => setFilter('type', value === 'all' ? null : value)}
          >
            <SelectTrigger id="activity-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All event types</SelectItem>
              {Object.entries(ACTIVITY_TYPE_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {activity.loading && !activity.data ? <LoadingState label="Loading activity" rows={6} /> : null}
      {activity.error ? <ErrorState message={activity.error} onRetry={activity.reload} /> : null}

      {activity.data ? (
        activity.data.events.length === 0 ? (
          vendorId || eventType ? (
            <FilteredEmptyState
              onClear={() => setSearchParams(new URLSearchParams(), { replace: true })}
            />
          ) : (
            <EmptyState title="No activity yet" description="Actions you take appear here." />
          )
        ) : (
          <>
            <p className="text-sm text-muted-foreground" role="status">
              {activity.data.events.length} event
              {activity.data.events.length === 1 ? '' : 's'}
            </p>
            <ol className="divide-y rounded-lg border bg-background">
              {activity.data.events.map((event) => (
                <li key={event.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium">
                      {ACTIVITY_TYPE_LABEL[event.event_type]}
                      {event.vendor_id ? (
                        <>
                          {' · '}
                          <Link
                            to={`/vendors/${event.vendor_id}`}
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            Open vendor
                          </Link>
                        </>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(event.created_at, app.organization.timezone)}
                    </p>
                  </div>
                  <p className="mt-1 text-sm">{event.summary}</p>
                  {event.reason ? (
                    <p className="mt-1 text-sm text-muted-foreground">Reason: {event.reason}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Actor: {event.actor_label} ({event.actor_role})
                  </p>
                </li>
              ))}
            </ol>
          </>
        )
      ) : null}
    </div>
  )
}
