import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
  Bell,
  CalendarClock,
  ChevronDown,
  MessageSquareWarning,
  RefreshCw,
  Send,
} from 'lucide-react'
import { api } from '@/api/client'
import { useApp } from '@/app/AppProvider'
import { useAction } from '@/app/useAction'
import { useServiceQuery } from '@/app/useServiceQuery'
import { PageHeader } from '@/components/PageHeader'
import { Section } from '@/components/Section'
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '@/components/States'
import { Chip, type ChipTone } from '@/components/StatusChips'
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
import type { Notification } from '@/domain/types'
import { cn } from '@/lib/utils'

const TYPE_LABEL: Record<Notification['type'], string> = {
  invitation: 'Invitation',
  vendor_digest: 'Vendor reminder digest',
  correction_requested: 'Correction request',
  internal_expiration_notice: 'Internal expiration notice',
}

const TYPE_ICON: Record<Notification['type'], typeof Bell> = {
  invitation: Send,
  vendor_digest: Bell,
  correction_requested: MessageSquareWarning,
  internal_expiration_notice: CalendarClock,
}

const STATUS_LABEL: Record<Notification['status'], string> = {
  queued: 'Queued',
  sent: 'Sent',
  failed: 'Failed',
  retry_scheduled: 'Retry scheduled',
}

const STATUS_TONE: Record<Notification['status'], ChipTone> = {
  queued: 'neutral',
  sent: 'ok',
  failed: 'danger',
  retry_scheduled: 'warn',
}

export function NotificationsPage() {
  const app = useApp()
  const [searchParams, setSearchParams] = useSearchParams()
  const vendorId = searchParams.get('vendor')
  const type = searchParams.get('type') as Notification['type'] | null
  const action = useAction()
  const outbox = useServiceQuery(() => api.notifications({ vendorId, type }), [vendorId, type])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const setFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="animate-rise space-y-4">
      <PageHeader
        title="Notifications"
        description="Every invitation, reminder and correction notice this organization has produced, with its real delivery state. Nothing here is simulated."
      />

      {outbox.data && !outbox.data.delivery.configured ? (
        <InlineNotice tone="warn" title="Messages are being held, not sent">
          {outbox.data.delivery.reason} You can still read the exact content of every queued message
          and pass the details on another way.
        </InlineNotice>
      ) : null}

      {outbox.loading && !outbox.data ? (
        <LoadingState label="Loading the notification log" rows={4} />
      ) : null}
      {outbox.error ? <ErrorState message={outbox.error} onRetry={outbox.reload} /> : null}

      {outbox.data ? (
        <>
          <Section aria-label="Message filters" className="p-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="outbox-vendor">Vendor</Label>
                <Select
                  value={vendorId ?? 'all'}
                  onValueChange={(value) => setFilter('vendor', value === 'all' ? null : value)}
                >
                  <SelectTrigger id="outbox-vendor" className="h-9 w-full">
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
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="outbox-type">Message type</Label>
                <Select
                  value={type ?? 'all'}
                  onValueChange={(value) => setFilter('type', value === 'all' ? null : value)}
                >
                  <SelectTrigger id="outbox-type" className="h-9 w-full">
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
              {vendorId || type ? (
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

          <p className="text-sm text-muted-foreground" role="status">
            {outbox.data.entries.length === outbox.data.total
              ? `${outbox.data.total} message${outbox.data.total === 1 ? '' : 's'}.`
              : `Showing ${outbox.data.entries.length} of ${outbox.data.total} messages.`}
          </p>

          {outbox.data.entries.length === 0 ? (
            <EmptyState
              title="No messages yet"
              description="Send an invitation or a reminder from a vendor, or run the reminder job from Settings, and the exact message appears here."
            />
          ) : (
            <ul className="space-y-2.5">
              {outbox.data.entries.map((entry) => {
                const notification = entry.notification
                const Icon = TYPE_ICON[notification.type]
                const open = expanded.has(notification.id)
                return (
                  <li key={notification.id} className="surface p-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Icon aria-hidden="true" className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="text-sm font-medium">{notification.subject}</p>
                          <div className="flex shrink-0 items-center gap-2">
                            <Chip tone={STATUS_TONE[notification.status]} size="sm">
                              {STATUS_LABEL[notification.status]}
                            </Chip>
                          </div>
                        </div>
                        <p className="text-sm break-all text-muted-foreground">
                          To {notification.recipient_label} &lt;{notification.recipient}&gt;
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {TYPE_LABEL[notification.type]} ·{' '}
                          {notification.manual ? 'Sent by a person' : 'Scheduled job'} ·{' '}
                          <Timestamp
                            value={notification.created_at}
                            timezone={app.organization.timezone}
                          />
                          {notification.sent_at ? (
                            <>
                              {' · delivered '}
                              <Timestamp
                                value={notification.sent_at}
                                timezone={app.organization.timezone}
                              />
                            </>
                          ) : null}
                          {entry.vendorName ? (
                            <>
                              {' · '}
                              <Link
                                to={`/vendors/${notification.vendor_id}`}
                                className="text-primary underline-offset-4 hover:underline"
                              >
                                {entry.vendorName}
                              </Link>
                            </>
                          ) : null}
                        </p>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-expanded={open}
                        className="-ml-2.5 text-muted-foreground"
                        onClick={() => toggle(notification.id)}
                      >
                        <ChevronDown
                          aria-hidden="true"
                          className={cn('transition-transform', open && 'rotate-180')}
                        />
                        {open ? 'Hide message' : 'Read message'}
                      </Button>
                      {notification.status !== 'sent' && app.can('reminder.send') ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={action.pending}
                          onClick={() =>
                            void action.run(() => api.retryNotification(notification.id), {
                              success: outbox.data?.delivery.configured
                                ? 'Delivery attempted again. The status reflects the result.'
                                : 'Message re-queued. It stays queued until SMTP is configured.',
                            })
                          }
                        >
                          <RefreshCw aria-hidden="true" />
                          Try delivery again
                        </Button>
                      ) : null}
                    </div>

                    {open ? (
                      <div className="mt-2 space-y-3">
                        <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 font-sans text-xs leading-relaxed whitespace-pre-wrap">
                          {notification.body}
                        </pre>
                        <dl className="space-y-1 text-xs text-muted-foreground">
                          <div className="flex flex-wrap gap-2">
                            <dt className="font-medium">Deduplication key</dt>
                            <dd className="font-mono break-all">{notification.idempotency_key}</dd>
                          </div>
                          <div className="flex gap-2">
                            <dt className="font-medium">Attempts</dt>
                            <dd className="tabular-nums">{notification.attempt_count}</dd>
                          </div>
                          {notification.items.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              <dt className="font-medium">Items</dt>
                              <dd>
                                {notification.items
                                  .map((item) => `${item.requirement_title} (${item.milestone_key})`)
                                  .join('; ')}
                              </dd>
                            </div>
                          ) : null}
                          {notification.last_error ? (
                            <div className="flex flex-wrap gap-2">
                              <dt className="font-medium">Last error</dt>
                              <dd className="text-destructive">{notification.last_error}</dd>
                            </div>
                          ) : null}
                        </dl>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      ) : null}
    </div>
  )
}
