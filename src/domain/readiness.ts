/**
 * Readiness calculation — the single source of truth for requirements section 5.4.
 *
 * Pure functions only: no storage access, no clock access. Callers pass `today`
 * already resolved in the organization timezone.
 */
import { compareDates, daysUntilExpiration, isExpiredOn, isExpiringSoonOn, minDate } from './dates'
import type {
  AssignedRequirement,
  CurrentDocumentStatus,
  IsoDate,
  ReadinessStatus,
  Submission,
  UUID,
  Vendor,
  VendorLifecycle,
} from './types'

export type BlockerReason =
  | 'expired'
  | 'expired_replacement_pending'
  | 'revoked'
  | 'changes_requested'
  | 'missing'
  | 'withdrawn'
  | 'awaiting_review'

export interface Blocker {
  requirement_id: UUID
  requirement_title: string
  reason: BlockerReason
  /** Operator-facing sentence, e.g. "Insurance certificate expired". */
  label: string
}

export interface RequirementStatus {
  requirement: AssignedRequirement
  /** Latest accepted version that currently satisfies the requirement, if any. */
  effective: Submission | null
  /** Newest submission of any state, used for "Latest submission" display. */
  latest: Submission | null
  /** Open submission awaiting a review decision, if any. */
  pending: Submission | null
  submissions: Submission[]
  satisfied: boolean
  currentDocument: CurrentDocumentStatus
  currentExpiration: IsoDate | null
  daysUntilExpiration: number | null
  /** Effective document exists but local today is past its expiration date. */
  effectiveExpired: boolean
  /** A pending submission exists while an effective document is already in place. */
  replacementPending: boolean
  blocker: Blocker | null
}

export interface VendorReadiness {
  vendor_id: UUID
  status: ReadinessStatus
  lifecycle: VendorLifecycle
  /** Overlapping secondary flag; a Ready vendor can carry it. */
  expiringSoon: boolean
  blockers: Blocker[]
  requiredTotal: number
  requiredSatisfied: number
  /** Earliest expiration among effective required documents. */
  nextExpiration: IsoDate | null
  pendingSubmissionCount: number
}

const BLOCKER_SEVERITY: Record<BlockerReason, number> = {
  expired: 0,
  expired_replacement_pending: 1,
  revoked: 2,
  changes_requested: 3,
  missing: 4,
  withdrawn: 4,
  awaiting_review: 5,
}

const BLOCKER_LABEL: Record<BlockerReason, string> = {
  expired: 'expired',
  expired_replacement_pending: 'expired (renewal awaiting review)',
  revoked: 'acceptance revoked',
  changes_requested: 'corrections requested',
  missing: 'missing',
  withdrawn: 'withdrawn, nothing submitted',
  awaiting_review: 'awaiting review',
}

export function blockerLabel(title: string, reason: BlockerReason): string {
  return `${title} ${BLOCKER_LABEL[reason]}`
}

export function isActiveRequirement(requirement: AssignedRequirement): boolean {
  return requirement.retired_at === null
}

/** Newest submission by version number. */
function newest(submissions: Submission[]): Submission | null {
  return submissions.reduce<Submission | null>(
    (best, current) => (best === null || current.version_number > best.version_number ? current : best),
    null,
  )
}

/**
 * Status of one requirement given all of its submissions.
 * `submissions` may be unsorted and may include every historical version.
 */
export function computeRequirementStatus(
  requirement: AssignedRequirement,
  submissions: Submission[],
  today: IsoDate,
): RequirementStatus {
  const ordered = [...submissions].sort((a, b) => a.version_number - b.version_number)
  const effective = requirement.effective_submission_id
    ? (ordered.find((s) => s.id === requirement.effective_submission_id) ?? null)
    : null
  const pending = ordered.find((s) => s.state === 'pending_review') ?? null
  const latest = newest(ordered)

  const currentExpiration = effective?.expiration_date ?? null
  const effectiveExpired = effective !== null && isExpiredOn(currentExpiration, today)
  const satisfied = effective !== null && !effectiveExpired
  const replacementPending = pending !== null && effective !== null

  let currentDocument: CurrentDocumentStatus = 'none'
  if (effective !== null) {
    if (effectiveExpired) currentDocument = 'expired'
    else if (isExpiringSoonOn(currentExpiration, today)) currentDocument = 'expiring_soon'
    else currentDocument = 'accepted'
  }

  return {
    requirement,
    effective,
    latest,
    pending,
    submissions: ordered,
    satisfied,
    currentDocument,
    currentExpiration,
    daysUntilExpiration: currentExpiration ? daysUntilExpiration(currentExpiration, today) : null,
    effectiveExpired,
    replacementPending,
    blocker: buildBlocker(requirement, {
      satisfied,
      effectiveExpired,
      replacementPending,
      pending,
      latest,
    }),
  }
}

function buildBlocker(
  requirement: AssignedRequirement,
  state: {
    satisfied: boolean
    effectiveExpired: boolean
    replacementPending: boolean
    pending: Submission | null
    latest: Submission | null
  },
): Blocker | null {
  if (state.satisfied) return null
  let reason: BlockerReason
  if (state.effectiveExpired) {
    reason = state.replacementPending ? 'expired_replacement_pending' : 'expired'
  } else if (state.pending !== null) {
    reason = 'awaiting_review'
  } else {
    switch (state.latest?.state) {
      case 'changes_requested':
        reason = 'changes_requested'
        break
      case 'revoked':
        reason = 'revoked'
        break
      case 'withdrawn':
        reason = 'withdrawn'
        break
      default:
        reason = 'missing'
    }
  }
  return {
    requirement_id: requirement.id,
    requirement_title: requirement.title,
    reason,
    label: blockerLabel(requirement.title, reason),
  }
}

