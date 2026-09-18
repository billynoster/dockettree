/** Vendor directory, detail, lifecycle, invitations, reminders, import and export. */
import { Hono } from 'hono'
import { validationError } from '@/domain/errors'
import { parseVendorQuery } from '@/domain/vendorQuery'
import { previewImport, importVendors } from '@/services/importService'
import { exportVendorStatus } from '@/services/exportService'
import {
  inviteVendor,
  previewInvitation,
  revokeInvitation,
} from '@/services/invitationService'
import { getOverview } from '@/services/overviewService'
import { previewReminder, sendReminder } from '@/services/reminderService'
import {
  archiveVendor,
  assignTemplate,
  createVendor,
  getVendorDetail,
  listTemplatesWithItems,
  listVendors,
  previewAssignTemplate,
  restoreRequirement,
  restoreVendor,
  retireRequirement,
  setRequirementDueDate,
  updateVendor,
} from '@/services/vendorService'
import { requirePrincipal, serviceContextFor, type AppEnv } from '../context'
import { handle, param } from '../handler'

export const vendorRoutes = new Hono<AppEnv>()

async function ctxOf(c: Parameters<Parameters<typeof handle>[0]>[0]) {
  return await serviceContextFor(c.get('deps'), requirePrincipal(c))
}

vendorRoutes.get(
  '/overview',
  handle(async (c) => await getOverview(await ctxOf(c))),
)

vendorRoutes.get(
  '/vendors',
  handle(async (c) => {
    const query = parseVendorQuery(new URL(c.req.url).searchParams)
    return await listVendors(await ctxOf(c), query)
  }),
)

vendorRoutes.get(
  '/vendors/templates',
  handle(async (c) => await listTemplatesWithItems(await ctxOf(c))),
)

vendorRoutes.post(
  '/vendors',
  handle(async (c) => {
    const body = await c.req.json()
    return await createVendor(await ctxOf(c), body)
  }),
)

vendorRoutes.get(
  '/vendors/:vendorId',
  handle(async (c) => await getVendorDetail(await ctxOf(c), param(c, 'vendorId'))),
)

vendorRoutes.patch(
  '/vendors/:vendorId',
  handle(async (c) => {
    const body = await c.req.json()
    return await updateVendor(await ctxOf(c), param(c, 'vendorId'), body)
  }),
)

vendorRoutes.post(
  '/vendors/:vendorId/archive',
  handle(async (c) => {
    const body = await c.req.json<{ reason?: string }>()
    return await archiveVendor(await ctxOf(c), param(c, 'vendorId'), body.reason ?? '')
  }),
)

vendorRoutes.post(
  '/vendors/:vendorId/restore',
  handle(async (c) => await restoreVendor(await ctxOf(c), param(c, 'vendorId'))),
)

vendorRoutes.get(
  '/vendors/:vendorId/checklist-preview',
  handle(async (c) => {
    const templateId = new URL(c.req.url).searchParams.get('templateId')
    if (!templateId) throw validationError('Choose a checklist template.')
    return await previewAssignTemplate(await ctxOf(c), param(c, 'vendorId'), templateId)
  }),
)

vendorRoutes.post(
  '/vendors/:vendorId/checklist',
  handle(async (c) => {
    const body = await c.req.json<{ templateId?: string; reason?: string }>()
    if (!body.templateId) throw validationError('Choose a checklist template.')
    await assignTemplate(await ctxOf(c), param(c, 'vendorId'), body.templateId, body.reason ?? '')
    return { assigned: true }
  }),
)

vendorRoutes.post(
  '/requirements/:requirementId/retire',
  handle(async (c) => {
    const body = await c.req.json<{ reason?: string }>()
    await retireRequirement(await ctxOf(c), param(c, 'requirementId'), body.reason ?? '')
    return { retired: true }
  }),
)

vendorRoutes.post(
  '/requirements/:requirementId/restore',
  handle(async (c) => {
    const body = await c.req.json<{ reason?: string }>()
    await restoreRequirement(await ctxOf(c), param(c, 'requirementId'), body.reason ?? '')
    return { restored: true }
  }),
)

vendorRoutes.post(
  '/requirements/:requirementId/due-date',
  handle(async (c) => {
    const body = await c.req.json<{ dueDate?: string | null }>()
    await setRequirementDueDate(await ctxOf(c), param(c, 'requirementId'), body.dueDate ?? null)
    return { updated: true }
  }),
)

vendorRoutes.get(
  '/vendors/:vendorId/invitation-preview',
  handle(async (c) => await previewInvitation(await ctxOf(c), param(c, 'vendorId'))),
)

vendorRoutes.post(
  '/vendors/:vendorId/invitation',
  handle(async (c) => {
    const deps = c.get('deps')
    const body = await c.req.json<{ expectedContactEmail?: string; requestKey?: string }>()
    return await inviteVendor(await ctxOf(c), deps.tokens, {
      vendorId: param(c, 'vendorId'),
      expectedContactEmail: body.expectedContactEmail ?? '',
      linkBase: deps.config.publicUrl,
      requestKey: body.requestKey,
    })
  }),
)

vendorRoutes.delete(
  '/invitations/:invitationId',
  handle(async (c) => {
    await revokeInvitation(await ctxOf(c), param(c, 'invitationId'))
    return { revoked: true }
  }),
)

vendorRoutes.get(
  '/vendors/:vendorId/reminder-preview',
  handle(async (c) => await previewReminder(await ctxOf(c), param(c, 'vendorId'))),
)

vendorRoutes.post(
  '/vendors/:vendorId/reminder',
  handle(async (c) => {
    const body = await c.req.json<{ requestKey?: string }>().catch(() => ({}) as { requestKey?: string })
    const result = await sendReminder(await ctxOf(c), param(c, 'vendorId'), body.requestKey)
    // Try delivery straight away so a manual send does not wait for the worker tick.
    void c.get('deps').deliveryWorker.runOnce().catch(() => undefined)
    return result
  }),
)

vendorRoutes.post(
  '/vendors/import-preview',
  handle(async (c) => {
    const body = await c.req.json<{ text?: string }>()
    return await previewImport(await ctxOf(c), body.text ?? '')
  }),
)

vendorRoutes.post(
  '/vendors/import',
  handle(async (c) => {
    const body = await c.req.json<{
      text?: string
      templateId?: string | null
      requestKey?: string
      confirmDuplicates?: boolean
    }>()
    if (!body.requestKey) throw validationError('A request key is required for an import.')
    return await importVendors(await ctxOf(c), {
      text: body.text ?? '',
      templateId: body.templateId ?? null,
      requestKey: body.requestKey,
      confirmDuplicates: body.confirmDuplicates,
    })
  }),
)

vendorRoutes.get(
  '/vendors-export',
  handle(async (c) => {
    const query = parseVendorQuery(new URL(c.req.url).searchParams)
    return await exportVendorStatus(await ctxOf(c), query)
  }),
)
