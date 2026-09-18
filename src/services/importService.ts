/** Vendor CSV import (requirements FR-10). Atomic, idempotent, never auto-invites. */
import { conflict, notFound, validationError } from '@/domain/errors'
import { newId } from '@/domain/ids'
import { validateImportCsv, type ImportValidation } from '@/domain/csv'
import type { AssignedRequirement, ImportBatch, UUID, Vendor } from '@/domain/types'
import { recordActivity } from './activityService'
import { nowIso, requireCapability, type ServiceContext } from './context'

export async function previewImport(ctx: ServiceContext, text: string): Promise<ImportValidation> {
  requireCapability(ctx, 'vendor.manage')
  const existing = await ctx.db.read(async (uow) => {
    const vendors = await uow.vendors.where('by_organization', ctx.organizationId)
    return vendors.map((vendor) => vendor.company_name)
  })
  return validateImportCsv(text, { existingCompanyNames: existing })
}

export interface ImportVendorsInput {
  text: string
  templateId: UUID | null
  /** Idempotency key for the whole batch. */
  requestKey: string
  confirmDuplicates?: boolean
}

export interface ImportVendorsResult {
  batch_id: UUID
  created: number
  replayed: boolean
  vendorIds: UUID[]
}

/**
 * Writes every valid row or nothing at all. Repeating the same request key returns the
 * original batch instead of creating vendors twice.
 */
export async function importVendors(
  ctx: ServiceContext,
  input: ImportVendorsInput,
): Promise<ImportVendorsResult> {
  requireCapability(ctx, 'vendor.manage')
  // A replayed batch returns the original result before validation runs again.
  const replay = await ctx.db.read((uow) => uow.importBatches.where('by_request_key', input.requestKey))
  if (replay.length > 0) {
    return {
      batch_id: replay[0].id,
      created: replay[0].created_vendor_ids.length,
      replayed: true,
      vendorIds: replay[0].created_vendor_ids,
    }
  }
  const validation = await previewImport(ctx, input.text)
  if (validation.fileError) {
    throw validationError(validation.fileError)
  }
  if (validation.issues.length > 0) {
    throw validationError(
      `${validation.issues.length} row problem${validation.issues.length === 1 ? '' : 's'} must be fixed before importing. No vendors were created.`,
    )
  }
  if (validation.duplicateWarnings.length > 0 && !input.confirmDuplicates) {
    throw conflict(
      `${validation.duplicateWarnings.length} row${validation.duplicateWarnings.length === 1 ? '' : 's'} duplicate an existing company name. Confirm the duplicates to continue.`,
    )
  }

  return await ctx.db.write(async (uow) => {
    const existingBatch = await uow.importBatches.where('by_request_key', input.requestKey)
    if (existingBatch.length > 0) {
      return {
        batch_id: existingBatch[0].id,
        created: existingBatch[0].created_vendor_ids.length,
        replayed: true,
        vendorIds: existingBatch[0].created_vendor_ids,
      }
    }

    const timestamp = nowIso(ctx)
    const template = input.templateId ? await uow.templates.get(input.templateId) : null
    if (input.templateId && !template) throw notFound('That checklist template no longer exists.')
    const templateItems = template
      ? (await uow.templateItems.where('by_template', template.id)).sort((a, b) => a.sort_order - b.sort_order)
      : []

    const vendorIds: UUID[] = []
    for (const candidate of validation.candidates) {
      const vendor: Vendor = {
        id: newId(),
        organization_id: ctx.organizationId,
        company_name: candidate.company_name,
        category: candidate.category,
        contact_name: candidate.contact_name,
        contact_email: candidate.contact_email,
        lifecycle: 'active',
        invited_at: null,
        property_tags: candidate.property_tags,
        archived_at: null,
        archive_reason: null,
        created_at: timestamp,
        updated_at: timestamp,
        record_version: 1,
      }
      await uow.vendors.put(vendor)
      vendorIds.push(vendor.id)

      if (template) {
        const requirements: AssignedRequirement[] = templateItems.map((item, index) => ({
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
        await uow.requirements.putMany(requirements)
      }

      await recordActivity(uow, ctx, {
        vendor_id: vendor.id,
        event_type: 'vendor_imported',
        target_id: vendor.id,
        summary: `Imported ${vendor.company_name} from CSV${template ? ` with checklist "${template.name}"` : ''}`,
        metadata: { row: candidate.row, template: template?.name ?? 'none' },
      })
    }

    const batch: ImportBatch = {
      id: newId(),
      organization_id: ctx.organizationId,
      request_key: input.requestKey,
      row_count: validation.candidates.length,
      status: 'completed',
      template_id: input.templateId,
      created_at: timestamp,
      created_vendor_ids: vendorIds,
    }
    await uow.importBatches.put(batch)

    return { batch_id: batch.id, created: vendorIds.length, replayed: false, vendorIds }
  })
}
