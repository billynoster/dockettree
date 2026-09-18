/**
 * Reminder eligibility — pure implementation of requirements section 5.5.
 *
 * These pure functions decide which reminders are eligible; the reminder service turns a
 * plan into outbox rows and the delivery worker attempts to send them.
 */
import { daysBetween, daysUntilExpiration } from './dates'
import type { RequirementStatus } from './readiness'
import { isActiveRequirement } from './readiness'
import type { IsoDate, NotificationItem, UUID, VendorLifecycle } from './types'

/** First missing-item reminder is 3 days after invitation, then every 7 days. */
export const MISSING_ITEM_FIRST_DAY = 3
export const MISSING_ITEM_INTERVAL_DAYS = 7
/** Renewal reminders become eligible at these days-remaining milestones. */
export const RENEWAL_MILESTONES = [30, 14, 7, 0]
/** Manual reminders are limited to one per vendor per 24 hours. */
export const MANUAL_REMINDER_COOLDOWN_HOURS = 24

export type ReminderLineKind = 'missing_item' | 'renewal' | 'expiration_internal'

export interface ReminderLine extends NotificationItem {
  kind: ReminderLineKind
}

export type ReminderSkipReason = 'archived' | 'no_actionable_items' | 'not_invited'

export interface VendorReminderPlan {
  vendor_id: UUID
  /** Vendor-facing digest lines. Empty means nothing to send. */
  vendorLines: ReminderLine[]
  /** Internal coordinator notices (expiration awareness, sent regardless of pending review). */
  internalLines: ReminderLine[]
  skipReason: ReminderSkipReason | null
}

export interface VendorReminderInput {
  vendor_id: UUID
  lifecycle: VendorLifecycle
  /** Invitation date in organization-local time, or null when never invited. */
  invitedDate: IsoDate | null
  requirements: RequirementStatus[]
}

/** Largest reached milestone of the 3-then-every-7-days cadence, or null before day 3. */
export function missingItemMilestoneDay(invitedDate: IsoDate | null, today: IsoDate): number | null {
  if (!invitedDate) return null
  const elapsed = daysBetween(invitedDate, today)
  if (elapsed < MISSING_ITEM_FIRST_DAY) return null
  const intervals = Math.floor((elapsed - MISSING_ITEM_FIRST_DAY) / MISSING_ITEM_INTERVAL_DAYS)
  return MISSING_ITEM_FIRST_DAY + intervals * MISSING_ITEM_INTERVAL_DAYS
}

/**
 * Most recent eligible renewal milestone for a document, or null when the document is
 * further out than 30 days. Returns `'expired'` once the document has lapsed.
 */
export function renewalMilestone(expiration: IsoDate, today: IsoDate): number | 'expired' | null {
  const remaining = daysUntilExpiration(expiration, today)
  if (remaining < 0) return 'expired'
  const reached = RENEWAL_MILESTONES.filter((milestone) => remaining <= milestone)
  if (reached.length === 0) return null
  return Math.min(...reached)
}

/**
 * Build the reminder plan for one vendor on one local date.
 *
 * `scheduled` mirrors the pilot's daily 09:00 job: it requires an invitation before the
 * missing-item cadence starts. A manual reminder ignores the cadence but still excludes
 * requirements whose only outstanding state is "awaiting review".
 */
export function planVendorReminder(
  input: VendorReminderInput,
  today: IsoDate,
  options: { scheduled: boolean },
): VendorReminderPlan {
  const empty = (skipReason: ReminderSkipReason): VendorReminderPlan => ({
    vendor_id: input.vendor_id,
    vendorLines: [],
    internalLines: [],
    skipReason,
  })

  if (input.lifecycle === 'archived') return empty('archived')

  const active = input.requirements.filter((status) => isActiveRequirement(status.requirement))
  const required = active.filter((status) => status.requirement.required)

  const milestoneDay = missingItemMilestoneDay(input.invitedDate, today)
  if (options.scheduled && input.invitedDate === null) return empty('not_invited')

  const vendorLines: ReminderLine[] = []
  const internalLines: ReminderLine[] = []

  for (const status of required) {
    // Missing / correction cadence: unsatisfied with nothing pending to resolve it.
    if (!status.satisfied && status.pending === null) {
      const eligible = options.scheduled ? milestoneDay !== null : true
      if (eligible) {
        vendorLines.push({
          kind: 'missing_item',
          requirement_id: status.requirement.id,
          requirement_title: status.requirement.title,
          milestone_key: options.scheduled ? `missing:${milestoneDay}` : 'missing:manual',
          detail: describeMissingDetail(status),
          submission_version: status.latest?.version_number ?? null,
        })
      }
    }

    // Renewal cadence: stop while a replacement is pending review.
    if (status.effective && status.currentExpiration && status.pending === null) {
      const milestone = renewalMilestone(status.currentExpiration, today)
      if (milestone !== null) {
        const remaining = daysUntilExpiration(status.currentExpiration, today)
        vendorLines.push({
          kind: 'renewal',
          requirement_id: status.requirement.id,
          requirement_title: status.requirement.title,
          milestone_key: `renewal:${milestone}`,
          detail:
            milestone === 'expired'
              ? `Expired on ${status.currentExpiration}. Submit a replacement document.`
              : `Expires ${status.currentExpiration} (${remaining} day${remaining === 1 ? '' : 's'} remaining). Submit a replacement document.`,
          submission_version: status.effective.version_number,
        })
      }
    }

    // Internal expiration notice: sent regardless of a pending replacement.
    if (status.effectiveExpired && status.effective) {
      internalLines.push({
        kind: 'expiration_internal',
        requirement_id: status.requirement.id,
        requirement_title: status.requirement.title,
        milestone_key: `expired:${status.effective.id}`,
        detail: status.replacementPending
          ? `Expired ${status.currentExpiration}. A replacement is awaiting review.`
          : `Expired ${status.currentExpiration}. No replacement submitted.`,
        submission_version: status.effective.version_number,
      })
    }
  }

  if (vendorLines.length === 0 && internalLines.length === 0) {
    return empty('no_actionable_items')
  }
  return { vendor_id: input.vendor_id, vendorLines, internalLines, skipReason: null }
}

function describeMissingDetail(status: RequirementStatus): string {
  switch (status.blocker?.reason) {
    case 'changes_requested':
      return 'Changes were requested. Submit a corrected version.'
    case 'revoked':
      return 'A previously accepted document was revoked. Submit a new version.'
    case 'expired':
      return `Expired ${status.currentExpiration}. Submit a replacement document.`
    case 'withdrawn':
      return 'The previous submission was withdrawn. Submit a document.'
    default:
      return 'No document submitted yet.'
  }
}

/** Deduplicate by organization / vendor / local date / channel, per section 5.5. */
export function digestIdempotencyKey(
  organizationId: UUID,
  vendorId: UUID,
  localDate: IsoDate,
): string {
  return `digest:${organizationId}:${vendorId}:${localDate}:email`
}

export function internalNoticeIdempotencyKey(
  organizationId: UUID,
  vendorId: UUID,
  localDate: IsoDate,
): string {
  return `internal-expiry:${organizationId}:${vendorId}:${localDate}:email`
}

export function correctionIdempotencyKey(
  organizationId: UUID,
  submissionId: UUID,
  version: number,
): string {
  return `correction:${organizationId}:${submissionId}:v${version}:email`
}

export function invitationIdempotencyKey(organizationId: UUID, invitationId: UUID): string {
  return `invitation:${organizationId}:${invitationId}:email`
}
