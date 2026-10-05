/**
 * Organization properties (sites) and vendor associations.
 *
 * Property tags on vendors remain denormalized names for filters/CSV; links in
 * `vendor_properties` are the first-class association. Plan property limits are
 * informational (soft-warn only), matching billing usage meters.
 */
import { pricingPlans } from '@/config/pricing'
import { conflict, validationError } from '@/domain/errors'
import { newId } from '@/domain/ids'
import type { Property, UUID, Vendor, VendorProperty } from '@/domain/types'
import { fieldErrorsFrom, propertyInputSchema, type PropertyInput } from '@/domain/validation'
import type { UnitOfWork } from '@/repositories/types'
import { recordActivity } from './activityService'
import { nowIso, requireCapability, type ServiceContext } from './context'
import { requireOwned } from './queries'

export interface PropertyUsageLimits {
  activeCount: number
  planLimit: number | null
  planId: string | null
  softWarnThresholdRatio: number
  nearLimit: boolean
  atLimit: boolean
}

export interface PropertyListItem {
  property: Property
  vendorCount: number
  vendors: { id: UUID; company_name: string; lifecycle: Vendor['lifecycle'] }[]
}

export interface PropertyListResult {
  properties: PropertyListItem[]
  usage: PropertyUsageLimits
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

async function planPropertyLimit(uow: UnitOfWork, organizationId: UUID): Promise<{
  planId: string | null
  planLimit: number | null
}> {
  const billing = await uow.organizationBilling.get(organizationId)
  const planId = billing?.plan_id ?? null
  const plan = planId ? pricingPlans.find((entry) => entry.id === planId) : null
  return { planId, planLimit: plan?.limits.properties ?? null }
}

function usageFrom(activeCount: number, planLimit: number | null, planId: string | null): PropertyUsageLimits {
  const softWarnThresholdRatio = 0.8
  const nearLimit =
    planLimit != null && planLimit > 0 && activeCount >= Math.ceil(planLimit * softWarnThresholdRatio)
  const atLimit = planLimit != null && planLimit > 0 && activeCount >= planLimit
  return { activeCount, planLimit, planId, softWarnThresholdRatio, nearLimit, atLimit }
}

export async function listProperties(ctx: ServiceContext): Promise<PropertyListResult> {
  requireCapability(ctx, 'org.view_all_vendors')
  return await ctx.db.read(async (uow) => {
    const properties = await uow.properties.where('by_organization', ctx.organizationId)
    const links = await uow.vendorProperties.where('by_organization', ctx.organizationId)
    const vendors = await uow.vendors.where('by_organization', ctx.organizationId)
    const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]))
    const { planId, planLimit } = await planPropertyLimit(uow, ctx.organizationId)
    const activeCount = properties.filter((property) => property.lifecycle === 'active').length

    const items = properties
      .sort(
        (a, b) =>
          Number(Boolean(a.archived_at)) - Number(Boolean(b.archived_at)) ||
          a.name.localeCompare(b.name),
      )
      .map((property) => {
        const linked = links
          .filter((link) => link.property_id === property.id)
          .map((link) => vendorById.get(link.vendor_id))
          .filter((vendor): vendor is Vendor => Boolean(vendor))
          .sort((a, b) => a.company_name.localeCompare(b.company_name))
        return {
          property,
          vendorCount: linked.length,
          vendors: linked.map((vendor) => ({
            id: vendor.id,
            company_name: vendor.company_name,
            lifecycle: vendor.lifecycle,
          })),
        }
      })

    return { properties: items, usage: usageFrom(activeCount, planLimit, planId) }
  })
}

/** Active property names for vendor forms and filters (archived omitted). */
export async function listActivePropertyNames(ctx: ServiceContext): Promise<string[]> {
  requireCapability(ctx, 'org.view_all_vendors')
  return await ctx.db.read(async (uow) => {
    const properties = await uow.properties.where('by_organization', ctx.organizationId)
    return properties
      .filter((property) => property.lifecycle === 'active')
      .map((property) => property.name)
      .sort((a, b) => a.localeCompare(b))
  })
}

async function assertUniqueActiveName(
  uow: UnitOfWork,
  organizationId: UUID,
  name: string,
  exceptId?: UUID,
): Promise<void> {
  const properties = await uow.properties.where('by_organization', organizationId)
  const clash = properties.find(
    (property) =>
      property.lifecycle === 'active' &&
      property.id !== exceptId &&
      normalizeName(property.name) === normalizeName(name),
  )
  if (clash) {
    throw conflict(`An active property named "${clash.name}" already exists.`)
  }
}

/**
 * Ensure property rows exist for the given names and rewrite vendor_properties +
 * vendor.property_tags to match. Creates missing active properties on demand so
 * vendor edits stay consistent with the Properties directory.
 */
