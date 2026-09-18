/** Review, acceptance, correction and revocation (requirements W3, W4, FR-05, FR-06, 5.2). */
import { isExpiredOn } from '@/domain/dates'
import { conflict, notFound, validationError } from '@/domain/errors'
import { newId } from '@/domain/ids'
import { correctionIdempotencyKey } from '@/domain/reminders'
import type {
  AssignedRequirement,
  FileObject,
  Notification,
  ReviewEvent,
  Submission,
  UUID,
  Vendor,
} from '@/domain/types'
import { recordActivity } from './activityService'
import { nowIso, requireCapability, today, type ServiceContext } from './context'
import { loadReviewEvents, loadVendorSnapshot } from './queries'

export interface ReviewQueueItem {
  submission: Submission
  requirement: AssignedRequirement
  vendor: Vendor
  file: FileObject | undefined
  /** Position in the oldest-first queue, 1-based. */
  position: number
}

export interface ReviewQueueResult {
  items: ReviewQueueItem[]
  total: number
  vendors: { id: UUID; company_name: string }[]
  requirementTitles: string[]
  filteredEmpty: boolean
}

/** Oldest-first pending submissions, excluding archived vendors (section 6, `/review`). */
export async function listReviewQueue(
  ctx: ServiceContext,
  filters: { vendorId?: UUID | null; requirementTitle?: string | null } = {},
): Promise<ReviewQueueResult> {
  return await ctx.db.read(async (uow) => {
    const pending = (await uow.submissions.where('by_state', 'pending_review')).filter(
      (submission) => submission.organization_id === ctx.organizationId,
    )
    const [vendors, requirements, files] = await Promise.all([
      uow.vendors.where('by_organization', ctx.organizationId),
      uow.requirements.where('by_organization', ctx.organizationId),
      uow.files.getAll(),
    ])
    const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]))
    const requirementById = new Map(requirements.map((requirement) => [requirement.id, requirement]))
    const fileById = new Map(files.map((file) => [file.id, file]))

    const all = pending
      .map((submission) => ({
        submission,
        vendor: vendorById.get(submission.vendor_id),
        requirement: requirementById.get(submission.requirement_id),
        file: fileById.get(submission.file_object_id),
      }))
      .filter(
        (entry): entry is { submission: Submission; vendor: Vendor; requirement: AssignedRequirement; file: FileObject | undefined } =>
          entry.vendor !== undefined &&
          entry.requirement !== undefined &&
          entry.vendor.lifecycle === 'active',
      )
      .sort((a, b) => a.submission.submitted_at.localeCompare(b.submission.submitted_at))

    const filtered = all.filter((entry) => {
      if (filters.vendorId && entry.vendor.id !== filters.vendorId) return false
      if (filters.requirementTitle && entry.requirement.title !== filters.requirementTitle) return false
      return true
    })

    return {
      items: filtered.map((entry, index) => ({ ...entry, position: index + 1 })),
      total: all.length,
      vendors: [...new Map(all.map((entry) => [entry.vendor.id, entry.vendor])).values()]
        .map((vendor) => ({ id: vendor.id, company_name: vendor.company_name }))
        .sort((a, b) => a.company_name.localeCompare(b.company_name)),
      requirementTitles: [...new Set(all.map((entry) => entry.requirement.title))].sort(),
      filteredEmpty: filtered.length === 0 && all.length > 0,
    }
  })
}

export interface ReviewDetail {
  submission: Submission
  requirement: AssignedRequirement
  vendor: Vendor
  file: FileObject | undefined
  /** Prior versions of the same requirement, newest first. */
  history: Submission[]
  /** Currently effective accepted version, if one exists. */
  effective: Submission | null
  reviewEvents: ReviewEvent[]
  /** Reason from the most recent changes-requested decision, if any. */
  lastCorrectionReason: string | null
  canAccept: boolean
  blockedAcceptReason: string | null
  nextPendingSubmissionId: UUID | null
}

