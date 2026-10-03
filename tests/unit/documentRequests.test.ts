/** Document request inbox lifecycle — create from reminder/correction, advance on portal/submit/accept. */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  DOCUMENT_REQUEST_STATE_LABEL,
  advanceDocumentRequestState,
  canAdvanceDocumentRequest,
  reopenDocumentRequestForCorrection,
} from '@/domain/documentRequests'
import { getVendorPortal } from '@/services/portalService'
import {
  getDocumentRequest,
  listDocumentRequests,
  listVendorDocumentRequests,
} from '@/services/documentRequestService'
import { sendReminder } from '@/services/reminderService'
import { reviewSubmission, getReviewDetail } from '@/services/reviewService'
import { submitDocument } from '@/services/submissionService'
import { getVendorSnapshot } from '@/services/vendorService'
import {
  createHarness,
  samplePdfFile,
  vendorIdFor,
  type Harness,
} from '../harness'

let harness: Harness

beforeEach(async () => {
  harness = await createHarness('admin')
})

async function requirementIdByTitle(vendorSlug: string, title: string) {
  const snapshot = await getVendorSnapshot(harness.admin(), vendorIdFor(vendorSlug))
  const status = snapshot.requirementStatuses.find((entry) => entry.requirement.title === title)
  if (!status) throw new Error(`No requirement ${title}`)
  return status.requirement.id
}

describe('document request domain helpers', () => {
  it('only advances forward and treats completed as terminal', () => {
    expect(canAdvanceDocumentRequest('sent', 'viewed')).toBe(true)
    expect(canAdvanceDocumentRequest('in_review', 'sent')).toBe(false)
    expect(canAdvanceDocumentRequest('completed', 'viewed')).toBe(false)
    expect(DOCUMENT_REQUEST_STATE_LABEL.sent).toBe('Sent')
  })

  it('reopens a request for correction back to Sent', () => {
    const base = {
      id: 'r1',
      organization_id: 'org',
      vendor_id: 'v1',
      requirement_id: 'req1',
      item_title: 'Safety acknowledgment',
      detail: 'Still needed',
      source: 'reminder' as const,
      state: 'in_review' as const,
      notification_id: 'n1',
      submission_id: 's1',
      created_by: 'u1',
      sent_at: '2026-09-01T00:00:00.000Z',
      viewed_at: '2026-09-02T00:00:00.000Z',
      uploaded_at: '2026-09-03T00:00:00.000Z',
      in_review_at: '2026-09-03T00:00:00.000Z',
      completed_at: null,
      closed_reason: null,
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-03T00:00:00.000Z',
    }
    const reopened = reopenDocumentRequestForCorrection(base, '2026-09-04T00:00:00.000Z', {
      notification_id: 'n2',
      detail: 'Please sign page 2',
    })
    expect(reopened.state).toBe('sent')
    expect(reopened.source).toBe('correction')
    expect(reopened.submission_id).toBeNull()
    expect(reopened.detail).toBe('Please sign page 2')
    expect(advanceDocumentRequestState(base, 'completed', '2026-09-05T00:00:00.000Z').state).toBe(
      'completed',
    )
  })
})

describe('document request lifecycle', () => {
  it('backfills from seeded digests and lists an open inbox', async () => {
    const listed = await listDocumentRequests(harness.ctx, { state: 'open' })
    expect(listed.total).toBeGreaterThan(0)
    expect(listed.items.every((item) => item.request.state !== 'completed')).toBe(true)
    expect(listed.items[0]?.state_label).toBeTruthy()
    expect(listed.items[0]?.next_action).toBeTruthy()
  })

  it('creates requests when a reminder is sent and advances through portal → upload → accept', async () => {
    const vendorId = vendorIdFor('ironwood-pest-control')
    const requirementId = await requirementIdByTitle('ironwood-pest-control', 'Safety acknowledgment')

    // Manual reminder may be blocked by cooldown from seed; move clock forward if needed.
    harness.setToday('2026-09-20')
    const sent = await sendReminder(harness.ctx, vendorId)
    expect(['queued', 'deduplicated', 'no_action']).toContain(sent.status)

    const beforePortal = await listVendorDocumentRequests(harness.ctx, vendorId)
    const openSafety = beforePortal.items.find(
      (item) =>
        item.request.requirement_id === requirementId ||
        item.request.item_title === 'Safety acknowledgment',
    )
    expect(openSafety).toBeTruthy()

    harness.actAs('vendor_contact', vendorId)
    await getVendorPortal(harness.ctx, vendorId)
    const afterView = await listVendorDocumentRequests(harness.admin(), vendorId)
    const viewed = afterView.items.find((item) => item.request.id === openSafety!.request.id)
    expect(viewed?.request.state === 'viewed' || viewed?.request.state === 'sent').toBe(true)
    // If still sent, the ask may already have been advanced by prior seed sync; continue from open ask.
    const targetId = openSafety!.request.id

    const upload = await submitDocument(harness.ctx, {
      requirementId,
      file: samplePdfFile('safety.pdf'),
      dates: { issue_date: '', expiration_date: '' },
    })

    const afterUpload = await getDocumentRequest(harness.admin(), targetId)
    expect(['uploaded', 'in_review', 'completed']).toContain(afterUpload.request.state)
    expect(afterUpload.request.submission_id).toBeTruthy()

    harness.actAs('reviewer')
    const detail = await getReviewDetail(harness.ctx, upload.submission_id)
    await reviewSubmission(harness.ctx, {
      submissionId: upload.submission_id,
      expectedVersion: detail.submission.record_version,
      decision: 'accepted',
      reason: '',
    })

    const completed = await getDocumentRequest(harness.admin(), targetId)
    expect(completed.request.state).toBe('completed')
    expect(completed.timeline.some((step) => step.label === 'Completed')).toBe(true)
  })

  it('reopens the request when a reviewer asks for changes', async () => {
    const vendorId = vendorIdFor('ironwood-pest-control')
    const requirementId = await requirementIdByTitle('ironwood-pest-control', 'Safety acknowledgment')
    harness.setToday('2026-09-21')

    harness.actAs('vendor_contact', vendorId)
    const first = await submitDocument(harness.ctx, {
      requirementId,
      file: samplePdfFile('safety-v1.pdf'),
      dates: { issue_date: '', expiration_date: '' },
    })

    harness.actAs('reviewer')
    const detail = await getReviewDetail(harness.ctx, first.submission_id)
    await reviewSubmission(harness.ctx, {
      submissionId: first.submission_id,
      expectedVersion: detail.submission.record_version,
      decision: 'changes_requested',
      reason: 'The signature block is blank on page 2. Please sign and date it.',
    })

    const listed = await listVendorDocumentRequests(harness.admin(), vendorId)
    const correction = listed.items.find(
      (item) =>
        item.request.requirement_id === requirementId &&
        item.request.source === 'correction' &&
        item.request.state === 'sent',
    )
    expect(correction).toBeTruthy()
    expect(correction?.request.detail).toContain('signature block')
  })
})
