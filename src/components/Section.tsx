/**
 * The one panel shape used across every screen: a white surface with an optional titled header,
 * a body, and an optional footer. Pages compose these instead of repeating border/padding
 * classes, which is what keeps spacing and heading sizes consistent between surfaces.
 */
import { cn } from '@/lib/utils'

export function Section({ className, ...props }: React.ComponentProps<'section'>) {
  return <section className={cn('surface overflow-hidden', className)} {...props} />
}

export function SectionHeader({
  title,
  description,
  action,
  id,
  level = 'h2',
  className,
  border = false,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  id?: string
  level?: 'h2' | 'h3'
  className?: string
  /** Set when the body below is a list or table that should be separated by a rule. */
  border?: boolean
}) {
  const Heading = level
  return (
    <div
      className={cn(
        'flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4',
        border && 'border-b',
        className,
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <Heading id={id} className="text-[0.9375rem] leading-tight font-semibold">
          {title}
        </Heading>
        {description ? (
          <p className="text-[0.8125rem] leading-snug text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  )
}

export function SectionBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('px-4 pb-4', className)} {...props} />
}

export function SectionFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-2 border-t bg-muted/50 px-4 py-3', className)}
      {...props}
    />
  )
}

/** Label/value pairs. Values stay on one line on desktop and stack under 640px. */
export function KeyValueList({
  items,
  className,
  columns = 2,
}: {
  items: { label: React.ReactNode; value: React.ReactNode; key?: string }[]
  className?: string
  columns?: 1 | 2 | 3
}) {
  return (
    <dl
      className={cn(
        'grid gap-x-6 gap-y-3 text-sm',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {items.map((item, index) => (
        <div key={item.key ?? index} className="min-w-0">
          <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {item.label}
          </dt>
          <dd className="mt-0.5 break-words">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
