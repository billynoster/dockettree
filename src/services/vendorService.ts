/** Vendor directory and lifecycle use cases (requirements W1, FR-01, FR-02, FR-13). */
import { compareDates } from '@/domain/dates'
import { conflict, validationError } from '@/domain/errors'
import { newId } from '@/domain/ids'
import { compareNextExpiration, countReadiness, type ReadinessCounts } from '@/domain/readiness'
import type {
  AssignedRequirement,
  IsoDate,
  ReadinessStatus,
  RequirementTemplate,
  TemplateItem,
  UUID,
  Vendor,
  VendorLifecycle,
} from '@/domain/types'
import { fieldErrorsFrom, vendorInputSchema, type VendorInput } from '@/domain/validation'
import { withIdempotency, type UnitOfWork } from '@/repositories/types'
import { recordActivity } from './activityService'
import { nowIso, requireCapability, today, type ServiceContext } from './context'
import {
  type VendorSnapshot,
  buildSnapshot,
  invitationStatus,
  loadVendorActivity,
  loadVendorInvitations,
  loadVendorSnapshot,
  loadVendorSnapshots,
  requireOwned,
} from './queries'

export interface VendorListQuery {
  search?: string
  readiness?: ReadinessStatus[]
  category?: string | null
  property?: string | null
  expiringSoonOnly?: boolean
  lifecycle?: VendorLifecycle | 'all'
  sort?: 'name' | 'next_expiration' | 'updated'
  direction?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface VendorRow {
  vendor: Vendor
  readiness: VendorSnapshot['readiness']
  invitationStatus: ReturnType<typeof invitationStatus>['status']
}

export interface VendorListResult {
  rows: VendorRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  counts: ReadinessCounts
  categories: string[]
  properties: string[]
  /** True when the organization has vendors but the filters matched none. */
  filteredEmpty: boolean
}

export const DEFAULT_PAGE_SIZE = 25

export async function listVendors(
  ctx: ServiceContext,
  query: VendorListQuery = {},
): Promise<VendorListResult> {
  requireCapability(ctx, 'org.view_all_vendors')
  return await ctx.db.read(async (uow) => {
    const todayValue = today(ctx)
    const snapshots = await loadVendorSnapshots(uow, ctx.organizationId, todayValue)
    const invitations = await uow.invitations.getAll()
    const counts = countReadiness(snapshots.map((snapshot) => snapshot.readiness))

    const lifecycle = query.lifecycle ?? 'active'
    const search = (query.search ?? '').trim().toLowerCase()
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE
    const sort = query.sort ?? 'name'
    const direction = query.direction ?? 'asc'

    const scoped = snapshots.filter((snapshot) =>
      lifecycle === 'all' ? true : snapshot.vendor.lifecycle === lifecycle,
    )

    const filtered = scoped.filter((snapshot) => {
      const vendor = snapshot.vendor
      if (search.length > 0) {
        const haystack = `${vendor.company_name} ${vendor.contact_email} ${vendor.contact_name}`.toLowerCase()
        if (!haystack.includes(search)) return false
      }
      if (query.readiness && query.readiness.length > 0) {
        if (!query.readiness.includes(snapshot.readiness.status)) return false
      }
      if (query.category && vendor.category !== query.category) return false
      if (query.property && !vendor.property_tags.includes(query.property)) return false
      if (query.expiringSoonOnly && !snapshot.readiness.expiringSoon) return false
      return true
    })

    const sorted = [...filtered].sort((a, b) => {
      let result = 0
      if (sort === 'name') result = a.vendor.company_name.localeCompare(b.vendor.company_name)
      else if (sort === 'updated') result = a.vendor.updated_at.localeCompare(b.vendor.updated_at)
      else result = compareNextExpiration(a.readiness.nextExpiration, b.readiness.nextExpiration)
      if (result === 0) result = a.vendor.company_name.localeCompare(b.vendor.company_name)
      return direction === 'asc' ? result : -result
    })

    const total = sorted.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const page = Math.min(Math.max(query.page ?? 1, 1), totalPages)
    const start = (page - 1) * pageSize

    const rows: VendorRow[] = sorted.slice(start, start + pageSize).map((snapshot) => ({
      vendor: snapshot.vendor,
      readiness: snapshot.readiness,
      invitationStatus: invitationStatus(
        invitations.filter((invitation) => invitation.vendor_id === snapshot.vendor.id),
        nowIso(ctx),
      ).status,
    }))

    return {
      rows,
      total,
      page,
      pageSize,
      totalPages,
      counts,
      categories: [...new Set(snapshots.map((snapshot) => snapshot.vendor.category))].sort(),
      properties: [...new Set(snapshots.flatMap((snapshot) => snapshot.vendor.property_tags))].sort(),
      filteredEmpty: total === 0 && scoped.length > 0,
    }
  })
}

/** Every filtered row, ignoring pagination — used by the CSV export (FR-11). */
export async function listAllFilteredVendors(
  ctx: ServiceContext,
  query: VendorListQuery,
): Promise<VendorSnapshot[]> {
  const result = await listVendors(ctx, { ...query, page: 1, pageSize: Number.MAX_SAFE_INTEGER })
  const ids = new Set(result.rows.map((row) => row.vendor.id))
  return await ctx.db.read(async (uow) => {
    const snapshots = await loadVendorSnapshots(uow, ctx.organizationId, today(ctx))
    return snapshots.filter((snapshot) => ids.has(snapshot.vendor.id))
  })
}

export async function getVendorSnapshot(ctx: ServiceContext, vendorId: UUID): Promise<VendorSnapshot> {
  requireCapability(ctx, 'org.view_all_vendors')
  return await ctx.db.read((uow) => loadVendorSnapshot(uow, vendorId, today(ctx), ctx.organizationId))
}

export interface VendorDetail {
  snapshot: VendorSnapshot
  invitation: ReturnType<typeof invitationStatus>
  invitations: Awaited<ReturnType<typeof loadVendorInvitations>>
  activity: Awaited<ReturnType<typeof loadVendorActivity>>
  /** Latest correction or revocation reason per requirement, for the vendor-facing message. */
  correctionReasons: Record<UUID, string | null>
  lastReminderAt: string | null
}

export async function getVendorDetail(ctx: ServiceContext, vendorId: UUID): Promise<VendorDetail> {
  requireCapability(ctx, 'org.view_all_vendors')
  return await ctx.db.read(async (uow) => {
    const snapshot = await loadVendorSnapshot(uow, vendorId, today(ctx), ctx.organizationId)
    const invitations = await loadVendorInvitations(uow, vendorId)
    const activity = await loadVendorActivity(uow, vendorId)
    const notifications = await uow.notifications.where('by_vendor', vendorId)
    const reviewEvents = await uow.reviewEvents.getAll()

    const correctionReasons: Record<UUID, string | null> = {}
    for (const status of snapshot.requirementStatuses) {
      const latest = status.latest
      if (!latest || (latest.state !== 'changes_requested' && latest.state !== 'revoked')) {
        correctionReasons[status.requirement.id] = null
        continue
      }
      const reason = reviewEvents
        .filter(
          (event) =>
            event.submission_id === latest.id &&
            (event.decision === 'changes_requested' || event.decision === 'revoked'),
        )
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.reason
      correctionReasons[status.requirement.id] = reason ?? null
    }

    const reminders = notifications
      .filter((notification) => notification.type === 'vendor_digest')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))

    return {
      snapshot,
      invitation: invitationStatus(invitations, nowIso(ctx)),
      invitations,
      activity,
      correctionReasons,
      lastReminderAt: reminders[0]?.created_at ?? null,
    }
  })
}

