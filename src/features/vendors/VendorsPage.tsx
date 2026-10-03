import { api } from '@/api/client'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Download,
  Plus,
  Search,
  SlidersHorizontal,
  Upload,
  X,
} from 'lucide-react'
import { useApp } from '@/app/AppProvider'
import { useAction } from '@/app/useAction'
import { useServiceQuery } from '@/app/useServiceQuery'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { RequirementMeter } from '@/components/Metrics'
import { Section } from '@/components/Section'
import { EmptyState, ErrorState, FilteredEmptyState, TableSkeleton } from '@/components/States'
import { ExpiringSoonChip, ReadinessChip } from '@/components/StatusChips'
import { Timestamp } from '@/components/Timestamp'
import {
  ClearFiltersButton,
  Toolbar,
  ToolbarActions,
  ToolbarGroup,
  ToolbarRow,
} from '@/components/Toolbar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RemovableChip, ToggleChip } from '@/components/ui/toggle-chip'
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
  TableSortHeader,
} from '@/components/ui/table'
import { formatDate } from '@/domain/dates'
import { READINESS_LABEL } from '@/domain/readiness'
import type { ReadinessStatus } from '@/domain/types'
import { downloadText } from '@/lib/download'
import { ScrollRegion } from '@/components/ScrollRegion'
import { ImportVendorsDialog } from './ImportVendorsDialog'
import { hasActiveFilters, parseVendorQuery, vendorQueryToParams } from '@/domain/vendorQuery'

const READINESS_FILTERS: ReadinessStatus[] = [
  'ready',
  'awaiting_review',
  'not_ready',
  'unconfigured',
]

const SORT_LABEL = {
  name: 'Company name',
  next_expiration: 'Next expiration',
  updated: 'Updated',
} as const

type SortKey = keyof typeof SORT_LABEL

