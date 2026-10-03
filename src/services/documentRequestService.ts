/**
 * Requests inbox: first-class document/info asks tied to reminder digests, correction
 * notices, portal opens, submissions, and review decisions. SMTP still queues only —
 * creating a request does not require delivery.
 */
import {
  advanceDocumentRequestState,
  DOCUMENT_REQUEST_NEXT_ACTION,
  DOCUMENT_REQUEST_STATE_LABEL,
  DOCUMENT_REQUEST_VENDOR_NEXT_ACTION,
  isOpenDocumentRequest,
  nextActionFor,
  reopenDocumentRequestForCorrection,
} from '@/domain/documentRequests'
import { forbidden } from '@/domain/errors'
import { newId } from '@/domain/ids'
import { can } from '@/domain/permissions'
import type {
  DocumentRequest,
  DocumentRequestSource,
  DocumentRequestState,
  IsoDateTime,
  Notification,
  NotificationItem,
  UUID,
  Vendor,
} from '@/domain/types'
import type { UnitOfWork } from '@/repositories/types'
import { nowIso, type ServiceContext } from './context'
import { requireOwned } from './queries'

export interface DocumentRequestListItem {
  request: DocumentRequest
  vendor: { id: UUID; company_name: string }
  state_label: string
  next_action: string
}

export interface DocumentRequestDetail extends DocumentRequestListItem {
  timeline: { at: IsoDateTime; label: string; detail: string | null }[]
  vendor_contact: { name: string; email: string }
}

export interface DocumentRequestListResult {
  items: DocumentRequestListItem[]
  total: number
  vendors: { id: UUID; company_name: string }[]
  stateCounts: Record<DocumentRequestState, number>
}

export interface DocumentRequestQuery {
  vendorId?: string | null
  state?: DocumentRequestState | 'open' | 'all' | null
  limit?: number
}

function sourceFromNotification(type: Notification['type']): DocumentRequestSource {
  if (type === 'correction_requested') return 'correction'
  if (type === 'vendor_digest') return 'reminder'
  return 'manual'
}

function emptyStateCounts(): Record<DocumentRequestState, number> {
  return { sent: 0, viewed: 0, uploaded: 0, in_review: 0, completed: 0 }
}

async function vendorMap(uow: UnitOfWork, organizationId: UUID): Promise<Map<UUID, Vendor>> {
  const vendors = (await uow.vendors.where('by_organization', organizationId)).filter(
    (vendor) => vendor.organization_id === organizationId,
  )
  return new Map(vendors.map((vendor) => [vendor.id, vendor]))
}

function toListItem(
  request: DocumentRequest,
  vendor: Vendor | undefined,
  audience: 'staff' | 'vendor',
): DocumentRequestListItem {
  return {
    request,
    vendor: {
      id: request.vendor_id,
      company_name: vendor?.company_name ?? 'Unknown vendor',
    },
    state_label: DOCUMENT_REQUEST_STATE_LABEL[request.state],
    next_action: nextActionFor(request, audience),
  }
}

function timelineFor(request: DocumentRequest): DocumentRequestDetail['timeline'] {
  const steps: DocumentRequestDetail['timeline'] = [
    { at: request.sent_at, label: 'Sent', detail: request.detail },
  ]
  if (request.viewed_at) {
    steps.push({ at: request.viewed_at, label: 'Viewed', detail: 'Vendor opened the portal' })
  }
  if (request.uploaded_at) {
    steps.push({
      at: request.uploaded_at,
      label: 'Uploaded',
      detail: 'A document was submitted for this item',
    })
  }
  if (request.in_review_at) {
    steps.push({
      at: request.in_review_at,
      label: 'In Review',
      detail: 'Submission is awaiting a decision',
    })
  }
  if (request.completed_at) {
    steps.push({
      at: request.completed_at,
      label: 'Completed',
      detail: request.closed_reason ?? 'Document accepted',
    })
  }
  return steps
}

/**
 * Create inbox rows for each line on a digest/correction notification. Idempotent on
 * notification_id + requirement_id (or item title when requirement is null).
 */
