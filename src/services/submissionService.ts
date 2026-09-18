/** Upload and submission use cases (requirements W2, FR-04, FR-06, 5.2). */
import { conflict, forbidden, notFound, validationError } from '@/domain/errors'
import { newId } from '@/domain/ids'
import { can } from '@/domain/permissions'
import type { FileObject, Submission, UUID } from '@/domain/types'
import {
  detectMimeFromBytes,
  validateSubmissionDates,
  validateUpload,
  type SubmissionDateInput,
} from '@/domain/validation'
import { withIdempotency } from '@/repositories/types'
import { recordActivity } from './activityService'
import { nowIso, today, type ServiceContext } from './context'
import { requireOwned } from './queries'

export interface SubmitDocumentInput {
  requirementId: UUID
  file: File
  dates: SubmissionDateInput
  requestKey?: string
}

export interface SubmitDocumentResult {
  submission_id: UUID
  version_number: number
  replayed: boolean
  warning: string | null
}

/**
 * A submission is created only when file and date validation both succeed. File bytes are
 * read before the write transaction so the database transaction never waits on file I/O.
 */
export async function submitDocument(
  ctx: ServiceContext,
  input: SubmitDocumentInput,
): Promise<SubmitDocumentResult> {
  const context = await ctx.db.read(async (uow) => {
    const requirement = requireOwned(
      await uow.requirements.get(input.requirementId),
      ctx.organizationId,
      'That requirement no longer exists.',
    )
    const vendor = requireOwned(
      await uow.vendors.get(requirement.vendor_id),
      ctx.organizationId,
      'That vendor no longer exists.',
    )
    const submissions = await uow.submissions.where('by_requirement', requirement.id)
    return { requirement, vendor, submissions }
  })

  const { requirement, vendor, submissions } = context

  if (ctx.session.role === 'vendor_contact') {
    if (ctx.session.vendorId !== vendor.id) {
      throw forbidden('This portal belongs to a different vendor.')
    }
  } else if (!can(ctx.session.role, 'document.upload_on_behalf')) {
    throw forbidden(`The ${ctx.session.role} role cannot upload documents.`)
  }

  if (vendor.lifecycle === 'archived') {
    throw forbidden('This vendor is archived, so document uploads are disabled. Restore the vendor first.')
  }
  if (requirement.retired_at) {
    throw conflict('This requirement was retired and no longer accepts submissions.')
  }
  if (submissions.some((submission) => submission.state === 'pending_review')) {
    throw conflict(
      'A submission for this requirement is already awaiting review. Withdraw it before submitting another version.',
    )
  }

  const bytes = new Uint8Array(await input.file.arrayBuffer())
  const detected = detectMimeFromBytes(bytes.subarray(0, 16))
  const fileCheck = validateUpload(
    { name: input.file.name, size: input.file.size, type: input.file.type },
    detected,
  )
  if (!fileCheck.ok || fileCheck.detectedMime === null) {
    throw validationError(fileCheck.error ?? 'That file cannot be submitted.', {
      file: fileCheck.error ?? 'That file cannot be submitted.',
    })
  }

  const dateCheck = validateSubmissionDates(input.dates, requirement, today(ctx))
  if (Object.keys(dateCheck.fieldErrors).length > 0) {
    throw validationError('Check the dates on this document.', dateCheck.fieldErrors)
  }

  const detectedMime = fileCheck.detectedMime
  const blob = new Blob([bytes as unknown as BlobPart], { type: detectedMime })
  const nextVersion =
    submissions.reduce((highest, submission) => Math.max(highest, submission.version_number), 0) + 1
  const onBehalf = ctx.session.role !== 'vendor_contact'

  const result = await ctx.db.write(async (uow) =>
    withIdempotency(uow, input.requestKey ?? null, nowIso(ctx), async () => {
      const timestamp = nowIso(ctx)
      const fileObject: FileObject = {
        id: newId(),
        organization_id: ctx.organizationId,
        storage_key: `blob/${newId()}`,
        original_filename: input.file.name,
        detected_mime: detectedMime,
        byte_size: input.file.size,
        scan_status: 'not_scanned',
        created_by: ctx.session.userId,
        created_at: timestamp,
      }
      await uow.blobs.put(fileObject.storage_key, blob)
      await uow.files.put(fileObject)

      const submission: Submission = {
        id: newId(),
        organization_id: ctx.organizationId,
        vendor_id: vendor.id,
        requirement_id: requirement.id,
        version_number: nextVersion,
        state: 'pending_review',
        file_object_id: fileObject.id,
        issue_date: dateCheck.issue_date,
        expiration_date: dateCheck.expiration_date,
        submitted_by: ctx.session.userId,
        submitted_by_label: ctx.session.userLabel,
        submitted_on_behalf: onBehalf,
        submitted_at: timestamp,
        decided_at: null,
        withdrawn_at: null,
        superseded_by_submission_id: null,
        record_version: 1,
      }
      await uow.submissions.put(submission)
      await uow.vendors.put({ ...vendor, updated_at: timestamp })

      await recordActivity(uow, ctx, {
        vendor_id: vendor.id,
        event_type: onBehalf ? 'document_submitted_on_behalf' : 'document_submitted',
        target_id: submission.id,
        summary: onBehalf
          ? `${ctx.session.userLabel} submitted ${requirement.title} v${nextVersion} on behalf of ${vendor.company_name}`
          : `${ctx.session.userLabel} submitted ${requirement.title} v${nextVersion}`,
        metadata: {
          requirement: requirement.title,
          version: nextVersion,
          filename: fileObject.original_filename,
          expiration_date: submission.expiration_date,
        },
        vendor_visible: true,
      })

      return { submission_id: submission.id, version_number: nextVersion }
    }),
  )

  return {
    submission_id: result.value.submission_id,
    version_number: result.value.version_number,
    replayed: result.replayed,
    warning: dateCheck.warning,
  }
}

