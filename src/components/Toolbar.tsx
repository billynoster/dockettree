/**
 * Filter toolbar molecule. Four screens filter a list — vendors, the review queue, notifications
 * and activity — and before this they each hand-rolled a grid of selects with slightly different
 * spacing. They now compose the same three parts, so a filter row looks and behaves identically
 * wherever it appears.
 */
import { useId } from 'react'
import { Section } from '@/components/Section'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export function Toolbar({
  children,
  label,
  className,
}: {
  children: React.ReactNode
  /** Names the region for assistive technology, e.g. "Queue filters". */
  label: string
  className?: string
}) {
  return (
    <Section aria-label={label} className={cn('p-3 sm:p-4', className)}>
      <div className="flex flex-col gap-3">{children}</div>
    </Section>
  )
}

/** A row inside the toolbar. Fields share the width evenly and stack under 640px. */
export function ToolbarRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-end', className)}>{children}</div>
  )
}

/**
 * A labelled control. The label is always rendered — a select whose only clue is its current value
 * is unreadable once someone has changed it — and `children` receives the generated id.
 */
export function ToolbarField({
  label,
  children,
  className,
  hideLabel = false,
}: {
  label: string
  children: (id: string) => React.ReactNode
  className?: string
  hideLabel?: boolean
}) {
  const id = useId()
  return (
    <div className={cn('min-w-0 flex-1 space-y-1.5', className)}>
      <Label htmlFor={id} className={hideLabel ? 'sr-only' : undefined}>
        {label}
      </Label>
      {children(id)}
    </div>
  )
}

/** Trailing actions: clear, sort direction, a disclosure for secondary filters. */
export function ToolbarActions({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn('flex shrink-0 items-center gap-2', className)}>{children}</div>
}

/** The standard "give me everything back" control. Only rendered when something is applied. */
export function ClearFiltersButton({ onClear }: { onClear: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="shrink-0" onClick={onClear}>
      Clear filters
    </Button>
  )
}

/** A group of toggles or pills with a quiet leading label. */
export function ToolbarGroup({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <span className="pr-1 text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}
