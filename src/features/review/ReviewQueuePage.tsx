import { Link, useSearchParams } from 'react-router'
import { ChevronRight, Paperclip } from 'lucide-react'
import { api } from '@/api/client'
import { useApp } from '@/app/AppProvider'
import { useServiceQuery } from '@/app/useServiceQuery'
import { PageHeader } from '@/components/PageHeader'
import { Section } from '@/components/Section'
import {
  EmptyState,
  ErrorState,
  FilteredEmptyState,
  InlineNotice,
  LoadingState,
} from '@/components/States'
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
import { formatDate } from '@/domain/dates'

export function ReviewQueuePage() {
  const app = useApp()
  const [searchParams, setSearchParams] = useSearchParams()
  const vendorId = searchParams.get('vendor')
  const requirementTitle = searchParams.get('requirement')
  const filtered = Boolean(vendorId || requirementTitle)

  const queue = useServiceQuery(
    () => api.reviewQueue({ vendorId, requirementTitle }),
    [vendorId, requirementTitle],
  )

  const setFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  const canDecide = app.can('submission.review')

  return (
    <div className="animate-rise space-y-4">
      <PageHeader
        title="Review queue"
        description="Oldest pending submission first, so nothing waits indefinitely. Archived vendors are excluded, and the count is submissions rather than vendors."
      />

      {queue.loading && !queue.data ? (
        <LoadingState label="Loading the review queue" rows={4} />
      ) : null}
      {queue.error ? <ErrorState message={queue.error} onRetry={queue.reload} /> : null}

      {queue.data ? (
        <>
          <Section aria-label="Queue filters" className="p-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="review-vendor">Vendor</Label>
                <Select
                  value={vendorId ?? 'all'}
                  onValueChange={(value) => setFilter('vendor', value === 'all' ? null : value)}
                >
                  <SelectTrigger id="review-vendor" className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All vendors</SelectItem>
                    {queue.data.vendors.map((vendor) => (
                      <SelectItem key={vendor.id} value={vendor.id}>
                        {vendor.company_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="review-requirement">Requirement</Label>
                <Select
                  value={requirementTitle ?? 'all'}
                  onValueChange={(value) => setFilter('requirement', value === 'all' ? null : value)}
                >
                  <SelectTrigger id="review-requirement" className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All requirements</SelectItem>
                    {queue.data.requirementTitles.map((title) => (
                      <SelectItem key={title} value={title}>
                        {title}
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

          {!canDecide ? (
            <InlineNotice tone="info" title="You can read this queue but not decide">
              Only an admin or reviewer can accept a submission or request changes. Open a submission
              to read it and its history.
            </InlineNotice>
          ) : null}

          <p className="text-sm text-muted-foreground" role="status">
            {queue.data.items.length === queue.data.total
              ? `${queue.data.total} pending submission${queue.data.total === 1 ? '' : 's'}.`
              : `Showing ${queue.data.items.length} of ${queue.data.total} pending submissions.`}
          </p>

          {queue.data.items.length === 0 ? (
            queue.data.filteredEmpty ? (
              <FilteredEmptyState
                title="Nothing pending matches these filters"
                description="Clear the filters to see the whole queue."
                onClear={() => setSearchParams(new URLSearchParams(), { replace: true })}
              />
            ) : (
              <EmptyState
                title="Nothing is waiting for review"
                description="Every submission from an active vendor has a decision. New submissions appear here automatically, oldest first."
              />
            )
          ) : (
            <Section>
              <ul className="divide-y">
                {queue.data.items.map((item) => (
                  <li key={item.submission.id}>
                    <Link
                      to={`/review/${item.submission.id}`}
                      className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-muted/60 sm:items-center sm:gap-4"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[0.6875rem] font-semibold text-muted-foreground tabular-nums sm:mt-0"
                      >
                        {item.position}
                      </span>
                      <span className="min-w-0 flex-1 space-y-0.5">
                        <span className="block text-sm font-medium group-hover:text-primary">
                          {item.requirement.title}
                          <span className="font-normal text-muted-foreground">
                            {' · '}v{item.submission.version_number}
                          </span>
                        </span>
                        <span className="block truncate text-sm">{item.vendor.company_name}</span>
                        <span className="block text-xs text-muted-foreground">
                          Submitted{' '}
                          <Timestamp
                            value={item.submission.submitted_at}
                            timezone={app.organization.timezone}
                          />{' '}
                          by {item.submission.submitted_by_label}
                          {item.submission.submitted_on_behalf ? ' (on behalf of the vendor)' : ''}
                          {item.submission.expiration_date
                            ? ` · expires ${formatDate(item.submission.expiration_date)}`
                            : ''}
                        </span>
                        {item.file ? (
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Paperclip aria-hidden="true" className="size-3" />
                            <span className="truncate">{item.file.original_filename}</span>
                          </span>
                        ) : null}
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-muted-foreground group-hover:text-primary">
                        <span className="hidden sm:inline">
                          {canDecide ? 'Review' : 'Open'}
                        </span>
                        <ChevronRight
                          aria-hidden="true"
                          className="size-4 transition-transform group-hover:translate-x-0.5"
                        />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      ) : null}
    </div>
  )
}