export interface DuplicateWarning {
  vendor_id: UUID
  company_name: string
}

/** Case-insensitive company-name duplicate check (FR-01). Email may be shared. */
export async function findDuplicateCompanyName(
  ctx: ServiceContext,
  companyName: string,
  excludeVendorId?: UUID,
): Promise<DuplicateWarning | null> {
  const target = companyName.trim().toLowerCase()
  if (target.length === 0) return null
  return await ctx.db.read(async (uow) => {
    const vendors = await uow.vendors.where('by_organization', ctx.organizationId)
    const match = vendors.find(
      (vendor) => vendor.company_name.trim().toLowerCase() === target && vendor.id !== excludeVendorId,
    )
    return match ? { vendor_id: match.id, company_name: match.company_name } : null
  })
}

export interface CreateVendorInput extends VendorInput {
  template_id: UUID | null
  requestKey?: string
  /** Set after the user confirms a duplicate company name. */
  confirmDuplicate?: boolean
}

export async function createVendor(
  ctx: ServiceContext,
  input: CreateVendorInput,
): Promise<{ vendor_id: UUID; replayed: boolean }> {
  requireCapability(ctx, 'vendor.manage')
  const parsed = vendorInputSchema.safeParse(input)
  if (!parsed.success) {
    throw validationError('Fix the highlighted fields.', fieldErrorsFrom(parsed.error))
  }
  // A replayed request must not be rejected as its own duplicate.
  if (input.requestKey) {
    const replay = await ctx.db.read((uow) => uow.requests.get(input.requestKey as string))
    if (replay) {
      return { ...(JSON.parse(replay.result_json) as { vendor_id: UUID }), replayed: true }
    }
  }
  if (!input.confirmDuplicate) {
    const duplicate = await findDuplicateCompanyName(ctx, parsed.data.company_name)
    if (duplicate) {
      throw conflict(
        `${duplicate.company_name} already exists in this organization. Confirm that this is a separate vendor record before saving.`,
      )
    }
  }

  const result = await ctx.db.write(async (uow) =>
    withIdempotency(uow, input.requestKey ?? null, nowIso(ctx), async () => {
      const timestamp = nowIso(ctx)
      const vendor: Vendor = {
        id: newId(),
        organization_id: ctx.organizationId,
        company_name: parsed.data.company_name,
        category: parsed.data.category,
        contact_name: parsed.data.contact_name,
        contact_email: parsed.data.contact_email,
        lifecycle: 'active',
        invited_at: null,
        property_tags: parsed.data.property_tags,
        archived_at: null,
        archive_reason: null,
        created_at: timestamp,
        updated_at: timestamp,
        record_version: 1,
      }
      await uow.vendors.put(vendor)
      await uow.vendorMemberships.put({
        id: newId(),
        organization_id: ctx.organizationId,
        vendor_id: vendor.id,
        user_id: newId(),
        verified_at: null,
      })
      await recordActivity(uow, ctx, {
        vendor_id: vendor.id,
        event_type: 'vendor_created',
        target_id: vendor.id,
        summary: `Added vendor ${vendor.company_name}`,
        metadata: { category: vendor.category, properties: vendor.property_tags.join(', ') },
      })

      if (input.template_id) {
        await assignTemplateWithin(uow, ctx, vendor, input.template_id)
      }
      return { vendor_id: vendor.id }
    }),
  )
  return { vendor_id: result.value.vendor_id, replayed: result.replayed }
}

