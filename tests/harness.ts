/**
 * Test harness: the real SQLite adapter and local file store on a temporary directory, the
 * real service layer, and a clock pinned to the seed instant so date-boundary assertions are
 * deterministic. Business rules are therefore exercised exactly as the server runs them.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fixedClock } from '@/domain/clock'
import type { IsoDate, Role, UUID } from '@/domain/types'
import type { Database } from '@/repositories/types'
import type { ServiceContext } from '@/services/context'
import { SqliteDatabase } from '../server/db/sqliteDatabase'
import { LocalBlobStore } from '../server/files/localBlobStore'
import { AppError } from '@/domain/errors'
import { hashToken, newToken } from '../server/auth/tokens'
import {
  ADMIN_USER_ID,
  COORDINATOR_USER_ID,
  DEFAULT_TIMEZONE,
  ORGANIZATION_ID,
  REVIEWER_USER_ID,
  seedSampleData,
  vendorIdFor,
} from '../server/seed/sampleData'

/** The sample dataset is written relative to this day, and so are the test expectations. */
export const TEST_TODAY: IsoDate = '2026-09-17'
const TEST_INSTANT = `${TEST_TODAY}T12:00:00.000Z`

export interface Harness {
  ctx: ServiceContext
  db: Database
  dataDir: string
  /** Moves the clock, exactly as the passage of real time would. */
  setToday(date: IsoDate): void
  actAs(role: Role, vendorId?: UUID | null): void
  /** An admin context on the same data, for reads the acting role may not perform. */
  admin(): ServiceContext
  close(): void
}

const ACTORS: Record<Role, { id: UUID; label: string }> = {
  admin: { id: ADMIN_USER_ID, label: 'Dana Whitfield' },
  coordinator: { id: COORDINATOR_USER_ID, label: 'Marcus Reyes' },
  reviewer: { id: REVIEWER_USER_ID, label: 'Priya Raman' },
  vendor_contact: { id: 'vendor-contact-user', label: 'Vendor contact' },
}

/** A fast stand-in for scrypt: seeded accounts never sign in during service tests. */
const fastHash = async (password: string) => `scrypt$test$${password}`

export function createDatabase(): { db: SqliteDatabase; dataDir: string } {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'docksy-test-'))
  const db = new SqliteDatabase({
    file: path.join(dataDir, 'test.sqlite'),
    blobs: new LocalBlobStore(path.join(dataDir, 'uploads')),
  })
  return { db, dataDir }
}

export async function seedForTests(db: Database, now = new Date(TEST_INSTANT)): Promise<void> {
  await seedSampleData(db, now, {
    hashPassword: fastHash,
    hashToken,
    staffPassword: 'test-staff-password',
    vendorPassword: 'test-vendor-password',
  })
}

export async function createHarness(role: Role = 'admin'): Promise<Harness> {
  const { db, dataDir } = createDatabase()
  await seedForTests(db)

  let instant = TEST_INSTANT
  const ctx: ServiceContext = {
    db,
    clock: {
      now: () => new Date(instant),
      nowIso: () => instant,
    },
    session: {
      role,
      userId: ACTORS[role].id,
      userLabel: ACTORS[role].label,
      vendorId: null,
    },
    organizationId: ORGANIZATION_ID,
    timezone: DEFAULT_TIMEZONE,
  }

  return {
    ctx,
    db,
    dataDir,
    setToday(date) {
      instant = `${date}T12:00:00.000Z`
      ctx.clock = fixedClock(instant)
    },
    admin() {
      return {
        ...ctx,
        clock: fixedClock(instant),
        session: {
          role: 'admin',
          userId: ACTORS.admin.id,
          userLabel: ACTORS.admin.label,
          vendorId: null,
        },
      }
    },
    actAs(nextRole, vendorId = null) {
      ctx.session = {
        role: nextRole,
        userId: ACTORS[nextRole].id,
        userLabel: ACTORS[nextRole].label,
        vendorId,
      }
    },
    close() {
      db.close()
      rmSync(dataDir, { recursive: true, force: true })
    },
  }
}

export { vendorIdFor, ORGANIZATION_ID, DEFAULT_TIMEZONE }

/** Real token factory: the invitation token is random and only its hash is stored. */
export const testTokens = { create: newToken, hash: hashToken }

export const testHasher = {
  hash: fastHash,
  assertPolicy: (password: string, field = 'password') => {
    if (password.length < 12) {
      throw new AppError('validation', 'Choose a longer password.', {
        fieldErrors: { [field]: 'Use at least 12 characters.' },
      })
    }
  },
}

export function samplePdfFile(name = 'sample.pdf'): File {
  const pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'
  const bytes = new Uint8Array(pdf.length)
  for (let i = 0; i < pdf.length; i += 1) bytes[i] = pdf.charCodeAt(i)
  return new File([bytes], name, { type: 'application/pdf' })
}

export function oversizedFile(): File {
  const bytes = new Uint8Array(11 * 1024 * 1024)
  bytes[0] = 0x25
  bytes[1] = 0x50
  bytes[2] = 0x44
  bytes[3] = 0x46
  return new File([bytes], 'huge.pdf', { type: 'application/pdf' })
}

export function textFileDisguisedAsPdf(): File {
  return new File([new TextEncoder().encode('not really a pdf')], 'notes.pdf', {
    type: 'application/pdf',
  })
}

export function emptyFile(): File {
  return new File([], 'empty.pdf', { type: 'application/pdf' })
}
