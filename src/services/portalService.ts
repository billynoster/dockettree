/**
 * Vendor portal data (requirements section 6 `/portal/:vendorId`, W2).
 *
 * Demo only: the vendor context is explicit in the URL. In the pilot an authenticated
 * vendor membership determines the portal context and a URL id grants nothing.
 */
import { forbidden } from '@/domain/errors'
import { CURRENT_DOCUMENT_LABEL, type RequirementStatus } from '@/domain/readiness'
import type { ActivityEvent, Organization, ReviewEvent, UUID, Vendor } from '@/domain/types'
import { today, type ServiceContext } from './context'
import { loadVendorSnapshot, sortByCreatedAtDesc, type VendorSnapshot } from './queries'

export interface PortalRequirement {
  status: RequirementStatus
  /** Latest correction reason the vendor must address, if any. */
  correctionReason: string | null
  currentDocumentLabel: string
  canSubmit: boolean
  blockedSubmitReason: string | null
}

export interface PortalData {
  vendor: Vendor
  organization: Organization | undefined
  snapshot: VendorSnapshot
  requirements: PortalRequirement[]
  optionalRequirements: PortalRequirement[]
  requiredTotal: number
  requiredSatisfied: number
  events: ActivityEvent[]
  readOnlyReason: string | null
}

export async function getVendorPortal(ctx: ServiceContext, vendorId: UUID): Promise<PortalData> {
  if (ctx.session.role === 'vendor_contact' && ctx.session.vendorId !== vendorId) {
    throw forbidden(
      'This portal belongs to a different vendor. A vendor contact can only open their own portal.',
    )
  }
  return await ctx.db.read(async (uow) => {
    const todayValue = today(ctx)
    const snapshot = await loadVendorSnapshot(uow, vendorId, todayValue)
    const organization = await uow.organizations.get(ctx.organizationId)
    const reviewEvents = await uow.reviewEvents.getAll()
    const eventsBySubmission = new Map<UUID, ReviewEvent[]>()
    for (const event of reviewEvents) {
      const list = eventsBySubmission.get(event.submission_id)
      if (list) list.push(event)
      else eventsBySubmission.set(event.submission_id, [event])
    }

    const archived = snapshot.vendor.lifecycle === 'archived'
    const toPortalRequirement = (status: RequirementStatus): PortalRequirement => {
      const decisions = status.submissions
        .flatMap((submission) => eventsBySubmission.get(submission.id) ?? [])
        .filter((event) => event.decision === 'changes_requested' || event.decision === 'revoked')
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
      const latestState = status.latest?.state
      const correctionReason =
        latestState === 'changes_requested' || latestState === 'revoked'
          ? (decisions[0]?.reason ?? null)
          : null
      const blockedSubmitReason = archived
        ? 'This vendor record is archived, so uploads are disabled.'
        : status.pending
          ? 'A submission is already awaiting review. Withdraw it to replace it.'
          : null
      return {
        status,
        correctionReason,
        currentDocumentLabel: CURRENT_DOCUMENT_LABEL[status.currentDocument],
        canSubmit: blockedSubmitReason === null,
        blockedSubmitReason,
      }
    }

    const active = snapshot.requirementStatuses.filter((status) => status.requirement.retired_at === null)
    const events = sortByCreatedAtDesc(
      (await uow.activity.where('by_vendor', vendorId)).filter((event) => event.vendor_visible),
    ).slice(0, 12)

    return {
      vendor: snapshot.vendor,
      organization,
      snapshot,
      requirements: active.filter((status) => status.requirement.required).map(toPortalRequirement),
      optionalRequirements: active
        .filter((status) => !status.requirement.required)
        .map(toPortalRequirement),
      requiredTotal: snapshot.readiness.requiredTotal,
      requiredSatisfied: snapshot.readiness.requiredSatisfied,
      events,
      readOnlyReason: archived
        ? 'This vendor record is archived. Contact the operations team if you need to submit documents.'
        : null,
    }
  })
}
