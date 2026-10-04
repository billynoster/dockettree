/** Loading, empty, filtered-empty, error, access-denied and inline-notice surfaces. */
import {
  CalendarClock,
  CircleAlert,
  Inbox,
  Info,
  Lock,
  RotateCcw,
  SearchX,
  TriangleAlert,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { TONE_CLASS, type ChipTone } from '@/components/ui/chip'

/**
 * Generic placeholder. Skeletons mirror the shape of the content that replaces them so the layout
 * does not jump when data lands; `LoadingState` is the fallback for freeform bodies.
 */
export function LoadingState({ label = 'Loading…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true">
      <p className="sr-only" role="status">
        {label}
      </p>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="surface space-y-2.5 p-4">
          <Skeleton className="h-3.5" style={{ width: `${[52, 38, 60, 44, 48, 34][index % 6]}%` }} />
          <Skeleton className="h-3" style={{ width: `${[78, 64, 84, 70, 74, 60][index % 6]}%` }} />
        </div>
      ))}
    </div>
  )
}

/** Placeholder for the readiness tile row on the overview. */
export function StatsSkeleton({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="space-y-4" aria-busy="true">
      <p className="sr-only" role="status">
        {label}
      </p>
      <div className="surface space-y-4 p-4">
        <Skeleton className="h-9 w-28" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="surface space-y-2 p-3.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-10" />
              <Skeleton className="h-2.5 w-full" />
            </div>
          ))}
        </div>
      </div>
      <LoadingState rows={3} />
    </div>
  )
}

/** Placeholder for the vendor table: header rule plus evenly spaced rows. */
export function TableSkeleton({
  label = 'Loading…',
  rows = 6,
  columns = 6,
}: {
  label?: string
  rows?: number
  columns?: number
}) {
  return (
    <div className="surface overflow-hidden" aria-busy="true">
      <p className="sr-only" role="status">
        {label}
      </p>
      <div className="flex gap-4 border-b bg-muted/40 px-4 py-3">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-4 border-b px-4 py-3.5 last:border-b-0">
          {Array.from({ length: columns }).map((_, index) => (
            <Skeleton
              key={index}
              className="h-3.5 flex-1"
              style={{ maxWidth: index === 0 ? undefined : `${60 + ((rowIndex + index) % 4) * 10}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

interface PanelProps {
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
}

function Panel({
  icon,
  title,
  description,
  action,
  tone = 'neutral',
}: PanelProps & { icon: React.ReactNode; tone?: 'neutral' | 'danger' }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-2xl border px-6 py-12 text-center',
        tone === 'danger' ? 'tone-danger' : 'border-dashed bg-card/60',
      )}
    >
      <span
        className={cn(
          'flex size-11 items-center justify-center rounded-full',
          tone === 'danger' ? 'bg-card/70' : 'bg-muted text-muted-foreground',
        )}
      >
        {icon}
      </span>
      <div className="max-w-prose space-y-1.5">
        <h3 className="type-display-sm">{title}</h3>
        {description ? (
          <p className={cn('type-body', tone === 'danger' ? undefined : 'text-muted-foreground')}>
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  )
}

export function EmptyState(props: PanelProps) {
  return <Panel icon={<Inbox aria-hidden="true" className="size-5" />} {...props} />
}

export function FilteredEmptyState({
  onClear,
  title = 'Nothing matches these filters',
  description = 'Adjust or clear the filters to see the full list again.',
}: {
  onClear: () => void
  title?: string
  description?: string
}) {
  return (
    <Panel
      icon={<SearchX aria-hidden="true" className="size-5" />}
      title={title}
      description={description}
      action={
        <Button variant="outline" size="sm" onClick={onClear}>
          <RotateCcw aria-hidden="true" />
          Clear filters
        </Button>
      }
    />
  )
}

export function ErrorState({
  message,
  onRetry,
  title = 'Something went wrong',
}: {
  message: string
  onRetry?: () => void
  title?: string
}) {
  return (
    <Panel
      tone="danger"
      icon={<CircleAlert aria-hidden="true" className="size-5" />}
      title={title}
      description={message}
      action={
        onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCcw aria-hidden="true" />
            Try again
          </Button>
        ) : undefined
      }
    />
  )
}

export function AccessDeniedState({
  message,
  action,
}: {
  message: string
  action?: React.ReactNode
}) {
  return (
    <Panel
      icon={<Lock aria-hidden="true" className="size-5" />}
      title="Not available for your role"
      description={message}
      action={action}
    />
  )
}

const NOTICE_ICON = {
  ok: CheckCircle2,
  info: Info,
  waiting: Info,
  warn: TriangleAlert,
  expiring: CalendarClock,
  danger: CircleAlert,
  neutral: Info,
  brand: Info,
} as const

/**
 * Inline explanation attached to the thing it describes: a read-only reason, a delivery caveat, a
 * blocked action. One shape for all of them, so the meaning is carried by tone and icon, and a
 * warning can never be mistaken for a decorative aside.
 */
export function InlineNotice({
  tone = 'info',
  title,
  children,
  action,
  className,
  role,
}: {
  tone?: ChipTone
  title?: React.ReactNode
  children?: React.ReactNode
  action?: React.ReactNode
  className?: string
  role?: 'alert' | 'status'
}) {
  const Icon = NOTICE_ICON[tone]
  return (
    <div
      role={role}
      className={cn(
        'flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm',
        TONE_CLASS[tone],
        className,
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="[&_a]:underline [&_a]:underline-offset-2">{children}</div> : null}
      </div>
      {action ? <div className="-mr-1.5 shrink-0">{action}</div> : null}
    </div>
  )
}
