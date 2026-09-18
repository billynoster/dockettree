import type { IsoDate, IsoDateTime } from './types'

/** A document is flagged Expiring soon when it expires within this many days, inclusive. */
export const EXPIRING_SOON_WINDOW_DAYS = 30

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const MS_PER_DAY = 86_400_000

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) return false
  const ms = Date.parse(`${value}T00:00:00Z`)
  if (Number.isNaN(ms)) return false
  // Reject rolled-over values such as 2026-02-31.
  return new Date(ms).toISOString().slice(0, 10) === value
}

/**
 * Today as a date-only value in the organization's IANA timezone. All expiration
 * comparisons use this so a UTC midnight rollover never shifts a local due date.
 */
export function todayInTimeZone(instant: Date, timeZone: string): IsoDate {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(instant)
}

/** Local wall-clock time (HH:mm) in the organization timezone. */
export function localTimeInTimeZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(instant)
}

function dateOnlyMs(value: IsoDate): number {
  return Date.parse(`${value}T00:00:00Z`)
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((dateOnlyMs(to) - dateOnlyMs(from)) / MS_PER_DAY)
}

export function addDays(value: IsoDate, days: number): IsoDate {
  return new Date(dateOnlyMs(value) + days * MS_PER_DAY).toISOString().slice(0, 10)
}

export function compareDates(a: IsoDate, b: IsoDate): number {
  return dateOnlyMs(a) - dateOnlyMs(b)
}

export function minDate(a: IsoDate | null, b: IsoDate | null): IsoDate | null {
  if (!a) return b
  if (!b) return a
  return compareDates(a, b) <= 0 ? a : b
}

/** Days remaining until expiration; 0 on the expiration date, negative once expired. */
export function daysUntilExpiration(expiration: IsoDate, today: IsoDate): number {
  return daysBetween(today, expiration)
}

/** A document is valid through its expiration date and expired when today is after it. */
export function isExpiredOn(expiration: IsoDate | null, today: IsoDate): boolean {
  if (!expiration) return false
  return compareDates(today, expiration) > 0
}

export function isExpiringSoonOn(expiration: IsoDate | null, today: IsoDate): boolean {
  if (!expiration) return false
  const remaining = daysUntilExpiration(expiration, today)
  return remaining >= 0 && remaining <= EXPIRING_SOON_WINDOW_DAYS
}

/** Demo date control: pick a calendar date, keep a stable mid-day instant. */
export function instantForDemoDate(date: IsoDate): IsoDateTime {
  return `${date}T12:00:00.000Z`
}

export function formatDate(value: IsoDate | null): string {
  if (!value) return '—'
  const ms = dateOnlyMs(value)
  if (Number.isNaN(ms)) return value
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(ms))
}

export function formatDateTime(value: IsoDateTime | null, timeZone: string): string {
  if (!value) return '—'
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) return value
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms))
}

export function describeRelativeDays(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return 'in 1 day'
  if (days > 1) return `in ${days} days`
  if (days === -1) return '1 day ago'
  return `${Math.abs(days)} days ago`
}
