/**
 * Read-side helpers. Every screen derives readiness from these so there is exactly one
 * implementation of the section 5.4 rules in the application.
 */
import { notFound } from '@/domain/errors'
import { INVITATION_LABEL, invitationStatus, type InvitationStatus } from '@/domain/invitations'
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

/**
 * Rejects a record owned by another organization. Database constraints already make a
 * cross-organization reference impossible; this stops an id substituted into a request from
 * reaching a record the caller's organization does not own.
 */
export function requireOwned<T extends { organization_id: UUID }>(
  entity: T | undefined | null,
  organizationId: UUID,
  message: string,
): T {
  if (!entity || entity.organization_id !== organizationId) throw notFound(message)
  return entity
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
  organizationId: UUID,
): Promise<VendorSnapshot> {
  const vendor = requireOwned(
    await uow.vendors.get(vendorId),
    organizationId,
    'That vendor no longer exists.',
  )
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

export { INVITATION_LABEL, invitationStatus, type InvitationStatus }
