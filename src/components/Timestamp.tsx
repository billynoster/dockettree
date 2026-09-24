/**
 * Timestamps. Operations staff scan for recency first, so the visible label is relative and the
 * exact organization-local value stays available as the title and to screen readers.
 */
import { useSyncExternalStore } from 'react'
import { formatDateTime } from '@/domain/dates'
import type { IsoDateTime } from '@/domain/types'

/**
 * One shared minute tick for every relative label on the page, so "2 minutes ago" ages on its own
 * and a screen that stays open overnight does not keep claiming an event happened just now.
 */
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null
let snapshot = Date.now()

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!timer) {
    timer = setInterval(() => {
      snapshot = Date.now()
      for (const notify of listeners) notify()
    }, 60_000)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  )
}

function relativeLabel(value: IsoDateTime, now: number): string {
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) return value
  const seconds = Math.round((now - ms) / 1000)
  const future = seconds < 0
  const absolute = Math.abs(seconds)
  const format = (amount: number, unit: Intl.RelativeTimeFormatUnit) =>
    new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(future ? amount : -amount, unit)

  if (absolute < 45) return future ? 'in a moment' : 'just now'
  if (absolute < 3600) return format(Math.round(absolute / 60), 'minute')
  if (absolute < 86_400) return format(Math.round(absolute / 3600), 'hour')
  if (absolute < 2_592_000) return format(Math.round(absolute / 86_400), 'day')
  if (absolute < 31_536_000) return format(Math.round(absolute / 2_592_000), 'month')
  return format(Math.round(absolute / 31_536_000), 'year')
}

export function Timestamp({
  value,
  timezone,
  mode = 'relative',
  className,
}: {
  value: IsoDateTime | null
  timezone: string
  /** `absolute` keeps the full date visible for audit-style surfaces such as Activity. */
  mode?: 'relative' | 'absolute'
  className?: string
}) {
  const now = useNow()
  if (!value) return <span className={className}>—</span>
  const exact = formatDateTime(value, timezone)
  if (mode === 'absolute') {
    return (
      <time dateTime={value} className={className}>
        {exact}
      </time>
    )
  }
  return (
    <time dateTime={value} title={exact} className={className}>
      {relativeLabel(value, now)}
      <span className="sr-only"> ({exact})</span>
    </time>
  )
}