export interface UpdateVendorInput extends VendorInput {
  expectedVersion: number
  confirmDuplicate?: boolean
}

export async function updateVendor(
  ctx: ServiceContext,
  vendorId: UUID,
  input: UpdateVendorInput,
): Promise<Vendor> {
  requireCapability(ctx, 'vendor.manage')
  const parsed = vendorInputSchema.safeParse(input)
  if (!parsed.success) {
    throw validationError('Fix the highlighted fields.', fieldErrorsFrom(parsed.error))
  }
  if (!input.confirmDuplicate) {
    const duplicate = await findDuplicateCompanyName(ctx, parsed.data.company_name, vendorId)
    if (duplicate) {
      throw conflict(
        `${duplicate.company_name} already exists in this organization. Confirm that this is a separate vendor record before saving.`,
      )
    }
  }

  return await ctx.db.write(async (uow) => {
    const vendor = requireOwned(
      await uow.vendors.get(vendorId),
      ctx.organizationId,
      'That vendor no longer exists.',
    )
    if (vendor.record_version !== input.expectedVersion) {
      throw conflict('This vendor changed in another tab. Reload to see the current details.')
    }
    const changed: string[] = []
    if (vendor.company_name !== parsed.data.company_name) changed.push('company name')
    if (vendor.category !== parsed.data.category) changed.push('category')
    if (vendor.contact_name !== parsed.data.contact_name) changed.push('contact name')
    if (vendor.contact_email !== parsed.data.contact_email) changed.push('contact email')
    if (vendor.property_tags.join('|') !== parsed.data.property_tags.join('|')) changed.push('properties')

    const updated: Vendor = {
      ...vendor,
      ...parsed.data,
      updated_at: nowIso(ctx),
      record_version: vendor.record_version + 1,
    }
    await uow.vendors.put(updated)
    await recordActivity(uow, ctx, {
      vendor_id: vendor.id,
      event_type: 'vendor_updated',
      target_id: vendor.id,
      summary:
        changed.length > 0
          ? `Updated ${vendor.company_name}: ${changed.join(', ')}`
          : `Saved ${vendor.company_name} with no field changes`,
      metadata: { fields: changed.join(', ') },
    })
    return updated
  })
}