export async function syncVendorPropertyAssociations(
  uow: UnitOfWork,
  ctx: ServiceContext,
  vendor: Vendor,
  propertyNames: string[],
): Promise<string[]> {
  const cleaned = [...new Set(propertyNames.map((name) => name.trim()).filter(Boolean))]
  const existing = await uow.properties.where('by_organization', ctx.organizationId)
  const byName = new Map(existing.map((property) => [normalizeName(property.name), property]))
  const timestamp = nowIso(ctx)
  const resolved: Property[] = []

  for (const name of cleaned) {
    const key = normalizeName(name)
    let property = byName.get(key)
    if (!property) {
      property = {
        id: newId(),
        organization_id: ctx.organizationId,
        name,
        address: '',
        notes: '',
        lifecycle: 'active',
        archived_at: null,
        archive_reason: null,
        created_at: timestamp,
        updated_at: timestamp,
        record_version: 1,
      }
      await uow.properties.put(property)
      byName.set(key, property)
      await recordActivity(uow, ctx, {
        vendor_id: null,
        event_type: 'property_created',
        target_id: property.id,
        summary: `Created property "${property.name}" from a vendor assignment`,
        metadata: { source: 'vendor_sync' },
      })
    } else if (property.lifecycle === 'archived') {
      // Linking an archived site reactivates it so the association stays meaningful.
      property = {
        ...property,
        lifecycle: 'active',
        archived_at: null,
        archive_reason: null,
        updated_at: timestamp,
        record_version: property.record_version + 1,
      }
      await uow.properties.put(property)
      byName.set(key, property)
      await recordActivity(uow, ctx, {
        vendor_id: null,
        event_type: 'property_restored',
        target_id: property.id,
        summary: `Restored property "${property.name}" when linking ${vendor.company_name}`,
      })
    }
    resolved.push(property)
  }

  const existingLinks = await uow.vendorProperties.where('by_vendor', vendor.id)
  const keepIds = new Set(resolved.map((property) => property.id))
  for (const link of existingLinks) {
    if (!keepIds.has(link.property_id)) await uow.vendorProperties.delete(link.id)
  }
  const existingPropertyIds = new Set(existingLinks.map((link) => link.property_id))
  for (const property of resolved) {
    if (existingPropertyIds.has(property.id)) continue
    const link: VendorProperty = {
      id: newId(),
      organization_id: ctx.organizationId,
      vendor_id: vendor.id,
      property_id: property.id,
      created_at: timestamp,
    }
    await uow.vendorProperties.put(link)
  }

  return resolved.map((property) => property.name).sort((a, b) => a.localeCompare(b))
}

export async function createProperty(
  ctx: ServiceContext,
  input: PropertyInput,
): Promise<{ property_id: UUID; usage: PropertyUsageLimits }> {
  requireCapability(ctx, 'vendor.manage')
  const parsed = propertyInputSchema.safeParse(input)
  if (!parsed.success) {
    throw validationError('Fix the highlighted fields.', fieldErrorsFrom(parsed.error))
  }

  return await ctx.db.write(async (uow) => {
    await assertUniqueActiveName(uow, ctx.organizationId, parsed.data.name)
    const timestamp = nowIso(ctx)
    const property: Property = {
      id: newId(),
      organization_id: ctx.organizationId,
      name: parsed.data.name,
      address: parsed.data.address,
      notes: parsed.data.notes,
      lifecycle: 'active',
      archived_at: null,
      archive_reason: null,
      created_at: timestamp,
      updated_at: timestamp,
      record_version: 1,
    }
    await uow.properties.put(property)
    await recordActivity(uow, ctx, {
      vendor_id: null,
      event_type: 'property_created',
      target_id: property.id,
      summary: `Added property "${property.name}"`,
      metadata: { address: property.address },
    })

    const all = await uow.properties.where('by_organization', ctx.organizationId)
    const { planId, planLimit } = await planPropertyLimit(uow, ctx.organizationId)
    const activeCount = all.filter((entry) => entry.lifecycle === 'active').length
    return { property_id: property.id, usage: usageFrom(activeCount, planLimit, planId) }
  })
}

export async function updateProperty(
  ctx: ServiceContext,
  propertyId: UUID,
  input: PropertyInput & { expectedVersion: number },
): Promise<Property> {
  requireCapability(ctx, 'vendor.manage')
  const parsed = propertyInputSchema.safeParse(input)
  if (!parsed.success) {
    throw validationError('Fix the highlighted fields.', fieldErrorsFrom(parsed.error))
  }

  return await ctx.db.write(async (uow) => {
    const property = requireOwned(
      await uow.properties.get(propertyId),
      ctx.organizationId,
      'That property no longer exists.',
    )
    if (property.record_version !== input.expectedVersion) {
      throw conflict('This property changed in another tab. Reload to see the current details.')
    }
    if (property.lifecycle === 'active') {
      await assertUniqueActiveName(uow, ctx.organizationId, parsed.data.name, propertyId)
    }

    const renamed = property.name !== parsed.data.name
    const updated: Property = {
      ...property,
      name: parsed.data.name,
      address: parsed.data.address,
      notes: parsed.data.notes,
      updated_at: nowIso(ctx),
      record_version: property.record_version + 1,
    }
    await uow.properties.put(updated)

    if (renamed) {
      const links = await uow.vendorProperties.where('by_property', propertyId)
      for (const link of links) {
        const vendor = await uow.vendors.get(link.vendor_id)
        if (!vendor || vendor.organization_id !== ctx.organizationId) continue
        const tags = vendor.property_tags.map((tag) =>
          normalizeName(tag) === normalizeName(property.name) ? updated.name : tag,
        )
        await uow.vendors.put({
          ...vendor,
          property_tags: [...new Set(tags)],
          updated_at: nowIso(ctx),
          record_version: vendor.record_version + 1,
        })
      }
    }

    await recordActivity(uow, ctx, {
      vendor_id: null,
      event_type: 'property_updated',
      target_id: propertyId,
      summary: renamed
        ? `Renamed property "${property.name}" to "${updated.name}"`
        : `Updated property "${updated.name}"`,
      metadata: { renamed },
    })
    return updated
  })
}

