/**
 * Readiness-focused reports for operations coordinators.
 *
 * Summaries are derived from the same readiness math as the dashboard — never stored.
 */
import { toCsv } from '@/domain/csv'
import { daysUntilExpiration } from '@/domain/dates'
import { READINESS_LABEL } from '@/domain/readiness'
import type { IsoDate, ReadinessStatus, UUID } from '@/domain/types'
import { requireCapability, today, type ServiceContext } from './context'
import { loadVendorSnapshots } from './queries'

export interface ReportVendorRow {
  vendor_id: UUID
  company_name: string
  category: string
  lifecycle: 'active' | 'archived'
  status: ReadinessStatus
  status_label: string
  expiring_soon: boolean
  next_expiration: IsoDate | null
  days_until_expiration: number | null
  blockers: string
  properties: string[]
}

export interface PropertyReadinessRow {
  property_id: UUID | null
  property_name: string
  vendor_count: number
  ready: number
  not_ready: number
  awaiting_review: number
  unconfigured: number
  archived: number
  expiring_soon: number
}

export interface ReadinessReport {
  today: IsoDate
  totals: {
    active_vendors: number
    ready: number
    not_ready: number
    awaiting_review: number
    unconfigured: number
    archived: number
    expiring_soon: number
  }
  vendors: ReportVendorRow[]
  by_property: PropertyReadinessRow[]
  expiring_documents: {
    vendor_id: UUID
    company_name: string
    requirement_title: string
    expiration_date: IsoDate
    days_until: number
    properties: string[]
  }[]
}

export interface ReportExportResult {
  filename: string
  csv: string
  rowCount: number
}