export async function archiveVendor(
  ctx: ServiceContext,
  vendorId: UUID,
  reason: string,
): Promise<Vendor> {
  requireCapability(ctx, 'vendor.archive')
  const trimmedReason = reason.trim()
  if (trimmedReason.length === 0) {
    throw validationError('Add a short reason so the history explains the change.', {
      reason: 'Enter a reason for archiving this vendor.',
    })
  }
  return await ctx.db.write(async (uow) => {
    const vendor = requireOwned(
      await uow.vendors.get(vendorId),
      ctx.organizationId,
      'That vendor no longer exists.',
    )
    if (vendor.lifecycle === 'archived') return vendor
    const timestamp = nowIso(ctx)
    const updated: Vendor = {
      ...vendor,
      lifecycle: 'archived',
      archived_at: timestamp,
      archive_reason: trimmedReason,
      updated_at: timestamp,
      record_version: vendor.record_version + 1,
    }
    await uow.vendors.put(updated)
    await recordActivity(uow, ctx, {
      vendor_id: vendor.id,
      event_type: 'vendor_archived',
      target_id: vendor.id,
      summary: `Archived ${vendor.company_name}`,
      reason: trimmedReason,
    })
    return updated
  })
}

export async function restoreVendor(ctx: ServiceContext, vendorId: UUID): Promise<Vendor> {
  requireCapability(ctx, 'vendor.archive')
  return await ctx.db.write(async (uow) => {
    const vendor = requireOwned(
      await uow.vendors.get(vendorId),
      ctx.organizationId,
      'That vendor no longer exists.',
    )
    if (vendor.lifecycle === 'active') return vendor
    const timestamp = nowIso(ctx)
    const updated: Vendor = {
      ...vendor,
      lifecycle: 'active',
      archived_at: null,
      archive_reason: null,
      updated_at: timestamp,
      record_version: vendor.record_version + 1,
    }
    await uow.vendors.put(updated)
    await recordActivity(uow, ctx, {
      vendor_id: vendor.id,
      event_type: 'vendor_restored',
      target_id: vendor.id,
      summary: `Restored ${vendor.company_name} to the active directory`,
    })
    return updated
  })
}

export interface TemplateWithItems {
  template: RequirementTemplate
  items: TemplateItem[]
}

export async function listTemplatesWithItems(ctx: ServiceContext): Promise<TemplateWithItems[]> {
  requireCapability(ctx, 'org.view_all_vendors')
  return await ctx.db.read(async (uow) => {
    const templates = await uow.templates.where('by_organization', ctx.organizationId)
    const items = await uow.templateItems.getAll()
    return templates
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((template) => ({
        template,
        items: items
          .filter((item) => item.template_id === template.id)
          .sort((a, b) => a.sort_order - b.sort_order),
      }))
  })
}

