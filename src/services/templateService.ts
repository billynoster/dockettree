/**
 * Requirement template management (requirements section 6 `/requirements`, FR-02).
 *
 * Editing a template bumps its version and never changes requirements already assigned to
 * a vendor: assignments are snapshots.
 */
import { validationError } from '@/domain/errors'
import { newId } from '@/domain/ids'
import type { RequirementTemplate, TemplateItem, UUID } from '@/domain/types'
import { fieldErrorsFrom, templateItemSchema, templateSchema } from '@/domain/validation'
import { recordActivity } from './activityService'
import { nowIso, requireCapability, type ServiceContext } from './context'
import { requireOwned } from './queries'

export interface TemplateSummary {
  template: RequirementTemplate
  items: TemplateItem[]
  requiredCount: number
  optionalCount: number
  /** Number of vendors that carry a snapshot of this template. */
  assignedVendorCount: number
}

export async function listTemplates(ctx: ServiceContext): Promise<TemplateSummary[]> {
  requireCapability(ctx, 'org.view_all_vendors')
  return await ctx.db.read(async (uow) => {
    const templates = await uow.templates.where('by_organization', ctx.organizationId)
    const items = await uow.templateItems.getAll()
    const requirements = await uow.requirements.where('by_organization', ctx.organizationId)
    return templates
      .sort((a, b) => Number(Boolean(a.archived_at)) - Number(Boolean(b.archived_at)) || a.name.localeCompare(b.name))
      .map((template) => {
        const templateItems = items
          .filter((item) => item.template_id === template.id)
          .sort((a, b) => a.sort_order - b.sort_order)
        return {
          template,
          items: templateItems,
          requiredCount: templateItems.filter((item) => item.required).length,
          optionalCount: templateItems.filter((item) => !item.required).length,
          assignedVendorCount: new Set(
            requirements
              .filter((requirement) => requirement.source_template_id === template.id)
              .map((requirement) => requirement.vendor_id),
          ).size,
        }
      })
  })
}

export interface TemplateItemInput {
  id?: UUID
  title: string
  instructions: string
  required: boolean
  expiration_required: boolean
  collect_issue_date: boolean
}

export interface SaveTemplateInput {
  name: string
  description: string
  items: TemplateItemInput[]
}

function validateTemplateInput(input: SaveTemplateInput) {
  const parsed = templateSchema.safeParse({ name: input.name, description: input.description })
  if (!parsed.success) {
    throw validationError('Fix the highlighted fields.', fieldErrorsFrom(parsed.error))
  }
  if (input.items.length === 0) {
    throw validationError('Add at least one requirement to this template.', {
      items: 'A template needs at least one requirement.',
    })
  }
  const items = input.items.map((item, index) => {
    const itemParsed = templateItemSchema.safeParse(item)
    if (!itemParsed.success) {
      const errors = fieldErrorsFrom(itemParsed.error)
      const prefixed = Object.fromEntries(
        Object.entries(errors).map(([field, message]) => [`items.${index}.${field}`, message]),
      )
      throw validationError('Fix the highlighted requirement fields.', prefixed)
    }
    return { ...itemParsed.data, id: item.id }
  })
  return { template: parsed.data, items }
}

export async function createTemplate(ctx: ServiceContext, input: SaveTemplateInput): Promise<UUID> {
  requireCapability(ctx, 'template.manage')
  const validated = validateTemplateInput(input)
  return await ctx.db.write(async (uow) => {
    const timestamp = nowIso(ctx)
    const template: RequirementTemplate = {
      id: newId(),
      organization_id: ctx.organizationId,
      name: validated.template.name,
      description: validated.template.description,
      version: 1,
      archived_at: null,
      created_at: timestamp,
      updated_at: timestamp,
      record_version: 1,
    }
    await uow.templates.put(template)
    await uow.templateItems.putMany(
      validated.items.map((item, index) => ({
        id: newId(),
        template_id: template.id,
        title: item.title,
        instructions: item.instructions,
        required: item.required,
        expiration_required: item.expiration_required,
        collect_issue_date: item.collect_issue_date,
        sort_order: index,
      })),
    )
    await recordActivity(uow, ctx, {
      vendor_id: null,
      event_type: 'template_created',
      target_id: template.id,
      summary: `Created checklist template "${template.name}" with ${validated.items.length} items`,
      metadata: { item_count: validated.items.length },
    })
    return template.id
  })
}

export async function updateTemplate(
  ctx: ServiceContext,
  templateId: UUID,
  input: SaveTemplateInput,
): Promise<void> {
  requireCapability(ctx, 'template.manage')
  const validated = validateTemplateInput(input)
  await ctx.db.write(async (uow) => {
    const template = requireOwned(
      await uow.templates.get(templateId),
      ctx.organizationId,
      'That template no longer exists.',
    )
    const timestamp = nowIso(ctx)
    await uow.templates.put({
      ...template,
      name: validated.template.name,
      description: validated.template.description,
      version: template.version + 1,
      updated_at: timestamp,
      record_version: template.record_version + 1,
    })
    const existing = await uow.templateItems.where('by_template', templateId)
    const keptIds = new Set(validated.items.map((item) => item.id).filter(Boolean))
    for (const item of existing) {
      if (!keptIds.has(item.id)) await uow.templateItems.delete(item.id)
    }
    await uow.templateItems.putMany(
      validated.items.map((item, index) => ({
        id: item.id ?? newId(),
        template_id: templateId,
        title: item.title,
        instructions: item.instructions,
        required: item.required,
        expiration_required: item.expiration_required,
        collect_issue_date: item.collect_issue_date,
        sort_order: index,
      })),
    )
    await recordActivity(uow, ctx, {
      vendor_id: null,
      event_type: 'template_updated',
      target_id: templateId,
      summary: `Updated template "${validated.template.name}" to version ${template.version + 1}. Existing vendor assignments keep their snapshot.`,
      metadata: { version: template.version + 1, item_count: validated.items.length },
    })
  })
}

export async function setTemplateArchived(
  ctx: ServiceContext,
  templateId: UUID,
  archived: boolean,
): Promise<void> {
  requireCapability(ctx, 'template.manage')
  await ctx.db.write(async (uow) => {
    const template = requireOwned(
      await uow.templates.get(templateId),
      ctx.organizationId,
      'That template no longer exists.',
    )
    const timestamp = nowIso(ctx)
    await uow.templates.put({
      ...template,
      archived_at: archived ? timestamp : null,
      updated_at: timestamp,
      record_version: template.record_version + 1,
    })
    await recordActivity(uow, ctx, {
      vendor_id: null,
      event_type: archived ? 'template_archived' : 'template_updated',
      target_id: templateId,
      summary: archived
        ? `Archived template "${template.name}". Existing vendor assignments are unchanged.`
        : `Restored template "${template.name}"`,
    })
  })
}
