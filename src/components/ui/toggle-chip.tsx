import { cn } from '@/lib/utils'

/**
 * Two-state filter atom. `aria-pressed` carries the state, so the selection is not conveyed by
 * colour alone, and the pressed fill is ink rather than a status hue so a selected filter can never
 * be read as a readiness value.
 */
export function ToggleChip({
  pressed,
  onToggle,
  children,
  className,
}: {
  pressed: boolean
  onToggle: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cn(
        'type-subtitle inline-flex h-8 items-center gap-1.5 rounded-full border px-3 transition-[background-color,border-color,color] duration-(--duration-quick) ease-(--ease-soft)',
        pressed
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border-strong bg-card text-foreground-soft hover:border-input hover:bg-muted hover:text-foreground',
        className,
      )}
    >
      {children}
    </button>
  )
}

/**
 * A filter that is currently applied, shown above the results. Clicking removes it, so the label
 * and the affordance are the same target.
 */
export function RemovableChip({
  onRemove,
  children,
  removeLabel = 'Remove filter',
}: {
  onRemove: () => void
  children: React.ReactNode
  removeLabel?: string
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="tone-brand inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-[filter] duration-(--duration-quick) hover:brightness-[0.97]"
    >
      {children}
      <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3">
        <path
          d="M3 3l6 6M9 3l-6 6"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      <span className="sr-only">{removeLabel}</span>
    </button>
  )
}