export async function createRequestsFromNotification(
  uow: UnitOfWork,
  ctx: ServiceContext,
  notification: Notification,
  options: { actorId?: UUID | 'system' } = {},
): Promise<DocumentRequest[]> {
  if (notification.type !== 'vendor_digest' && notification.type !== 'correction_requested') {
    return []
  }
  if (!notification.vendor_id) return []

  const existing = (await uow.documentRequests.where('by_notification', notification.id)).filter(
    (row) => row.organization_id === ctx.organizationId,
  )
  if (existing.length > 0) return existing

  const items: NotificationItem[] =
    notification.items.length > 0
      ? notification.items
      : [
          {
            requirement_id: null,
            requirement_title: notification.subject.replace(/^Reminder:\s*/i, '').trim() || 'Documents',
            milestone_key: 'digest',
            detail: notification.subject,
            submission_version: null,
          },
        ]

  const vendorRequirements = (
    await uow.requirements.where('by_vendor', notification.vendor_id)
  ).filter((row) => row.organization_id === ctx.organizationId && row.retired_at === null)

  const resolveRequirementId = (item: NotificationItem): UUID | null => {
    if (item.requirement_id) return item.requirement_id
    const match = vendorRequirements.find(
      (row) => row.title.toLowerCase() === item.requirement_title.toLowerCase(),
    )
    return match?.id ?? null
  }

  const timestamp = notification.created_at
  const source = sourceFromNotification(notification.type)
  const actor = options.actorId ?? (notification.manual ? ctx.session.userId : 'system')
  const created: DocumentRequest[] = []

  for (const item of items) {
    const requirementId = resolveRequirementId(item)
    // Corrections reopen the open ask for the same requirement instead of stacking rows.
    if (source === 'correction' && requirementId) {
      const openForRequirement = (await uow.documentRequests.where('by_requirement', requirementId))
        .filter(
          (row) =>
            row.organization_id === ctx.organizationId &&
            row.vendor_id === notification.vendor_id &&
            isOpenDocumentRequest(row.state),
        )
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      const prior = openForRequirement[0]
      if (prior) {
        const reopened = reopenDocumentRequestForCorrection(prior, timestamp, {
          notification_id: notification.id,
          detail: item.detail,
        })
        await uow.documentRequests.put(reopened)
        created.push(reopened)
        continue
      }
    }

    const row: DocumentRequest = {
      id: newId(),
      organization_id: ctx.organizationId,
      vendor_id: notification.vendor_id,
      requirement_id: requirementId,
      item_title: item.requirement_title,
      detail: item.detail,
      source,
      state: 'sent',
      notification_id: notification.id,
      submission_id: null,
      created_by: actor,
      sent_at: timestamp,
      viewed_at: null,
      uploaded_at: null,
      in_review_at: null,
      completed_at: null,
      closed_reason: null,
      created_at: timestamp,
      updated_at: timestamp,
    }
    await uow.documentRequests.put(row)
    created.push(row)
  }
  return created
}

/** Backfill inbox rows from outbox notifications that predate the document_requests table. */
export async function ensureDocumentRequestsFromOutbox(
  uow: UnitOfWork,
  ctx: ServiceContext,
): Promise<void> {
  const notifications = (await uow.notifications.where('by_organization', ctx.organizationId)).filter(
    (row) =>
      row.organization_id === ctx.organizationId &&
      (row.type === 'vendor_digest' || row.type === 'correction_requested') &&
      row.vendor_id,
  )
  const linked = new Set(
    (await uow.documentRequests.where('by_organization', ctx.organizationId))
      .map((row) => row.notification_id)
      .filter((id): id is UUID => Boolean(id)),
  )

  for (const notification of notifications) {
    if (linked.has(notification.id)) continue
    const created = await createRequestsFromNotification(uow, ctx, notification, {
      actorId: notification.manual ? ctx.session.userId : 'system',
    })
    // Best-effort state sync from current submissions for historical rows.
    for (const request of created) {
      if (!request.requirement_id) continue
      const submissions = await uow.submissions.where('by_requirement', request.requirement_id)
      const latest = [...submissions].sort((a, b) => b.version_number - a.version_number)[0]
      if (!latest) continue
      let next = request
      if (latest.state === 'accepted') {
        next = advanceDocumentRequestState(next, 'viewed', latest.submitted_at)
        next = advanceDocumentRequestState(next, 'uploaded', latest.submitted_at, {
          submission_id: latest.id,
        })
        next = advanceDocumentRequestState(next, 'in_review', latest.submitted_at)
        next = advanceDocumentRequestState(
          next,
          'completed',
          latest.decided_at ?? latest.submitted_at,
          { closed_reason: 'Document accepted' },
        )
      } else if (latest.state === 'pending_review') {
        next = advanceDocumentRequestState(next, 'viewed', latest.submitted_at)
        next = advanceDocumentRequestState(next, 'uploaded', latest.submitted_at, {
          submission_id: latest.id,
        })
        next = advanceDocumentRequestState(next, 'in_review', latest.submitted_at)
      } else if (latest.state === 'changes_requested') {
        // Correction notifications already reopen; leave as Sent if this is the correction row.
        if (request.source !== 'correction') {
          next = advanceDocumentRequestState(next, 'viewed', latest.submitted_at)
          next = advanceDocumentRequestState(next, 'uploaded', latest.submitted_at, {
            submission_id: latest.id,
          })
          next = advanceDocumentRequestState(next, 'in_review', latest.submitted_at)
        }
      }
      if (next !== request) await uow.documentRequests.put(next)
    }
  }
}

