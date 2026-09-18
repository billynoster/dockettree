import { INITIAL_DEMO_INSTANT } from '@/demo/clock'
import {
  ADMIN_USER_ID,
  COORDINATOR_USER_ID,
  DEFAULT_TIMEZONE,
  ORGANIZATION_ID,
  REVIEWER_USER_ID,
  seedDatabase,
  vendorIdFor,
} from '@/demo/fixtures'
import { instantForDemoDate } from '@/domain/dates'
import type { IsoDate, Role, UUID } from '@/domain/types'
import { IndexedDbDatabase } from '@/repositories/indexeddb/database'
import type { ServiceContext } from '@/services/context'

let databaseCounter = 0

export interface Harness {
  ctx: ServiceContext
  setDemoDate(date: IsoDate): void
  actAs(role: Role, vendorId?: UUID | null): void
  close(): void
}

const ACTORS: Record<Role, { id: UUID; label: string }> = {
  admin: { id: ADMIN_USER_ID, label: 'Dana Whitfield' },
  coordinator: { id: COORDINATOR_USER_ID, label: 'Marcus Reyes' },
  reviewer: { id: REVIEWER_USER_ID, label: 'Priya Raman' },
  vendor_contact: { id: 'vendor-contact-user', label: 'Vendor contact' },
}

export async function createHarness(role: Role = 'admin'): Promise<Harness> {
  databaseCounter += 1
  const db = await IndexedDbDatabase.open(`vendor-readiness-test-${databaseCounter}`)
  await seedDatabase(db, new Date(INITIAL_DEMO_INSTANT))

  let instant = INITIAL_DEMO_INSTANT
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
    setDemoDate(date) {
      instant = instantForDemoDate(date)
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
    },
  }
}

export { vendorIdFor }

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
