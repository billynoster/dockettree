/**
 * Clock interface. Services read time through this so "today" is always resolved in the
 * organization timezone and tests can pin an instant. Production uses `systemClock()`.
 */
import type { IsoDateTime } from './types'

export interface Clock {
  now(): Date
  nowIso(): IsoDateTime
}

export function systemClock(): Clock {
  return {
    now: () => new Date(),
    nowIso: () => new Date().toISOString(),
  }
}

/** Fixed instant, used by tests that assert date-boundary behaviour. */
export function fixedClock(instant: Date | IsoDateTime): Clock {
  const value = typeof instant === 'string' ? new Date(instant) : instant
  return {
    now: () => new Date(value.getTime()),
    nowIso: () => value.toISOString(),
  }
}