export interface VendorReadinessInput {
  vendor: Pick<Vendor, 'id' | 'lifecycle'>
  requirements: AssignedRequirement[]
  /** Every submission belonging to this vendor, any state. */
  submissions: Submission[]
}

/**
 * Exactly one readiness status per active vendor, evaluated in the order defined by
 * requirements section 5.4. Optional items never affect the status or the vendor-level
 * Expiring soon flag.
 */
export function computeVendorReadiness(input: VendorReadinessInput, today: IsoDate): VendorReadiness {
  const statuses = computeRequirementStatuses(input, today)
  const active = statuses.filter((s) => isActiveRequirement(s.requirement))
  const required = active.filter((s) => s.requirement.required)

  const pendingSubmissionCount = active.filter((s) => s.pending !== null).length
  const blockers = required
    .map((s) => s.blocker)
    .filter((blocker): blocker is Blocker => blocker !== null)
    .sort(
      (a, b) =>
        BLOCKER_SEVERITY[a.reason] - BLOCKER_SEVERITY[b.reason] ||
        a.requirement_title.localeCompare(b.requirement_title),
    )

  const nextExpiration = required.reduce<IsoDate | null>(
    (earliest, s) => (s.effective ? minDate(earliest, s.currentExpiration) : earliest),
    null,
  )
  const expiringSoon = required.some(
    (s) => s.effective !== null && isExpiringSoonOn(s.currentExpiration, today),
  )
  const requiredSatisfied = required.filter((s) => s.satisfied).length

  const status = deriveStatus(input.vendor.lifecycle, required)

  return {
    vendor_id: input.vendor.id,
    status,
    lifecycle: input.vendor.lifecycle,
    expiringSoon,
    blockers,
    requiredTotal: required.length,
    requiredSatisfied,
    nextExpiration,
    pendingSubmissionCount,
  }
}

function deriveStatus(lifecycle: VendorLifecycle, required: RequirementStatus[]): ReadinessStatus {
  if (lifecycle === 'archived') return 'archived'
  if (required.length === 0) return 'unconfigured'

  const unsatisfied = required.filter((s) => !s.satisfied)
  if (unsatisfied.length === 0) return 'ready'

  // An expired effective required document is Not ready even when a replacement is pending.
  if (required.some((s) => s.effectiveExpired)) return 'not_ready'
  if (unsatisfied.every((s) => s.pending !== null)) return 'awaiting_review'
  return 'not_ready'
}

export function computeRequirementStatuses(
  input: VendorReadinessInput,
  today: IsoDate,
): RequirementStatus[] {
  const byRequirement = new Map<UUID, Submission[]>()
  for (const submission of input.submissions) {
    const list = byRequirement.get(submission.requirement_id)
    if (list) list.push(submission)
    else byRequirement.set(submission.requirement_id, [submission])
  }
  return [...input.requirements]
    .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title))
    .map((requirement) =>
      computeRequirementStatus(requirement, byRequirement.get(requirement.id) ?? [], today),
    )
}

export const READINESS_LABEL: Record<ReadinessStatus, string> = {
  ready: 'Ready',
  awaiting_review: 'Awaiting review',
  not_ready: 'Not ready',
  unconfigured: 'Unconfigured',
  archived: 'Archived',
}

export const READINESS_EXPLANATION: Record<ReadinessStatus, string> = {
  ready: 'Every required document has been accepted and is current.',
  awaiting_review: 'Every outstanding required item has a submission waiting for a decision.',
  not_ready: 'At least one required item is unsatisfied with nothing pending to resolve it.',
  unconfigured: 'No required items are assigned yet, so readiness cannot be determined.',
  archived: 'Archived vendors are excluded from active metrics, review queue and reminders.',
}

export const CURRENT_DOCUMENT_LABEL: Record<CurrentDocumentStatus, string> = {
  accepted: 'Accepted',
  expiring_soon: 'Expiring soon',
  expired: 'Expired',
  none: 'None',
}

export const SUBMISSION_STATE_LABEL: Record<Submission['state'], string> = {
  pending_review: 'Pending review',
  accepted: 'Accepted',
  changes_requested: 'Changes requested',
  withdrawn: 'Withdrawn',
  superseded: 'Superseded',
  revoked: 'Revoked',
}

/** Dashboard partition of active vendors; Expiring soon overlaps the four buckets. */
export interface ReadinessCounts {
  active: number
  ready: number
  awaiting_review: number
  not_ready: number
  unconfigured: number
  expiring_soon: number
  archived: number
}

export function countReadiness(all: VendorReadiness[]): ReadinessCounts {
  const counts: ReadinessCounts = {
    active: 0,
    ready: 0,
    awaiting_review: 0,
    not_ready: 0,
    unconfigured: 0,
    expiring_soon: 0,
    archived: 0,
  }
  for (const readiness of all) {
    if (readiness.lifecycle === 'archived') {
      counts.archived += 1
      continue
    }
    counts.active += 1
    if (readiness.status === 'ready') counts.ready += 1
    else if (readiness.status === 'awaiting_review') counts.awaiting_review += 1
    else if (readiness.status === 'not_ready') counts.not_ready += 1
    else if (readiness.status === 'unconfigured') counts.unconfigured += 1
    if (readiness.expiringSoon) counts.expiring_soon += 1
  }
  return counts
}

/** Sort helper for the vendor table's "next expiration" column. */
export function compareNextExpiration(a: IsoDate | null, b: IsoDate | null): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return compareDates(a, b)
}