export async function listDocumentRequests(
  ctx: ServiceContext,
  query: DocumentRequestQuery = {},
): Promise<DocumentRequestListResult> {
  if (!can(ctx.session.role, 'org.view_all_vendors')) {
    throw forbidden('Only workspace staff can open the requests inbox.')
  }

  return await ctx.db.write(async (uow) => {
    await ensureDocumentRequestsFromOutbox(uow, ctx)
    const vendors = await vendorMap(uow, ctx.organizationId)
    let rows = (await uow.documentRequests.where('by_organization', ctx.organizationId)).filter(
      (row) => row.organization_id === ctx.organizationId,
    )

    if (query.vendorId) {
      rows = rows.filter((row) => row.vendor_id === query.vendorId)
    }
    if (query.state && query.state !== 'all') {
      if (query.state === 'open') {
        rows = rows.filter((row) => isOpenDocumentRequest(row.state))
      } else {
        rows = rows.filter((row) => row.state === query.state)
      }
    }

    rows.sort((a, b) => b.sent_at.localeCompare(a.sent_at))
    const stateCounts = emptyStateCounts()
    for (const row of (await uow.documentRequests.where('by_organization', ctx.organizationId)).filter(
      (entry) => entry.organization_id === ctx.organizationId,
    )) {
      stateCounts[row.state] += 1
    }

    const limit = query.limit ?? 200
    const items = rows.slice(0, limit).map((request) => toListItem(request, vendors.get(request.vendor_id), 'staff'))
    const vendorOptions = [...vendors.values()]
      .filter((vendor) => vendor.lifecycle === 'active')
      .sort((a, b) => a.company_name.localeCompare(b.company_name))
      .map((vendor) => ({ id: vendor.id, company_name: vendor.company_name }))

    return { items, total: rows.length, vendors: vendorOptions, stateCounts }
  })
}

export async function getDocumentRequest(
  ctx: ServiceContext,
  requestId: UUID,
): Promise<DocumentRequestDetail> {
  if (!can(ctx.session.role, 'org.view_all_vendors')) {
    throw forbidden('Only workspace staff can open a request.')
  }
  return await ctx.db.write(async (uow) => {
    await ensureDocumentRequestsFromOutbox(uow, ctx)
    const request = requireOwned(
      await uow.documentRequests.get(requestId),
      ctx.organizationId,
      'That request no longer exists.',
    )
    const vendor = requireOwned(
      await uow.vendors.get(request.vendor_id),
      ctx.organizationId,
      'That vendor no longer exists.',
    )
    return {
      ...toListItem(request, vendor, 'staff'),
      timeline: timelineFor(request),
      vendor_contact: { name: vendor.contact_name, email: vendor.contact_email },
    }
  })
}

