/** Vendor status CSV export (requirements FR-11). No document bytes, no access URLs. */
import { toCsv } from '@/domain/csv'
import { READINESS_LABEL } from '@/domain/readiness'
import { requireCapability, type ServiceContext } from './context'
import { listAllFilteredVendors, type VendorListQuery } from './vendorService'

export const EXPORT_COLUMNS = [
  'company_name',
  'category',
  'readiness',
  'expiring_soon',
  'blockers',
  'required_items_satisfied',
  'next_expiration',
  'contact_name',
  'contact_email',
  'properties',
  'exported_at',
]

export interface ExportResult {
  filename: string
  csv: string
  rowCount: number
}

/** Exports every filtered row, not only the current page. */
export async function exportVendorStatus(
  ctx: ServiceContext,
  query: VendorListQuery,
): Promise<ExportResult> {
  requireCapability(ctx, 'export.run')
  const snapshots = await listAllFilteredVendors(ctx, query)
  const exportedAt = ctx.clock.nowIso()

  const rows = snapshots
    .sort((a, b) => a.vendor.company_name.localeCompare(b.vendor.company_name))
    .map((snapshot) => [
      snapshot.vendor.company_name,
      snapshot.vendor.category,
      READINESS_LABEL[snapshot.readiness.status],
      snapshot.readiness.expiringSoon ? 'yes' : 'no',
      snapshot.readiness.blockers.map((blocker) => blocker.label).join('; '),
      `${snapshot.readiness.requiredSatisfied} of ${snapshot.readiness.requiredTotal}`,
      snapshot.readiness.nextExpiration ?? '',
      snapshot.vendor.contact_name,
      snapshot.vendor.contact_email,
      snapshot.vendor.property_tags.join('; '),
      exportedAt,
    ])

  return {
    filename: `vendor-readiness-${exportedAt.slice(0, 10)}.csv`,
    csv: toCsv(EXPORT_COLUMNS, rows),
    rowCount: rows.length,
  }
}
