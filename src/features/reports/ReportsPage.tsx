import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Download, FileBarChart } from 'lucide-react'
import { api } from '@/api/client'
import { useApp } from '@/app/AppProvider'
import { useAction } from '@/app/useAction'
import { useServiceQuery } from '@/app/useServiceQuery'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { Section } from '@/components/Section'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { Chip, ReadinessChip } from '@/components/StatusChips'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { downloadText } from '@/lib/download'
import { cn } from '@/lib/utils'
import type { ReadinessStatus } from '@/domain/types'

type StatusFilter = 'all' | 'ready' | 'not_ready' | 'awaiting_review' | 'unconfigured' | 'expiring'

function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'ok' | 'warn' | 'danger' | 'neutral'
}) {
  return (
    <div className="rounded-2xl border bg-background/60 px-4 py-3">
      <p className="type-eyebrow">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums tracking-tight',
          tone === 'ok' && 'text-[var(--tone-ok-foreground)]',
          tone === 'warn' && 'text-[var(--tone-warn-foreground)]',
          tone === 'danger' && 'text-[var(--tone-danger-foreground)]',
        )}
      >
        {value}
      </p>
    </div>
  )
}

export function ReportsPage() {
  const app = useApp()
  const report = useServiceQuery(() => api.readinessReport(), [])
  const action = useAction()
  const canExport = app.can('export.run')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [propertyFilter, setPropertyFilter] = useState<string>('all')

  const propertyOptions = useMemo(() => {
    const names = new Set<string>()
    for (const row of report.data?.by_property ?? []) {
      if (row.property_id) names.add(row.property_name)
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [report.data?.by_property])

  const filteredVendors = useMemo(() => {
    const rows = report.data?.vendors ?? []
    return rows.filter((row) => {
      if (row.lifecycle === 'archived') return false
      if (propertyFilter !== 'all' && !row.properties.includes(propertyFilter)) return false
      if (statusFilter === 'all') return true
      if (statusFilter === 'expiring') return row.expiring_soon
      return row.status === (statusFilter as ReadinessStatus)
    })
  }, [propertyFilter, report.data?.vendors, statusFilter])

  return (
    <Page density="workspace">
      <PageHeader
        compact
        title="Reports"
        description="Ready vs not-ready vendors, documents expiring soon, and readiness by property"
        actions={
          canExport ? (
            <Button
              size="sm"
              variant="outline"
              disabled={action.pending || !report.data}
              onClick={() =>
                void action.run(() => api.exportReadinessReport(), {
                  success: 'CSV downloaded.',
                  onSuccess: (result) => downloadText(result.filename, result.csv),
                })
              }
            >
              <Download aria-hidden="true" />
              Export CSV
            </Button>
          ) : undefined
        }
      />

      {report.loading && !report.data ? <LoadingState label="Building readiness report" /> : null}
      {report.error ? <ErrorState message={report.error} onRetry={report.reload} /> : null}

      {report.data && report.data.totals.active_vendors === 0 ? (
        <EmptyState
          title="No active vendors to report"
          description="Add vendors and assign checklists to see readiness, expirations, and property roll-ups here."
          action={
            app.can('vendor.manage') ? (
              <Button asChild size="sm">
                <Link to="/vendors/new">Add vendor</Link>
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {report.data && report.data.totals.active_vendors > 0 ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Ready" value={report.data.totals.ready} tone="ok" />
            <Metric label="Not ready" value={report.data.totals.not_ready} tone="danger" />
            <Metric
              label="Awaiting review"
              value={report.data.totals.awaiting_review}
              tone="warn"
            />
            <Metric
              label="Expiring soon"
              value={report.data.totals.expiring_soon}
              tone="warn"
            />
          </div>

          <Section>
            <div className="flex flex-wrap items-end gap-3 border-b px-3 py-3">
              <div className="space-y-1">
                <p className="type-eyebrow">By property</p>
                <p className="text-sm text-muted-foreground">
                  Active vendor readiness rolled up by linked site
                </p>
              </div>
            </div>
            {report.data.by_property.length === 0 ? (
              <EmptyState
                title="No property roll-up yet"
                description="Create properties and link vendors to see readiness by site."
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link to="/properties">Open properties</Link>
                  </Button>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Property</TableHead>
                      <TableHead className="text-right">Vendors</TableHead>
                      <TableHead className="text-right">Ready</TableHead>
                      <TableHead className="text-right">Not ready</TableHead>
                      <TableHead className="text-right">In review</TableHead>
                      <TableHead className="text-right">Expiring</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.data.by_property.map((row) => (
                      <TableRow key={row.property_id ?? 'unassigned'}>
                        <TableCell className="font-medium">
                          {row.property_id ? (
                            <Link to="/properties" className="hover:underline">
                              {row.property_name}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">{row.property_name}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.vendor_count}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.ready}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.not_ready}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.awaiting_review}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.expiring_soon}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Section>

          <Section>
            <div className="flex flex-col gap-3 border-b px-3 py-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1">
                <p className="type-eyebrow">Vendor readiness</p>
                <p className="text-sm text-muted-foreground">
                  As of {report.data.today} · filters apply to the table only
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select
                  value={statusFilter}
                  onValueChange={(value) => setStatusFilter(value as StatusFilter)}
                >
                  <SelectTrigger className="w-[11rem]" aria-label="Filter by readiness">
                    <SelectValue placeholder="Readiness" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="ready">Ready</SelectItem>
                    <SelectItem value="not_ready">Not ready</SelectItem>
                    <SelectItem value="awaiting_review">Awaiting review</SelectItem>
                    <SelectItem value="unconfigured">Unconfigured</SelectItem>
                    <SelectItem value="expiring">Expiring soon</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={propertyFilter} onValueChange={setPropertyFilter}>
                  <SelectTrigger className="w-[12rem]" aria-label="Filter by property">
                    <SelectValue placeholder="Property" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All properties</SelectItem>
                    {propertyOptions.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {filteredVendors.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No vendors match these filters"
                  description="Clear a filter or link more vendors to properties."
                />
              </div>
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Properties</TableHead>
                        <TableHead>Next expiration</TableHead>
                        <TableHead>Blockers</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredVendors.map((row) => (
                        <TableRow key={row.vendor_id}>
                          <TableCell>
                            <Link
                              to={`/vendors/${row.vendor_id}`}
                              className="font-medium hover:underline"
                            >
                              {row.company_name}
                            </Link>
                            <p className="type-meta">{row.category}</p>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1.5">
                              <ReadinessChip status={row.status} />
                              {row.expiring_soon ? <Chip tone="warn">Expiring</Chip> : null}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[14rem] text-sm text-muted-foreground">
                            {row.properties.length > 0 ? row.properties.join(', ') : '—'}
                          </TableCell>
                          <TableCell className="tabular-nums text-sm">
                            {row.next_expiration ?? '—'}
                            {row.days_until_expiration != null ? (
                              <span className="type-meta block">
                                {row.days_until_expiration < 0
                                  ? `${Math.abs(row.days_until_expiration)}d overdue`
                                  : `${row.days_until_expiration}d`}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="max-w-[18rem] text-sm text-muted-foreground">
                            {row.blockers || '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <ul className="divide-y md:hidden" aria-label="Vendor readiness">
                  {filteredVendors.map((row) => (
                    <li key={row.vendor_id} className="space-y-2 px-3 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          to={`/vendors/${row.vendor_id}`}
                          className="font-medium hover:underline"
                        >
                          {row.company_name}
                        </Link>
                        <ReadinessChip status={row.status} />
                      </div>
                      <p className="type-meta">
                        {row.properties.length > 0 ? row.properties.join(', ') : 'No property'}
                        {row.next_expiration ? ` · next ${row.next_expiration}` : ''}
                      </p>
                      {row.blockers ? (
                        <p className="text-sm text-muted-foreground">{row.blockers}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Section>

          <Section>
            <div className="border-b px-3 py-3">
              <p className="type-eyebrow">Documents expiring within 30 days</p>
              <p className="text-sm text-muted-foreground">
                Required accepted documents nearing or past expiration
              </p>
            </div>
            {report.data.expiring_documents.length === 0 ? (
              <div className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
                <FileBarChart aria-hidden="true" className="size-4 shrink-0" />
                Nothing required is expiring in the next 30 days.
              </div>
            ) : (
              <ul className="divide-y">
                {report.data.expiring_documents.map((doc) => (
                  <li
                    key={`${doc.vendor_id}:${doc.requirement_title}:${doc.expiration_date}`}
                    className="flex flex-col gap-1 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <Link
                        to={`/vendors/${doc.vendor_id}`}
                        className="font-medium hover:underline"
                      >
                        {doc.company_name}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {doc.requirement_title}
                        {doc.properties.length > 0 ? ` · ${doc.properties.join(', ')}` : ''}
                      </p>
                    </div>
                    <Chip tone={doc.days_until < 0 ? 'danger' : 'warn'}>
                      {doc.days_until < 0
                        ? `${Math.abs(doc.days_until)}d overdue`
                        : doc.days_until === 0
                          ? 'Expires today'
                          : `${doc.days_until}d · ${doc.expiration_date}`}
                    </Chip>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      ) : null}
    </Page>
  )
}
