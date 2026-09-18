import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Download, Plus, Search, Upload } from 'lucide-react'
import { useApp } from '@/app/AppProvider'
import { useAction } from '@/app/useAction'
import { useServiceQuery } from '@/app/useServiceQuery'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorState, FilteredEmptyState, LoadingState } from '@/components/States'
import { ExpiringSoonChip, ReadinessChip } from '@/components/StatusChips'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { formatDate, formatDateTime } from '@/domain/dates'
import { can } from '@/domain/permissions'
import { READINESS_LABEL } from '@/domain/readiness'
import type { ReadinessStatus } from '@/domain/types'
import { downloadText } from '@/lib/download'
import { exportVendorStatus } from '@/services/exportService'
import { listVendors } from '@/services/vendorService'
import { ImportVendorsDialog } from './ImportVendorsDialog'
import { hasActiveFilters, parseVendorQuery, vendorQueryToParams } from './vendorQuery'

const READINESS_FILTERS: ReadinessStatus[] = [
  'ready',
  'awaiting_review',
  'not_ready',
  'unconfigured',
]

export function VendorsPage() {
  const app = useApp()
  const [searchParams, setSearchParams] = useSearchParams()
  const query = parseVendorQuery(searchParams)
  const [searchDraft, setSearchDraft] = useState(query.search ?? '')
  // Filters stay expanded on desktop and collapse into a labeled panel on narrow screens.
  const [filtersOpen, setFiltersOpen] = useState(
    () =>
      hasActiveFilters(query) ||
      (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches),
  )
  const exportAction = useAction()

  useEffect(() => {
    setSearchDraft(query.search ?? '')
  }, [query.search])

  const list = useServiceQuery((ctx) => listVendors(ctx, query), [searchParams.toString()])

  const update = (patch: Partial<typeof query>, resetPage = true) => {
    const next = { ...query, ...patch, page: resetPage ? 1 : (patch.page ?? query.page) }
    setSearchParams(vendorQueryToParams(next), { replace: true })
  }

  const toggleReadiness = (status: ReadinessStatus, checked: boolean) => {
    const current = new Set(query.readiness ?? [])
    if (checked) current.add(status)
    else current.delete(status)
    update({ readiness: [...current] })
  }

  const rows = list.data?.rows ?? []
  const canManage = can(app.role, 'vendor.manage')
  const canExport = can(app.role, 'export.run')

  return (
    <div className="space-y-4">
      <PageHeader
        title="Vendors"
        description="Search, filter and open any vendor. Archived vendors are hidden until you include them."
        actions={
          <>
            {canManage ? (
              <>
                <Button asChild size="sm">
                  <Link to="/vendors/new">
                    <Plus aria-hidden="true" />
                    Add vendor
                  </Link>
                </Button>
                <ImportVendorsDialog
                  trigger={
                    <Button variant="outline" size="sm">
                      <Upload aria-hidden="true" />
                      Import CSV
                    </Button>
                  }
                />
              </>
            ) : null}
            {canExport ? (
              <Button
                variant="outline"
                size="sm"
                disabled={exportAction.pending}
                onClick={() =>
                  void exportAction.run((ctx) => exportVendorStatus(ctx, query), {
                    success: (result) =>
                      `Exported ${result.rowCount} filtered vendor row${result.rowCount === 1 ? '' : 's'} to ${result.filename}.`,
                    skipRefresh: true,
                    onSuccess: (result) => downloadText(result.filename, result.csv),
                  })
                }
              >
                <Download aria-hidden="true" />
                Export CSV
              </Button>
            ) : null}
          </>
        }
      />

      <details
        className="rounded-lg border bg-background"
        open={filtersOpen}
        onToggle={(event) => setFiltersOpen((event.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
          Search and filters
          {hasActiveFilters(query) ? (
            <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
              Filters applied
            </span>
          ) : null}
        </summary>
        <div className="space-y-4 border-t px-4 py-4">
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault()
              update({ search: searchDraft })
            }}
          >
            <div className="flex-1 space-y-1">
              <Label htmlFor="vendor-search">Search company, contact or email</Label>
              <Input
                id="vendor-search"
                value={searchDraft}
                placeholder="e.g. ironwood or damon.frazier@example.com"
                onChange={(event) => setSearchDraft(event.target.value)}
              />
            </div>
            <Button type="submit" variant="outline">
              <Search aria-hidden="true" />
              Search
            </Button>
          </form>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Readiness</legend>
            <div className="flex flex-wrap gap-4">
              {READINESS_FILTERS.map((status) => (
                <div key={status} className="flex items-center gap-2">
                  <Checkbox
                    id={`readiness-${status}`}
                    checked={(query.readiness ?? []).includes(status)}
                    onCheckedChange={(checked) => toggleReadiness(status, checked === true)}
                  />
                  <Label htmlFor={`readiness-${status}`} className="font-normal">
                    {READINESS_LABEL[status]}
                  </Label>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="filter-expiring"
                  checked={query.expiringSoonOnly ?? false}
                  onCheckedChange={(checked) => update({ expiringSoonOnly: checked === true })}
                />
                <Label htmlFor="filter-expiring" className="font-normal">
                  Expiring soon only
                </Label>
              </div>
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="filter-category">Category</Label>
              <Select
                value={query.category ?? 'all'}
                onValueChange={(value) => update({ category: value === 'all' ? null : value })}
              >
                <SelectTrigger id="filter-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {(list.data?.categories ?? []).map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="filter-property">Property tag</Label>
              <Select
                value={query.property ?? 'all'}
                onValueChange={(value) => update({ property: value === 'all' ? null : value })}
              >
                <SelectTrigger id="filter-property">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All properties</SelectItem>
                  {(list.data?.properties ?? []).map((property) => (
                    <SelectItem key={property} value={property}>
                      {property}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="filter-lifecycle">Lifecycle</Label>
              <Select
                value={query.lifecycle ?? 'active'}
                onValueChange={(value) =>
                  update({ lifecycle: value as 'active' | 'archived' | 'all' })
                }
              >
                <SelectTrigger id="filter-lifecycle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="archived">Archived only</SelectItem>
                  <SelectItem value="all">Active and archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="filter-sort">Sort by</Label>
              <div className="flex gap-2">
                <Select
                  value={query.sort ?? 'name'}
                  onValueChange={(value) =>
                    update({ sort: value as 'name' | 'next_expiration' | 'updated' })
                  }
                >
                  <SelectTrigger id="filter-sort">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Company name</SelectItem>
                    <SelectItem value="next_expiration">Next expiration</SelectItem>
                    <SelectItem value="updated">Updated date</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => update({ direction: query.direction === 'asc' ? 'desc' : 'asc' })}
                >
                  {query.direction === 'asc' ? 'Ascending' : 'Descending'}
                </Button>
              </div>
            </div>
          </div>

          {hasActiveFilters(query) ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearchParams(new URLSearchParams(), { replace: true })}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      </details>

      {list.loading && !list.data ? <LoadingState label="Loading vendors" rows={6} /> : null}
      {list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : null}

      {list.data ? (
        <>
          <p className="text-sm text-muted-foreground" role="status">
            {list.data.total} vendor{list.data.total === 1 ? '' : 's'} match
            {list.data.total === 1 ? 'es' : ''} these filters. Showing page {list.data.page} of{' '}
            {list.data.totalPages}.
          </p>

          {list.data.total === 0 ? (
            list.data.filteredEmpty ? (
              <FilteredEmptyState
                onClear={() => setSearchParams(new URLSearchParams(), { replace: true })}
              />
            ) : (
              <EmptyState
                title="No vendors yet"
                description="Add your first vendor or import a CSV to get started."
                action={
                  canManage ? (
                    <Button asChild size="sm">
                      <Link to="/vendors/new">Add vendor</Link>
                    </Button>
                  ) : undefined
                }
              />
            )
          ) : (
            <>
              <div className="hidden overflow-x-auto rounded-lg border bg-background md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Readiness</TableHead>
                      <TableHead>Required items</TableHead>
                      <TableHead>Next expiration</TableHead>
                      <TableHead>Primary contact</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.vendor.id}>
                        <TableCell className="font-medium">
                          <Link
                            to={`/vendors/${row.vendor.id}`}
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {row.vendor.company_name}
                          </Link>
                          {row.vendor.property_tags.length > 0 ? (
                            <p className="text-xs text-muted-foreground">
                              {row.vendor.property_tags.join(', ')}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell>{row.vendor.category}</TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <ReadinessChip status={row.readiness.status} />
                            {row.readiness.expiringSoon ? <ExpiringSoonChip /> : null}
                          </div>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {row.readiness.requiredSatisfied} of {row.readiness.requiredTotal}
                        </TableCell>
                        <TableCell>{formatDate(row.readiness.nextExpiration)}</TableCell>
                        <TableCell>
                          <p>{row.vendor.contact_name}</p>
                          <p className="text-xs text-muted-foreground">{row.vendor.contact_email}</p>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDateTime(row.vendor.updated_at, app.organization.timezone)}
                        </TableCell>
                        <TableCell>
                          <Button asChild variant="outline" size="sm">
                            <Link to={`/vendors/${row.vendor.id}`}>Open</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <ul className="space-y-3 md:hidden">
                {rows.map((row) => (
                  <li key={row.vendor.id} className="rounded-lg border bg-background p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{row.vendor.company_name}</p>
                        <p className="text-xs text-muted-foreground">{row.vendor.category}</p>
                      </div>
                      <ReadinessChip status={row.readiness.status} />
                    </div>
                    <dl className="mt-3 space-y-1 text-sm">
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Next deadline</dt>
                        <dd>{formatDate(row.readiness.nextExpiration)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Required items</dt>
                        <dd className="tabular-nums">
                          {row.readiness.requiredSatisfied} of {row.readiness.requiredTotal}
                        </dd>
                      </div>
                    </dl>
                    {row.readiness.expiringSoon ? (
                      <div className="mt-2">
                        <ExpiringSoonChip nextExpiration={row.readiness.nextExpiration} />
                      </div>
                    ) : null}
                    <Button asChild size="sm" className="mt-3 w-full">
                      <Link to={`/vendors/${row.vendor.id}`}>Open vendor</Link>
                    </Button>
                  </li>
                ))}
              </ul>

              {list.data.totalPages > 1 ? (
                <nav
                  aria-label="Vendor pagination"
                  className="flex items-center justify-between gap-2"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={list.data.page <= 1}
                    onClick={() => update({ page: list.data!.page - 1 }, false)}
                  >
                    Previous
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    Page {list.data.page} of {list.data.totalPages} · 25 rows per page
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={list.data.page >= list.data.totalPages}
                    onClick={() => update({ page: list.data!.page + 1 }, false)}
                  >
                    Next
                  </Button>
                </nav>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </div>
  )
}
