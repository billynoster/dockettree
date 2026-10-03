import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { BellRing, ChevronRight, Inbox } from 'lucide-react'
import { api } from '@/api/client'
import { useApp } from '@/app/AppProvider'
import { useServiceQuery } from '@/app/useServiceQuery'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { Section, SectionHeader } from '@/components/Section'
import {
  EmptyState,
  ErrorState,
  FilteredEmptyState,
  LoadingState,
} from '@/components/States'
import { RequestStateChip } from '@/components/StatusChips'
import { Timestamp } from '@/components/Timestamp'
import {
  ClearFiltersButton,
  Toolbar,
  ToolbarField,
  ToolbarRow,
} from '@/components/Toolbar'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DOCUMENT_REQUEST_STATE_LABEL,
  DOCUMENT_REQUEST_STATES,
} from '@/domain/documentRequests'
import type { DocumentRequestState } from '@/domain/types'
import { RemindVendorDialog } from '@/features/vendors/RemindVendorDialog'
import { cn } from '@/lib/utils'

const SOURCE_LABEL = {
  reminder: 'Reminder',
  correction: 'Update requested',
  manual: 'Manual request',
} as const

export function RequestsPage() {
  const app = useApp()
  const [searchParams, setSearchParams] = useSearchParams()
  const vendorId = searchParams.get('vendor')
  const stateParam = (searchParams.get('state') as DocumentRequestState | 'open' | null) ?? 'open'
  const selectedId = searchParams.get('id')
  const canRemind = app.can('reminder.send')

  const list = useServiceQuery(
    () => api.listRequests({ vendorId, state: stateParam }),
    [vendorId, stateParam],
  )

  const selected = useMemo(() => {
    if (!list.data?.items.length) return null
    if (selectedId) {
      return list.data.items.find((item) => item.request.id === selectedId) ?? list.data.items[0]
    }
    return list.data.items[0]
  }, [list.data, selectedId])

  const detail = useServiceQuery(
    () => (selected ? api.requestDetail(selected.request.id) : Promise.resolve(null)),
    [selected?.request.id],
  )

  const setFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'id') next.delete('id')
    setSearchParams(next, { replace: true })
  }

  const selectRequest = (id: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('id', id)
    setSearchParams(next, { replace: true })
  }

  const filtered = Boolean(vendorId || (stateParam && stateParam !== 'open'))
  const [remindVendorId, setRemindVendorId] = useState<string | null>(null)

  return (
    <Page density="workspace">
      <PageHeader
        compact
        title="Requests"
        description="Document and info asks sent to vendors — what was requested, where it stands, and what’s next"
        actions={
          canRemind && list.data?.vendors[0] ? (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={remindVendorId ?? list.data.vendors[0].id}
                onValueChange={setRemindVendorId}
              >
                <SelectTrigger className="h-9 w-[12rem]" aria-label="Vendor for new request">
                  <SelectValue placeholder="Choose vendor" />
                </SelectTrigger>
                <SelectContent>
                  {list.data.vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      {vendor.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <RemindVendorDialog
                vendorId={remindVendorId ?? list.data.vendors[0].id}
                onSent={() => void list.reload()}
                trigger={
                  <Button size="sm">
                    <BellRing aria-hidden="true" />
                    Request documents
                  </Button>
                }
              />
            </div>
          ) : null
        }
      />

      {list.loading && !list.data ? <LoadingState label="Loading requests" rows={5} /> : null}
      {list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : null}

      {list.data ? (
        <>
          <Toolbar label="Request filters" sticky>
            <ToolbarRow>
              <ToolbarField label="State">
                {(id) => (
                  <Select
                    value={stateParam}
                    onValueChange={(value) =>
                      setFilter('state', value === 'all' ? null : value)
                    }
                  >
                    <SelectTrigger id={id} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      {DOCUMENT_REQUEST_STATES.map((state) => (
                        <SelectItem key={state} value={state}>
                          {DOCUMENT_REQUEST_STATE_LABEL[state]}
                        </SelectItem>
                      ))}
                      <SelectItem value="all">All</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </ToolbarField>
              <ToolbarField label="Vendor">
                {(id) => (
                  <Select
                    value={vendorId ?? 'all'}
                    onValueChange={(value) => setFilter('vendor', value === 'all' ? null : value)}
                  >
                    <SelectTrigger id={id} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All vendors</SelectItem>
                      {list.data!.vendors.map((vendor) => (
                        <SelectItem key={vendor.id} value={vendor.id}>
                          {vendor.company_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </ToolbarField>
              {filtered ? (
                <ClearFiltersButton
                  onClear={() => {
                    setSearchParams(new URLSearchParams({ state: 'open' }), { replace: true })
                  }}
                />
              ) : null}
            </ToolbarRow>
          </Toolbar>

          {list.data.items.length === 0 ? (
            filtered ? (
              <FilteredEmptyState
                title="No requests match these filters"
                description="Try another vendor or state, or clear filters to see the open inbox."
                onClear={() =>
                  setSearchParams(new URLSearchParams({ state: 'open' }), { replace: true })
                }
              />
            ) : (
              <EmptyState
                title="No open requests"
                description="When you request documents or ask for an update, those asks show up here with a clear next step."
                action={
                  canRemind && list.data.vendors[0] ? (
                    <RemindVendorDialog
                      vendorId={list.data.vendors[0].id}
                      trigger={
                        <Button size="sm">
                          <BellRing aria-hidden="true" />
                          Request documents
                        </Button>
                      }
                    />
                  ) : undefined
                }
              />
            )
          ) : (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
              <Section aria-labelledby="requests-inbox-heading" className="min-w-0">
                <SectionHeader
                  id="requests-inbox-heading"
                  title="Inbox"
                  description={`${list.data.total} request${list.data.total === 1 ? '' : 's'}`}
                  border
                />
                <ul className="divide-y">
                  {list.data.items.map((item) => {
                    const active = selected?.request.id === item.request.id
                    return (
                      <li key={item.request.id}>
                        <button
                          type="button"
                          onClick={() => selectRequest(item.request.id)}
                          className={cn(
                            'flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors duration-(--duration-quick)',
                            active
                              ? 'bg-[var(--tone-brand-surface)]'
                              : 'hover:bg-muted/60',
                          )}
                        >
                          <Inbox
                            aria-hidden="true"
                            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-start justify-between gap-2">
                              <span className="truncate text-sm font-medium">
                                {item.vendor.company_name}
                              </span>
                              <RequestStateChip state={item.request.state} size="sm" />
                            </span>
                            <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                              {item.request.item_title}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              Sent{' '}
                              <Timestamp
                                value={item.request.sent_at}
                                timezone={app.organization.timezone}
                              />
                            </span>
                          </span>
                          <ChevronRight
                            aria-hidden="true"
                            className="mt-1 size-4 shrink-0 text-muted-foreground xl:hidden"
                          />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </Section>

              <Section aria-labelledby="request-detail-heading" className="min-w-0">
                {detail.loading && !detail.data ? (
                  <LoadingState label="Loading request" rows={4} />
                ) : null}
                {detail.error ? (
                  <ErrorState message={detail.error} onRetry={detail.reload} />
                ) : null}
                {detail.data ? (
                  <>
                    <SectionHeader
                      id="request-detail-heading"
                      title={detail.data.request.item_title}
                      description={detail.data.vendor.company_name}
                      action={<RequestStateChip state={detail.data.request.state} />}
                      border
                    />
                    <div className="space-y-5 px-4 py-4">
                      <dl className="grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-muted-foreground">Vendor</dt>
                          <dd className="font-medium">
                            <Link
                              className="text-[var(--tone-brand-foreground)] underline-offset-2 hover:underline"
                              to={`/vendors/${detail.data.request.vendor_id}?tab=requests`}
                            >
                              {detail.data.vendor.company_name}
                            </Link>
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Contact</dt>
                          <dd className="font-medium break-all">
                            {detail.data.vendor_contact.name} · {detail.data.vendor_contact.email}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Date sent</dt>
                          <dd className="font-medium">
                            <Timestamp
                              value={detail.data.request.sent_at}
                              timezone={app.organization.timezone}
                            />
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Source</dt>
                          <dd className="font-medium">
                            {SOURCE_LABEL[detail.data.request.source]}
                          </dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-muted-foreground">Next action</dt>
                          <dd className="font-medium">{detail.data.next_action}</dd>
                        </div>
                        {detail.data.request.detail ? (
                          <div className="sm:col-span-2">
                            <dt className="text-muted-foreground">What was asked</dt>
                            <dd className="text-foreground">{detail.data.request.detail}</dd>
                          </div>
                        ) : null}
                      </dl>

                      <div>
                        <h3 className="text-sm font-semibold">Timeline</h3>
                        <ol className="mt-3 space-y-3 border-l border-border pl-4">
                          {detail.data.timeline.map((step) => (
                            <li key={`${step.label}-${step.at}`} className="relative">
                              <span
                                aria-hidden="true"
                                className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-primary"
                              />
                              <p className="text-sm font-medium">{step.label}</p>
                              <p className="text-xs text-muted-foreground">
                                <Timestamp
                                  value={step.at}
                                  timezone={app.organization.timezone}
                                />
                              </p>
                              {step.detail ? (
                                <p className="mt-0.5 text-sm text-muted-foreground">{step.detail}</p>
                              ) : null}
                            </li>
                          ))}
                        </ol>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {detail.data.request.state === 'in_review' ||
                        detail.data.request.state === 'uploaded' ? (
                          <Button asChild size="sm">
                            <Link to={`/review?vendor=${detail.data.request.vendor_id}`}>
                              Open review queue
                            </Link>
                          </Button>
                        ) : null}
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/vendors/${detail.data.request.vendor_id}?tab=requests`}>
                            Vendor requests
                          </Link>
                        </Button>
                        {canRemind &&
                        (detail.data.request.state === 'sent' ||
                          detail.data.request.state === 'viewed') ? (
                          <RemindVendorDialog
                            vendorId={detail.data.request.vendor_id}
                            trigger={
                              <Button size="sm" variant="outline">
                                <BellRing aria-hidden="true" />
                                Send another reminder
                              </Button>
                            }
                          />
                        ) : null}
                      </div>
                    </div>
                  </>
                ) : null}
              </Section>
            </div>
          )}
        </>
      ) : null}
    </Page>
  )
}
