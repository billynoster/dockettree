/**
 * Uploads, review decisions, the vendor portal and document downloads.
 *
 * Bytes are validated server-side (magic bytes and size, not the extension) and are served
 * only to a caller authorized for that vendor.
 */
import { Hono } from 'hono'
import { validationError } from '@/domain/errors'
import { MAX_UPLOAD_BYTES } from '@/domain/validation'
import { getVendorPortal } from '@/services/portalService'
import {
  getReviewDetail,
  listReviewQueue,
  reviewSubmission,
  revokeAcceptance,
} from '@/services/reviewService'
import { loadSubmissionFile, submitDocument, withdrawSubmission } from '@/services/submissionService'
import { requirePrincipal, requireVendorContext, serviceContextFor, type AppEnv } from '../context'
import { handle, param } from '../handler'

export const documentRoutes = new Hono<AppEnv>()

async function ctxOf(c: Parameters<Parameters<typeof handle>[0]>[0]) {
  return await serviceContextFor(c.get('deps'), requirePrincipal(c))
}

documentRoutes.get(
  '/review',
  handle(async (c) => {
    const params = new URL(c.req.url).searchParams
    return await listReviewQueue(await ctxOf(c), {
      vendorId: params.get('vendor'),
      requirementTitle: params.get('requirement'),
    })
  }),
)

documentRoutes.get(
  '/review/:submissionId',
  handle(async (c) => await getReviewDetail(await ctxOf(c), param(c, 'submissionId'))),
)

documentRoutes.post(
  '/review/:submissionId',
  handle(async (c) => {
    const body = await c.req.json<{
      expectedVersion?: number
      decision?: 'accepted' | 'changes_requested'
      reason?: string
      requestKey?: string
    }>()
    if (body.decision !== 'accepted' && body.decision !== 'changes_requested') {
      throw validationError('Choose a decision.')
    }
    const result = await reviewSubmission(await ctxOf(c), {
      submissionId: param(c, 'submissionId'),
      expectedVersion: body.expectedVersion ?? 0,
      decision: body.decision,
      reason: body.reason,
      requestKey: body.requestKey,
    })
    void c.get('deps').deliveryWorker.runOnce().catch(() => undefined)
    return result
  }),
)

documentRoutes.post(
  '/submissions/:submissionId/revoke',
  handle(async (c) => {
    const body = await c.req.json<{ reason?: string }>()
    await revokeAcceptance(await ctxOf(c), param(c, 'submissionId'), body.reason ?? '')
    return { revoked: true }
  }),
)

documentRoutes.post(
  '/submissions/:submissionId/withdraw',
  handle(async (c) => {
    const body = await c.req.json<{ expectedVersion?: number }>()
    await withdrawSubmission(await ctxOf(c), param(c, 'submissionId'), body.expectedVersion ?? 0)
    return { withdrawn: true }
  }),
)

documentRoutes.post(
  '/requirements/:requirementId/submissions',
  handle(async (c) => {
    const form = await c.req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      throw validationError('Choose a document to upload.', { file: 'Choose a PDF, PNG or JPEG file.' })
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw validationError('That file is larger than 10 MiB.', {
        file: 'Choose a file of 10 MiB or less.',
      })
    }
    const expiration = form.get('expiration_date')
    const issue = form.get('issue_date')
    return await submitDocument(await ctxOf(c), {
      requirementId: param(c, 'requirementId'),
      file,
      dates: {
        issue_date: typeof issue === 'string' ? issue : '',
        expiration_date: typeof expiration === 'string' ? expiration : '',
      },
      requestKey: typeof form.get('requestKey') === 'string' ? String(form.get('requestKey')) : undefined,
    })
  }),
)

/** Inline preview of a submitted document, authorized per vendor on every request. */
documentRoutes.get(
  '/submissions/:submissionId/file',
  handle(async (c) => {
    const { file, blob } = await loadSubmissionFile(await ctxOf(c), param(c, 'submissionId'))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    return new Response(bytes, {
      headers: {
        'Content-Type': file.detected_mime,
        'Content-Length': String(bytes.byteLength),
        'Content-Disposition': `inline; filename="${file.original_filename.replace(/["\\]/g, '')}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    })
  }),
)

documentRoutes.get(
  '/portal',
  handle(async (c) => {
    const principal = requirePrincipal(c)
    const vendorId = requireVendorContext(principal)
    return await getVendorPortal(await ctxOf(c), vendorId)
  }),
)
