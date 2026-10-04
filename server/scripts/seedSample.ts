/**
 * Loads the optional sample dataset. This replaces everything in the database, so it refuses
 * to run against a database that already holds non-sample records unless --force is passed.
 */
import { systemClock } from '@/domain/clock'
import { hashPassword } from '../auth/passwords'
import { hashToken } from '../auth/tokens'
import { loadConfig } from '../config'
import { ORGANIZATION_ID, seedSampleData } from '../seed/sampleData'
import { openStorage } from '../storage'

export const SAMPLE_STAFF_PASSWORD = process.env.SAMPLE_STAFF_PASSWORD ?? 'cedar-grove-staff-2026'
export const SAMPLE_VENDOR_PASSWORD = process.env.SAMPLE_VENDOR_PASSWORD ?? 'cedar-grove-vendor-2026'

async function main(): Promise<void> {
  const force = process.argv.includes('--force')
  const config = loadConfig()
  const { db, databaseLabel } = await openStorage(config)

  const organizations = await db.read((uow) => uow.organizations.getAll())
  const hasOtherData = organizations.some((organization) => organization.id !== ORGANIZATION_ID)
  if (hasOtherData && !force) {
    console.error(
      'This database already contains an organization that is not the sample data.\n' +
        'Re-run with --force to replace everything, or point DOCKSY_DATA_DIR at a scratch directory.',
    )
    db.close()
    process.exit(1)
  }

  await seedSampleData(db, systemClock().now(), {
    hashPassword,
    hashToken,
    staffPassword: SAMPLE_STAFF_PASSWORD,
    vendorPassword: SAMPLE_VENDOR_PASSWORD,
  })
  const vendorCount = await db.read((uow) => uow.vendors.count())
  db.close()

  console.log(`Seeded the Cedar Grove sample organization with ${vendorCount} vendors.`)
  console.log(`Storage: ${databaseLabel}`)
  console.log('Staff sign-in:')
  console.log(`  dana.whitfield@example.com   admin        ${SAMPLE_STAFF_PASSWORD}`)
  console.log(`  marcus.reyes@example.com     coordinator  ${SAMPLE_STAFF_PASSWORD}`)
  console.log(`  priya.raman@example.com      reviewer     ${SAMPLE_STAFF_PASSWORD}`)
  console.log('Vendor contact sign-in (any seeded vendor contact email), for example:')
  console.log(`  damon.frazier@example.com    Ironwood Pest Control    ${SAMPLE_VENDOR_PASSWORD}`)
}

await main()
