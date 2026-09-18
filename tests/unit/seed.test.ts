/** Seed assertions for the exact distribution required by requirements section 10. */
import { beforeAll, describe, expect, it } from 'vitest'
import { SEED_EXPECTATIONS, vendorIdFor } from '../../server/seed/sampleData'
import { listReviewQueue } from '@/services/reviewService'
import { getOverview } from '@/services/overviewService'
import { getVendorSnapshot, listVendors } from '@/services/vendorService'
import { createHarness, type Harness } from '../harness'

let harness: Harness

beforeAll(async () => {
  harness = await createHarness('admin')
})

describe('seeded demonstration data', () => {
  it('matches the required primary count distribution', async () => {
    const overview = await getOverview(harness.ctx)
    expect(overview.today).toBe('2026-09-17')
    expect(overview.counts.active).toBe(10)
    expect(overview.counts.ready).toBe(4)
    expect(overview.counts.not_ready).toBe(3)
    expect(overview.counts.awaiting_review).toBe(2)
    expect(overview.counts.unconfigured).toBe(1)
    expect(overview.counts.archived).toBe(2)
    expect(
      overview.counts.ready +
        overview.counts.awaiting_review +
        overview.counts.not_ready +
        overview.counts.unconfigured,
    ).toBe(overview.counts.active)
  })

  it('flags exactly two Ready vendors as expiring soon', async () => {
    const list = await listVendors(harness.ctx, { lifecycle: 'all' })
    const expiring = list.rows.filter((row) => row.readiness.expiringSoon)
    expect(expiring).toHaveLength(SEED_EXPECTATIONS.expiring_soon)
    expect(expiring.every((row) => row.readiness.status === 'ready')).toBe(true)
    expect(expiring.map((row) => row.vendor.company_name).sort()).toEqual([
      'Cedar Line Landscaping',
      'Riverstone Mechanical Services',
    ])
  })

  it('gives every seeded vendor its documented readiness status', async () => {
    for (const expectation of SEED_EXPECTATIONS.byVendor) {
      const snapshot = await getVendorSnapshot(harness.ctx, vendorIdFor(expectation.slug))
      expect(snapshot.readiness.status, expectation.company_name).toBe(expectation.expected)
      expect(snapshot.readiness.expiringSoon, expectation.company_name).toBe(
        expectation.expectedExpiringSoon,
      )
    }
  })

  it('covers the required edge cases', async () => {
    const readyWithPendingRenewal = await getVendorSnapshot(
      harness.ctx,
      vendorIdFor('riverstone-mechanical'),
    )
    expect(readyWithPendingRenewal.readiness.status).toBe('ready')
    expect(readyWithPendingRenewal.readiness.pendingSubmissionCount).toBe(1)

    const expiredWithPendingRenewal = await getVendorSnapshot(
      harness.ctx,
      vendorIdFor('summit-fire-protection'),
    )
    expect(expiredWithPendingRenewal.readiness.status).toBe('not_ready')
    expect(expiredWithPendingRenewal.readiness.blockers[0].reason).toBe('expired_replacement_pending')

    const corrections = await getVendorSnapshot(harness.ctx, vendorIdFor('harborview-plumbing'))
    expect(corrections.readiness.blockers.map((blocker) => blocker.reason)).toEqual([
      'changes_requested',
    ])

    const missing = await getVendorSnapshot(harness.ctx, vendorIdFor('ironwood-pest-control'))
    expect(missing.readiness.blockers.map((blocker) => blocker.label)).toEqual([
      'Safety acknowledgment missing',
    ])

    const awaiting = await getVendorSnapshot(harness.ctx, vendorIdFor('lakeside-window-care'))
    expect(awaiting.readiness.status).toBe('awaiting_review')
    expect(awaiting.readiness.requiredSatisfied).toBe(0)

    const optionalMissing = await getVendorSnapshot(harness.ctx, vendorIdFor('bluewater-janitorial'))
    expect(optionalMissing.readiness.status).toBe('ready')
    const brochure = optionalMissing.requirementStatuses.find(
      (status) => status.requirement.title === 'Company brochure',
    )
    expect(brochure?.satisfied).toBe(false)
    expect(brochure?.requirement.required).toBe(false)
  })

  it('counts pending submissions, not vendors, and excludes archived vendors', async () => {
    const queue = await listReviewQueue(harness.ctx)
    expect(queue.total).toBe(7)
    const archivedVendorId = vendorIdFor('meadowbrook-courier')
    expect(queue.items.some((item) => item.vendor.id === archivedVendorId)).toBe(false)
    // Oldest first.
    const timestamps = queue.items.map((item) => item.submission.submitted_at)
    expect([...timestamps].sort()).toEqual(timestamps)
  })

  it('stores real sample document bytes for every seeded submission', async () => {
    const files = await harness.ctx.db.read((uow) => uow.files.getAll())
    expect(files.length).toBeGreaterThan(20)
    expect(files.every((file) => file.byte_size > 400)).toBe(true)
    const blobs = await harness.ctx.db.read(async (uow) => {
      const found = await Promise.all(files.map((file) => uow.blobs.get(file.storage_key)))
      return found
    })
    expect(blobs.every((blob) => blob !== undefined)).toBe(true)
  })
})