export function VendorsPage() {
  const app = useApp()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const query = parseVendorQuery(searchParams)
  const [searchDraft, setSearchDraft] = useState(query.search ?? '')
  const searchRef = useRef<HTMLInputElement>(null)
  // Category, property and lifecycle are used far less than search and readiness, so they stay
  // folded away until asked for — which also keeps the toolbar to two rows on a phone.
  const [moreOpen, setMoreOpen] = useState(
    () => Boolean(query.category || query.property || (query.lifecycle && query.lifecycle !== 'active')),
  )
  const exportAction = useAction()

  const list = useServiceQuery(() => api.listVendors(query), [searchParams.toString()])

  const update = (patch: Partial<typeof query>, resetPage = true) => {
    const next = { ...query, ...patch, page: resetPage ? 1 : (patch.page ?? query.page) }
    setSearchParams(vendorQueryToParams(next), { replace: true })
  }

  useEffect(() => {
    setSearchDraft(query.search ?? '')
  }, [query.search])

  // Search applies as you type. The URL is still the source of truth, so a shared link keeps the
  // exact same result set.
  useEffect(() => {
    if (searchDraft === (query.search ?? '')) return
    const handle = setTimeout(
      () =>
        setSearchParams(vendorQueryToParams({ ...query, search: searchDraft, page: 1 }), {
          replace: true,
        }),
      350,
    )
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft])

  // "/" is the near-universal shortcut for search in list-heavy tools.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      event.preventDefault()
      searchRef.current?.focus()
      searchRef.current?.select()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const toggleReadiness = (status: ReadinessStatus) => {
    const current = new Set(query.readiness ?? [])
    if (current.has(status)) current.delete(status)
    else current.add(status)
    update({ readiness: [...current] })
  }

  const sortBy = (column: SortKey) => {
    if (query.sort === column) {
      update({ direction: query.direction === 'asc' ? 'desc' : 'asc' })
    } else {
      update({ sort: column, direction: column === 'name' ? 'asc' : 'desc' })
    }
  }

  const clearAll = () => setSearchParams(new URLSearchParams(), { replace: true })

  const rows = list.data?.rows ?? []
  const canManage = app.can('vendor.manage')
  const canExport = app.can('export.run')
  const filtersApplied = hasActiveFilters(query)
  const pageSize = 25
  const firstRow = list.data ? (list.data.page - 1) * pageSize + 1 : 0
  const lastRow = list.data ? Math.min(list.data.page * pageSize, list.data.total) : 0

  const appliedPills: { key: string; label: string; clear: () => void }[] = [
    ...(query.search
      ? [{ key: 'q', label: `Search: “${query.search}”`, clear: () => update({ search: '' }) }]
      : []),
    ...(query.readiness ?? []).map((status) => ({
      key: `r-${status}`,
      label: READINESS_LABEL[status],
      clear: () => toggleReadiness(status),
    })),
    ...(query.expiringSoonOnly
      ? [{ key: 'expiring', label: 'Expiring soon only', clear: () => update({ expiringSoonOnly: false }) }]
      : []),
    ...(query.category
      ? [{ key: 'category', label: `Category: ${query.category}`, clear: () => update({ category: null }) }]
      : []),
    ...(query.property
      ? [{ key: 'property', label: `Property: ${query.property}`, clear: () => update({ property: null }) }]
      : []),
    ...(query.lifecycle && query.lifecycle !== 'active'
      ? [
          {
            key: 'lifecycle',
            label: query.lifecycle === 'archived' ? 'Archived only' : 'Active and archived',
            clear: () => update({ lifecycle: 'active' as const }),
          },
        ]
      : []),
  ]

  return (
    <Page density="workspace">
      <PageHeader
        compact
        title="Vendors"
        description="Search and filter active vendors. Include archived from More when needed."
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
                  void exportAction.run(() => api.exportVendors(query), {
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

      <Toolbar label="Search and filters" sticky>
        <ToolbarRow className="sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Label htmlFor="vendor-search" className="sr-only">
              Search company, contact or email
            </Label>
            <Input
              id="vendor-search"
              ref={searchRef}
              type="search"
              value={searchDraft}
              className="pr-9 pl-9"
              placeholder="Search company, contact or email…"
              onChange={(event) => setSearchDraft(event.target.value)}
            />
            {searchDraft ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="absolute top-1/2 right-1 -translate-y-1/2"
                aria-label="Clear search"
                onClick={() => {
                  setSearchDraft('')
                  searchRef.current?.focus()
                }}
              >
                <X aria-hidden="true" />
              </Button>
            ) : null}
          </div>
          <ToolbarActions>
            <Label htmlFor="filter-sort" className="sr-only">
              Sort by
            </Label>
            <Select value={query.sort ?? 'name'} onValueChange={(value) => sortBy(value as SortKey)}>
              <SelectTrigger id="filter-sort" className="min-w-40 flex-1 sm:flex-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SORT_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={`Sort ${query.direction === 'asc' ? 'ascending' : 'descending'}. Switch to ${query.direction === 'asc' ? 'descending' : 'ascending'}.`}
              onClick={() => update({ direction: query.direction === 'asc' ? 'desc' : 'asc' })}
            >
              {query.direction === 'asc' ? (
                <ArrowUp aria-hidden="true" />
              ) : (
                <ArrowDown aria-hidden="true" />
              )}
            </Button>
            <Button
              type="button"
              variant={moreOpen ? 'secondary' : 'outline'}
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((open) => !open)}
            >
              <SlidersHorizontal aria-hidden="true" />
              More
            </Button>
          </ToolbarActions>
        </ToolbarRow>

        <ToolbarGroup label="Readiness">
          {READINESS_FILTERS.map((status) => (
            <ToggleChip
              key={status}
              pressed={(query.readiness ?? []).includes(status)}
              onToggle={() => toggleReadiness(status)}
            >
              {READINESS_LABEL[status]}
            </ToggleChip>
          ))}
          <span aria-hidden="true" className="mx-1 hidden h-4 w-px bg-border sm:block" />
          <ToggleChip
            pressed={query.expiringSoonOnly ?? false}
            onToggle={() => update({ expiringSoonOnly: !query.expiringSoonOnly })}
          >
            Expiring soon
          </ToggleChip>
        </ToolbarGroup>

        {moreOpen ? (
          <div className="grid gap-3 border-t pt-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="filter-category">Category</Label>
              <Select
                value={query.category ?? 'all'}
                onValueChange={(value) => update({ category: value === 'all' ? null : value })}
              >
                <SelectTrigger id="filter-category" className="w-full">
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
            <div className="space-y-1.5">
              <Label htmlFor="filter-property">Property tag</Label>
              <Select
                value={query.property ?? 'all'}
                onValueChange={(value) => update({ property: value === 'all' ? null : value })}
              >
                <SelectTrigger id="filter-property" className="w-full">
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
            <div className="space-y-1.5">
              <Label htmlFor="filter-lifecycle">Lifecycle</Label>
              <Select
                value={query.lifecycle ?? 'active'}
                onValueChange={(value) => update({ lifecycle: value as 'active' | 'archived' | 'all' })}
              >
                <SelectTrigger id="filter-lifecycle" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="archived">Archived only</SelectItem>
                  <SelectItem value="all">Active and archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}

        {appliedPills.length > 0 ? (
          <ToolbarGroup label="Applied" className="border-t pt-3">
            {appliedPills.map((pill) => (
              <RemovableChip key={pill.key} onRemove={pill.clear}>
                {pill.label}
              </RemovableChip>
            ))}
            <ClearFiltersButton onClear={clearAll} />
          </ToolbarGroup>
        ) : null}
      </Toolbar>

      {list.loading && !list.data ? <TableSkeleton label="Loading vendors" rows={6} columns={6} /> : null}
      {list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : null}

      {list.data ? (
        <>
          {list.data.total === 0 ? (
            list.data.filteredEmpty ? (
              <FilteredEmptyState
                title="No vendors match these filters"
                onClear={clearAll}
              />
            ) : (
              <EmptyState
                title="No vendors yet"
                description="Add your first vendor or import a CSV of the vendors you already work with."
                action={
                  canManage ? (
                    <div className="flex flex-wrap justify-center gap-2">
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
                    </div>
                  ) : undefined
                }
              />
            )
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="type-meta" role="status">
                  Showing {firstRow}–{lastRow} of {list.data.total} vendor
                  {list.data.total === 1 ? '' : 's'}
                  {filtersApplied ? ' matching these filters' : ''}.
                </p>
              </div>

              <Section className="hidden md:block">
                <ScrollRegion label="Vendor results">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur supports-backdrop-filter:bg-card/90">
                      <TableRow className="hover:bg-transparent">
                        <TableSortHeader
                          active={(query.sort ?? 'name') === 'name'}
                          direction={query.direction ?? 'asc'}
                          onSort={() => sortBy('name')}
                          className="pl-4"
                        >
                          Vendor
                        </TableSortHeader>
                        <TableHead>Readiness</TableHead>
                        <TableHead>Required items</TableHead>
                        <TableSortHeader
                          active={query.sort === 'next_expiration'}
                          direction={query.direction ?? 'asc'}
                          onSort={() => sortBy('next_expiration')}
                        >
                          Next expiration
                        </TableSortHeader>
                        <TableHead>Primary contact</TableHead>
                        <TableSortHeader
                          active={query.sort === 'updated'}
                          direction={query.direction ?? 'asc'}
                          onSort={() => sortBy('updated')}
                        >
                          Updated
                        </TableSortHeader>
                        <TableHead className="w-8 pr-4">
                          <span className="sr-only">Open</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="[&_td]:py-2">
                      {rows.map((row) => (
                        /*
                         * The row responds to a click for pointer convenience; the vendor name is a
                         * real link, which is what the keyboard and assistive technology follow.
                         */
                        <TableRow
                          key={row.vendor.id}
                          className="group cursor-pointer"
                          onClick={() => navigate(`/vendors/${row.vendor.id}`)}
                        >
                          <TableCell className="max-w-64 pl-4 font-medium whitespace-normal">
                            <Link
                              to={`/vendors/${row.vendor.id}`}
                              className="rounded-sm underline-offset-[3px] group-hover:text-clay-text group-hover:underline"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {row.vendor.company_name}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {row.vendor.category}
                              {row.vendor.property_tags.length > 0
                                ? ` · ${row.vendor.property_tags.join(', ')}`
                                : ''}
                            </p>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col items-start gap-0.5">
                              <ReadinessChip status={row.readiness.status} size="sm" />
                              {row.readiness.expiringSoon ? <ExpiringSoonChip size="sm" /> : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            <RequirementMeter
                              satisfied={row.readiness.requiredSatisfied}
                              total={row.readiness.requiredTotal}
                            />
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatDate(row.readiness.nextExpiration)}
                          </TableCell>
                          <TableCell className="max-w-56 whitespace-normal">
                            <p className="text-sm">{row.vendor.contact_name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {row.vendor.contact_email}
                            </p>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            <Timestamp
                              value={row.vendor.updated_at}
                              timezone={app.organization.timezone}
                            />
                          </TableCell>
                          <TableCell className="pr-4">
                            <ChevronRight
                              aria-hidden="true"
                              className="size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollRegion>
              </Section>

              <ScrollRegion label="Vendor results" className="md:hidden">
                <ul className="space-y-2">
                  {rows.map((row) => (
                    <li key={row.vendor.id}>
                      <Link
                        to={`/vendors/${row.vendor.id}`}
                        className="surface block space-y-2 p-3 transition-colors active:bg-muted/60"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium">{row.vendor.company_name}</p>
                            <p className="text-xs text-muted-foreground">{row.vendor.category}</p>
                          </div>
                          <ChevronRight
                            aria-hidden="true"
                            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <ReadinessChip status={row.readiness.status} size="sm" />
                          {row.readiness.expiringSoon ? (
                            <ExpiringSoonChip
                              nextExpiration={row.readiness.nextExpiration}
                              size="sm"
                            />
                          ) : null}
                        </div>
                        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                          <div>
                            <dt className="text-xs text-muted-foreground">Required items</dt>
                            <dd>
                              <RequirementMeter
                                satisfied={row.readiness.requiredSatisfied}
                                total={row.readiness.requiredTotal}
                              />
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Next expiration</dt>
                            <dd>{formatDate(row.readiness.nextExpiration)}</dd>
                          </div>
                          <div className="col-span-2 min-w-0">
                            <dt className="text-xs text-muted-foreground">Primary contact</dt>
                            <dd className="truncate">
                              {row.vendor.contact_name} · {row.vendor.contact_email}
                            </dd>
                          </div>
                        </dl>
                      </Link>
                    </li>
                  ))}
                </ul>
              </ScrollRegion>

              {list.data.totalPages > 1 ? (
                <nav
                  aria-label="Vendor pagination"
                  className="flex items-center justify-between gap-2 pt-1"
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
                    Page {list.data.page} of {list.data.totalPages}
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
    </Page>
  )
}
