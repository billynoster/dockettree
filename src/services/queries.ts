/**
 * Read-side helpers. Every screen derives readiness from these so there is exactly one
 * implementation of the section 5.4 rules in the application.
 */
import { notFound } from '@/domain/errors'
import {
  computeRequirementStatuses,
  computeVendorReadiness,
  isActiveRequirement,
  type RequirementStatus,
  type VendorReadiness,
} from '@/domain/readiness'
import type {
  ActivityEvent,
  AssignedRequirement,
  FileObject,
  Invitation,
  IsoDate,
  Notification,
  ReviewEvent,
  Submission,
  UUID,
  Vendor,
} from '@/domain/types'
import type { UnitOfWork } from '@/repositories/types'

export interface VendorSnapshot {
  vendor: Vendor
  requirements: AssignedRequirement[]
  submissions: Submission[]
  requirementStatuses: RequirementStatus[]
  readiness: VendorReadiness
}

export function buildSnapshot(
  vendor: Vendor,
  requirements: AssignedRequirement[],
  submissions: Submission[],
  todayValue: IsoDate,
): VendorSnapshot {
  const input = { vendor, requirements, submissions }
  return {
    vendor,
    requirements,
    submissions,
    requirementStatuses: computeRequirementStatuses(input, todayValue),
    readiness: computeVendorReadiness(input, todayValue),
  }
}

export async function loadVendorSnapshots(
  uow: UnitOfWork,
  organizationId: UUID,
  todayValue: IsoDate,
): Promise<VendorSnapshot[]> {
  const [vendors, requirements, submissions] = await Promise.all([
    uow.vendors.where('by_organization', organizationId),
    uow.requirements.where('by_organization', organizationId),
    uow.submissions.getAll(),
  ])

  const requirementsByVendor = groupBy(requirements, (item) => item.vendor_id)
  const submissionsByVendor = groupBy(submissions, (item) => item.vendor_id)

  return vendors.map((vendor) =>
    buildSnapshot(
      vendor,
      requirementsByVendor.get(vendor.id) ?? [],
      submissionsByVendor.get(vendor.id) ?? [],
      todayValue,
    ),
  )
}

export async function loadVendorSnapshot(
  uow: UnitOfWork,
  vendorId: UUID,
  todayValue: IsoDate,
): Promise<VendorSnapshot> {
  const vendor = await uow.vendors.get(vendorId)
  if (!vendor) throw notFound('That vendor no longer exists.')
  const [requirements, submissions] = await Promise.all([
    uow.requirements.where('by_vendor', vendorId),
    uow.submissions.where('by_vendor', vendorId),
  ])
  return buildSnapshot(vendor, requirements, submissions, todayValue)
}

export function activeRequirements(snapshot: VendorSnapshot): RequirementStatus[] {
  return snapshot.requirementStatuses.filter((status) => isActiveRequirement(status.requirement))
}

export async function loadVendorActivity(
  uow: UnitOfWork,
  vendorId: UUID,
): Promise<ActivityEvent[]> {
  const events = await uow.activity.where('by_vendor', vendorId)
  return sortByCreatedAtDesc(events)
}

export async function loadVendorInvitations(uow: UnitOfWork, vendorId: UUID): Promise<Invitation[]> {
  const invitations = await uow.invitations.where('by_vendor', vendorId)
  return sortByCreatedAtDesc(invitations)
}

export async function loadVendorNotifications(
  uow: UnitOfWork,
  vendorId: UUID,
): Promise<Notification[]> {
  const notifications = await uow.notifications.where('by_vendor', vendorId)
  return sortByCreatedAtDesc(notifications)
}

export async function loadReviewEvents(uow: UnitOfWork, submissionId: UUID): Promise<ReviewEvent[]> {
  const events = await uow.reviewEvents.where('by_submission', submissionId)
  return sortByCreatedAtDesc(events)
}

export async function loadFile(uow: UnitOfWork, fileId: UUID): Promise<FileObject | undefined> {
  return await uow.files.get(fileId)
}

export function sortByCreatedAtDesc<T extends { created_at: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const item of items) {
    const group = map.get(key(item))
    if (group) group.push(item)
    else map.set(key(item), [item])
  }
  return map
}

/** Latest invitation state used by the vendor header badge. */
export type InvitationStatus = 'not_invited' | 'invited' | 'accepted' | 'expired' | 'revoked'

export function invitationStatus(
  invitations: Invitation[],
  nowInstant: string,
): { status: InvitationStatus; invitation: Invitation | null } {
  const latest = sortByCreatedAtDesc(invitations)[0] ?? null
  if (!latest) return { status: 'not_invited', invitation: null }
  if (latest.revoked_at) return { status: 'revoked', invitation: latest }
  if (latest.redeemed_at) return { status: 'accepted', invitation: latest }
  if (latest.expires_at < nowInstant) return { status: 'expired', invitation: latest }
  return { status: 'invited', invitation: latest }
}

export const INVITATION_LABEL: Record<InvitationStatus, string> = {
  not_invited: 'Not invited',
  invited: 'Invitation sent',
  accepted: 'Invitation accepted',
  expired: 'Invitation expired',
  revoked: 'Invitation revoked',
}