/** Copy the template's current items onto the vendor as an immutable snapshot (FR-02). */
async function assignTemplateWithin(
  uow: UnitOfWork,
  ctx: ServiceContext,
  vendor: Vendor,
  templateId: UUID,
): Promise<AssignedRequirement[]> {
  const template = requireOwned(
    await uow.templates.get(templateId),
    ctx.organizationId,
    'That checklist template no longer exists.',
  )
  const items = (await uow.templateItems.where('by_template', templateId)).sort(
    (a, b) => a.sort_order - b.sort_order,
  )
  const timestamp = nowIso(ctx)
  const created: AssignedRequirement[] = items.map((item, index) => ({
    id: newId(),
    organization_id: ctx.organizationId,
    vendor_id: vendor.id,
    source_template_id: template.id,
    source_template_version: template.version,
    source_item_id: item.id,
    title: item.title,
    instructions: item.instructions,
    required: item.required,
    expiration_required: item.expiration_required,
    collect_issue_date: item.collect_issue_date,
    sort_order: index,
    due_date: null,
    retired_at: null,
    retired_reason: null,
    effective_submission_id: null,
    created_at: timestamp,
    updated_at: timestamp,
    record_version: 1,
  }))
  await uow.requirements.putMany(created)
  await recordActivity(uow, ctx, {
    vendor_id: vendor.id,
    event_type: 'checklist_assigned',
    target_id: template.id,
    summary: `Assigned checklist "${template.name}" v${template.version} (${created.length} items)`,
    metadata: { template_version: template.version, item_count: created.length },
    vendor_visible: true,
  })
  return created
}

export interface ChecklistImpactPreview {
  addedTitles: string[]
  currentStatus: ReadinessStatus
  projectedStatus: ReadinessStatus
  requiredBefore: number
  requiredAfter: number
}

/** Readiness impact preview required before changing an assigned checklist (section 5.1). */
export async function previewAssignTemplate(
  ctx: ServiceContext,
  vendorId: UUID,
  templateId: UUID,
): Promise<ChecklistImpactPreview> {
  return await ctx.db.read(async (uow) => {
    const todayValue = today(ctx)
    const snapshot = await loadVendorSnapshot(uow, vendorId, todayValue, ctx.organizationId)
    const template = requireOwned(
      await uow.templates.get(templateId),
      ctx.organizationId,
      'That checklist template no longer exists.',
    )
    const items = await uow.templateItems.where('by_template', templateId)
    const timestamp = nowIso(ctx)
    const projected: AssignedRequirement[] = items.map((item, index) => ({
      id: `preview-${index}`,
      organization_id: ctx.organizationId,
      vendor_id: vendorId,
      source_template_id: template.id,
      source_template_version: template.version,
      source_item_id: item.id,
      title: item.title,
      instructions: item.instructions,
      required: item.required,
      expiration_required: item.expiration_required,
      collect_issue_date: item.collect_issue_date,
      sort_order: 1000 + index,
      due_date: null,
      retired_at: null,
      retired_reason: null,
      effective_submission_id: null,
      created_at: timestamp,
      updated_at: timestamp,
      record_version: 1,
    }))
    const projectedSnapshot = buildSnapshot(
      snapshot.vendor,
      [...snapshot.requirements, ...projected],
      snapshot.submissions,
      todayValue,
    )
    return {
      addedTitles: projected.map((item) => item.title),
      currentStatus: snapshot.readiness.status,
      projectedStatus: projectedSnapshot.readiness.status,
      requiredBefore: snapshot.readiness.requiredTotal,
      requiredAfter: projectedSnapshot.readiness.requiredTotal,
    }
  })
}