export async function listVendorDocumentRequests(
  ctx: ServiceContext,
  vendorId: UUID,
): Promise<DocumentRequestListResult> {
  if (ctx.session.role === 'vendor_contact' && ctx.session.vendorId !== vendorId) {
    throw forbidden('A vendor contact can only see their own requests.')
  }
  if (
    ctx.session.role !== 'vendor_contact' &&
    !can(ctx.session.role, 'org.view_all_vendors')
  ) {
    throw forbidden('You cannot list requests for that vendor.')
  }

  return await ctx.db.write(async (uow) => {
    await ensureDocumentRequestsFromOutbox(uow, ctx)
    const vendor = requireOwned(
      await uow.vendors.get(vendorId),
      ctx.organizationId,
      'That vendor no longer exists.',
    )
    const rows = (await uow.documentRequests.where('by_vendor', vendorId))
      .filter((row) => row.organization_id === ctx.organizationId)
      .sort((a, b) => b.sent_at.localeCompare(a.sent_at))
    const audience = ctx.session.role === 'vendor_contact' ? 'vendor' : 'staff'
    const stateCounts = emptyStateCounts()
    for (const row of rows) stateCounts[row.state] += 1
    return {
      items: rows.map((request) => toListItem(request, vendor, audience)),
      total: rows.length,
      vendors: [{ id: vendor.id, company_name: vendor.company_name }],
      stateCounts,
    }
  })
}

/** Mark open Sent requests as Viewed when the vendor opens the portal. */
export async function markVendorRequestsViewed(
  uow: UnitOfWork,
  ctx: ServiceContext,
  vendorId: UUID,
): Promise<number> {
  const timestamp = nowIso(ctx)
  const rows = (await uow.documentRequests.where('by_vendor', vendorId)).filter(
    (row) => row.organization_id === ctx.organizationId && row.state === 'sent',
  )
  for (const row of rows) {
    await uow.documentRequests.put(advanceDocumentRequestState(row, 'viewed', timestamp))
  }
  return rows.length
}

async function openRequestsForRequirement(
  uow: UnitOfWork,
  ctx: ServiceContext,
  input: { vendorId: UUID; requirementId: UUID },
): Promise<DocumentRequest[]> {
  const byRequirement = (await uow.documentRequests.where('by_requirement', input.requirementId)).filter(
    (row) =>
      row.organization_id === ctx.organizationId &&
      row.vendor_id === input.vendorId &&
      isOpenDocumentRequest(row.state),
  )
  if (byRequirement.length > 0) return byRequirement

  // Seeded digests may have left requirement_id null; match open asks by title.
  const requirement = await uow.requirements.get(input.requirementId)
  if (!requirement) return []
  return (await uow.documentRequests.where('by_vendor', input.vendorId)).filter(
    (row) =>
      row.organization_id === ctx.organizationId &&
      isOpenDocumentRequest(row.state) &&
      (row.requirement_id === null || row.requirement_id === input.requirementId) &&
      row.item_title.toLowerCase() === requirement.title.toLowerCase(),
  )
}

/** After a submission is created: Uploaded then In Review (pending review). */
export async function advanceRequestsForSubmission(
  uow: UnitOfWork,
  ctx: ServiceContext,
  input: { vendorId: UUID; requirementId: UUID; submissionId: UUID; at: IsoDateTime },
): Promise<void> {
  const open = await openRequestsForRequirement(uow, ctx, input)
  for (const row of open) {
    let next = advanceDocumentRequestState(row, 'viewed', input.at)
    next = advanceDocumentRequestState(next, 'uploaded', input.at, {
      submission_id: input.submissionId,
    })
    next = {
      ...advanceDocumentRequestState(next, 'in_review', input.at),
      requirement_id: next.requirement_id ?? input.requirementId,
    }
    await uow.documentRequests.put(next)
  }
}

/** Accept → Completed. Changes requested is handled by createRequestsFromNotification reopen. */
export async function completeRequestsForAcceptance(
  uow: UnitOfWork,
  ctx: ServiceContext,
  input: { vendorId: UUID; requirementId: UUID; submissionId: UUID; at: IsoDateTime },
): Promise<void> {
  const open = await openRequestsForRequirement(uow, ctx, input)
  for (const row of open) {
    let next = advanceDocumentRequestState(row, 'in_review', input.at, {
      submission_id: input.submissionId,
    })
    next = {
      ...advanceDocumentRequestState(next, 'completed', input.at, {
        closed_reason: 'Document accepted',
      }),
      requirement_id: next.requirement_id ?? input.requirementId,
    }
    await uow.documentRequests.put(next)
  }
}

export { DOCUMENT_REQUEST_NEXT_ACTION, DOCUMENT_REQUEST_STATE_LABEL, DOCUMENT_REQUEST_VENDOR_NEXT_ACTION }
