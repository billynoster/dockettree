import { Link, useSearchParams } from 'react-router'
import {
  Archive,
  ArchiveRestore,
  Check,
  ClipboardList,
  FileUp,
  FileX2,
  MessageSquareWarning,
  Pencil,
  Send,
  Settings,
  ShieldOff,
  UserPlus,
  Users,
} from 'lucide-react'
import { api } from '@/api/client'
import { ACTIVITY_TYPE_LABEL } from '@/domain/activity'
import { useApp } from '@/app/AppProvider'
import { useServiceQuery } from '@/app/useServiceQuery'
import { PageHeader } from '@/components/PageHeader'
import { Section } from '@/components/Section'
import { EmptyState, ErrorState, FilteredEmptyState, LoadingState } from '@/components/States'
import { Timestamp } from '@/components/Timestamp'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ActivityEventType } from '@/domain/types'
import { cn } from '@/lib/utils'

/** An icon per event family, so scanning a long audit list does not mean reading every label. */
const EVENT_ICON: Record<ActivityEventType, typeof Check> = {
  vendor_created: UserPlus,
  vendor_updated: Pencil,
  vendor_archived: Archive,
  vendor_restored: ArchiveRestore,
  vendor_imported: Users,
  checklist_assigned: ClipboardList,
  requirement_added: ClipboardList,
  requirement_retired: Archive,
  requirement_updated: Pencil,
  invitation_sent: Send,
  invitation_revoked: FileX2,
  invitation_accepted: UserPlus,
  document_submitted: FileUp,
  document_submitted_on_behalf: FileUp,
  document_withdrawn: FileX2,
  submission_accepted: Check,
  submission_changes_requested: MessageSquareWarning,
  acceptance_revoked: ShieldOff,
  reminder_sent: Send,
  template_created: ClipboardList,
  template_updated: Pencil,
  template_archived: Archive,
  settings_updated: Settings,
  member_added: UserPlus,
  member_updated: Pencil,
  member_removed: Users,
}

const ACCENT: Partial<Record<ActivityEventType, string>> = {
  submission_accepted: 'tone-ok',
  submission_changes_requested: 'tone-danger',
  acceptance_revoked: 'tone-danger',
  vendor_archived: 'tone-neutral',
  document_withdrawn: 'tone-neutral',
}

export function ActivityPage() {
  const app = useApp()
  const [searchParams, setSearchParams] = useSearchParams()
  const vendorId = searchParams.get('vendor')
  const eventType = searchParams.get('type')
  const filtered = Boolean(vendorId || eventType)

  const vendors = useServiceQuery(
    () => api.listVendors({ lifecycle: 'all', pageSize: 200, sort: 'name' }),
    [],
  )
  const activity = useServiceQuery(
    () =>
      api.listActivity({
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
    <div className="animate-rise space-y-4">
      <PageHeader
        title="Activity"
        description="Append-only history of vendor changes, invitations, submissions, decisions and reminders. Events cannot be edited or deleted, by anyone."
      />

      <Section aria-label="Activity filters" className="p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="activity-vendor">Vendor</Label>
            <Select
              value={vendorId ?? 'all'}
              onValueChange={(value) => setFilter('vendor', value === 'all' ? null : value)}
            >
              <SelectTrigger id="activity-vendor" className="h-9 w-full">
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
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="activity-type">Event type</Label>
            <Select
              value={eventType ?? 'all'}
              onValueChange={(value) => setFilter('type', value === 'all' ? null : value)}
            >
              <SelectTrigger id="activity-type" className="h-9 w-full">
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
          {filtered ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 shrink-0"
              onClick={() => setSearchParams(new URLSearchParams(), { replace: true })}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      </Section>

      {activity.loading && !activity.data ? (
        <LoadingState label="Loading activity" rows={6} />
      ) : null}
      {activity.error ? <ErrorState message={activity.error} onRetry={activity.reload} /> : null}

      {activity.data ? (
        activity.data.events.length === 0 ? (
          filtered ? (
            <FilteredEmptyState
              title="No events match these filters"
              onClear={() => setSearchParams(new URLSearchParams(), { replace: true })}
            />
          ) : (
            <EmptyState
              title="No activity yet"
              description="Every action you take is recorded here with who did it and when."
            />
          )
        ) : (
          <>
            <p className="text-sm text-muted-foreground" role="status">
              {activity.data.events.length} event
              {activity.data.events.length === 1 ? '' : 's'}, newest first.
            </p>
            <Section>
              <ol className="divide-y">
                {activity.data.events.map((event) => {
                  const Icon = EVENT_ICON[event.event_type]
                  return (
                    <li key={event.id} className="flex gap-3 px-4 py-3.5">
                      <span
                        className={cn(
                          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border',
                          ACCENT[event.event_type] ?? 'tone-neutral',
                        )}
                      >
                        <Icon aria-hidden="true" className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                          <p className="text-sm font-medium">
                            {ACTIVITY_TYPE_LABEL[event.event_type]}
                          </p>
                          <Timestamp
                            value={event.created_at}
                            timezone={app.organization.timezone}
                            mode="absolute"
                            className="text-xs text-muted-foreground"
                          />
                        </div>
                        <p className="mt-0.5 text-sm">{event.summary}</p>
                        {event.reason ? (
                          <p className="mt-1 border-l-2 pl-2.5 text-sm text-muted-foreground">
                            {event.reason}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {event.actor_label} · {event.actor_role}
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
                      </div>
                    </li>
                  )
                })}
              </ol>
            </Section>
          </>
        )
      ) : null}
    </div>
  )
}
