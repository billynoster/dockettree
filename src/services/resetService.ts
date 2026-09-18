/** Demo reset (requirements FR-14): clears records, blobs and the outbox, then reseeds. */
import { INITIAL_DEMO_INSTANT } from '@/demo/clock'
import { seedDatabase } from '@/demo/fixtures'
import type { Database } from '@/repositories/types'

export interface ResetResult {
  seededAt: string
  clockInstant: string
}

export async function resetDemoData(db: Database): Promise<ResetResult> {
  const instant = new Date(INITIAL_DEMO_INSTANT)
  await seedDatabase(db, instant)
  return { seededAt: new Date().toISOString(), clockInstant: instant.toISOString() }
}

/** Seeds only when the database is empty, so a refresh keeps existing demo work. */
export async function ensureSeeded(db: Database): Promise<boolean> {
  const count = await db.read((uow) => uow.vendors.count())
  if (count > 0) return false
  await seedDatabase(db, new Date(INITIAL_DEMO_INSTANT))
  return true
}
