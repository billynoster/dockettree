/** Numeric display molecules: readiness tiles, the readiness mix bar, and progress meters. */
import { Link } from 'react-router'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { READINESS_TONE } from '@/components/StatusChips'
import { ToneDot, TONE_SOLID, type ChipTone } from '@/components/ui/chip'
import { READINESS_LABEL } from '@/domain/readiness'
import type { ReadinessStatus } from '@/domain/types'

export { READINESS_TONE, ToneDot }
export type Tone = ChipTone

/**
 * A readiness bucket. The whole tile is the link target so the pointer and the keyboard reach the
 * same affordance, and the count keeps its own line so scanning the row compares numbers.
 */
export function StatTile({
  label,
  value,
  description,
  tone,
  to,
  share,
  compact = false,
}: {
  label: string
  value: number
  description: string
  tone: ChipTone
  to: string
  /** Portion of the active population, 0–1, drawn as a hairline under the count. */
  share?: number
  /** Denser tile for above-the-fold overview grids; description stays available to AT. */
  compact?: boolean
}) {
  return (
    <Link
      to={to}
      title={description}
      className={cn(
        'group surface flex h-full flex-col transition-[box-shadow,border-color,transform] duration-(--duration-quick) ease-(--ease-soft) hover:-translate-y-px hover:border-border-strong hover:shadow-raised focus-visible:border-ring',
        compact ? 'gap-1.5 p-3' : 'gap-2 p-4',
      )}
    >
      <span className="type-subtitle flex items-center gap-2">
        <ToneDot tone={tone} />
        {label}
        <ArrowUpRight
          aria-hidden="true"
          className="ml-auto size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        />
      </span>
      <span className={compact ? 'text-[1.375rem] font-semibold tracking-[-0.022em] tabular-nums' : 'type-metric-sm'}>
        {value}
      </span>
      {share === undefined ? null : (
        <span aria-hidden="true" className="h-1 w-full overflow-hidden rounded-full bg-accent">
          <span
            className={cn('block h-full rounded-full transition-[width] duration-700 ease-(--ease-soft)', TONE_SOLID[tone])}
            style={{ width: `${Math.round(share * 100)}%` }}
          />
        </span>
      )}
      <span className={cn('type-meta', compact && 'line-clamp-2 max-sm:sr-only')}>{description}</span>
    </Link>
  )
}

/**
 * Readiness mix across active vendors. It is decorative: the same numbers are in the tiles above
 * and in the sentence beside it, so the bar carries no information on its own.
 */
export function ReadinessMixBar({
  counts,
  total,
}: {
  counts: Record<ReadinessStatus, number>
  total: number
}) {
  if (total === 0) return null
  const order: ReadinessStatus[] = ['ready', 'awaiting_review', 'not_ready', 'unconfigured']
  return (
    <div aria-hidden="true" className="flex h-2 w-full gap-px overflow-hidden rounded-full bg-accent">
      {order.map((status) =>
        counts[status] === 0 ? null : (
          <span
            key={status}
            title={`${READINESS_LABEL[status]}: ${counts[status]}`}
            className={cn(
              'h-full transition-[flex-grow] duration-700 ease-(--ease-soft)',
              TONE_SOLID[READINESS_TONE[status]],
            )}
            style={{ flexGrow: counts[status] }}
          />
        ),
      )}
    </div>
  )
}

/** "3 / 5" progress, drawn as discrete ticks so partial completion stays countable at a glance. */
export function RequirementMeter({
  satisfied,
  total,
  className,
}: {
  satisfied: number
  total: number
  className?: string
}) {
  const complete = total > 0 && satisfied >= total
  const ticks = Math.min(total, 6)
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="text-sm font-semibold tabular-nums">
        {satisfied}
        <span className="font-medium text-muted-foreground"> / {total}</span>
      </span>
      {total === 0 ? null : (
        <span aria-hidden="true" className="flex gap-0.5">
          {Array.from({ length: ticks }).map((_, index) => (
            <span
              key={index}
              className={cn(
                'h-3.5 w-[3px] rounded-full',
                index < Math.round((satisfied / total) * ticks)
                  ? complete
                    ? 'bg-tone-ok'
                    : 'bg-primary'
                  : 'bg-border-strong',
              )}
            />
          ))}
        </span>
      )}
    </span>
  )
}

/** Labelled horizontal progress used on the vendor portal. */
export function ProgressMeter({
  value,
  max,
  label,
  tone = 'brand',
}: {
  value: number
  max: number
  label: string
  tone?: ChipTone
}) {
  const percent = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100))
  const fill = tone === 'neutral' ? 'bg-primary' : TONE_SOLID[tone]
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
      className="h-2.5 w-full overflow-hidden rounded-full bg-accent"
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-700 ease-(--ease-soft)', fill)}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}