export async function assignTemplate(
  ctx: ServiceContext,
  vendorId: UUID,
  templateId: UUID,
  reason: string,
): Promise<void> {
  requireCapability(ctx, 'vendor.manage')
  if (reason.trim().length === 0) {
    throw validationError('Add a reason for the checklist change.', {
      reason: 'Explain why these requirements are being added.',
    })
  }
  await ctx.db.write(async (uow) => {
    const vendor = requireOwned(
      await uow.vendors.get(vendorId),
      ctx.organizationId,
      'That vendor no longer exists.',
    )
    const created = await assignTemplateWithin(uow, ctx, vendor, templateId)
    await recordActivity(uow, ctx, {
      vendor_id: vendorId,
      event_type: 'requirement_added',
      target_id: templateId,
      summary: `Added ${created.length} requirement${created.length === 1 ? '' : 's'} to ${vendor.company_name}`,
      reason: reason.trim(),
      vendor_visible: true,
    })
  })
}

/** Retiring keeps submissions and history but removes the item from the calculation. */
export async function retireRequirement(
  ctx: ServiceContext,
  requirementId: UUID,
  reason: string,
): Promise<void> {
  requireCapability(ctx, 'template.manage')
  if (reason.trim().length === 0) {
    throw validationError('A reason is required to retire a requirement.', {
      reason: 'Explain why this requirement no longer applies.',
    })
  }
  await ctx.db.write(async (uow) => {
    const requirement = requireOwned(
      await uow.requirements.get(requirementId),
      ctx.organizationId,
      'That requirement no longer exists.',
    )
    const vendor = await uow.vendors.get(requirement.vendor_id)
    const timestamp = nowIso(ctx)
    await uow.requirements.put({
      ...requirement,
      retired_at: timestamp,
      retired_reason: reason.trim(),
      updated_at: timestamp,
      record_version: requirement.record_version + 1,
    })
    await recordActivity(uow, ctx, {
      vendor_id: requirement.vendor_id,
      event_type: 'requirement_retired',
      target_id: requirement.id,
      summary: `Retired requirement "${requirement.title}"${vendor ? ` for ${vendor.company_name}` : ''}`,
      reason: reason.trim(),
      vendor_visible: true,
    })
  })
}

export async function restoreRequirement(
  ctx: ServiceContext,
  requirementId: UUID,
  reason: string,
): Promise<void> {
  requireCapability(ctx, 'template.manage')
  if (reason.trim().length === 0) {
    throw validationError('A reason is required to reinstate a requirement.', {
      reason: 'Explain why this requirement applies again.',
    })
  }
  await ctx.db.write(async (uow) => {
    const requirement = requireOwned(
      await uow.requirements.get(requirementId),
      ctx.organizationId,
      'That requirement no longer exists.',
    )
    const timestamp = nowIso(ctx)
    await uow.requirements.put({
      ...requirement,
      retired_at: null,
      retired_reason: null,
      updated_at: timestamp,
      record_version: requirement.record_version + 1,
    })
    await recordActivity(uow, ctx, {
      vendor_id: requirement.vendor_id,
      event_type: 'requirement_updated',
      target_id: requirement.id,
      summary: `Reinstated requirement "${requirement.title}"`,
      reason: reason.trim(),
      vendor_visible: true,
    })
  })
}

export async function setRequirementDueDate(
  ctx: ServiceContext,
  requirementId: UUID,
  dueDate: IsoDate | null,
): Promise<void> {
  requireCapability(ctx, 'vendor.manage')
  await ctx.db.write(async (uow) => {
    const requirement = requireOwned(
      await uow.requirements.get(requirementId),
      ctx.organizationId,
      'That requirement no longer exists.',
    )
    if (dueDate && requirement.due_date && compareDates(dueDate, requirement.due_date) === 0) return
    const timestamp = nowIso(ctx)
    await uow.requirements.put({
      ...requirement,
      due_date: dueDate,
      updated_at: timestamp,
      record_version: requirement.record_version + 1,
    })
    await recordActivity(uow, ctx, {
      vendor_id: requirement.vendor_id,
      event_type: 'requirement_updated',
      target_id: requirement.id,
      summary: dueDate
        ? `Set due date ${dueDate} for "${requirement.title}"`
        : `Cleared the due date for "${requirement.title}"`,
      vendor_visible: true,
    })
  })
}
