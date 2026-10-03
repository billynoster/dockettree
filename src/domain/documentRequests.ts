/**
 * Document request inbox lifecycle (product Requests surface).
 *
 * A request is one item asked of a vendor (usually one checklist requirement). It progresses
 * Sent → Viewed → Uploaded → In Review → Completed, mapped onto reminder/correction outbox
 * rows, portal opens, submissions, and review decisions.
 */
import type { DocumentRequest, DocumentRequestState, IsoDateTime } from './types'

export const DOCUMENT_REQUEST_STATES: DocumentRequestState[] = [
  'sent',
  'viewed',
  'uploaded',
  'in_review',
  'completed',
]

export const DOCUMENT_REQUEST_STATE_LABEL: Record<DocumentRequestState, string> = {
  sent: 'Sent',
  viewed: 'Viewed',
  uploaded: 'Uploaded',
  in_review: 'In Review',
  completed: 'Completed',
}

/** Next-step copy for staff. Vendors see a shorter variant in the portal. */
export const DOCUMENT_REQUEST_NEXT_ACTION: Record<DocumentRequestState, string> = {
  sent: 'Waiting for the vendor to open the request',
  viewed: 'Waiting for the vendor to upload the document',
  uploaded: 'Open the review queue for this submission',
  in_review: 'Review the uploaded document',
  completed: 'No further action',
}

export const DOCUMENT_REQUEST_VENDOR_NEXT_ACTION: Record<DocumentRequestState, string> = {
  sent: 'Open this item and upload the document',
  viewed: 'Upload the requested document',
  uploaded: 'Waiting for review',
  in_review: 'Waiting for review',
  completed: 'This request is complete',
}

const STATE_RANK: Record<DocumentRequestState, number> = {
  sent: 0,
  viewed: 1,
  uploaded: 2,
  in_review: 3,
  completed: 4,
}

export function isOpenDocumentRequest(state: DocumentRequestState): boolean {
  return state !== 'completed'
}

export function canAdvanceDocumentRequest(
  current: DocumentRequestState,
  next: DocumentRequestState,
): boolean {
  if (current === 'completed') return false
  return STATE_RANK[next] >= STATE_RANK[current]
}

/** Advance only forward (or same). Completed is terminal. */
export function advanceDocumentRequestState(
  request: DocumentRequest,
  next: DocumentRequestState,
  at: IsoDateTime,
  extras: Partial<
    Pick<DocumentRequest, 'submission_id' | 'notification_id' | 'detail' | 'closed_reason'>
  > = {},
): DocumentRequest {
  if (request.state === 'completed' || !canAdvanceDocumentRequest(request.state, next)) {
    return request
  }
  const updated: DocumentRequest = {
    ...request,
    ...extras,
    state: next,
    updated_at: at,
  }
  if (next === 'viewed' && !updated.viewed_at) updated.viewed_at = at
  if (next === 'uploaded' && !updated.uploaded_at) updated.uploaded_at = at
  if (next === 'in_review' && !updated.in_review_at) updated.in_review_at = at
  if (next === 'completed' && !updated.completed_at) updated.completed_at = at
  return updated
}

/**
 * Reset an open request when a reviewer asks for changes. A correction is a new ask, so the
 * same row returns to Sent with fresh timestamps rather than inventing a sixth state.
 */
export function reopenDocumentRequestForCorrection(
  request: DocumentRequest,
  at: IsoDateTime,
  input: { notification_id: string; detail: string },
): DocumentRequest {
  return {
    ...request,
    source: 'correction',
    state: 'sent',
    notification_id: input.notification_id,
    submission_id: null,
    detail: input.detail,
    sent_at: at,
    viewed_at: null,
    uploaded_at: null,
    in_review_at: null,
    completed_at: null,
    closed_reason: null,
    updated_at: at,
  }
}

export function nextActionFor(
  request: DocumentRequest,
  audience: 'staff' | 'vendor' = 'staff',
): string {
  const map =
    audience === 'vendor' ? DOCUMENT_REQUEST_VENDOR_NEXT_ACTION : DOCUMENT_REQUEST_NEXT_ACTION
  return map[request.state]
}
