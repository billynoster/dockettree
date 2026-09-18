/** Business-rule tests for requirements section 5.4 and the section 11 expectations table. */
import { describe, expect, it } from 'vitest'
import { computeRequirementStatus, computeVendorReadiness, countReadiness } from '@/domain/readiness'
import type { AssignedRequirement, Submission } from '@/domain/types'
import { makeRequirement, makeSubmission } from '../factories'

const TODAY = '2026-09-17'

function readiness(
  requirements: AssignedRequirement[],
  submissions: Submission[],
  lifecycle: 'active' | 'archived' = 'active',
  today = TODAY,
) {
  return computeVendorReadiness(
    { vendor: { id: 'vendor-1', lifecycle }, requirements, submissions },
    today,
  )
}

describe('requirement satisfaction', () => {
  it('treats a required accepted document with no expiration as satisfied', () => {
    const requirement = makeRequirement({ expiration_required: false, title: 'Service agreement' })
    const accepted = makeSubmission(requirement, 'accepted')
    requirement.effective_submission_id = accepted.id

    const status = computeRequirementStatus(requirement, [accepted], TODAY)
    expect(status.satisfied).toBe(true)
    expect(status.currentDocument).toBe('accepted')
    expect(status.blocker).toBeNull()
  })

  it('keeps a document valid on its expiration date and flags it as expiring', () => {
    const requirement = makeRequirement()
    const accepted = makeSubmission(requirement, 'accepted', { expiration_date: TODAY })
    requirement.effective_submission_id = accepted.id

    const status = computeRequirementStatus(requirement, [accepted], TODAY)
    expect(status.satisfied).toBe(true)
    expect(status.currentDocument).toBe('expiring_soon')
    expect(status.daysUntilExpiration).toBe(0)
    expect(readiness([requirement], [accepted]).expiringSoon).toBe(true)
  })

  it('treats a document that expired yesterday as unsatisfied', () => {
    const requirement = makeRequirement()
    const accepted = makeSubmission(requirement, 'accepted', { expiration_date: '2026-09-16' })
    requirement.effective_submission_id = accepted.id

    const status = computeRequirementStatus(requirement, [accepted], TODAY)
    expect(status.satisfied).toBe(false)
    expect(status.currentDocument).toBe('expired')
    expect(status.blocker?.label).toBe('Insurance certificate expired')
  })

  it('does not flag an already expired document as expiring soon', () => {
    const requirement = makeRequirement()
    const accepted = makeSubmission(requirement, 'accepted', { expiration_date: '2026-09-16' })
    requirement.effective_submission_id = accepted.id
    expect(readiness([requirement], [accepted]).expiringSoon).toBe(false)
  })

  it('flags a document expiring exactly 30 days out and not 31 days out', () => {
    const requirement = makeRequirement()
    const inWindow = makeSubmission(requirement, 'accepted', { expiration_date: '2026-10-17' })
    requirement.effective_submission_id = inWindow.id
    expect(readiness([requirement], [inWindow]).expiringSoon).toBe(true)

    const outside = makeSubmission(requirement, 'accepted', { expiration_date: '2026-10-18' })
    requirement.effective_submission_id = outside.id
    expect(readiness([requirement], [outside]).expiringSoon).toBe(false)
  })
})