export async function setPropertyArchived(
  ctx: ServiceContext,
  propertyId: UUID,
  archived: boolean,
  reason?: string,
): Promise<Property> {
  requireCapability(ctx, archived ? 'vendor.archive' : 'vendor.manage')
  return await ctx.db.write(async (uow) => {
    const property = requireOwned(
      await uow.properties.get(propertyId),
      ctx.organizationId,
      'That property no longer exists.',
    )
    if (archived && property.lifecycle === 'archived') return property
    if (!archived && property.lifecycle === 'active') return property

    if (!archived) {
      await assertUniqueActiveName(uow, ctx.organizationId, property.name, propertyId)
    }

    const timestamp = nowIso(ctx)
    const updated: Property = {
      ...property,
      lifecycle: archived ? 'archived' : 'active',
      archived_at: archived ? timestamp : null,
      archive_reason: archived ? (reason?.trim() || 'Archived') : null,
      updated_at: timestamp,
      record_version: property.record_version + 1,
    }
    await uow.properties.put(updated)
    await recordActivity(uow, ctx, {
      vendor_id: null,
      event_type: archived ? 'property_archived' : 'property_restored',
      target_id: propertyId,
      summary: archived
        ? `Archived property "${property.name}"`
        : `Restored property "${property.name}"`,
      reason: archived ? updated.archive_reason : null,
    })
    return updated
  })
}

export async function setPropertyVendors(
  ctx: ServiceContext,
  propertyId: UUID,
  vendorIds: UUID[],
): Promise<PropertyListItem> {
  requireCapability(ctx, 'vendor.manage')
  return await ctx.db.write(async (uow) => {
    const property = requireOwned(
      await uow.properties.get(propertyId),
      ctx.organizationId,
      'That property no longer exists.',
    )
    if (property.lifecycle === 'archived') {
      throw validationError('Restore this property before changing vendor assignments.', {
        property: 'Archived properties cannot be linked to vendors.',
      })
    }

    const uniqueVendorIds = [...new Set(vendorIds)]
    const vendors: Vendor[] = []
    for (const vendorId of uniqueVendorIds) {
      const vendor = requireOwned(
        await uow.vendors.get(vendorId),
        ctx.organizationId,
        'One of the selected vendors no longer exists.',
      )
      vendors.push(vendor)
    }

    const existingLinks = await uow.vendorProperties.where('by_property', propertyId)
    const keep = new Set(uniqueVendorIds)
    for (const link of existingLinks) {
      if (!keep.has(link.vendor_id)) {
        await uow.vendorProperties.delete(link.id)
        const vendor = await uow.vendors.get(link.vendor_id)
        if (vendor) {
          const tags = vendor.property_tags.filter(
            (tag) => normalizeName(tag) !== normalizeName(property.name),
          )
          await uow.vendors.put({
            ...vendor,
            property_tags: tags,
            updated_at: nowIso(ctx),
            record_version: vendor.record_version + 1,
          })
        }
      }
    }

    const existingVendorIds = new Set(existingLinks.map((link) => link.vendor_id))
    const timestamp = nowIso(ctx)
    for (const vendor of vendors) {
      if (!existingVendorIds.has(vendor.id)) {
        await uow.vendorProperties.put({
          id: newId(),
          organization_id: ctx.organizationId,
          vendor_id: vendor.id,
          property_id: propertyId,
          created_at: timestamp,
        })
      }
      if (!vendor.property_tags.some((tag) => normalizeName(tag) === normalizeName(property.name))) {
        await uow.vendors.put({
          ...vendor,
          property_tags: [...vendor.property_tags, property.name].sort((a, b) => a.localeCompare(b)),
          updated_at: timestamp,
          record_version: vendor.record_version + 1,
        })
      }
    }

    await recordActivity(uow, ctx, {
      vendor_id: null,
      event_type: 'property_updated',
      target_id: propertyId,
      summary: `Updated vendor links for "${property.name}" (${vendors.length} vendors)`,
      metadata: { vendor_count: vendors.length },
    })

    return {
      property,
      vendorCount: vendors.length,
      vendors: vendors
        .sort((a, b) => a.company_name.localeCompare(b.company_name))
        .map((vendor) => ({
          id: vendor.id,
          company_name: vendor.company_name,
          lifecycle: vendor.lifecycle,
        })),
    }
  })
}