export async function getReadinessReport(ctx: ServiceContext): Promise<ReadinessReport> {
  requireCapability(ctx, 'org.view_all_vendors')
  return await ctx.db.read(async (uow) => {
    const todayValue = today(ctx)
    const snapshots = await loadVendorSnapshots(uow, ctx.organizationId, todayValue)
    const properties = await uow.properties.where('by_organization', ctx.organizationId)
    const links = await uow.vendorProperties.where('by_organization', ctx.organizationId)

    const vendors: ReportVendorRow[] = snapshots
      .map((snapshot) => ({
        vendor_id: snapshot.vendor.id,
        company_name: snapshot.vendor.company_name,
        category: snapshot.vendor.category,
        lifecycle: snapshot.vendor.lifecycle,
        status: snapshot.readiness.status,
        status_label: READINESS_LABEL[snapshot.readiness.status],
        expiring_soon: snapshot.readiness.expiringSoon,
        next_expiration: snapshot.readiness.nextExpiration,
        days_until_expiration: snapshot.readiness.nextExpiration
          ? daysUntilExpiration(snapshot.readiness.nextExpiration, todayValue)
          : null,
        blockers: snapshot.readiness.blockers.map((blocker) => blocker.label).join('; '),
        properties: [...snapshot.vendor.property_tags].sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.company_name.localeCompare(b.company_name))

    const active = vendors.filter((row) => row.lifecycle === 'active')
    const totals = {
      active_vendors: active.length,
      ready: active.filter((row) => row.status === 'ready').length,
      not_ready: active.filter((row) => row.status === 'not_ready').length,
      awaiting_review: active.filter((row) => row.status === 'awaiting_review').length,
      unconfigured: active.filter((row) => row.status === 'unconfigured').length,
      archived: vendors.filter((row) => row.lifecycle === 'archived').length,
      expiring_soon: active.filter((row) => row.expiring_soon).length,
    }

    const vendorsByProperty = new Map<string, Set<UUID>>()
    for (const link of links) {
      const set = vendorsByProperty.get(link.property_id) ?? new Set()
      set.add(link.vendor_id)
      vendorsByProperty.set(link.property_id, set)
    }

    const snapshotByVendor = new Map(snapshots.map((snapshot) => [snapshot.vendor.id, snapshot]))
    const by_property: PropertyReadinessRow[] = properties
      .filter((property) => property.lifecycle === 'active')
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((property) => {
        const vendorIds = [...(vendorsByProperty.get(property.id) ?? [])]
        const rows = vendorIds
          .map((id) => snapshotByVendor.get(id))
          .filter((snapshot): snapshot is (typeof snapshots)[number] => Boolean(snapshot))
        const activeRows = rows.filter((snapshot) => snapshot.vendor.lifecycle === 'active')
        return {
          property_id: property.id,
          property_name: property.name,
          vendor_count: rows.length,
          ready: activeRows.filter((snapshot) => snapshot.readiness.status === 'ready').length,
          not_ready: activeRows.filter((snapshot) => snapshot.readiness.status === 'not_ready').length,
          awaiting_review: activeRows.filter(
            (snapshot) => snapshot.readiness.status === 'awaiting_review',
          ).length,
          unconfigured: activeRows.filter(
            (snapshot) => snapshot.readiness.status === 'unconfigured',
          ).length,
          archived: rows.filter((snapshot) => snapshot.vendor.lifecycle === 'archived').length,
          expiring_soon: activeRows.filter((snapshot) => snapshot.readiness.expiringSoon).length,
        }
      })

    const linkedVendorIds = new Set(links.map((link) => link.vendor_id))
    const unassigned = snapshots.filter((snapshot) => !linkedVendorIds.has(snapshot.vendor.id))
    if (unassigned.length > 0) {
      const activeRows = unassigned.filter((snapshot) => snapshot.vendor.lifecycle === 'active')
      by_property.push({
        property_id: null,
        property_name: 'Unassigned',
        vendor_count: unassigned.length,
        ready: activeRows.filter((snapshot) => snapshot.readiness.status === 'ready').length,
        not_ready: activeRows.filter((snapshot) => snapshot.readiness.status === 'not_ready').length,
        awaiting_review: activeRows.filter(
          (snapshot) => snapshot.readiness.status === 'awaiting_review',
        ).length,
        unconfigured: activeRows.filter(
          (snapshot) => snapshot.readiness.status === 'unconfigured',
        ).length,
        archived: unassigned.filter((snapshot) => snapshot.vendor.lifecycle === 'archived').length,
        expiring_soon: activeRows.filter((snapshot) => snapshot.readiness.expiringSoon).length,
      })
    }

    const expiring_documents: ReadinessReport['expiring_documents'] = []
    for (const snapshot of snapshots) {
      if (snapshot.vendor.lifecycle !== 'active') continue
      for (const status of snapshot.requirementStatuses) {
        if (!status.requirement.required || status.requirement.retired_at) continue
        if (!status.currentExpiration) continue
        const days = daysUntilExpiration(status.currentExpiration, todayValue)
        if (days == null || days > 30) continue
        expiring_documents.push({
          vendor_id: snapshot.vendor.id,
          company_name: snapshot.vendor.company_name,
          requirement_title: status.requirement.title,
          expiration_date: status.currentExpiration,
          days_until: days,
          properties: [...snapshot.vendor.property_tags],
        })
      }
    }
    expiring_documents.sort(
      (a, b) => a.days_until - b.days_until || a.company_name.localeCompare(b.company_name),
    )

    return { today: todayValue, totals, vendors, by_property, expiring_documents }
  })
}

export async function exportReadinessReportCsv(ctx: ServiceContext): Promise<ReportExportResult> {
  requireCapability(ctx, 'export.run')
  const report = await getReadinessReport(ctx)
  const columns = [
    'company_name',
    'category',
    'lifecycle',
    'readiness',
    'expiring_soon',
    'next_expiration',
    'days_until_expiration',
    'blockers',
    'properties',
    'exported_at',
  ]
  const exportedAt = ctx.clock.nowIso()
  const rows = report.vendors.map((row) => [
    row.company_name,
    row.category,
    row.lifecycle,
    row.status_label,
    row.expiring_soon ? 'yes' : 'no',
    row.next_expiration ?? '',
    row.days_until_expiration == null ? '' : String(row.days_until_expiration),
    row.blockers,
    row.properties.join('; '),
    exportedAt,
  ])
  return {
    filename: `readiness-report-${report.today}.csv`,
    csv: toCsv(columns, rows),
    rowCount: rows.length,
  }
}
