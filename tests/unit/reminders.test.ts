import { describe, expect, it } from 'vitest'
import { computeRequirementStatuses } from '@/domain/readiness'
import {
  digestIdempotencyKey,
  missingItemMilestoneDay,
  planVendorReminder,
  renewalMilestone,
} from '@/domain/reminders'
import type { AssignedRequirement, Submission } from '@/domain/types'
import { makeRequirement, makeSubmission } from '../factories'

const TODAY = '2026-09-17'

function plan(
  requirements: AssignedRequirement[],
  submissions: Submission[],
  options: { invitedDate?: string | null; scheduled?: boolean; archived?: boolean } = {},
) {
  return planVendorReminder(
    {
      vendor_id: 'vendor-1',
      lifecycle: options.archived ? 'archived' : 'active',
      invitedDate: 'invitedDate' in options ? options.invitedDate! : '2026-08-01',
      requirements: computeRequirementStatuses(
        { vendor: { id: 'vendor-1', lifecycle: 'active' }, requirements, submissions },
        TODAY,
      ),
    },
    TODAY,
    { scheduled: options.scheduled ?? true },
  )
}

describe('missing-item cadence', () => {
  it('starts 3 days after the invitation and repeats every 7 days', () => {
    expect(missingItemMilestoneDay('2026-09-16', TODAY)).toBeNull()
    expect(missingItemMilestoneDay('2026-09-14', TODAY)).toBe(3)
    expect(missingItemMilestoneDay('2026-09-10', TODAY)).toBe(3)
    expect(missingItemMilestoneDay('2026-09-07', TODAY)).toBe(10)
    expect(missingItemMilestoneDay(null, TODAY)).toBeNull()
  })

  it('uses only the most recent milestone instead of backfilling missed ones', () => {
    const safety = makeRequirement({ title: 'Safety acknowledgment', expiration_required: false })
    const result = plan([safety], [], { invitedDate: '2026-06-01' })
    expect(result.vendorLines).toHaveLength(1)
    expect(result.vendorLines[0].milestone_key).toBe('missing:108')
  })

  it('skips requirements that are only awaiting review', () => {
    const safety = makeRequirement({ title: 'Safety acknowledgment', expiration_required: false })
    const pending = makeSubmission(safety, 'pending_review')
    const result = plan([safety], [pending])
    expect(result.vendorLines).toHaveLength(0)
    expect(result.skipReason).toBe('no_actionable_items')
  })

  it('includes an item whose changes were requested', () => {
    const safety = makeRequirement({ title: 'Safety acknowledgment', expiration_required: false })
    const rejected = makeSubmission(safety, 'changes_requested')
    const result = plan([safety], [rejected])
    expect(result.vendorLines[0].detail).toContain('Changes were requested')
  })

  it('requires an invitation for the scheduled job but not for a manual reminder', () => {
    const safety = makeRequirement({ title: 'Safety acknowledgment', expiration_required: false })
    expect(plan([safety], [], { invitedDate: null }).skipReason).toBe('not_invited')
    expect(plan([safety], [], { invitedDate: null, scheduled: false }).vendorLines).toHaveLength(1)
  })

  it('sends nothing for archived vendors', () => {
    const safety = makeRequirement({ title: 'Safety acknowledgment', expiration_required: false })
    expect(plan([safety], [], { archived: true }).skipReason).toBe('archived')
  })
})

describe('renewal cadence', () => {
  it('uses the most recent reached milestone', () => {
    expect(renewalMilestone('2026-11-30', TODAY)).toBeNull()
    expect(renewalMilestone('2026-10-17', TODAY)).toBe(30)
    expect(renewalMilestone('2026-10-10', TODAY)).toBe(30)
    expect(renewalMilestone('2026-10-01', TODAY)).toBe(14)
    expect(renewalMilestone('2026-09-28', TODAY)).toBe(14)
    expect(renewalMilestone('2026-09-22', TODAY)).toBe(7)
    expect(renewalMilestone('2026-09-17', TODAY)).toBe(0)
    expect(renewalMilestone('2026-09-10', TODAY)).toBe('expired')
  })

  it('stops renewal reminders while a replacement is pending', () => {
    const insurance = makeRequirement({ title: 'Insurance certificate' })
    const current = makeSubmission(insurance, 'accepted', {
      expiration_date: '2026-10-01',
      version_number: 1,
    })
    insurance.effective_submission_id = current.id
    const pending = makeSubmission(insurance, 'pending_review', {
      expiration_date: '2027-10-01',
      version_number: 2,
    })

    expect(plan([insurance], [current]).vendorLines).toHaveLength(1)
    expect(plan([insurance], [current, pending]).vendorLines).toHaveLength(0)
  })

  it('notifies internally about an expired document even when a replacement is pending', () => {
    const insurance = makeRequirement({ title: 'Insurance certificate' })
    const expired = makeSubmission(insurance, 'accepted', {
      expiration_date: '2026-09-10',
      version_number: 1,
    })
    insurance.effective_submission_id = expired.id
    const pending = makeSubmission(insurance, 'pending_review', {
      expiration_date: '2027-09-10',
      version_number: 2,
    })

    const result = plan([insurance], [expired, pending])
    expect(result.vendorLines).toHaveLength(0)
    expect(result.internalLines).toHaveLength(1)
    expect(result.internalLines[0].detail).toContain('replacement is awaiting review')
  })
})

describe('deduplication keys', () => {
  it('keys a digest by organization, vendor, local date and channel', () => {
    expect(digestIdempotencyKey('org-1', 'vendor-1', TODAY)).toBe(
      'digest:org-1:vendor-1:2026-09-17:email',
    )
  })
})