describe('vendor readiness status', () => {
  it('is Unconfigured with no required items, even when optional items exist', () => {
    const optional = makeRequirement({ required: false, title: 'Company brochure' })
    expect(readiness([optional], []).status).toBe('unconfigured')
  })

  it('is Ready when every required item has a valid accepted document', () => {
    const insurance = makeRequirement({ title: 'Insurance certificate' })
    const insuranceDoc = makeSubmission(insurance, 'accepted', { expiration_date: '2027-01-01' })
    insurance.effective_submission_id = insuranceDoc.id
    const agreement = makeRequirement({ title: 'Service agreement', expiration_required: false })
    const agreementDoc = makeSubmission(agreement, 'accepted')
    agreement.effective_submission_id = agreementDoc.id

    const result = readiness([insurance, agreement], [insuranceDoc, agreementDoc])
    expect(result.status).toBe('ready')
    expect(result.requiredSatisfied).toBe(2)
    expect(result.blockers).toHaveLength(0)
  })

  it('is Awaiting review when all unsatisfied required items have a pending submission', () => {
    const insurance = makeRequirement({ title: 'Insurance certificate' })
    const pendingInsurance = makeSubmission(insurance, 'pending_review', { expiration_date: '2027-01-01' })
    const agreement = makeRequirement({ title: 'Service agreement', expiration_required: false })
    const pendingAgreement = makeSubmission(agreement, 'pending_review')

    const result = readiness([insurance, agreement], [pendingInsurance, pendingAgreement])
    expect(result.status).toBe('awaiting_review')
    expect(result.blockers.map((blocker) => blocker.label)).toEqual([
      'Insurance certificate awaiting review',
      'Service agreement awaiting review',
    ])
  })

  it('is Not ready when an effective required document expired even with a pending replacement', () => {
    const insurance = makeRequirement({ title: 'Insurance certificate' })
    const expired = makeSubmission(insurance, 'accepted', {
      expiration_date: '2026-09-10',
      version_number: 1,
    })
    insurance.effective_submission_id = expired.id
    const replacement = makeSubmission(insurance, 'pending_review', {
      expiration_date: '2027-09-10',
      version_number: 2,
    })

    const result = readiness([insurance], [expired, replacement])
    expect(result.status).toBe('not_ready')
    expect(result.blockers[0].label).toBe('Insurance certificate expired (renewal awaiting review)')
  })

  it('is Not ready with one missing and one pending item, showing both blockers', () => {
    const safety = makeRequirement({ title: 'Safety acknowledgment', expiration_required: false })
    const agreement = makeRequirement({ title: 'Service agreement', expiration_required: false })
    const pending = makeSubmission(agreement, 'pending_review')

    const result = readiness([safety, agreement], [pending])
    expect(result.status).toBe('not_ready')
    expect(result.blockers.map((blocker) => blocker.label)).toEqual([
      'Safety acknowledgment missing',
      'Service agreement awaiting review',
    ])
  })

  it('stays Ready with a valid effective document and a pending renewal', () => {
    const insurance = makeRequirement({ title: 'Insurance certificate' })
    const current = makeSubmission(insurance, 'accepted', {
      expiration_date: '2026-10-05',
      version_number: 1,
    })
    insurance.effective_submission_id = current.id
    const renewal = makeSubmission(insurance, 'pending_review', {
      expiration_date: '2027-10-05',
      version_number: 2,
    })

    const result = readiness([insurance], [current, renewal])
    expect(result.status).toBe('ready')
    expect(result.expiringSoon).toBe(true)
  })

  it('stays Ready with a valid effective document and a rejected renewal', () => {
    const insurance = makeRequirement({ title: 'Insurance certificate' })
    const current = makeSubmission(insurance, 'accepted', {
      expiration_date: '2027-02-01',
      version_number: 1,
    })
    insurance.effective_submission_id = current.id
    const rejected = makeSubmission(insurance, 'changes_requested', {
      expiration_date: '2028-02-01',
      version_number: 2,
    })

    expect(readiness([insurance], [current, rejected]).status).toBe('ready')
  })

  it('is Not ready after revoking the effective acceptance, with no fallback to an older version', () => {
    const insurance = makeRequirement({ title: 'Insurance certificate' })
    const older = makeSubmission(insurance, 'superseded', {
      expiration_date: '2027-01-01',
      version_number: 1,
    })
    const revoked = makeSubmission(insurance, 'revoked', {
      expiration_date: '2027-06-01',
      version_number: 2,
    })
    insurance.effective_submission_id = null

    const result = readiness([insurance], [older, revoked])
    expect(result.status).toBe('not_ready')
    expect(result.blockers[0].label).toBe('Insurance certificate acceptance revoked')
  })

  it('ignores optional items that are missing or expired', () => {
    const insurance = makeRequirement({ title: 'Insurance certificate' })
    const current = makeSubmission(insurance, 'accepted', { expiration_date: '2027-05-01' })
    insurance.effective_submission_id = current.id
    const brochure = makeRequirement({ required: false, title: 'Company brochure' })
    const expiredBrochure = makeSubmission(brochure, 'accepted', { expiration_date: '2026-01-01' })
    brochure.effective_submission_id = expiredBrochure.id

    const result = readiness([insurance, brochure], [current, expiredBrochure])
    expect(result.status).toBe('ready')
    expect(result.expiringSoon).toBe(false)
    expect(result.blockers).toHaveLength(0)
  })

  it('excludes retired requirements from the calculation but keeps their submissions', () => {
    const retired = makeRequirement({
      title: 'Retired item',
      retired_at: '2026-09-01T00:00:00.000Z',
    })
    const insurance = makeRequirement({ title: 'Insurance certificate' })
    const current = makeSubmission(insurance, 'accepted', { expiration_date: '2027-05-01' })
    insurance.effective_submission_id = current.id
    const retiredSubmission = makeSubmission(retired, 'changes_requested')

    const result = readiness([retired, insurance], [current, retiredSubmission])
    expect(result.status).toBe('ready')
    expect(result.requiredTotal).toBe(1)
  })

  it('reports Archived regardless of document state', () => {
    const insurance = makeRequirement()
    expect(readiness([insurance], [], 'archived').status).toBe('archived')
  })
})

describe('dashboard counts', () => {
  it('partitions active vendors and treats expiring soon as an overlapping flag', () => {
    const insurance = makeRequirement()
    const expiring = makeSubmission(insurance, 'accepted', { expiration_date: '2026-09-25' })
    insurance.effective_submission_id = expiring.id

    const counts = countReadiness([
      readiness([insurance], [expiring]),
      readiness([makeRequirement({ title: 'Missing item' })], []),
      readiness([makeRequirement({ required: false })], []),
      readiness([makeRequirement()], [], 'archived'),
    ])

    expect(counts.active).toBe(3)
    expect(counts.ready + counts.awaiting_review + counts.not_ready + counts.unconfigured).toBe(
      counts.active,
    )
    expect(counts.expiring_soon).toBe(1)
    expect(counts.archived).toBe(1)
  })
})
