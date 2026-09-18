import { Link, useSearchParams } from 'react-router'
import { RefreshCw } from 'lucide-react'
import { api } from '@/api/client'
import { useApp } from '@/app/AppProvider'
import { useAction } from '@/app/useAction'
import { useServiceQuery } from '@/app/useServiceQuery'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDateTime } from '@/domain/dates'
import type { Notification } from '@/domain/types'

const TYPE_LABEL: Record<Notification['type'], string> = {
  invitation: 'Invitation',
  vendor_digest: 'Vendor reminder digest',
  correction_requested: 'Correction request',
  internal_expiration_notice: 'Internal expiration notice',
}

const STATUS_LABEL: Record<Notification['status'], string> = {
  queued: 'Queued',
  sent: 'Sent',
  failed: 'Failed',
  retry_scheduled: 'Retry scheduled',
}

const STATUS_STYLE: Record<Notification['status'], string> = {
  queued: 'border-slate-200 bg-slate-100 text-slate-700',
  sent: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  failed: 'border-rose-200 bg-rose-50 text-rose-800',
  retry_scheduled: 'border-amber-300 bg-amber-50 text-amber-900',
}

export function NotificationsPage() {
  const app = useApp()
  const [searchParams, setSearchParams] = useSearchParams()
  const vendorId = searchParams.get('vendor')
  const type = searchParams.get('type') as Notification['type'] | null
  const action = useAction()
  const outbox = useServiceQuery(() => api.notifications({ vendorId, type }), [vendorId, type])

  const setFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        description="Every invitation, reminder and correction notice this organization has produced, with its real delivery state."
      />

      {outbox.data && !outbox.data.delivery.configured ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {outbox.data.delivery.reason} Queued messages stay here until SMTP is configured; you can
          still read the exact content and hand the details over another way.
        </p>
      ) : null}

      {outbox.loading && !outbox.data ? (
        <LoadingState label="Loading the notification log" rows={4} />
      ) : null}
      {outbox.error ? <ErrorState message={outbox.error} onRetry={outbox.reload} /> : null}

      {outbox.data ? (
        <>
          <div className="grid gap-3 rounded-lg border bg-background p-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="outbox-vendor">Vendor</Label>
              <Select
                value={vendorId ?? 'all'}
                onValueChange={(value) => setFilter('vendor', value === 'all' ? null : value)}
              >
                <SelectTrigger id="outbox-vendor">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All vendors</SelectItem>
                  {outbox.data.vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      {vendor.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="outbox-type">Message type</Label>
              <Select
                value={type ?? 'all'}
                onValueChange={(value) => setFilter('type', value === 'all' ? null : value)}
              >
                <SelectTrigger id="outbox-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {Object.entries(TYPE_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-sm text-muted-foreground" role="status">
            {outbox.data.entries.length} of {outbox.data.total} message
            {outbox.data.total === 1 ? '' : 's'}
          </p>

          {outbox.data.entries.length === 0 ? (
            <EmptyState
              title="No messages yet"
              description="Send an invitation or a reminder, or run the reminder job from Settings."
            />
          ) : (
            <ul className="space-y-3">
              {outbox.data.entries.map((entry) => (
                <li key={entry.notification.id} className="rounded-lg border bg-background p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-medium">{entry.notification.subject}</p>
                      <p className="text-sm text-muted-foreground break-all">
                        To {entry.notification.recipient_label} &lt;{entry.notification.recipient}&gt;
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {TYPE_LABEL[entry.notification.type]} ·{' '}
                        {entry.notification.manual ? 'Manual' : 'Scheduled job'} ·{' '}
                        {formatDateTime(entry.notification.created_at, app.organization.timezone)}
                        {entry.vendorName ? (
                          <>
                            {' · '}
                            <Link
                              to={`/vendors/${entry.notification.vendor_id}`}
                              className="text-primary underline-offset-4 hover:underline"
                            >
                              {entry.vendorName}
                            </Link>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[entry.notification.status]}`}
                      >
                        {STATUS_LABEL[entry.notification.status]}
                      </span>
                      {entry.notification.sent_at ? (
                        <span className="text-xs text-muted-foreground">
                          Sent {formatDateTime(entry.notification.sent_at, app.organization.timezone)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-muted-foreground">
                      Message body and metadata
                    </summary>
                    <pre className="mt-2 overflow-x-auto rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
                      {entry.notification.body}
                    </pre>
                    <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <div className="flex gap-2">
                        <dt>Deduplication key</dt>
                        <dd className="break-all font-mono">{entry.notification.idempotency_key}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt>Attempts</dt>
                        <dd>{entry.notification.attempt_count}</dd>
                      </div>
                      {entry.notification.items.length > 0 ? (
                        <div className="flex gap-2">
                          <dt>Items</dt>
                          <dd>
                            {entry.notification.items
                              .map((item) => `${item.requirement_title} (${item.milestone_key})`)
                              .join('; ')}
                          </dd>
                        </div>
                      ) : null}
                      {entry.notification.last_error ? (
                        <div className="flex gap-2">
                          <dt>Last error</dt>
                          <dd className="text-destructive">{entry.notification.last_error}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </details>

                  {entry.notification.status !== 'sent' && app.can('reminder.send') ? (
                    <Button
                      className="mt-3"
                      size="sm"
                      variant="outline"
                      disabled={action.pending}
                      onClick={() =>
                        void action.run(() => api.retryNotification(entry.notification.id), {
                          success: outbox.data?.delivery.configured
                            ? 'Delivery attempted again. The status below reflects the result.'
                            : 'Message re-queued. It stays queued until SMTP is configured.',
                        })
                      }
                    >
                      <RefreshCw aria-hidden="true" />
                      Try delivery again
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  )
}