export async function getReviewDetail(ctx: ServiceContext, submissionId: UUID): Promise<ReviewDetail> {
  const queue = await listReviewQueue(ctx)
  return await ctx.db.read(async (uow) => {
    const submission = await uow.submissions.get(submissionId)
    if (!submission) throw notFound('That submission no longer exists.')
    const requirement = await uow.requirements.get(submission.requirement_id)
    const vendor = await uow.vendors.get(submission.vendor_id)
    if (!requirement || !vendor) throw notFound('That submission is no longer linked to a vendor.')
    const file = await uow.files.get(submission.file_object_id)
    const siblings = (await uow.submissions.where('by_requirement', requirement.id)).sort(
      (a, b) => b.version_number - a.version_number,
    )
    const effective = requirement.effective_submission_id
      ? (siblings.find((entry) => entry.id === requirement.effective_submission_id) ?? null)
      : null
    const reviewEvents = await loadReviewEvents(uow, submission.id)

    const previousEvents = await Promise.all(
      siblings.filter((entry) => entry.id !== submission.id).map((entry) => loadReviewEvents(uow, entry.id)),
    )
    const lastCorrection = [...reviewEvents, ...previousEvents.flat()]
      .filter((event) => event.decision === 'changes_requested')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]

    const expired = isExpiredOn(submission.expiration_date, today(ctx))
    const missingExpiration = requirement.expiration_required && submission.expiration_date === null
    const blockedAcceptReason = expired
      ? 'This document expired before today, so it cannot be accepted. Request a replacement with a current expiration date.'
      : missingExpiration
        ? 'This requirement needs an expiration date before it can be accepted.'
        : null

    const queueIds = queue.items.map((item) => item.submission.id)
    const currentIndex = queueIds.indexOf(submissionId)
    const nextPendingSubmissionId =
      currentIndex === -1
        ? (queueIds[0] ?? null)
        : (queueIds[currentIndex + 1] ?? queueIds.find((id) => id !== submissionId) ?? null)

    return {
      submission,
      requirement,
      vendor,
      file,
      history: siblings.filter((entry) => entry.id !== submission.id),
      effective,
      reviewEvents,
      lastCorrectionReason: lastCorrection?.reason ?? null,
      canAccept: submission.state === 'pending_review' && blockedAcceptReason === null,
      blockedAcceptReason,
      nextPendingSubmissionId,
    }
  })
}

export interface ReviewSubmissionInput {
  submissionId: UUID
  expectedVersion: number
  decision: 'accepted' | 'changes_requested'
  reason?: string
  requestKey?: string
}

export interface ReviewSubmissionResult {
  submission_id: UUID
  vendor_id: UUID
  decision: 'accepted' | 'changes_requested'
  /** Readiness after the decision, so the UI updates without a refresh. */
  readinessStatus: string
  supersededSubmissionId: UUID | null
}

/**
 * One transactional decision. The record version is checked so a stale or repeated review
 * cannot create a contradictory decision (FR-05, section 11 "two reviewers act simultaneously").
 */
export async function reviewSubmission(
  ctx: ServiceContext,
  input: ReviewSubmissionInput,
): Promise<ReviewSubmissionResult> {
  requireCapability(ctx, 'submission.review')
  const reason = (input.reason ?? '').trim()
  if (input.decision === 'changes_requested' && reason.length < 5) {
    throw validationError('Explain what the vendor needs to change.', {
      reason: 'Enter the correction reason the vendor will see (at least 5 characters).',
    })
  }

  const outcome = await ctx.db.write(async (uow) => {
    const submission = await uow.submissions.get(input.submissionId)
    if (!submission) throw notFound('That submission no longer exists.')
    if (submission.state !== 'pending_review') {
      throw conflict(
        `This submission was already decided (${submission.state.replace('_', ' ')}). Reload the review queue for the current decision.`,
      )
    }
    if (submission.record_version !== input.expectedVersion) {
      throw conflict('Another reviewer decided this submission first. Reload to see their decision.')
    }
    const requirement = await uow.requirements.get(submission.requirement_id)
    const vendor = await uow.vendors.get(submission.vendor_id)
    if (!requirement || !vendor) throw notFound('That submission is no longer linked to a vendor.')

    const timestamp = nowIso(ctx)
    let supersededSubmissionId: UUID | null = null

    if (input.decision === 'accepted') {
      if (requirement.expiration_required && submission.expiration_date === null) {
        throw validationError('This requirement needs an expiration date before it can be accepted.')
      }
      if (isExpiredOn(submission.expiration_date, today(ctx))) {
        throw validationError(
          'This document expired before today. Request a replacement with a current expiration date instead of accepting it.',
        )
      }

      // Supersede the previously effective version and move the pointer atomically.
      if (requirement.effective_submission_id && requirement.effective_submission_id !== submission.id) {
        const previous = await uow.submissions.get(requirement.effective_submission_id)
        if (previous) {
          supersededSubmissionId = previous.id
          await uow.submissions.put({
            ...previous,
            state: 'superseded',
            superseded_by_submission_id: submission.id,
            record_version: previous.record_version + 1,
          })
        }
      }
      await uow.submissions.put({
        ...submission,
        state: 'accepted',
        decided_at: timestamp,
        record_version: submission.record_version + 1,
      })
      await uow.requirements.put({
        ...requirement,
        effective_submission_id: submission.id,
        updated_at: timestamp,
        record_version: requirement.record_version + 1,
      })
    } else {
      await uow.submissions.put({
        ...submission,
        state: 'changes_requested',
        decided_at: timestamp,
        record_version: submission.record_version + 1,
      })
    }

    const reviewEvent: ReviewEvent = {
      id: newId(),
      organization_id: ctx.organizationId,
      submission_id: submission.id,
      actor_id: ctx.session.userId,
      actor_label: ctx.session.userLabel,
      decision: input.decision,
      reason: input.decision === 'changes_requested' ? reason : null,
      created_at: timestamp,
    }
    await uow.reviewEvents.put(reviewEvent)
    await uow.vendors.put({ ...vendor, updated_at: timestamp })

    await recordActivity(uow, ctx, {
      vendor_id: vendor.id,
      event_type: input.decision === 'accepted' ? 'submission_accepted' : 'submission_changes_requested',
      target_id: submission.id,
      summary:
        input.decision === 'accepted'
          ? `Accepted ${requirement.title} v${submission.version_number}`
          : `Requested changes to ${requirement.title} v${submission.version_number}`,
      reason: input.decision === 'changes_requested' ? reason : null,
      metadata: {
        requirement: requirement.title,
        version: submission.version_number,
        superseded_version: supersededSubmissionId ? 'yes' : 'no',
      },
      vendor_visible: true,
    })

    if (input.decision === 'changes_requested') {
      // Correction notices are transactional and separate from the daily digest.
      const notification: Notification = {
        id: newId(),
        organization_id: ctx.organizationId,
        vendor_id: vendor.id,
        type: 'correction_requested',
        recipient: vendor.contact_email,
        recipient_label: vendor.contact_name,
        subject: `Changes requested: ${requirement.title}`,
        body: [
          `Hello ${vendor.contact_name},`,
          '',
          `A reviewer asked for changes to ${requirement.title} (version ${submission.version_number}).`,
          '',
          `Reason: ${reason}`,
          '',
          'Open your vendor portal to upload a corrected version.',
          '',
          'Simulated message. No email was sent by this prototype.',
        ].join('\n'),
        items: [
          {
            requirement_id: requirement.id,
            requirement_title: requirement.title,
            milestone_key: `correction:v${submission.version_number}`,
            detail: reason,
            submission_version: submission.version_number,
          },
        ],
        status: 'simulated_sent',
        idempotency_key: correctionIdempotencyKey(
          ctx.organizationId,
          submission.id,
          submission.version_number,
        ),
        attempt_count: 1,
        next_attempt_at: null,
        sent_at: timestamp,
        last_error: null,
        manual: false,
        created_at: timestamp,
      }
      await uow.notifications.put(notification)
    }

    return { vendorId: vendor.id, supersededSubmissionId }
  })

  const snapshot = await ctx.db.read((uow) => loadVendorSnapshot(uow, outcome.vendorId, today(ctx)))
  return {
    submission_id: input.submissionId,
    vendor_id: outcome.vendorId,
    decision: input.decision,
    readinessStatus: snapshot.readiness.status,
    supersededSubmissionId: outcome.supersededSubmissionId,
  }
}

