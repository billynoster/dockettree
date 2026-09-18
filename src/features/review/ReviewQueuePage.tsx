import { Link, useSearchParams } from 'react-router'
import { api } from '@/api/client'
import { useApp } from '@/app/AppProvider'
import { useServiceQuery } from '@/app/useServiceQuery'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorState, FilteredEmptyState, LoadingState } from '@/components/States'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDate, formatDateTime } from '@/domain/dates'

export function ReviewQueuePage() {
  const app = useApp()
  const [searchParams, setSearchParams] = useSearchParams()
  const vendorId = searchParams.get('vendor')
  const requirementTitle = searchParams.get('requirement')

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
    <div className="space-y-4">
      <PageHeader
        title="Review queue"
        description="Oldest pending submission first. Archived vendors are excluded. The count is submissions, not vendors."
      />

      {queue.loading && !queue.data ? <LoadingState label="Loading the review queue" rows={4} /> : null}
      {queue.error ? <ErrorState message={queue.error} onRetry={queue.reload} /> : null}

      {queue.data ? (
        <>
          <div className="grid gap-3 rounded-lg border bg-background p-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="review-vendor">Vendor</Label>
              <Select
                value={vendorId ?? 'all'}
                onValueChange={(value) => setFilter('vendor', value === 'all' ? null : value)}
              >
                <SelectTrigger id="review-vendor">
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
            <div className="space-y-1">
              <Label htmlFor="review-requirement">Requirement</Label>
              <Select
                value={requirementTitle ?? 'all'}
                onValueChange={(value) => setFilter('requirement', value === 'all' ? null : value)}
              >
                <SelectTrigger id="review-requirement">
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
            <div className="flex items-end">
              <p className="text-sm text-muted-foreground" role="status">
                {queue.data.items.length} of {queue.data.total} pending submission
                {queue.data.total === 1 ? '' : 's'} shown
              </p>
            </div>
          </div>

          {!canDecide ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Your role can read the queue, but only an admin or reviewer can decide a submission.
            </p>
          ) : null}

          {queue.data.items.length === 0 ? (
            queue.data.filteredEmpty ? (
              <FilteredEmptyState
                onClear={() => setSearchParams(new URLSearchParams(), { replace: true })}
              />
            ) : (
              <EmptyState
                title="Nothing is waiting for review"
                description="Every submission from active vendors has a decision. New submissions appear here automatically."
              />
            )
          ) : (
            <ul className="space-y-3">
              {queue.data.items.map((item) => (
                <li
                  key={item.submission.id}
                  className="flex flex-col gap-3 rounded-lg border bg-background p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium">
                      #{item.position} · {item.requirement.title}
                    </p>
                    <p className="text-sm">
                      <Link
                        to={`/vendors/${item.vendor.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {item.vendor.company_name}
                      </Link>{' '}
                      · version {item.submission.version_number}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Submitted {formatDateTime(item.submission.submitted_at, app.organization.timezone)}{' '}
                      by {item.submission.submitted_by_label}
                      {item.submission.submitted_on_behalf ? ' (on behalf of the vendor)' : ''}
                      {item.submission.expiration_date
                        ? ` · expires ${formatDate(item.submission.expiration_date)}`
                        : ''}
                      {item.file ? ` · ${item.file.original_filename}` : ''}
                    </p>
                  </div>
                  <Button asChild size="sm">
                    <Link to={`/review/${item.submission.id}`}>
                      {canDecide ? 'Open review' : 'Open submission'}
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  )
}