/** A mistaken submission can be withdrawn only while it is pending. History is retained. */
export async function withdrawSubmission(
  ctx: ServiceContext,
  submissionId: UUID,
  expectedVersion: number,
): Promise<void> {
  await ctx.db.write(async (uow) => {
    const submission = requireOwned(
      await uow.submissions.get(submissionId),
      ctx.organizationId,
      'That submission no longer exists.',
    )
    const vendor = requireOwned(
      await uow.vendors.get(submission.vendor_id),
      ctx.organizationId,
      'That vendor no longer exists.',
    )
    if (ctx.session.role === 'vendor_contact' && ctx.session.vendorId !== vendor.id) {
      throw forbidden('This portal belongs to a different vendor.')
    }
    if (ctx.session.role === 'reviewer') {
      throw forbidden('Reviewers cannot withdraw a vendor submission.')
    }
    if (submission.state !== 'pending_review') {
      throw conflict('Only a submission that is still pending review can be withdrawn.')
    }
    if (submission.record_version !== expectedVersion) {
      throw conflict('This submission changed elsewhere. Reload before withdrawing it.')
    }
    const requirement = await uow.requirements.get(submission.requirement_id)
    const timestamp = nowIso(ctx)
    await uow.submissions.put({
      ...submission,
      state: 'withdrawn',
      withdrawn_at: timestamp,
      record_version: submission.record_version + 1,
    })
    await recordActivity(uow, ctx, {
      vendor_id: vendor.id,
      event_type: 'document_withdrawn',
      target_id: submission.id,
      summary: `Withdrew ${requirement?.title ?? 'submission'} v${submission.version_number}`,
      metadata: { requirement: requirement?.title ?? '', version: submission.version_number },
      vendor_visible: true,
    })
  })
}

export interface LoadedFile {
  file: FileObject
  blob: Blob
}

/** Fetch document bytes for preview. Vendors may only read their own documents. */
export async function loadSubmissionFile(
  ctx: ServiceContext,
  submissionId: UUID,
): Promise<LoadedFile> {
  return await ctx.db.read(async (uow) => {
    const submission = requireOwned(
      await uow.submissions.get(submissionId),
      ctx.organizationId,
      'That submission no longer exists.',
    )
    if (ctx.session.role === 'vendor_contact' && ctx.session.vendorId !== submission.vendor_id) {
      throw forbidden('This document belongs to a different vendor.')
    }
    const file = await uow.files.get(submission.file_object_id)
    if (!file) throw notFound('That document file is missing from storage.')
    const blob = await uow.blobs.get(file.storage_key)
    if (!blob) throw notFound('That document file is missing from storage.')
    return { file, blob }
  })
}
