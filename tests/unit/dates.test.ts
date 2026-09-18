import { describe, expect, it } from 'vitest'
import {
  addDays,
  daysBetween,
  daysUntilExpiration,
  isExpiredOn,
  isExpiringSoonOn,
  isIsoDate,
  todayInTimeZone,
} from '@/domain/dates'

describe('organization-local dates', () => {
  it('resolves today in the organization timezone, not UTC', () => {
    // 03:30 UTC on 2026-09-18 is still 2026-09-17 in America/Chicago.
    const instant = new Date('2026-09-18T03:30:00.000Z')
    expect(todayInTimeZone(instant, 'America/Chicago')).toBe('2026-09-17')
    expect(todayInTimeZone(instant, 'UTC')).toBe('2026-09-18')
  })

  it('respects the organization-local expiration boundary across UTC midnight', () => {
    const instant = new Date('2026-09-18T04:00:00.000Z')
    const chicagoToday = todayInTimeZone(instant, 'America/Chicago')
    const utcToday = todayInTimeZone(instant, 'UTC')
    expect(isExpiredOn('2026-09-17', chicagoToday)).toBe(false)
    expect(isExpiredOn('2026-09-17', utcToday)).toBe(true)
  })

  it('counts whole days between date-only values', () => {
    expect(daysBetween('2026-09-17', '2026-10-17')).toBe(30)
    expect(daysUntilExpiration('2026-09-17', '2026-09-17')).toBe(0)
    expect(daysUntilExpiration('2026-09-10', '2026-09-17')).toBe(-7)
    expect(addDays('2026-09-17', 14)).toBe('2026-10-01')
  })

  it('includes both ends of the 30-day expiring window', () => {
    expect(isExpiringSoonOn('2026-09-17', '2026-09-17')).toBe(true)
    expect(isExpiringSoonOn('2026-10-17', '2026-09-17')).toBe(true)
    expect(isExpiringSoonOn('2026-10-18', '2026-09-17')).toBe(false)
    expect(isExpiringSoonOn('2026-09-16', '2026-09-17')).toBe(false)
  })

  it('rejects impossible calendar dates', () => {
    expect(isIsoDate('2026-02-31')).toBe(false)
    expect(isIsoDate('2026-9-1')).toBe(false)
    expect(isIsoDate('2026-02-28')).toBe(true)
  })
})
