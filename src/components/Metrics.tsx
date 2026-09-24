/** Numeric display components: readiness tiles, the readiness mix bar, and progress meters. */
import { Link } from 'react-router'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { READINESS_LABEL } from '@/domain/readiness'
import type { ReadinessStatus } from '@/domain/types'

export const READINESS_TONE: Record<ReadinessStatus, 'ok' | 'info' | 'danger' | 'neutral'> = {
  ready: 'ok',
  awaiting_review: 'info',
  not_ready: 'danger',
  unconfigured: 'neutral',
  archived: 'neutral',
}

const DOT_CLASS = {
  ok: 'bg-tone-ok',
  info: 'bg-tone-info',
  warn: 'bg-tone-warn',
  danger: 'bg-tone-danger',
  neutral: 'bg-tone-neutral',
  brand: 'bg-primary',
} as const

export type Tone = keyof typeof DOT_CLASS

export function ToneDot({ tone, className }: { tone: Tone; className?: string }) {
  return (
    <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', DOT_CLASS[tone], className)} />
  )
}

/**
 * A readiness bucket. The whole tile is the link target so the pointer and the keyboard reach the
 * same affordance, and the count keeps its own line so scanning down the row compares numbers.
 */
export function StatTile({
  label,
  value,
  description,
  tone,
  to,
  share,
}: {
  label: string
  value: number
  description: string
  tone: Tone
  to: string
  /** Portion of the active population, 0–1, drawn as a hairline under the count. */
  share?: number
}) {
  return (
    <Link
      to={to}
      className="group surface flex h-full flex-col gap-2 p-3.5 transition-[box-shadow,border-color,transform] hover:-translate-y-px hover:border-primary/35 hover:shadow-raised focus-visible:border-primary/50"
    >
      <span className="flex items-center gap-2 text-[0.8125rem] font-medium">
        <ToneDot tone={tone} />
        {label}
        <ArrowUpRight
          aria-hidden="true"
          className="ml-auto size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        />
      </span>
      <span className="text-[1.75rem] leading-none font-semibold">{value}</span>
      {share === undefined ? null : (
        <span aria-hidden="true" className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <span
            className={cn('block h-full rounded-full transition-[width] duration-500', DOT_CLASS[tone])}
            style={{ width: `${Math.round(share * 100)}%` }}
          />
        </span>
      )}
      <span className="text-xs leading-snug text-muted-foreground">{description}</span>
    </Link>
  )
}

/**
 * Readiness mix across active vendors. It is decorative: the same numbers are in the tiles above
 * and in the accessible summary sentence, so the bar carries no information on its own.
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
    <div aria-hidden="true" className="flex h-2 w-full gap-px overflow-hidden rounded-full bg-muted">
      {order.map((status) =>
        counts[status] === 0 ? null : (
          <span
            key={status}
            title={`${READINESS_LABEL[status]}: ${counts[status]}`}
            className={cn('h-full transition-[flex-grow] duration-500', DOT_CLASS[READINESS_TONE[status]])}
            style={{ flexGrow: counts[status] }}
          />
        ),
      )}
    </div>
  )
}

/** "3 of 5" progress, drawn as discrete ticks so partial completion is countable at a glance. */
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
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="text-sm font-medium tabular-nums">
        {satisfied}
        <span className="text-muted-foreground"> / {total}</span>
      </span>
      {total === 0 ? null : (
        <span aria-hidden="true" className="flex gap-0.5">
          {Array.from({ length: Math.min(total, 6) }).map((_, index) => (
            <span
              key={index}
              className={cn(
                'h-3.5 w-1 rounded-full',
                index < Math.round((satisfied / total) * Math.min(total, 6))
                  ? complete
                    ? 'bg-tone-ok'
                    : 'bg-primary'
                  : 'bg-border',
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
  tone?: Tone
}) {
  const percent = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100))
  return (
    <div className="space-y-1.5">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={label}
        className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-700 ease-out', DOT_CLASS[tone])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
