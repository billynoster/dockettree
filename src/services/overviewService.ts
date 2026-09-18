/** Overview dashboard data (requirements section 6 `/overview`, W5). */
import { daysUntilExpiration } from '@/domain/dates'
import { countReadiness, type Blocker, type ReadinessCounts } from '@/domain/readiness'
import type { ActivityEvent, IsoDate, ReadinessStatus, UUID } from '@/domain/types'
import { today, type ServiceContext } from './context'
import { loadVendorSnapshots, sortByCreatedAtDesc } from './queries'

export interface AttentionItem {
  vendor_id: UUID
  company_name: string
  status: ReadinessStatus
  expiringSoon: boolean
  topBlocker: Blocker | null
  blockerCount: number
  nextExpiration: IsoDate | null
  daysUntilExpiration: number | null
  /** Lower sorts first. */
  priority: number
  reason: string
}

export interface OverviewData {
  counts: ReadinessCounts
  pendingReviewCount: number
  attention: AttentionItem[]
  recentActivity: ActivityEvent[]
  today: IsoDate
}

const PRIORITY = {
  expired: 0,
  revoked: 1,
  changes_requested: 2,
  missing: 3,
  expiring_soon: 4,
  awaiting_review: 5,
}

export async function getOverview(ctx: ServiceContext): Promise<OverviewData> {
  return await ctx.db.read(async (uow) => {
    const todayValue = today(ctx)
    const snapshots = await loadVendorSnapshots(uow, ctx.organizationId, todayValue)
    const activeSnapshots = snapshots.filter((snapshot) => snapshot.vendor.lifecycle === 'active')
    const counts = countReadiness(snapshots.map((snapshot) => snapshot.readiness))

    const pendingReviewCount = activeSnapshots.reduce(
      (total, snapshot) => total + snapshot.readiness.pendingSubmissionCount,
      0,
    )

    const attention: AttentionItem[] = []
    for (const snapshot of activeSnapshots) {
      const readiness = snapshot.readiness
      const topBlocker = readiness.blockers[0] ?? null
      let priority: number | null = null
      let reason = ''

      if (topBlocker) {
        if (topBlocker.reason === 'expired' || topBlocker.reason === 'expired_replacement_pending') {
          priority = PRIORITY.expired
          reason = topBlocker.label
        } else if (topBlocker.reason === 'revoked') {
          priority = PRIORITY.revoked
          reason = topBlocker.label
        } else if (topBlocker.reason === 'changes_requested') {
          priority = PRIORITY.changes_requested
          reason = topBlocker.label
        } else if (topBlocker.reason === 'missing' || topBlocker.reason === 'withdrawn') {
          priority = PRIORITY.missing
          reason = topBlocker.label
        } else {
          priority = PRIORITY.awaiting_review
          reason = topBlocker.label
        }
      } else if (readiness.expiringSoon) {
        priority = PRIORITY.expiring_soon
        const days = readiness.nextExpiration
          ? daysUntilExpiration(readiness.nextExpiration, todayValue)
          : null
        reason =
          days === null
            ? 'A required document expires soon'
            : `Required document expires in ${days} day${days === 1 ? '' : 's'}`
      } else if (readiness.status === 'unconfigured') {
        priority = PRIORITY.missing
        reason = 'No required items assigned yet'
      }

      if (priority === null) continue
      attention.push({
        vendor_id: snapshot.vendor.id,
        company_name: snapshot.vendor.company_name,
        status: readiness.status,
        expiringSoon: readiness.expiringSoon,
        topBlocker,
        blockerCount: readiness.blockers.length,
        nextExpiration: readiness.nextExpiration,
        daysUntilExpiration: readiness.nextExpiration
          ? daysUntilExpiration(readiness.nextExpiration, todayValue)
          : null,
        priority,
        reason,
      })
    }

    attention.sort(
      (a, b) =>
        a.priority - b.priority ||
        (a.daysUntilExpiration ?? 9999) - (b.daysUntilExpiration ?? 9999) ||
        a.company_name.localeCompare(b.company_name),
    )

    const activity = sortByCreatedAtDesc(
      (await uow.activity.getAll()).filter((event) => event.organization_id === ctx.organizationId),
    ).slice(0, 8)

    return { counts, pendingReviewCount, attention, recentActivity: activity, today: todayValue }
  })
}