/**
 * Revoke an acceptance. The requirement immediately stops being satisfied and there is no
 * automatic fallback to an older accepted version (section 5.2).
 */
export async function revokeAcceptance(
  ctx: ServiceContext,
  submissionId: UUID,
  reason: string,
): Promise<void> {
  requireCapability(ctx, 'submission.revoke_acceptance')
  const trimmed = reason.trim()
  if (trimmed.length < 5) {
    throw validationError('A reason is required to revoke an acceptance.', {
      reason: 'Explain why this acceptance is being revoked (at least 5 characters).',
    })
  }
  await ctx.db.write(async (uow) => {
    const submission = await uow.submissions.get(submissionId)
    if (!submission) throw notFound('That submission no longer exists.')
    if (submission.state !== 'accepted') {
      throw conflict('Only an accepted submission can have its acceptance revoked.')
    }
    const requirement = await uow.requirements.get(submission.requirement_id)
    const vendor = await uow.vendors.get(submission.vendor_id)
    if (!requirement || !vendor) throw notFound('That submission is no longer linked to a vendor.')

    const timestamp = nowIso(ctx)
    await uow.submissions.put({
      ...submission,
      state: 'revoked',
      decided_at: timestamp,
      record_version: submission.record_version + 1,
    })
    if (requirement.effective_submission_id === submission.id) {
      await uow.requirements.put({
        ...requirement,
        effective_submission_id: null,
        updated_at: timestamp,
        record_version: requirement.record_version + 1,
      })
    }
    await uow.reviewEvents.put({
      id: newId(),
      organization_id: ctx.organizationId,
      submission_id: submission.id,
      actor_id: ctx.session.userId,
      actor_label: ctx.session.userLabel,
      decision: 'revoked',
      reason: trimmed,
      created_at: timestamp,
    })
    await uow.vendors.put({ ...vendor, updated_at: timestamp })
    await recordActivity(uow, ctx, {
      vendor_id: vendor.id,
      event_type: 'acceptance_revoked',
      target_id: submission.id,
      summary: `Revoked acceptance of ${requirement.title} v${submission.version_number}`,
      reason: trimmed,
      metadata: { requirement: requirement.title, version: submission.version_number },
      vendor_visible: true,
    })
  })
}
