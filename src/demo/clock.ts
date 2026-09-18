/**
 * Injected clock. Every service reads time through this interface so the demo date
 * control can move time forward and the pilot can substitute server time.
 */
import type { IsoDate, IsoDateTime } from '@/domain/types'

export interface Clock {
  now(): Date
  nowIso(): IsoDateTime
}

/** Initial demo instant required by requirements section 5.3. */
export const INITIAL_DEMO_DATE: IsoDate = '2026-09-17'
export const INITIAL_DEMO_INSTANT: IsoDateTime = '2026-09-17T12:00:00.000Z'

export function fixedClock(instant: Date | IsoDateTime): Clock {
  const value = typeof instant === 'string' ? new Date(instant) : instant
  return {
    now: () => new Date(value.getTime()),
    nowIso: () => value.toISOString(),
  }
}

export function systemClock(): Clock {
  return {
    now: () => new Date(),
    nowIso: () => new Date().toISOString(),
  }
}
