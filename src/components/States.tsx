/** Loading, empty, filtered-empty, error and access-denied states used across screens. */
import { CircleAlert, Inbox, Lock, RotateCcw, SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export function LoadingState({ label = 'Loading…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true">
      <p className="sr-only" role="status">
        {label}
      </p>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  )
}

interface PanelProps {
  title: string
  description?: string
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
      className={
        tone === 'danger'
          ? 'flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6'
          : 'flex flex-col items-start gap-3 rounded-lg border border-dashed bg-background p-6'
      }
    >
      <div className="text-muted-foreground">{icon}</div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold">{title}</h3>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function EmptyState(props: PanelProps) {
  return <Panel icon={<Inbox aria-hidden="true" className="size-6" />} {...props} />
}

export function FilteredEmptyState({ onClear }: { onClear: () => void }) {
  return (
    <Panel
      icon={<SearchX aria-hidden="true" className="size-6" />}
      title="No vendors match these filters"
      description="Adjust or clear the filters to see the full list again."
      action={
        <Button variant="outline" size="sm" onClick={onClear}>
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
      icon={<CircleAlert aria-hidden="true" className="size-6 text-destructive" />}
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
      icon={<Lock aria-hidden="true" className="size-6" />}
      title="Not available for your role"
      description={message}
      action={action}
    />
  )
}
